import type { NextFunction, Response } from 'express';
import type { AuthRequest } from './auth';

const rateLimit = require('express-rate-limit');
const slowDown = require('express-slow-down');
const redisService = require('../services/redisService');
const logger = require('../utils/logger').default;

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

// Free-text fields whose content must be preserved verbatim. Stripping
// `<`, `>`, `javascript:` or `on*=` from these silently corrupts legitimate
// input — e.g. VM exec `command` arrays like `['sh', '-c', 'x > y']`.
const PRESERVED_TEXT_FIELDS = new Set([
  'command',
  'commands',
  'args',
  'description',
  'reason',
  'content',
  'comment',
  'notes',
  'message',
  'text',
  'title',
]);

const isPreservedTextValue = (value: unknown): boolean => typeof value === 'string'
  || (Array.isArray(value) && value.every((item) => typeof item === 'string'));

const shouldSkipField = (key: string, value: unknown): boolean => SENSITIVE_FIELDS.has(key) || (PRESERVED_TEXT_FIELDS.has(key) && isPreservedTextValue(value));

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
    // Two composed limiters: a per-IP cap bounds password spraying across many
    // accounts, while a per IP+email cap bounds targeted floods without letting
    // an attacker lock out an account globally (DoS via `auth:{email}` keys).
    const ipLimiter = SecurityMiddleware.createAdvancedRateLimit({
      windowMs: 15 * 60 * 1000,
      max: 20,
      message: 'Too many authentication attempts from this IP, please try again later',
      skipSuccessfulRequests: true,
      keyGenerator: (req: AuthRequest) => `auth:${getClientIp(req)}`,
    });

    const accountLimiter = SecurityMiddleware.createAdvancedRateLimit({
      windowMs: 15 * 60 * 1000,
      max: 5,
      message: 'Too many authentication attempts, please try again later',
      skipSuccessfulRequests: true,
      keyGenerator: (req: AuthRequest) => {
        const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
        return `auth:${getClientIp(req)}:${email || 'anonymous'}`;
      },
    });

    return SecurityMiddleware.combineSecurityMiddlewares([ipLimiter, accountLimiter]);
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
    const MAX_ENTRIES = 10000;

    return (req, res, next) => {
      const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
      // Key by email+ip so a distributed attacker can't lock an account out
      // globally, and a single IP can't spray unlimited accounts either.
      const key = `${email || 'anonymous'}:${getClientIp(req)}`;
      const now = Date.now();

      if (attempts.size >= MAX_ENTRIES) {
        // Evict expired/unlocked entries first, then oldest if still over capacity
        // (Map preserves insertion order, so keys() yields oldest first).
        for (const [attemptKey, attemptValue] of attempts) {
          if (attemptValue.lockoutUntil <= now) {
            attempts.delete(attemptKey);
          }
        }

        while (attempts.size >= MAX_ENTRIES) {
          const oldestKey = attempts.keys().next().value;
          if (oldestKey === undefined) {
            break;
          }
          attempts.delete(oldestKey);
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
            .replace(/javascript\s*:/gi, '')
            // Strip HTML-like tags only — bare `<`/`>` (e.g. `x > y`) and
            // `on*=` outside tags (e.g. `done=true`) are legitimate input.
            .replace(/<\/?[a-zA-Z][^<>]*>/g, '');
        }

        if (Array.isArray(obj)) {
          return obj.map((item) => sanitize(item));
        }

        if (typeof obj === 'object' && obj !== null) {
          const sanitized: Record<string, unknown> = {};
          for (const [key, value] of Object.entries(obj)) {
            sanitized[key] = shouldSkipField(key, value) ? value : sanitize(value);
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
    // High-signal patterns only — bare keywords (SELECT, DROP), comments (`--`)
    // or `1=1` in prose are legitimate text and must not be flagged.
    const suspiciousPatterns = [
      /(\b(OR|AND)\s+\d+\s*=\s*\d+(\s*(--|#|\/\*))?)/gi,
      /('\s*(OR|AND)\s+[\w'"-]+\s*=\s*[\w'"-]+)/gi,
      /(\bUNION\s+(ALL\s+)?SELECT\b)/gi,
      /(;\s*(DROP|TRUNCATE|ALTER)\s+(TABLE|DATABASE|INDEX|VIEW))/gi,
      /(;\s*(DELETE\s+FROM|INSERT\s+INTO|UPDATE\s+\w+\s+SET))/gi,
      /('\s*(--|#|\/\*))/g,
      /(\bEXEC(UTE)?\s+(xp_|sp_))/gi,
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
            ([key, value]) => !shouldSkipField(key, value) && checkForSQLInjection(value),
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
      /<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi,
      /<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi,
      /<embed\b[^<]*(?:(?!<\/embed>)<[^<]*)*<\/embed>/gi,
    ];

    // `on*=` is only an event handler inside a tag — `done=true`, `tone=440`
    // or `once=1` in plain text are legitimate input.
    const eventHandlerPattern = /on\w+\s*=/gi;

    return (req, res, next) => {
      const checkForXSS = (obj: unknown): boolean => {
        if (typeof obj === 'string') {
          const matchesPattern = xssPatterns.some((pattern) => {
            pattern.lastIndex = 0;
            return pattern.test(obj);
          });

          if (matchesPattern) {
            return true;
          }

          eventHandlerPattern.lastIndex = 0;
          return obj.includes('<') && eventHandlerPattern.test(obj);
        }

        if (Array.isArray(obj)) {
          return obj.some((item) => checkForXSS(item));
        }

        if (typeof obj === 'object' && obj !== null) {
          return Object.entries(obj).some(
            ([key, value]) => !shouldSkipField(key, value) && checkForXSS(value),
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
      // NOTE: Content-Length is client-supplied and advisory — chunked bodies
      // can bypass this check entirely. Reject non-numeric values, but real
      // limits must also be enforced by the body parser / reverse proxy.
      const rawContentLength = req.headers['content-length'];
      const contentLength = Number.parseInt(String(rawContentLength || '0'), 10);

      if (rawContentLength !== undefined && Number.isNaN(contentLength)) {
        res.status(400).json({
          success: false,
          error: 'Invalid request',
          message: 'Invalid Content-Length header',
        });
        return;
      }

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
      // Only flag genuinely suspicious signals: path traversal or scanner UAs.
      // `/admin` and `/config` are legitimate authenticated routes, so matching
      // on them produced noise for every admin request.
      const isSuspicious = req.path.includes('..')
        || userAgent?.includes('bot')
        || userAgent?.includes('crawler');

      if (isSuspicious) {
        logger.logSecurity('Suspicious request', {
          method: req.method,
          path: req.path,
          ip: req.ip,
          userAgent,
        });
      }

      res.on('finish', () => {
        const duration = Date.now() - startTime;

        if (res.statusCode >= 400) {
          logger.warn(`Error response: ${res.statusCode} ${req.method} ${req.path} (${duration}ms) from ${req.ip}`);
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

        try {
          // Async middleware that rejects must be forwarded to next() —
          // otherwise the request hangs and the rejection goes unhandled.
          Promise.resolve(middleware(req, res, runNext)).catch(runNext);
        } catch (error) {
          runNext(error);
        }
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
