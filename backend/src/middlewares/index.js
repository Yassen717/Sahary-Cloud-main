// Authentication middleware
const {
  AuthMiddleware,
  authenticate,
  optionalAuth,
  requireRole,
  requireAdmin,
  requireSuperAdmin,
  requireEmailVerification,
  requireOwnershipOrAdmin,
  requireSelfOrAdmin,
  createRateLimit,
  authenticateApiKey,
  conditional,
  logAuthEvent,
  validateSession,
  requireFeature,
  combine,
} = require('./auth');

// RBAC middleware
const {
  RBACMiddleware,
  ROLE_PERMISSIONS,
  OWNERSHIP_PATTERNS,
  requirePermission,
  requireAnyPermission,
  requireAllPermissions,
  requireOwnershipOrPermission,
  requireDynamicPermission,
  getUserPermissions,
  canPerformAction,
  conditionalPermission,
  logPermissionCheck,
  getPermissionsForRole,
  roleHasPermission,
  getMinimumRoleForPermission,
} = require('./rbac');

// Security middleware
const {
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
} = require('./security');

// Validation middleware
const { validate, sanitize, customValidators, createValidator } = require('./validation');

/**
 * Common middleware combinations for different use cases
 */
const commonMiddleware = {
  // Basic security for all routes
  basicSecurity: [
    securityHeaders(),
    sanitizeInput(),
    xssProtection(),
    sqlInjectionProtection(),
  ],

  // Authentication required
  authenticated: [
    authenticate,
    logAuthEvent,
  ],

  // Admin access required
  adminOnly: [
    authenticate,
    requireAdmin,
    logAuthEvent,
  ],

  // Super admin access required
  superAdminOnly: [
    authenticate,
    requireSuperAdmin,
    logAuthEvent,
  ],

  // Email verification required
  verifiedOnly: [
    authenticate,
    requireEmailVerification,
    logAuthEvent,
  ],

  // API with rate limiting
  apiWithRateLimit: [
    apiRateLimit(),
    authenticate,
    logAuthEvent,
  ],

  // Public API with rate limiting
  publicApiWithRateLimit: [
    apiRateLimit(),
    optionalAuth,
  ],

  // Upload endpoints
  uploadEndpoint: [
    uploadRateLimit(),
    authenticate,
    requireEmailVerification,
    requestSizeLimit({ maxSize: 50 * 1024 * 1024 }), // 50MB for uploads
  ],

  // High security endpoints (admin operations)
  highSecurity: [
    authRateLimit(),
    authenticate,
    requireAdmin,
    requireEmailVerification,
    logAuthEvent,
    logPermissionCheck,
  ],

  // DDoS protection for public endpoints
  ddosProtected: [
    ...ddosProtection(),
    securityLogging(),
  ],
};

/**
 * Create middleware chain
 * @param {...Function|Array} middlewares - Middleware functions or arrays
 * @returns {Array} Flattened middleware array
 */
const createMiddlewareChain = (...middlewares) => {
  const flatten = (arr) => {
    return arr.reduce((flat, item) => {
      return flat.concat(Array.isArray(item) ? flatten(item) : item);
    }, []);
  };

  return flatten(middlewares);
};

/**
 * Apply middleware conditionally
 * @param {Function} condition - Condition function
 * @param {Function|Array} middleware - Middleware to apply
 * @returns {Function} Conditional middleware
 */
const applyIf = (condition, middleware) => {
  return (req, res, next) => {
    if (condition(req)) {
      if (Array.isArray(middleware)) {
        return createMiddlewareChain(...middleware)[0](req, res, next);
      }
      return middleware(req, res, next);
    }
    next();
  };
};

/**
 * Resource-specific middleware factories
 */
const resourceMiddleware = {
  // VM resource middleware
  vm: {
    create: [
      authenticate,
      requireEmailVerification,
      requirePermission('vm:create'),
      logAuthEvent,
    ],
    read: (isOwn = true) => [
      authenticate,
      requirePermission(isOwn ? 'vm:read:own' : 'vm:read:all'),
    ],
    update: (isOwn = true) => [
      authenticate,
      requireEmailVerification,
      requirePermission(isOwn ? 'vm:update:own' : 'vm:update:all'),
      logAuthEvent,
    ],
    delete: (isOwn = true) => [
      authenticate,
      requireEmailVerification,
      requirePermission(isOwn ? 'vm:delete:own' : 'vm:delete:all'),
      logAuthEvent,
    ],
  },

  // User resource middleware
  user: {
    profile: [
      authenticate,
      requireSelfOrAdmin,
    ],
    management: [
      authenticate,
      requireAdmin,
      requirePermission('user:read:all'),
      logAuthEvent,
    ],
  },

  // Billing resource middleware
  billing: {
    read: (isOwn = true) => [
      authenticate,
      requirePermission(isOwn ? 'billing:read:own' : 'billing:read:all'),
    ],
    pay: [
      authenticate,
      requireEmailVerification,
      requirePermission('billing:pay:own'),
      logAuthEvent,
    ],
    manage: [
      authenticate,
      requireAdmin,
      requirePermission('billing:create'),
      logAuthEvent,
    ],
  },

  // Solar resource middleware
  solar: {
    read: [
      optionalAuth, // Solar data can be public
      requirePermission('solar:read'),
    ],
    manage: [
      authenticate,
      requireAdmin,
      requirePermission('solar:update:status'),
      logAuthEvent,
    ],
    configure: [
      authenticate,
      requireSuperAdmin,
      requirePermission('solar:configure'),
      logAuthEvent,
    ],
  },
};

/**
 * Environment-specific middleware
 */
const environmentMiddleware = {
  development: {
    // More permissive rate limiting
    rateLimit: createAdvancedRateLimit({ max: 1000 }),
    // Additional logging
    logging: [logAuthEvent, logPermissionCheck],
  },
  
  test: {
    // Very permissive for testing
    rateLimit: createAdvancedRateLimit({ max: 10000 }),
    // Minimal logging
    logging: [],
  },
  
  production: {
    // Strict rate limiting
    rateLimit: createAdvancedRateLimit({ max: 100 }),
    // Full security stack
    security: [
      ...commonMiddleware.basicSecurity,
      ...ddosProtection(),
      securityLogging(),
    ],
    // Comprehensive logging
    logging: [logAuthEvent, logPermissionCheck, securityLogging()],
  },
};

/**
 * Get environment-specific middleware
 * @param {string} type - Middleware type
 * @returns {Array} Environment-specific middleware
 */
const getEnvironmentMiddleware = (type) => {
  const env = process.env.NODE_ENV || 'development';
  return environmentMiddleware[env]?.[type] || [];
};

module.exports = {
  // Core middleware classes
  AuthMiddleware,
  RBACMiddleware,
  SecurityMiddleware,

  // Authentication middleware
  authenticate,
  optionalAuth,
  requireRole,
  requireAdmin,
  requireSuperAdmin,
  requireEmailVerification,
  requireOwnershipOrAdmin,
  requireSelfOrAdmin,
  authenticateApiKey,
  validateSession,
  requireFeature,

  // RBAC middleware
  requirePermission,
  requireAnyPermission,
  requireAllPermissions,
  requireOwnershipOrPermission,
  requireDynamicPermission,
  getUserPermissions,
  canPerformAction,
  conditionalPermission,
  getPermissionsForRole,
  roleHasPermission,
  getMinimumRoleForPermission,
  ROLE_PERMISSIONS,

  // Security middleware
  createAdvancedRateLimit,
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

  // Validation middleware
  validate,
  sanitize,
  createValidator,

  // Utility functions
  createRateLimit,
  conditional,
  combine,
  logAuthEvent,
  logPermissionCheck,

  // Common middleware combinations
  commonMiddleware,
  resourceMiddleware,
  environmentMiddleware,

  // Helper functions
  createMiddlewareChain,
  applyIf,
  getEnvironmentMiddleware,
};