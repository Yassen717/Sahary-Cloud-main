/**
 * Role-Based Access Control (RBAC) Middleware
 * Provides fine-grained permission control based on user roles and permissions
 */

// Define permissions for each role
const ROLE_PERMISSIONS = {
  USER: [
    // Profile permissions
    'profile:read',
    'profile:update',
    
    // VM permissions
    'vm:create',
    'vm:read:own',
    'vm:update:own',
    'vm:delete:own',
    'vm:start:own',
    'vm:stop:own',
    'vm:restart:own',
    
    // Billing permissions
    'billing:read:own',
    'billing:pay:own',
    
    // Usage permissions
    'usage:read:own',
    
    // Solar data permissions (read-only)
    'solar:read',
    
    // Notification permissions
    'notification:read:own',
    'notification:update:own',
  ],

  ADMIN: [
    // All user permissions
    ...this?.USER || [],
    
    // User management
    'user:read:all',
    'user:update:status',
    'user:read:details',
    
    // VM management
    'vm:read:all',
    'vm:update:all',
    'vm:delete:all',
    'vm:start:all',
    'vm:stop:all',
    'vm:restart:all',
    'vm:suspend:all',
    
    // Billing management
    'billing:read:all',
    'billing:create',
    'billing:update',
    'billing:refund',
    
    // Usage monitoring
    'usage:read:all',
    
    // Solar system management
    'solar:read:all',
    'solar:update:status',
    
    // System settings (limited)
    'settings:read',
    'settings:update:limited',
    
    // Notifications
    'notification:create',
    'notification:read:all',
    'notification:send',
    
    // Audit logs
    'audit:read',
    
    // Reports
    'reports:generate',
    'reports:read',
  ],

  SUPER_ADMIN: [
    // All admin permissions
    ...this?.ADMIN || [],
    
    // User management (full)
    'user:create',
    'user:delete',
    'user:update:role',
    'user:impersonate',
    
    // System settings (full)
    'settings:create',
    'settings:update:all',
    'settings:delete',
    
    // Solar system (full control)
    'solar:update:all',
    'solar:configure',
    'solar:maintenance',
    
    // System administration
    'system:backup',
    'system:restore',
    'system:maintenance',
    'system:logs',
    
    // API keys
    'apikey:create',
    'apikey:read',
    'apikey:update',
    'apikey:delete',
    
    // Audit logs (full)
    'audit:read:all',
    'audit:export',
  ],
};

// Fix the circular reference issue
ROLE_PERMISSIONS.ADMIN = [
  // User permissions
  ...ROLE_PERMISSIONS.USER,
  
  // Admin-specific permissions
  'user:read:all',
  'user:update:status',
  'user:read:details',
  'vm:read:all',
  'vm:update:all',
  'vm:delete:all',
  'vm:start:all',
  'vm:stop:all',
  'vm:restart:all',
  'vm:suspend:all',
  'billing:read:all',
  'billing:create',
  'billing:update',
  'billing:refund',
  'usage:read:all',
  'solar:read:all',
  'solar:update:status',
  'settings:read',
  'settings:update:limited',
  'notification:create',
  'notification:read:all',
  'notification:send',
  'audit:read',
  'reports:generate',
  'reports:read',
];

ROLE_PERMISSIONS.SUPER_ADMIN = [
  // Admin permissions
  ...ROLE_PERMISSIONS.ADMIN,
  
  // Super admin-specific permissions
  'user:create',
  'user:delete',
  'user:update:role',
  'user:impersonate',
  'settings:create',
  'settings:update:all',
  'settings:delete',
  'solar:update:all',
  'solar:configure',
  'solar:maintenance',
  'system:backup',
  'system:restore',
  'system:maintenance',
  'system:logs',
  'apikey:create',
  'apikey:read',
  'apikey:update',
  'apikey:delete',
  'audit:read:all',
  'audit:export',
];

// Resource ownership patterns
const OWNERSHIP_PATTERNS = {
  'vm:*:own': (req, resource) => {
    return resource.userId === req.user.userId;
  },
  'billing:*:own': (req, resource) => {
    return resource.userId === req.user.userId;
  },
  'usage:*:own': (req, resource) => {
    return resource.userId === req.user.userId;
  },
  'notification:*:own': (req, resource) => {
    return resource.userId === req.user.userId;
  },
};

class RBACMiddleware {
  /**
   * Check if user has specific permission
   * @param {string} permission - Permission to check
   * @returns {Function} Middleware function
   */
  static requirePermission(permission) {
    return (req, res, next) => {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required',
          message: 'Please authenticate to access this resource',
        });
      }

      const userPermissions = ROLE_PERMISSIONS[req.user.role] || [];
      
      if (!userPermissions.includes(permission)) {
        return res.status(403).json({
          success: false,
          error: 'Insufficient permissions',
          message: `This action requires the '${permission}' permission`,
          requiredPermission: permission,
          userRole: req.user.role,
        });
      }

      next();
    };
  }

  /**
   * Check if user has any of the specified permissions
   * @param {...string} permissions - Permissions to check
   * @returns {Function} Middleware function
   */
  static requireAnyPermission(...permissions) {
    return (req, res, next) => {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required',
          message: 'Please authenticate to access this resource',
        });
      }

      const userPermissions = ROLE_PERMISSIONS[req.user.role] || [];
      const hasPermission = permissions.some(permission => 
        userPermissions.includes(permission)
      );

      if (!hasPermission) {
        return res.status(403).json({
          success: false,
          error: 'Insufficient permissions',
          message: `This action requires one of the following permissions: ${permissions.join(', ')}`,
          requiredPermissions: permissions,
          userRole: req.user.role,
        });
      }

      next();
    };
  }

  /**
   * Check if user has all specified permissions
   * @param {...string} permissions - Permissions to check
   * @returns {Function} Middleware function
   */
  static requireAllPermissions(...permissions) {
    return (req, res, next) => {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required',
          message: 'Please authenticate to access this resource',
        });
      }

      const userPermissions = ROLE_PERMISSIONS[req.user.role] || [];
      const hasAllPermissions = permissions.every(permission => 
        userPermissions.includes(permission)
      );

      if (!hasAllPermissions) {
        const missingPermissions = permissions.filter(permission => 
          !userPermissions.includes(permission)
        );

        return res.status(403).json({
          success: false,
          error: 'Insufficient permissions',
          message: `This action requires all of the following permissions: ${permissions.join(', ')}`,
          missingPermissions,
          userRole: req.user.role,
        });
      }

      next();
    };
  }

  /**
   * Check resource ownership or admin permission
   * @param {string} resourceType - Type of resource (vm, billing, etc.)
   * @param {Function} resourceGetter - Function to get resource from request
   * @returns {Function} Middleware function
   */
  static requireOwnershipOrPermission(resourceType, resourceGetter) {
    return async (req, res, next) => {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required',
          message: 'Please authenticate to access this resource',
        });
      }

      try {
        // Get the resource
        const resource = await resourceGetter(req);
        if (!resource) {
          return res.status(404).json({
            success: false,
            error: 'Resource not found',
            message: 'The requested resource does not exist',
          });
        }

        // Check if user owns the resource
        const ownershipPattern = OWNERSHIP_PATTERNS[`${resourceType}:*:own`];
        const isOwner = ownershipPattern ? ownershipPattern(req, resource) : false;

        // Check if user has admin permissions for this resource type
        const userPermissions = ROLE_PERMISSIONS[req.user.role] || [];
        const hasAdminPermission = userPermissions.some(permission => 
          permission.startsWith(`${resourceType}:`) && permission.includes(':all')
        );

        if (!isOwner && !hasAdminPermission) {
          return res.status(403).json({
            success: false,
            error: 'Access denied',
            message: 'You can only access your own resources or need admin privileges',
          });
        }

        // Add resource and ownership info to request
        req.resource = resource;
        req.isOwner = isOwner;
        req.hasAdminPermission = hasAdminPermission;
        next();
      } catch (error) {
        return res.status(500).json({
          success: false,
          error: 'Resource access check failed',
          message: error.message,
        });
      }
    };
  }

  /**
   * Dynamic permission check based on request context
   * @param {Function} permissionResolver - Function that returns required permission
   * @returns {Function} Middleware function
   */
  static requireDynamicPermission(permissionResolver) {
    return (req, res, next) => {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required',
          message: 'Please authenticate to access this resource',
        });
      }

      try {
        const requiredPermission = permissionResolver(req);
        const userPermissions = ROLE_PERMISSIONS[req.user.role] || [];

        if (!userPermissions.includes(requiredPermission)) {
          return res.status(403).json({
            success: false,
            error: 'Insufficient permissions',
            message: `This action requires the '${requiredPermission}' permission`,
            requiredPermission,
            userRole: req.user.role,
          });
        }

        next();
      } catch (error) {
        return res.status(500).json({
          success: false,
          error: 'Permission check failed',
          message: error.message,
        });
      }
    };
  }

  /**
   * Get user permissions
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next function
   */
  static getUserPermissions(req, res, next) {
    if (!req.user) {
      req.userPermissions = [];
    } else {
      req.userPermissions = ROLE_PERMISSIONS[req.user.role] || [];
    }
    next();
  }

  /**
   * Check if user can perform action on specific resource
   * @param {string} action - Action to perform
   * @param {string} resourceType - Type of resource
   * @param {string} scope - Scope (own, all)
   * @returns {Function} Middleware function
   */
  static canPerformAction(action, resourceType, scope = 'own') {
    return (req, res, next) => {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required',
          message: 'Please authenticate to access this resource',
        });
      }

      const permission = `${resourceType}:${action}:${scope}`;
      const userPermissions = ROLE_PERMISSIONS[req.user.role] || [];

      if (!userPermissions.includes(permission)) {
        return res.status(403).json({
          success: false,
          error: 'Insufficient permissions',
          message: `This action requires the '${permission}' permission`,
          requiredPermission: permission,
          userRole: req.user.role,
        });
      }

      next();
    };
  }

  /**
   * Conditional permission check
   * @param {Function} condition - Condition function
   * @param {string} permission - Permission required if condition is true
   * @returns {Function} Middleware function
   */
  static conditionalPermission(condition, permission) {
    return (req, res, next) => {
      if (!condition(req)) {
        return next();
      }

      return RBACMiddleware.requirePermission(permission)(req, res, next);
    };
  }

  /**
   * Log permission checks for debugging
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next function
   */
  static logPermissionCheck(req, res, next) {
    if (req.user && process.env.NODE_ENV === 'development') {
      const userPermissions = ROLE_PERMISSIONS[req.user.role] || [];
      console.log(`Permission Check: ${req.method} ${req.path} - User: ${req.user.email} (${req.user.role})`);
      console.log(`Available permissions:`, userPermissions);
    }
    next();
  }

  /**
   * Get all permissions for a role
   * @param {string} role - Role name
   * @returns {Array} Array of permissions
   */
  static getPermissionsForRole(role) {
    return ROLE_PERMISSIONS[role] || [];
  }

  /**
   * Check if role has specific permission
   * @param {string} role - Role name
   * @param {string} permission - Permission to check
   * @returns {boolean} Has permission
   */
  static roleHasPermission(role, permission) {
    const permissions = ROLE_PERMISSIONS[role] || [];
    return permissions.includes(permission);
  }

  /**
   * Get minimum role required for permission
   * @param {string} permission - Permission to check
   * @returns {string|null} Minimum role or null if permission doesn't exist
   */
  static getMinimumRoleForPermission(permission) {
    const roles = ['USER', 'ADMIN', 'SUPER_ADMIN'];
    
    for (const role of roles) {
      if (RBACMiddleware.roleHasPermission(role, permission)) {
        return role;
      }
    }
    
    return null;
  }
}

module.exports = {
  RBACMiddleware,
  ROLE_PERMISSIONS,
  OWNERSHIP_PATTERNS,
  requirePermission: RBACMiddleware.requirePermission,
  requireAnyPermission: RBACMiddleware.requireAnyPermission,
  requireAllPermissions: RBACMiddleware.requireAllPermissions,
  requireOwnershipOrPermission: RBACMiddleware.requireOwnershipOrPermission,
  requireDynamicPermission: RBACMiddleware.requireDynamicPermission,
  getUserPermissions: RBACMiddleware.getUserPermissions,
  canPerformAction: RBACMiddleware.canPerformAction,
  conditionalPermission: RBACMiddleware.conditionalPermission,
  logPermissionCheck: RBACMiddleware.logPermissionCheck,
  getPermissionsForRole: RBACMiddleware.getPermissionsForRole,
  roleHasPermission: RBACMiddleware.roleHasPermission,
  getMinimumRoleForPermission: RBACMiddleware.getMinimumRoleForPermission,
};