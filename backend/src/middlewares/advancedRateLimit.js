const rateLimit = require('express-rate-limit');
const RedisStore = require('rate-limit-redis');
const redisService = require('../services/redisService');
const { RateLimitError } = require('../utils/errors');
const logger = require('../utils/logger');

/**
 * Advanced Rate Limiting Middleware
 * Provides flexible rate limiting with Redis store
 */

/**
 * Create rate limiter with Redis store
 * @param {Object} options - Rate limit options
 * @returns {Function} Rate limit middleware
 */
const createRateLimiter = (options = {}) => {
  const {
    windowMs = 15 * 60 * 1000, // 15 minutes
    max = 100, // limit each IP to 100 requests per windowMs
    message = 'Too many requests, please try again later',
    skipSuccessfulRequests = false,
    skipFailedRequests = false,
    keyGenerator = null,
  } = options;

  const limiter = rateLimit({
    windowMs,
    max,
    message: {
      success: false,
      error: message,
      retryAfter: Math.ceil(windowMs / 1000),
    },
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests,
    skipFailedRequests,
    keyGenerator: keyGenerator || ((req) => {
      return req.ip || req.connection.remoteAddress;
    }),
    handler: (req, res) => {
      logger.logSecurity('Rate limit exceeded', {
        ip: req.ip,
        path: req.path,
        method: req.method,
      });

      throw new RateLimitError(message, Math.ceil(windowMs / 1000));
    },
    // Use Redis store if available
    ...(redisService.isReady() && {
      store: new RedisStore({
        client: redisService.getClient(),
        prefix: 'rate_limit:',
      }),
    }),
  });

  return limiter;
};

/**
 * Strict rate limiter for authentication endpoints
 */
const authRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 requests per 15 minutes
  message: 'Too many authentication attempts, please try again later',
  skipSuccessfulRequests: true,
});

/**
 * API rate limiter
 */
const apiRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per 15 minutes
  message: 'API rate limit exceeded',
});

/**
 * Strict rate limiter for sensitive operations
 */
const strictRateLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // 10 requests per hour
  message: 'Rate limit exceeded for sensitive operation',
});

/**
 * User-based rate limiter
 */
const userRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 200,
  keyGenerator: (req) => {
    return req.user?.id || req.ip;
  },
});

/**
 * Endpoint-specific rate limiter
 */
const endpointRateLimiter = (endpoint, max = 50) => {
  return createRateLimiter({
    windowMs: 15 * 60 * 1000,
    max,
    keyGenerator: (req) => {
      return `${req.ip}:${endpoint}`;
    },
  });
};

/**
 * Dynamic rate limiter based on user role
 */
const roleBasedRateLimiter = (req, res, next) => {
  const role = req.user?.role || 'GUEST';
  
  const limits = {
    SUPER_ADMIN: 1000,
    ADMIN: 500,
    USER: 100,
    GUEST: 50,
  };

  const max = limits[role] || limits.GUEST;

  const limiter = createRateLimiter({
    windowMs: 15 * 60 * 1000,
    max,
    keyGenerator: (req) => {
      return req.user?.id || req.ip;
    },
  });

  return limiter(req, res, next);
};

/**
 * Sliding window rate limiter
 */
const slidingWindowLimiter = async (req, res, next) => {
  if (!redisService.isReady()) {
    return next();
  }

  const key = `sliding_window:${req.ip}`;
  const now = Date.now();
  const windowMs = 60 * 1000; // 1 minute
  const maxRequests = 60;

  try {
    // Add current request timestamp
    await redisService.getClient().zAdd(key, { score: now, value: `${now}` });

    // Remove old entries outside the window
    await redisService.getClient().zRemRangeByScore(key, 0, now - windowMs);

    // Count requests in current window
    const count = await redisService.getClient().zCard(key);

    // Set expiry on the key
    await redisService.getClient().expire(key, Math.ceil(windowMs / 1000));

    if (count > maxRequests) {
      logger.logSecurity('Sliding window rate limit exceeded', {
        ip: req.ip,
        count,
        max: maxRequests,
      });

      throw new RateLimitError('Rate limit exceeded', Math.ceil(windowMs / 1000));
    }

    next();
  } catch (error) {
    if (error instanceof RateLimitError) {
      next(error);
    } else {
      logger.error('Sliding window limiter error:', error);
      next();
    }
  }
};

/**
 * Burst rate limiter
 * Allows short bursts but limits sustained traffic
 */
const burstRateLimiter = createRateLimiter({
  windowMs: 1000, // 1 second
  max: 10, // 10 requests per second
  message: 'Too many requests in a short time',
});

module.exports = {
  createRateLimiter,
  authRateLimiter,
  apiRateLimiter,
  strictRateLimiter,
  userRateLimiter,
  endpointRateLimiter,
  roleBasedRateLimiter,
  slidingWindowLimiter,
  burstRateLimiter,
};
