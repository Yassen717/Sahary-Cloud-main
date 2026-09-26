import {
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
} from './auth';
import {
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
} from './rbac';
import {
  SecurityMiddleware,
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
  combineSecurityMiddlewares,
} from './security';
import {
  validate, sanitize, customValidators, createValidator,
} from './validation';

type Middleware = (...args: any[]) => unknown;
type MiddlewareItem = Middleware | Middleware[];
type MiddlewareChain = Middleware[];

const commonMiddleware = {
  basicSecurity: [
    securityHeaders(),
    sanitizeInput(),
    xssProtection(),
    sqlInjectionProtection(),
  ],
  authenticated: [
    authenticate,
    logAuthEvent,
  ],
  adminOnly: [
    authenticate,
    requireAdmin,
    logAuthEvent,
  ],
  superAdminOnly: [
    authenticate,
    requireSuperAdmin,
    logAuthEvent,
  ],
  verifiedOnly: [
    authenticate,
    requireEmailVerification,
    logAuthEvent,
  ],
  apiWithRateLimit: [
    apiRateLimit(),
    authenticate,
    logAuthEvent,
  ],
  publicApiWithRateLimit: [
    apiRateLimit(),
    optionalAuth,
  ],
  uploadEndpoint: [
    uploadRateLimit(),
    authenticate,
    requireEmailVerification,
    requestSizeLimit({ maxSize: 50 * 1024 * 1024 }),
  ],
  highSecurity: [
    authRateLimit(),
    authenticate,
    requireAdmin,
    requireEmailVerification,
    logAuthEvent,
    logPermissionCheck,
  ],
  ddosProtected: [
    ...ddosProtection(),
    securityLogging(),
  ],
};

const createMiddlewareChain = (...middlewares: MiddlewareItem[]): MiddlewareChain => {
  const flatten = (items: MiddlewareItem[]): Middleware[] => items.reduce<Middleware[]>((flat, item) => flat.concat(Array.isArray(item) ? flatten(item) : item), []);

  return flatten(middlewares);
};

const applyIf = (condition: (req: unknown) => boolean, middleware: MiddlewareItem): Middleware => {
  // Flatten once — every item in the chain must run, not just the first.
  const chain = createMiddlewareChain(...(Array.isArray(middleware) ? middleware : [middleware]));

  return (req, res, next) => {
    if (!condition(req)) {
      next();
      return;
    }

    let index = 0;

    const runNext = (error?: unknown): void => {
      if (error) {
        next(error);
        return;
      }

      if (index >= chain.length) {
        next();
        return;
      }

      const current = chain[index++];

      try {
        // Forward async rejections to next() so a throwing middleware can't
        // hang the request or produce an unhandled rejection.
        Promise.resolve(current(req, res, runNext)).catch(runNext);
      } catch (error) {
        runNext(error);
      }
    };

    runNext();
  };
};

const resourceMiddleware = {
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
  solar: {
    read: [
      optionalAuth,
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

const environmentMiddleware: Record<string, Record<string, Middleware | Middleware[]>> = {
  development: {
    rateLimit: createAdvancedRateLimit({ max: 1000 }),
    logging: [logAuthEvent, logPermissionCheck],
  },
  test: {
    rateLimit: createAdvancedRateLimit({ max: 10000 }),
    logging: [],
  },
  production: {
    rateLimit: createAdvancedRateLimit({ max: 100 }),
    security: [
      ...commonMiddleware.basicSecurity,
      ...ddosProtection(),
      securityLogging(),
    ],
    logging: [logAuthEvent, logPermissionCheck, securityLogging()],
  },
};

const getEnvironmentMiddleware = (type: string): Middleware | Middleware[] => {
  const env = process.env.NODE_ENV || 'development';
  return environmentMiddleware[env]?.[type] || [];
};

export {
  AuthMiddleware,
  RBACMiddleware,
  SecurityMiddleware,
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
  OWNERSHIP_PATTERNS,
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
  validate,
  sanitize,
  customValidators,
  createValidator,
  createRateLimit,
  conditional,
  combine,
  logAuthEvent,
  logPermissionCheck,
  commonMiddleware,
  resourceMiddleware,
  environmentMiddleware,
  createMiddlewareChain,
  applyIf,
  getEnvironmentMiddleware,
  combineSecurityMiddlewares,
};

export default {
  AuthMiddleware,
  RBACMiddleware,
  SecurityMiddleware,
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
  OWNERSHIP_PATTERNS,
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
  validate,
  sanitize,
  customValidators,
  createValidator,
  createRateLimit,
  conditional,
  combine,
  logAuthEvent,
  logPermissionCheck,
  commonMiddleware,
  resourceMiddleware,
  environmentMiddleware,
  createMiddlewareChain,
  applyIf,
  getEnvironmentMiddleware,
  combineSecurityMiddlewares,
};
