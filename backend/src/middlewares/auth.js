const JWTUtils = require('../utils/jwt');
const AuthService = require('../services/authService');
const { createClient } = require('redis');

/**
 * Authentication and Authorization Middleware
 */
class AuthMiddleware {
  /**
   * Authenticate user using JWT token
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next function
   */
  static async authenticate(req, res, next) {
    try {
      // Get token from header
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required',
          message: 'No valid authorization header provided',
        });
      }

      const token = authHeader.substring(7); // Remove 'Bearer ' prefix

      // Check if token is blacklisted (if Redis is available)
      let redisClient = null;
      try {
        redisClient = createClient({ url: process.env.REDIS_URL });
        await redisClient.connect();
        
        const isBlacklisted = await JWTUtils.isTokenBlacklisted(token, redisClient);
        if (isBlacklisted) {
          await redisClient.quit();
          return res.status(401).json({
            success: false,
            error: 'Token invalid',
            message: 'Token has been revoked',
          });
        }
        
        await redisClient.quit();
      } catch (redisError) {
        // Redis not available, continue without blacklist check
        console.warn('Redis not available for token blacklist check:', redisError.message);
      }

      // Verify token
      const decoded = await JWTUtils.verifyAccessToken(token);

      // Get user from database to ensure they still exist and are active
      const user = await AuthService.getUserById(decoded.userId);
      if (!user) {
        return res.status(401).json({
          success: false,
          error: 'User not found',
          message: 'Token user no longer exists',
        });
      }

      if (!user.isActive) {
        return res.status(401).json({
          success: false,
          error: 'Account deactivated',
          message: 'User account has been deactivated',
        });
      }

      // Add user info to request object
      req.user = {
        userId: user.id,
        email: user.email,
        role: user.role,
        isVerified: user.isVerified,
        firstName: user.firstName,
        lastName: user.lastName,
      };

      req.token = token;
      next();
    } catch (error) {
      return res.status(401).json({
        success: false,
        error: 'Authentication failed',
        message: error.message,
      });
    }
  }

  /**
   * Optional authentication - doesn't fail if no token provided
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next function
   */
  static async optionalAuth(req, res, next) {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        // No token provided, continue without authentication
        req.user = null;
        return next();
      }

      // Use the authenticate method but don't fail if it doesn't work
      await AuthMiddleware.authenticate(req, res, (error) => {
        if (error) {
          req.user = null;
        }
        next();
      });
    } catch (error) {
      req.user = null;
      next();
    }
  }

  /**
   * Require specific role(s)
   * @param {...string} roles - Required roles
   * @returns {Function} Middleware function
   */
  static requireRole(...roles) {
    return (req, res, next) => {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required',
          message: 'Please authenticate to access this resource',
        });
      }

      if (!roles.includes(req.user.role)) {
        return res.status(403).json({
          success: false,
          error: 'Insufficient permissions',
          message: `This action requires one of the following roles: ${roles.join(', ')}`,
          requiredRoles: roles,
          userRole: req.user.role,
        });
      }

      next();
    };
  }

  /**
   * Require admin role (ADMIN or SUPER_ADMIN)
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next function
   */
  static requireAdmin(req, res, next) {
    return AuthMiddleware.requireRole('ADMIN', 'SUPER_ADMIN')(req, res, next);
  }

  /**
   * Require super admin role
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next function
   */
  static requireSuperAdmin(req, res, next) {
    return AuthMiddleware.requireRole('SUPER_ADMIN')(req, res, next);
  }

  /**
   * Require email verification
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next function
   */
  static requireEmailVerification(req, res, next) {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
        message: 'Please authenticate to access this resource',
      });
    }

    if (!req.user.isVerified) {
      return res.status(403).json({
        success: false,
        error: 'Email verification required',
        message: 'Please verify your email address to access this resource',
        emailVerificationRequired: true,
      });
    }

    next();
  }

  /**
   * Check if user owns resource or is admin
   * @param {string} userIdParam - Parameter name containing user ID
   * @returns {Function} Middleware function
   */
  static requireOwnershipOrAdmin(userIdParam = 'userId') {
    return (req, res, next) => {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required',
          message: 'Please authenticate to access this resource',
        });
      }

      const resourceUserId = req.params[userIdParam] || req.body[userIdParam];
      const isOwner = req.user.userId === resourceUserId;
      const isAdmin = ['ADMIN', 'SUPER_ADMIN'].includes(req.user.role);

      if (!isOwner && !isAdmin) {
        return res.status(403).json({
          success: false,
          error: 'Access denied',
          message: 'You can only access your own resources or need admin privileges',
        });
      }

      // Add ownership info to request
      req.isOwner = isOwner;
      req.isAdmin = isAdmin;
      next();
    };
  }

  /**
   * Rate limiting middleware factory
   * @param {Object} options - Rate limiting options
   * @returns {Function} Rate limiting middleware
   */
  static createRateLimit(options = {}) {
    const rateLimit = require('express-rate-limit');
    
    const {
      windowMs = 15 * 60 * 1000, // 15 minutes
      max = 100, // requests per window
      message = 'Too many requests from this IP, please try again later',
      skipSuccessfulRequests = false,
      skipFailedRequests = false,
    } = options;

    return rateLimit({
      windowMs,
      max,
      message: {
        success: false,
        error: 'Rate limit exceeded',
        message,
      },
      standardHeaders: true,
      legacyHeaders: false,
      skipSuccessfulRequests,
      skipFailedRequests,
    });
  }

  /**
   * API key authentication (for external integrations)
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next function
   */
  static async authenticateApiKey(req, res, next) {
    try {
      const apiKey = req.headers['x-api-key'] || req.query.apiKey;
      
      if (!apiKey) {
        return res.status(401).json({
          success: false,
          error: 'API key required',
          message: 'Please provide a valid API key',
        });
      }

      // In a real implementation, you'd validate the API key against a database
      // For now, we'll use a simple environment variable check
      const validApiKeys = (process.env.VALID_API_KEYS || '').split(',');
      
      if (!validApiKeys.includes(apiKey)) {
        return res.status(401).json({
          success: false,
          error: 'Invalid API key',
          message: 'The provided API key is not valid',
        });
      }

      // Add API key info to request
      req.apiKey = apiKey;
      req.isApiRequest = true;
      next();
    } catch (error) {
      return res.status(401).json({
        success: false,
        error: 'API key authentication failed',
        message: error.message,
      });
    }
  }

  /**
   * Check if request is from same user or admin (for profile operations)
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next function
   */
  static requireSelfOrAdmin(req, res, next) {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
        message: 'Please authenticate to access this resource',
      });
    }

    const targetUserId = req.params.userId || req.params.id;
    const isSelf = req.user.userId === targetUserId;
    const isAdmin = ['ADMIN', 'SUPER_ADMIN'].includes(req.user.role);

    if (!isSelf && !isAdmin) {
      return res.status(403).json({
        success: false,
        error: 'Access denied',
        message: 'You can only access your own profile or need admin privileges',
      });
    }

    req.isSelf = isSelf;
    req.isAdmin = isAdmin;
    next();
  }

  /**
   * Conditional middleware - apply middleware only if condition is met
   * @param {Function} condition - Condition function
   * @param {Function} middleware - Middleware to apply
   * @returns {Function} Conditional middleware
   */
  static conditional(condition, middleware) {
    return (req, res, next) => {
      if (condition(req)) {
        return middleware(req, res, next);
      }
      next();
    };
  }

  /**
   * Log authentication events
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next function
   */
  static logAuthEvent(req, res, next) {
    if (req.user) {
      console.log(`Auth Event: ${req.method} ${req.path} - User: ${req.user.email} (${req.user.role})`);
    }
    next();
  }

  /**
   * Validate session (check if user session is still valid)
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next function
   */
  static async validateSession(req, res, next) {
    try {
      if (!req.user || !req.token) {
        return next();
      }

      // Check if session exists in database
      const session = await prisma.session.findFirst({
        where: {
          userId: req.user.userId,
          data: {
            path: ['accessToken'],
            equals: req.token
          },
          expiresAt: {
            gt: new Date()
          }
        }
      });

      if (!session) {
        return res.status(401).json({
          success: false,
          error: 'Session expired',
          message: 'Your session has expired, please login again',
        });
      }

      next();
    } catch (error) {
      console.error('Session validation error:', error);
      next(); // Continue without session validation if there's an error
    }
  }

  /**
   * Check feature flags
   * @param {string} feature - Feature name
   * @returns {Function} Middleware function
   */
  static requireFeature(feature) {
    return (req, res, next) => {
      const { isFeatureEnabled } = require('../config/auth');
      
      if (!isFeatureEnabled(feature)) {
        return res.status(403).json({
          success: false,
          error: 'Feature not available',
          message: `The ${feature} feature is currently disabled`,
        });
      }

      next();
    };
  }

  /**
   * Combine multiple middleware functions
   * @param {...Function} middlewares - Middleware functions to combine
   * @returns {Function} Combined middleware
   */
  static combine(...middlewares) {
    return (req, res, next) => {
      let index = 0;

      const runNext = (error) => {
        if (error) return next(error);
        
        if (index >= middlewares.length) {
          return next();
        }

        const middleware = middlewares[index++];
        middleware(req, res, runNext);
      };

      runNext();
    };
  }
}

// Export individual middleware functions for convenience
module.exports = {
  AuthMiddleware,
  authenticate: AuthMiddleware.authenticate,
  optionalAuth: AuthMiddleware.optionalAuth,
  requireRole: AuthMiddleware.requireRole,
  requireAdmin: AuthMiddleware.requireAdmin,
  requireSuperAdmin: AuthMiddleware.requireSuperAdmin,
  requireEmailVerification: AuthMiddleware.requireEmailVerification,
  requireOwnershipOrAdmin: AuthMiddleware.requireOwnershipOrAdmin,
  requireSelfOrAdmin: AuthMiddleware.requireSelfOrAdmin,
  createRateLimit: AuthMiddleware.createRateLimit,
  authenticateApiKey: AuthMiddleware.authenticateApiKey,
  conditional: AuthMiddleware.conditional,
  logAuthEvent: AuthMiddleware.logAuthEvent,
  validateSession: AuthMiddleware.validateSession,
  requireFeature: AuthMiddleware.requireFeature,
  combine: AuthMiddleware.combine,
};