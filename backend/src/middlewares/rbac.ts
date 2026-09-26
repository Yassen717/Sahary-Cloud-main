import type { NextFunction, Response } from 'express';
import type { AuthRequest } from './auth';

export type Role = 'USER' | 'ADMIN' | 'SUPER_ADMIN';

export type Permission =
  | 'profile:read'
  | 'profile:update'
  | 'vm:create'
  | 'vm:read:own'
  | 'vm:update:own'
  | 'vm:delete:own'
  | 'vm:start:own'
  | 'vm:stop:own'
  | 'vm:restart:own'
  | 'vm:create:own'
  | 'vm:manage:own'
  | 'invoice:read:own'
  | 'payment:create'
  | 'payment:read:own'
  | 'billing:read:own'
  | 'billing:pay:own'
  | 'usage:read:own'
  | 'solar:read'
  | 'notification:read:own'
  | 'notification:update:own'
  | 'user:read:all'
  | 'user:update:status'
  | 'user:read:details'
  | 'vm:read:all'
  | 'vm:update:all'
  | 'vm:delete:all'
  | 'vm:start:all'
  | 'vm:stop:all'
  | 'vm:restart:all'
  | 'vm:suspend:all'
  | 'vm:create:all'
  | 'vm:manage:all'
  | 'invoice:read:all'
  | 'invoice:create'
  | 'invoice:update'
  | 'payment:read:all'
  | 'payment:refund'
  | 'docker:manage'
  | 'admin:access'
  | 'admin:super'
  | 'billing:read:all'
  | 'billing:create'
  | 'billing:update'
  | 'billing:refund'
  | 'usage:read:all'
  | 'solar:read:all'
  | 'solar:update:status'
  | 'settings:read'
  | 'settings:update:limited'
  | 'notification:create'
  | 'notification:read:all'
  | 'notification:send'
  | 'audit:read'
  | 'reports:generate'
  | 'reports:read'
  | 'user:create'
  | 'user:delete'
  | 'user:update:role'
  | 'user:impersonate'
  | 'settings:create'
  | 'settings:update:all'
  | 'settings:delete'
  | 'solar:update:all'
  | 'solar:configure'
  | 'solar:maintenance'
  | 'system:backup'
  | 'system:restore'
  | 'system:maintenance'
  | 'system:logs'
  | 'apikey:create'
  | 'apikey:read'
  | 'apikey:update'
  | 'apikey:delete'
  | 'audit:read:all'
  | 'audit:export';

export interface RBACResource {
  userId?: string;
  [key: string]: unknown;
}

export interface RBACRequest extends AuthRequest {
  resource?: RBACResource;
  userPermissions?: Permission[];
  hasAdminPermission?: boolean;
}

type Middleware = (req: RBACRequest, res: Response, next: NextFunction) => unknown;
type ResourceGetter = (req: RBACRequest) => Promise<RBACResource | null | undefined> | RBACResource | null | undefined;
type PermissionResolver = (req: RBACRequest) => Permission;
type Condition = (req: RBACRequest) => boolean;

const USER_PERMISSIONS: Permission[] = [
  'profile:read',
  'profile:update',
  'vm:create',
  'vm:read:own',
  'vm:update:own',
  'vm:delete:own',
  'vm:start:own',
  'vm:stop:own',
  'vm:restart:own',
  'vm:create:own',
  'vm:manage:own',
  'invoice:read:own',
  'payment:create',
  'payment:read:own',
  'billing:read:own',
  'billing:pay:own',
  'usage:read:own',
  'solar:read',
  'notification:read:own',
  'notification:update:own',
];

const ADMIN_PERMISSIONS: Permission[] = [
  ...USER_PERMISSIONS,
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
  'vm:create:all',
  'vm:manage:all',
  'invoice:read:all',
  'invoice:create',
  'invoice:update',
  'payment:read:all',
  'payment:refund',
  'docker:manage',
  'admin:access',
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

const SUPER_ADMIN_PERMISSIONS: Permission[] = [
  ...ADMIN_PERMISSIONS,
  'admin:super',
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

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  USER: USER_PERMISSIONS,
  ADMIN: ADMIN_PERMISSIONS,
  SUPER_ADMIN: SUPER_ADMIN_PERMISSIONS,
};

export const OWNERSHIP_PATTERNS: Record<string, (req: RBACRequest, resource: RBACResource) => boolean> = {
  'vm:*:own': (req, resource) => resource.userId === req.user?.userId,
  'billing:*:own': (req, resource) => resource.userId === req.user?.userId,
  'usage:*:own': (req, resource) => resource.userId === req.user?.userId,
  'notification:*:own': (req, resource) => resource.userId === req.user?.userId,
};

const resolvePermissionsForRole = (role: string): Permission[] => ROLE_PERMISSIONS[role as Role] || [];

const hasPermission = (role: string, permission: string): boolean => resolvePermissionsForRole(role).includes(permission as Permission);

export class RBACMiddleware {
  static requirePermission(permission: Permission): Middleware {
    return (req, res, next) => {
      if (!req.user) {
        res.status(401).json({
          success: false,
          error: 'Authentication required',
          message: 'Please authenticate to access this resource',
        });
        return;
      }

      const userPermissions = resolvePermissionsForRole(req.user.role);

      if (!userPermissions.includes(permission)) {
        res.status(403).json({
          success: false,
          error: 'Insufficient permissions',
          message: `This action requires the '${permission}' permission`,
          requiredPermission: permission,
          userRole: req.user.role,
        });
        return;
      }

      next();
    };
  }

  static requireAnyPermission(...permissions: Permission[]): Middleware {
    return (req, res, next) => {
      if (!req.user) {
        res.status(401).json({
          success: false,
          error: 'Authentication required',
          message: 'Please authenticate to access this resource',
        });
        return;
      }

      const userPermissions = resolvePermissionsForRole(req.user.role);
      const hasAnyPermission = permissions.some((permission) => userPermissions.includes(permission));

      if (!hasAnyPermission) {
        res.status(403).json({
          success: false,
          error: 'Insufficient permissions',
          message: `This action requires one of the following permissions: ${permissions.join(', ')}`,
          requiredPermissions: permissions,
          userRole: req.user.role,
        });
        return;
      }

      next();
    };
  }

  static requireAllPermissions(...permissions: Permission[]): Middleware {
    return (req, res, next) => {
      if (!req.user) {
        res.status(401).json({
          success: false,
          error: 'Authentication required',
          message: 'Please authenticate to access this resource',
        });
        return;
      }

      const userPermissions = resolvePermissionsForRole(req.user.role);
      const hasAllPermissions = permissions.every((permission) => userPermissions.includes(permission));

      if (!hasAllPermissions) {
        const missingPermissions = permissions.filter((permission) => !userPermissions.includes(permission));

        res.status(403).json({
          success: false,
          error: 'Insufficient permissions',
          message: `This action requires all of the following permissions: ${permissions.join(', ')}`,
          missingPermissions,
          userRole: req.user.role,
        });
        return;
      }

      next();
    };
  }

  static requireOwnershipOrPermission(resourceType: string, resourceGetter: ResourceGetter): Middleware {
    return async (req, res, next) => {
      if (!req.user) {
        res.status(401).json({
          success: false,
          error: 'Authentication required',
          message: 'Please authenticate to access this resource',
        });
        return;
      }

      try {
        const resource = await resourceGetter(req);
        if (!resource) {
          res.status(404).json({
            success: false,
            error: 'Resource not found',
            message: 'The requested resource does not exist',
          });
          return;
        }

        const ownershipPattern = OWNERSHIP_PATTERNS[`${resourceType}:*:own`];
        const isOwner = ownershipPattern ? ownershipPattern(req, resource) : false;

        const userPermissions = resolvePermissionsForRole(req.user.role);
        const hasAdminPermission = userPermissions.some((permission) =>
          permission.startsWith(`${resourceType}:`) && permission.includes(':all'),
        );

        if (!isOwner && !hasAdminPermission) {
          res.status(403).json({
            success: false,
            error: 'Access denied',
            message: 'You can only access your own resources or need admin privileges',
          });
          return;
        }

        req.resource = resource;
        req.isOwner = isOwner;
        req.hasAdminPermission = hasAdminPermission;
        next();
      } catch (error) {
        res.status(500).json({
          success: false,
          error: 'Resource access check failed',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    };
  }

  static requireDynamicPermission(permissionResolver: PermissionResolver): Middleware {
    return (req, res, next) => {
      if (!req.user) {
        res.status(401).json({
          success: false,
          error: 'Authentication required',
          message: 'Please authenticate to access this resource',
        });
        return;
      }

      try {
        const requiredPermission = permissionResolver(req);
        const userPermissions = resolvePermissionsForRole(req.user.role);

        if (!userPermissions.includes(requiredPermission)) {
          res.status(403).json({
            success: false,
            error: 'Insufficient permissions',
            message: `This action requires the '${requiredPermission}' permission`,
            requiredPermission,
            userRole: req.user.role,
          });
          return;
        }

        next();
      } catch (error) {
        res.status(500).json({
          success: false,
          error: 'Permission check failed',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    };
  }

  static getUserPermissions(req: RBACRequest, _res: Response, next: NextFunction): void {
    if (!req.user) {
      req.userPermissions = [];
    } else {
      req.userPermissions = resolvePermissionsForRole(req.user.role);
    }

    next();
  }

  static canPerformAction(action: string, resourceType: string, scope: 'own' | 'all' = 'own'): Middleware {
    return (req, res, next) => {
      if (!req.user) {
        res.status(401).json({
          success: false,
          error: 'Authentication required',
          message: 'Please authenticate to access this resource',
        });
        return;
      }

      const permission = `${resourceType}:${action}:${scope}` as Permission;
      const userPermissions = resolvePermissionsForRole(req.user.role);

      if (!userPermissions.includes(permission)) {
        res.status(403).json({
          success: false,
          error: 'Insufficient permissions',
          message: `This action requires the '${permission}' permission`,
          requiredPermission: permission,
          userRole: req.user.role,
        });
        return;
      }

      next();
    };
  }

  static conditionalPermission(condition: Condition, permission: Permission): Middleware {
    return (req, res, next) => {
      if (!condition(req)) {
        next();
        return;
      }

      RBACMiddleware.requirePermission(permission)(req, res, next);
    };
  }

  static logPermissionCheck(req: RBACRequest, _res: Response, next: NextFunction): void {
    if (req.user && process.env.NODE_ENV === 'development') {
      const userPermissions = resolvePermissionsForRole(req.user.role);
      console.log(`Permission Check: ${req.method} ${req.path} - User: ${req.user.email} (${req.user.role})`);
      console.log('Available permissions:', userPermissions);
    }

    next();
  }

  static getPermissionsForRole(role: string): Permission[] {
    return resolvePermissionsForRole(role);
  }

  static roleHasPermission(role: string, permission: Permission): boolean {
    return hasPermission(role, permission);
  }

  static getMinimumRoleForPermission(permission: Permission): Role | null {
    const roles: Role[] = ['USER', 'ADMIN', 'SUPER_ADMIN'];

    for (const role of roles) {
      if (RBACMiddleware.roleHasPermission(role, permission)) {
        return role;
      }
    }

    return null;
  }
}

export const requirePermission = RBACMiddleware.requirePermission;
export const requireAnyPermission = RBACMiddleware.requireAnyPermission;
export const requireAllPermissions = RBACMiddleware.requireAllPermissions;
export const requireOwnershipOrPermission = RBACMiddleware.requireOwnershipOrPermission;
export const requireDynamicPermission = RBACMiddleware.requireDynamicPermission;
export const getUserPermissions = RBACMiddleware.getUserPermissions;
export const canPerformAction = RBACMiddleware.canPerformAction;
export const conditionalPermission = RBACMiddleware.conditionalPermission;
export const logPermissionCheck = RBACMiddleware.logPermissionCheck;
export const getPermissionsForRole = RBACMiddleware.getPermissionsForRole;
export const roleHasPermission = RBACMiddleware.roleHasPermission;
export const getMinimumRoleForPermission = RBACMiddleware.getMinimumRoleForPermission;

export default {
  RBACMiddleware,
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
};