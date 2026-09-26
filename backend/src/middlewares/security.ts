import type { NextFunction, Response } from 'express';
import type { AuthRequest } from './auth';

const rateLimit = require('express-rate-limit');
const slowDown = require('express-slow-down');
const redisService = require('../services/redisService');

type Middleware = (req: AuthRequest, res: Response, next: NextFunction) => unknown;

type AdvancedRateLimitOptions = {
  windowMs?: number;
  max?: number;
  message?: string;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
  keyGenerator?: (req: AuthRequest) => string;
  skip?: (req: AuthRequest) => boolean;
  [key: string]: unknown;
};

type SlowDownOptions = {
  windowMs?: number;
  delayAfter?: number;
  delayMs?: number;
  maxDelayMs?: number;
};

type IPFilterOptions = {
  whitelist?: string[];
  blacklist?: string[];
};



const getClientIp = (req: AuthRequest): string => req.ip || req.connection?.remoteAddress || 'unknown';

const SENSITIVE_FIELDS = new Set([
  'password',
  'currentPassword',
  'newPassword',
  'oldPassword',
  'confirmPassword',
  'newPasswordConfirm',
  'refreshToken',
  'token',
]);

export class SecurityMiddleware {
  static createAdvancedRateLimit(options: AdvancedRateLimitOptions = {}): Middleware {
    const {
      windowMs = 15 * 60 * 1000,
      max = 100,
      message = 'Too many requests from this IP, please try again later',
      skipSuccessfulRequests = false,
      skipFailedRequests = false,
      keyGenerator = (req: AuthRequest) => getClientIp(req),
      skip = () => false,
      ...extraOptions
    } = options;

    let store;

    try {
      if (redisService.isReady()) {
        const { RedisStore } = require('rate-limit-redis');
        const redisClient = redisService.getClient();

        store = new RedisStore({
          sendCommand: (...args: string[]) => redisClient.sendCommand(args),
        });
      }
    } catch (error) {
      console.warn('Redis not available for rate limiting, using memory store');
      store = undefined;
    }

    return rateLimit({
      windowMs,
      max,
      message: {
        success: false,
        error: 'Rate limit exceeded',
        message,
        retryAfter: Math.ceil(windowMs / 1000),
      },
      standardHeaders: true,
      legacyHeaders: false,
      skipSuccessfulRequests,
      skipFailedRequests,
      keyGenerator,
      skip,
      store,
      passOnStoreError: true,
      handler: (req: AuthRequest, res: Response) => {
        console.warn(`Rate limit exceeded for IP: ${req.ip}, Path: ${req.path}`);
        res.status(429).json({
          success: false,
          error: 'Rate limit exceeded',
          message,
          retryAfter: Math.ceil(windowMs / 1000),
        });
      },
      ...extraOptions,
    });
  }

  static createSlowDown(options: SlowDownOptions = {}): Middleware {
    const {
      windowMs = 15 * 60 * 1000,
      delayAfter = 50,
      delayMs = 500,
      maxDelayMs = 20000,
    } = options;

    return slowDown({
      windowMs,
      delayAfter,
      delayMs,
      maxDelayMs,
      keyGenerator: (req: AuthRequest) => getClientIp(req),
    });
  }

  static authRateLimit(): Middleware {
    return SecurityMiddleware.createAdvancedRateLimit({
      windowMs: 15 * 60 * 1000,
      max: 5,
      message: 'Too many authentication attempts, please try again later',
      skipSuccessfulRequests: true,
      keyGenerator: (req: AuthRequest) => {
        const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
        return email ? `auth:${email}` : `auth:${getClientIp(req)}`;
      },
    });
  }

  static apiRateLimit(): Middleware {
    return SecurityMiddleware.createAdvancedRateLimit({
      windowMs: 60 * 1000,
      max: 60,
      message: 'API rate limit exceeded, please slow down your requests',
      keyGenerator: (req: AuthRequest) => (req.user ? `api:${req.user.userId}` : `api:${getClientIp(req)}`),
    });
  }

  static uploadRateLimit(): Middleware {
    return SecurityMiddleware.createAdvancedRateLimit({
      windowMs: 60 * 1000,
      max: 10,
      message: 'Upload rate limit exceeded, please wait before uploading again',
      keyGenerator: (req: AuthRequest) => (req.user ? `upload:${req.user.userId}` : `upload:${getClientIp(req)}`),
    });
  }

  static ddosProtection(): Middleware[] {
    return [
      SecurityMiddleware.createSlowDown({
        windowMs: 60 * 1000,
        delayAfter: 100,
        delayMs: 100,
        maxDelayMs: 5000,
      }),
      SecurityMiddleware.createAdvancedRateLimit({
        windowMs: 60 * 1000,
        max: 200,
        message: 'Too many requests detected, possible DDoS attack blocked',
        handler: (req: AuthRequest, res: Response) => {
          console.error(`Possible DDoS attack from IP: ${req.ip}`);
          res.status(429).json({
            success: false,
            error: 'Rate limit exceeded',
            message: 'Too many requests detected, possible DDoS attack blocked',
            retryAfter: 60,
          });
        },
      }),
    ];
  }

  static bruteForceProtection(): Middleware {
    const attempts = new Map<string, { count: number; lockoutUntil: number }>();
    const LOCKOUT_TIME = 30 * 60 * 1000;
    const MAX_ATTEMPTS = 5;

    return (req, res, next) => {
      const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
      const key = email || getClientIp(req);
      const now = Date.now();

      if (attempts.size > 10000) {
        for (const [attemptKey, attemptValue] of attempts) {
          if (attemptValue.count === 0 && attemptValue.lockoutUntil <= now) {
            attempts.delete(attemptKey);
          }
        }
      }

      if (!attempts.has(key)) {
        attempts.set(key, { count: 0, lockoutUntil: 0 });
      }

      const attempt = attempts.get(key);

      if (!attempt) {
        next();
        return;
      }

      if (attempt.lockoutUntil > now) {
        const remainingTime = Math.ceil((attempt.lockoutUntil - now) / 1000);
        res.status(429).json({
          success: false,
          error: 'Account temporarily locked',
          message: `Too many failed attempts. Try again in ${remainingTime} seconds`,
          lockoutUntil: new Date(attempt.lockoutUntil).toISOString(),
        });
        return;
      }

      if (attempt.lockoutUntil <= now && attempt.lockoutUntil > 0) {
        attempt.count = 0;
        attempt.lockoutUntil = 0;
      }

      next();

      const originalSend = res.send.bind(res);
      (res as Response & { send: typeof res.send }).send = function send(data: unknown) {
        let response: { success?: boolean } | null = null;

        if (typeof data === 'string') {
          try {
            response = JSON.parse(data) as { success?: boolean };
          } catch {
            response = null;
          }
        } else if (data && typeof data === 'object') {
          response = data as { success?: boolean };
        }

        if (res.statusCode === 401 || res.statusCode === 403) {
          attempt.count += 1;

          if (attempt.count >= MAX_ATTEMPTS) {
            attempt.lockoutUntil = now + LOCKOUT_TIME;
            console.warn(`Account locked due to brute force: ${key}`);
          }
        } else if (res.statusCode === 200 && response && response.success) {
          attempt.count = 0;
          attempt.lockoutUntil = 0;
        }

        return originalSend(data);
      } as typeof res.send;
    };
  }

  static sanitizeInput(): Middleware {
    return (req, _res, next) => {
      const sanitize = (obj: unknown): unknown => {
        if (typeof obj === 'string') {
          return obj
            .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
            .replace(/javascript:/gi, '')
            .replace(/on\w+\s*=/gi, '')
            .replace(/[<>]/g, '');
        }

        if (Array.isArray(obj)) {
          return obj.map((item) => sanitize(item));
        }

        if (typeof obj === 'object' && obj !== null) {
          const sanitized: Record<string, unknown> = {};
          for (const [key, value] of Object.entries(obj)) {
            sanitized[key] = SENSITIVE_FIELDS.has(key) ? value : sanitize(value);
          }
          return sanitized;
        }

        return obj;
      };

      if (req.body) {
        req.body = sanitize(req.body) as never;
      }

      if (req.query) {
        req.query = sanitize(req.query) as never;
      }

      next();
    };
  }

  static sqlInjectionProtection(): Middleware {
    const suspiciousPatterns = [
      /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|UNION)\b)/gi,
      /(\b(OR|AND)\s+\d+\s*=\s*\d+)/gi,
      /(--|\/\*|\*\/)/g,
      /(\b(SCRIPT|JAVASCRIPT|VBSCRIPT)\b)/gi,
    ];

    return (req, res, next) => {
      const checkForSQLInjection = (obj: unknown): boolean => {
        if (typeof obj === 'string') {
          return suspiciousPatterns.some((pattern) => {
            pattern.lastIndex = 0;
            return pattern.test(obj);
          });
        }

        if (Array.isArray(obj)) {
          return obj.some((item) => checkForSQLInjection(item));
        }

        if (typeof obj === 'object' && obj !== null) {
          return Object.entries(obj).some(
            ([key, value]) => !SENSITIVE_FIELDS.has(key) && checkForSQLInjection(value),
          );
        }

        return false;
      };

      const hasSuspiciousContent = checkForSQLInjection(req.body)
        || checkForSQLInjection(req.query)
        || checkForSQLInjection(req.params);

      if (hasSuspiciousContent) {
        console.warn(`Potential SQL injection attempt from IP: ${req.ip}`);
        res.status(400).json({
          success: false,
          error: 'Invalid input detected',
          message: 'Your request contains potentially harmful content',
        });
        return;
      }

      next();
    };
  }

  static xssProtection(): Middleware {
    const xssPatterns = [
      /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
      /javascript:/gi,
      /on\w+\s*=/gi,
      /<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi,
      /<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi,
      /<embed\b[^<]*(?:(?!<\/embed>)<[^<]*)*<\/embed>/gi,
    ];

    return (req, res, next) => {
      const checkForXSS = (obj: unknown): boolean => {
        if (typeof obj === 'string') {
          return xssPatterns.some((pattern) => {
            pattern.lastIndex = 0;
            return pattern.test(obj);
          });
        }

        if (Array.isArray(obj)) {
          return obj.some((item) => checkForXSS(item));
        }

        if (typeof obj === 'object' && obj !== null) {
          return Object.entries(obj).some(
            ([key, value]) => !SENSITIVE_FIELDS.has(key) && checkForXSS(value),
          );
        }

        return false;
      };

      const hasXSSContent = checkForXSS(req.body)
        || checkForXSS(req.query)
        || checkForXSS(req.params);

      if (hasXSSContent) {
        console.warn(`Potential XSS attempt from IP: ${req.ip}`);
        res.status(400).json({
          success: false,
          error: 'Invalid input detected',
          message: 'Your request contains potentially harmful content',
        });
        return;
      }

      next();
    };
  }

  static requestSizeLimit(options: { maxSize?: number } = {}): Middleware {
    const { maxSize = 10 * 1024 * 1024 } = options;

    return (req, res, next) => {
      const contentLength = Number.parseInt(String(req.headers['content-length'] || '0'), 10);

      if (contentLength > maxSize) {
        res.status(413).json({
          success: false,
          error: 'Request too large',
          message: `Request size exceeds maximum allowed size of ${Math.round(maxSize / 1024 / 1024)}MB`,
        });
        return;
      }

      next();
    };
  }

  static ipFilter(options: IPFilterOptions = {}): Middleware {
    const { whitelist = [], blacklist = [] } = options;

    return (req, res, next) => {
      const clientIP = getClientIp(req);

      if (blacklist.length > 0 && blacklist.includes(clientIP)) {
        console.warn(`Blocked request from blacklisted IP: ${clientIP}`);
        res.status(403).json({
          success: false,
          error: 'Access denied',
          message: 'Your IP address has been blocked',
        });
        return;
      }

      if (whitelist.length > 0 && !whitelist.includes(clientIP)) {
        console.warn(`Blocked request from non-whitelisted IP: ${clientIP}`);
        res.status(403).json({
          success: false,
          error: 'Access denied',
          message: 'Your IP address is not authorized',
        });
        return;
      }

      next();
    };
  }

  static securityHeaders(): Middleware {
    return (req, res, next) => {
      res.setHeader('X-Frame-Options', 'DENY');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-XSS-Protection', '1; mode=block');

      if (req.secure || req.headers['x-forwarded-proto'] === 'https') {
        res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
      }

      res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
      res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');

      next();
    };
  }

  static securityLogging(): Middleware {
    return (req, res, next) => {
      const startTime = Date.now();

      const userAgent = typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : undefined;
      const isSuspicious = req.path.includes('..')
        || req.path.includes('admin')
        || req.path.includes('config')
        || userAgent?.includes('bot')
        || userAgent?.includes('crawler');

      if (isSuspicious) {
        console.warn(`Suspicious request: ${req.method} ${req.path} from ${req.ip}`);
      }

      res.on('finish', () => {
        const duration = Date.now() - startTime;

        if (res.statusCode >= 400) {
          console.warn(`Error response: ${res.statusCode} ${req.method} ${req.path} (${duration}ms) from ${req.ip}`);
        }
      });

      next();
    };
  }

  static combineSecurityMiddlewares(middlewares: Array<Middleware | Middleware[]>): Middleware {
    return (req, res, next) => {
      let index = 0;

      const runNext = (error?: unknown): void => {
        if (error) {
          next(error as Error);
          return;
        }

        if (index >= middlewares.length) {
          next();
          return;
        }

        const middleware = middlewares[index++];

        if (Array.isArray(middleware)) {
          SecurityMiddleware.combineSecurityMiddlewares(middleware)(req, res, runNext);
          return;
        }

        middleware(req, res, runNext);
      };

      runNext();
    };
  }
}

export const { createAdvancedRateLimit } = SecurityMiddleware;
export const { createSlowDown } = SecurityMiddleware;
export const { authRateLimit } = SecurityMiddleware;
export const { apiRateLimit } = SecurityMiddleware;
export const { uploadRateLimit } = SecurityMiddleware;
export const { ddosProtection } = SecurityMiddleware;
export const { bruteForceProtection } = SecurityMiddleware;
export const { sanitizeInput } = SecurityMiddleware;
export const { sqlInjectionProtection } = SecurityMiddleware;
export const { xssProtection } = SecurityMiddleware;
export const { requestSizeLimit } = SecurityMiddleware;
export const { ipFilter } = SecurityMiddleware;
export const { securityHeaders } = SecurityMiddleware;
export const { securityLogging } = SecurityMiddleware;
export const { combineSecurityMiddlewares } = SecurityMiddleware;

export default {
  SecurityMiddleware,
  createAdvancedRateLimit,
  createSlowDown,
  authRateLimit,
  apiRateLimit,
  uploadRateLimit,
  ddosProtection,
  bruteForceProtection,
  sanitizeInput,
  sqlInjectionProtection,
  xssProtection,
  requestSizeLimit,
  ipFilter,
  securityHeaders,
  securityLogging,
  combineSecurityMiddlewares,
};
