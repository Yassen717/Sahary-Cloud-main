const rateLimit = require('express-rate-limit');
const slowDown = require('express-slow-down');
const { createClient } = require('redis');

/**
 * Security Middleware
 * Provides various security measures including rate limiting, DDoS protection, and attack prevention
 */
class SecurityMiddleware {
  /**
   * Advanced rate limiting with Redis store
   * @param {Object} options - Rate limiting options
   * @returns {Function} Rate limiting middleware
   */
  static createAdvancedRateLimit(options = {}) {
    const {
      windowMs = 15 * 60 * 1000, // 15 minutes
      max = 100, // requests per window
      message = 'Too many requests from this IP, please try again later',
      skipSuccessfulRequests = false,
      skipFailedRequests = false,
      keyGenerator = (req) => req.ip,
      skip = () => false,
      onLimitReached = null,
    } = options;

    // Try to use Redis store if available
    let store;
    try {
      const RedisStore = require('rate-limit-redis');
      const redisClient = createClient({ url: process.env.REDIS_URL });
      
      store = new RedisStore({
        sendCommand: (...args) => redisClient.sendCommand(args),
      });
    } catch (error) {
      console.warn('Redis not available for rate limiting, using memory store');
      store = undefined; // Use default memory store
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
      onLimitReached: (req, res, options) => {
        console.warn(`Rate limit exceeded for IP: ${req.ip}, Path: ${req.path}`);
        if (onLimitReached) {
          onLimitReached(req, res, options);
        }
      },
    });
  }

  /**
   * Slow down requests instead of blocking them
   * @param {Object} options - Slow down options
   * @returns {Function} Slow down middleware
   */
  static createSlowDown(options = {}) {
    const {
      windowMs = 15 * 60 * 1000, // 15 minutes
      delayAfter = 50, // allow 50 requests per windowMs without delay
      delayMs = 500, // add 500ms delay per request after delayAfter
      maxDelayMs = 20000, // max delay of 20 seconds
    } = options;

    return slowDown({
      windowMs,
      delayAfter,
      delayMs,
      maxDelayMs,
      keyGenerator: (req) => req.ip,
    });
  }

  /**
   * Authentication-specific rate limiting
   * @returns {Function} Auth rate limiting middleware
   */
  static authRateLimit() {
    return SecurityMiddleware.createAdvancedRateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 5, // 5 attempts per window
      message: 'Too many authentication attempts, please try again later',
      skipSuccessfulRequests: true, // Don't count successful requests
      keyGenerator: (req) => {
        // Use email if provided, otherwise IP
        const email = req.body?.email;
        return email ? `auth:${email}` : `auth:${req.ip}`;
      },
      onLimitReached: (req, res, options) => {
        console.warn(`Auth rate limit exceeded for: ${req.body?.email || req.ip}`);
      },
    });
  }

  /**
   * API rate limiting
   * @returns {Function} API rate limiting middleware
   */
  static apiRateLimit() {
    return SecurityMiddleware.createAdvancedRateLimit({
      windowMs: 60 * 1000, // 1 minute
      max: 60, // 60 requests per minute
      message: 'API rate limit exceeded, please slow down your requests',
      keyGenerator: (req) => {
        // Use user ID if authenticated, otherwise IP
        return req.user ? `api:${req.user.userId}` : `api:${req.ip}`;
      },
    });
  }

  /**
   * Upload rate limiting
   * @returns {Function} Upload rate limiting middleware
   */
  static uploadRateLimit() {
    return SecurityMiddleware.createAdvancedRateLimit({
      windowMs: 60 * 1000, // 1 minute
      max: 10, // 10 uploads per minute
      message: 'Upload rate limit exceeded, please wait before uploading again',
      keyGenerator: (req) => {
        return req.user ? `upload:${req.user.userId}` : `upload:${req.ip}`;
      },
    });
  }

  /**
   * DDoS protection middleware
   * @returns {Function} DDoS protection middleware
   */
  static ddosProtection() {
    return [
      // First layer: Slow down after many requests
      SecurityMiddleware.createSlowDown({
        windowMs: 60 * 1000, // 1 minute
        delayAfter: 100, // slow down after 100 requests
        delayMs: 100, // add 100ms delay
        maxDelayMs: 5000, // max 5 second delay
      }),
      
      // Second layer: Block after excessive requests
      SecurityMiddleware.createAdvancedRateLimit({
        windowMs: 60 * 1000, // 1 minute
        max: 200, // 200 requests per minute
        message: 'Too many requests detected, possible DDoS attack blocked',
        onLimitReached: (req, res, options) => {
          console.error(`Possible DDoS attack from IP: ${req.ip}`);
          // In production, you might want to add IP to a blacklist
        },
      }),
    ];
  }

  /**
   * Brute force protection for login attempts
   * @returns {Function} Brute force protection middleware
   */
  static bruteForceProtection() {
    const attempts = new Map();
    const LOCKOUT_TIME = 30 * 60 * 1000; // 30 minutes
    const MAX_ATTEMPTS = 5;

    return (req, res, next) => {
      const key = req.body?.email || req.ip;
      const now = Date.now();
      
      if (!attempts.has(key)) {
        attempts.set(key, { count: 0, lockoutUntil: 0 });
      }

      const attempt = attempts.get(key);

      // Check if still locked out
      if (attempt.lockoutUntil > now) {
        const remainingTime = Math.ceil((attempt.lockoutUntil - now) / 1000);
        return res.status(429).json({
          success: false,
          error: 'Account temporarily locked',
          message: `Too many failed attempts. Try again in ${remainingTime} seconds`,
          lockoutUntil: new Date(attempt.lockoutUntil).toISOString(),
        });
      }

      // Reset if lockout period has passed
      if (attempt.lockoutUntil <= now && attempt.lockoutUntil > 0) {
        attempt.count = 0;
        attempt.lockoutUntil = 0;
      }

      // Continue to next middleware
      next();

      // Monitor response to count failed attempts
      const originalSend = res.send;
      res.send = function(data) {
        const response = typeof data === 'string' ? JSON.parse(data) : data;
        
        if (res.statusCode === 401 || (response && !response.success)) {
          // Failed attempt
          attempt.count++;
          
          if (attempt.count >= MAX_ATTEMPTS) {
            attempt.lockoutUntil = now + LOCKOUT_TIME;
            console.warn(`Account locked due to brute force: ${key}`);
          }
        } else if (res.statusCode === 200 && response && response.success) {
          // Successful attempt - reset counter
          attempt.count = 0;
          attempt.lockoutUntil = 0;
        }

        originalSend.call(this, data);
      };
    };
  }

  /**
   * Input sanitization middleware
   * @returns {Function} Input sanitization middleware
   */
  static sanitizeInput() {
    return (req, res, next) => {
      const sanitize = (obj) => {
        if (typeof obj === 'string') {
          // Remove potentially dangerous characters
          return obj
            .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
            .replace(/javascript:/gi, '')
            .replace(/on\w+\s*=/gi, '')
            .replace(/[<>]/g, '');
        }
        
        if (Array.isArray(obj)) {
          return obj.map(sanitize);
        }
        
        if (typeof obj === 'object' && obj !== null) {
          const sanitized = {};
          for (const [key, value] of Object.entries(obj)) {
            sanitized[key] = sanitize(value);
          }
          return sanitized;
        }
        
        return obj;
      };

      if (req.body) {
        req.body = sanitize(req.body);
      }
      
      if (req.query) {
        req.query = sanitize(req.query);
      }

      next();
    };
  }

  /**
   * SQL injection protection
   * @returns {Function} SQL injection protection middleware
   */
  static sqlInjectionProtection() {
    const suspiciousPatterns = [
      /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|UNION)\b)/gi,
      /(\b(OR|AND)\s+\d+\s*=\s*\d+)/gi,
      /(--|\/\*|\*\/)/g,
      /(\b(SCRIPT|JAVASCRIPT|VBSCRIPT)\b)/gi,
    ];

    return (req, res, next) => {
      const checkForSQLInjection = (obj) => {
        if (typeof obj === 'string') {
          return suspiciousPatterns.some(pattern => pattern.test(obj));
        }
        
        if (Array.isArray(obj)) {
          return obj.some(checkForSQLInjection);
        }
        
        if (typeof obj === 'object' && obj !== null) {
          return Object.values(obj).some(checkForSQLInjection);
        }
        
        return false;
      };

      const hasSuspiciousContent = 
        checkForSQLInjection(req.body) || 
        checkForSQLInjection(req.query) || 
        checkForSQLInjection(req.params);

      if (hasSuspiciousContent) {
        console.warn(`Potential SQL injection attempt from IP: ${req.ip}`);
        return res.status(400).json({
          success: false,
          error: 'Invalid input detected',
          message: 'Your request contains potentially harmful content',
        });
      }

      next();
    };
  }

  /**
   * XSS protection middleware
   * @returns {Function} XSS protection middleware
   */
  static xssProtection() {
    const xssPatterns = [
      /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
      /javascript:/gi,
      /on\w+\s*=/gi,
      /<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi,
      /<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi,
      /<embed\b[^<]*(?:(?!<\/embed>)<[^<]*)*<\/embed>/gi,
    ];

    return (req, res, next) => {
      const checkForXSS = (obj) => {
        if (typeof obj === 'string') {
          return xssPatterns.some(pattern => pattern.test(obj));
        }
        
        if (Array.isArray(obj)) {
          return obj.some(checkForXSS);
        }
        
        if (typeof obj === 'object' && obj !== null) {
          return Object.values(obj).some(checkForXSS);
        }
        
        return false;
      };

      const hasXSSContent = 
        checkForXSS(req.body) || 
        checkForXSS(req.query) || 
        checkForXSS(req.params);

      if (hasXSSContent) {
        console.warn(`Potential XSS attempt from IP: ${req.ip}`);
        return res.status(400).json({
          success: false,
          error: 'Invalid input detected',
          message: 'Your request contains potentially harmful content',
        });
      }

      next();
    };
  }

  /**
   * Request size limiting
   * @param {Object} options - Size limiting options
   * @returns {Function} Size limiting middleware
   */
  static requestSizeLimit(options = {}) {
    const { maxSize = 10 * 1024 * 1024 } = options; // 10MB default

    return (req, res, next) => {
      const contentLength = parseInt(req.headers['content-length'] || '0');
      
      if (contentLength > maxSize) {
        return res.status(413).json({
          success: false,
          error: 'Request too large',
          message: `Request size exceeds maximum allowed size of ${Math.round(maxSize / 1024 / 1024)}MB`,
        });
      }

      next();
    };
  }

  /**
   * IP whitelist/blacklist middleware
   * @param {Object} options - IP filtering options
   * @returns {Function} IP filtering middleware
   */
  static ipFilter(options = {}) {
    const { whitelist = [], blacklist = [] } = options;

    return (req, res, next) => {
      const clientIP = req.ip || req.connection.remoteAddress;

      // Check blacklist first
      if (blacklist.length > 0 && blacklist.includes(clientIP)) {
        console.warn(`Blocked request from blacklisted IP: ${clientIP}`);
        return res.status(403).json({
          success: false,
          error: 'Access denied',
          message: 'Your IP address has been blocked',
        });
      }

      // Check whitelist if defined
      if (whitelist.length > 0 && !whitelist.includes(clientIP)) {
        console.warn(`Blocked request from non-whitelisted IP: ${clientIP}`);
        return res.status(403).json({
          success: false,
          error: 'Access denied',
          message: 'Your IP address is not authorized',
        });
      }

      next();
    };
  }

  /**
   * Security headers middleware
   * @returns {Function} Security headers middleware
   */
  static securityHeaders() {
    return (req, res, next) => {
      // Prevent clickjacking
      res.setHeader('X-Frame-Options', 'DENY');
      
      // Prevent MIME type sniffing
      res.setHeader('X-Content-Type-Options', 'nosniff');
      
      // Enable XSS protection
      res.setHeader('X-XSS-Protection', '1; mode=block');
      
      // Strict transport security (HTTPS only)
      if (req.secure || req.headers['x-forwarded-proto'] === 'https') {
        res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
      }
      
      // Referrer policy
      res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
      
      // Permissions policy
      res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');

      next();
    };
  }

  /**
   * Request logging for security monitoring
   * @returns {Function} Security logging middleware
   */
  static securityLogging() {
    return (req, res, next) => {
      const startTime = Date.now();
      
      // Log suspicious requests
      const isSuspicious = 
        req.path.includes('..') || 
        req.path.includes('admin') ||
        req.path.includes('config') ||
        req.headers['user-agent']?.includes('bot') ||
        req.headers['user-agent']?.includes('crawler');

      if (isSuspicious) {
        console.warn(`Suspicious request: ${req.method} ${req.path} from ${req.ip}`);
      }

      // Log response time and status
      res.on('finish', () => {
        const duration = Date.now() - startTime;
        
        if (res.statusCode >= 400) {
          console.warn(`Error response: ${res.statusCode} ${req.method} ${req.path} (${duration}ms) from ${req.ip}`);
        }
      });

      next();
    };
  }

  /**
   * Combine multiple security middlewares
   * @param {Array} middlewares - Array of middleware functions
   * @returns {Function} Combined middleware
   */
  static combineSecurityMiddlewares(middlewares) {
    return (req, res, next) => {
      let index = 0;

      const runNext = (error) => {
        if (error) return next(error);
        
        if (index >= middlewares.length) {
          return next();
        }

        const middleware = middlewares[index++];
        
        if (Array.isArray(middleware)) {
          // Handle middleware arrays (like ddosProtection)
          return SecurityMiddleware.combineSecurityMiddlewares(middleware)(req, res, runNext);
        }
        
        middleware(req, res, runNext);
      };

      runNext();
    };
  }
}

module.exports = {
  SecurityMiddleware,
  createAdvancedRateLimit: SecurityMiddleware.createAdvancedRateLimit,
  createSlowDown: SecurityMiddleware.createSlowDown,
  authRateLimit: SecurityMiddleware.authRateLimit,
  apiRateLimit: SecurityMiddleware.apiRateLimit,
  uploadRateLimit: SecurityMiddleware.uploadRateLimit,
  ddosProtection: SecurityMiddleware.ddosProtection,
  bruteForceProtection: SecurityMiddleware.bruteForceProtection,
  sanitizeInput: SecurityMiddleware.sanitizeInput,
  sqlInjectionProtection: SecurityMiddleware.sqlInjectionProtection,
  xssProtection: SecurityMiddleware.xssProtection,
  requestSizeLimit: SecurityMiddleware.requestSizeLimit,
  ipFilter: SecurityMiddleware.ipFilter,
  securityHeaders: SecurityMiddleware.securityHeaders,
  securityLogging: SecurityMiddleware.securityLogging,
  combineSecurityMiddlewares: SecurityMiddleware.combineSecurityMiddlewares,
};