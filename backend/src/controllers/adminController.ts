import type { Request, Response } from 'express';

const AdminService = require('../services/adminService');
const { prisma } = require('../config/database');

type AdminUserRequest = Request & {
  user: {
    userId: string;
    email: string;
    role: string;
  };
};

type AdminQuery = {
  page?: string | number;
  limit?: string | number;
  role?: string;
  isActive?: string | boolean;
  isVerified?: string | boolean;
  search?: string;
  sortBy?: string;
  sortOrder?: string;
  startDate?: string;
  endDate?: string;
  groupBy?: string;
  userId?: string;
  action?: string;
  resource?: string;
};

// Map known errors to proper status codes; never echo raw error internals.
const sendError = (res: Response, error: unknown, fallback: string): void => {
  const err = error as { code?: string; statusCode?: number; message?: string } | null;

  if (err?.code === 'P2025') {
    res.status(404).json({
      success: false,
      error: 'Resource not found',
    });
    return;
  }

  // Operational errors (e.g. ValidationError) carry their own status code.
  if (typeof err?.statusCode === 'number' && err.statusCode >= 400 && err.statusCode < 500) {
    res.status(err.statusCode).json({
      success: false,
      error: err.message || fallback,
    });
    return;
  }

  res.status(500).json({
    success: false,
    error: fallback,
  });
};

const USER_SORTABLE_FIELDS = new Set(['email', 'firstName', 'lastName', 'role', 'isActive', 'isVerified', 'createdAt', 'updatedAt']);
const VALID_ROLES = new Set(['USER', 'ADMIN', 'SUPER_ADMIN']);
const MAX_PAGE_LIMIT = 200;

// Returns true/false for the literal strings 'true'/'false', undefined when
// the parameter was not provided, and null for anything else (invalid).
const parseBooleanQuery = (value: string | boolean | undefined): boolean | null | undefined => {
  if (value === undefined) {
    return undefined;
  }
  const normalized = String(value);
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  return null;
};

class AdminController {
  static async getDashboardStats(_req: Request, res: Response): Promise<void> {
    try {
      const stats = await AdminService.getDashboardStats();

      res.status(200).json({
        success: true,
        message: 'Dashboard statistics retrieved successfully',
        data: stats,
      });
    } catch (error) {
      sendError(res, error, 'Failed to get dashboard statistics');
    }
  }

  static async getSystemHealth(_req: Request, res: Response): Promise<void> {
    try {
      const health = await AdminService.getSystemHealth();

      res.status(200).json({
        success: true,
        message: 'System health retrieved successfully',
        data: health,
      });
    } catch (error) {
      sendError(res, error, 'Failed to get system health');
    }
  }

  static async getSystemResourceUsage(_req: Request, res: Response): Promise<void> {
    try {
      const usage = await AdminService.getSystemResourceUsage();

      res.status(200).json({
        success: true,
        message: 'System resource usage retrieved successfully',
        data: usage,
      });
    } catch (error) {
      sendError(res, error, 'Failed to get system resource usage');
    }
  }

  static async getAllUsers(req: Request, res: Response): Promise<void> {
    try {
      const {
        page = 1,
        limit = 20,
        role,
        isActive,
        isVerified,
        search,
        sortBy = 'createdAt',
        sortOrder = 'desc',
      } = req.query as AdminQuery;

      const activeFilter = parseBooleanQuery(isActive);
      const verifiedFilter = parseBooleanQuery(isVerified);

      if (activeFilter === null || verifiedFilter === null) {
        res.status(400).json({
          success: false,
          error: "Invalid filter: isActive and isVerified only accept 'true' or 'false'",
        });
        return;
      }

      const where: Record<string, unknown> = {};

      if (role) where.role = role;
      if (activeFilter !== undefined) where.isActive = activeFilter;
      if (verifiedFilter !== undefined) where.isVerified = verifiedFilter;
      if (search) {
        where.OR = [
          { email: { contains: search, mode: 'insensitive' } },
          { firstName: { contains: search, mode: 'insensitive' } },
          { lastName: { contains: search, mode: 'insensitive' } },
        ];
      }

      // Clamp pagination and whitelist sort fields/direction — the column
      // name and order come straight from the client otherwise.
      const pageNumber = Math.max(1, Number.parseInt(String(page), 10) || 1);
      const limitNumber = Math.min(MAX_PAGE_LIMIT, Math.max(1, Number.parseInt(String(limit), 10) || 20));
      const sortField = USER_SORTABLE_FIELDS.has(String(sortBy)) ? String(sortBy) : 'createdAt';
      const sortDirection = String(sortOrder).toLowerCase() === 'asc' ? 'asc' : 'desc';
      const skip = (pageNumber - 1) * limitNumber;

      const [users, total] = await Promise.all([
        prisma.user.findMany({
          where,
          orderBy: { [sortField]: sortDirection },
          skip,
          take: limitNumber,
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            role: true,
            isActive: true,
            isVerified: true,
            createdAt: true,
            updatedAt: true,
            _count: {
              select: {
                virtualMachines: true,
                invoices: true,
              },
            },
          },
        }),
        prisma.user.count({ where }),
      ]);

      res.status(200).json({
        success: true,
        message: 'Users retrieved successfully',
        data: users,
        pagination: {
          page: pageNumber,
          limit: limitNumber,
          total,
          totalPages: Math.ceil(total / limitNumber),
        },
      });
    } catch (error) {
      sendError(res, error, 'Failed to get users');
    }
  }

  static async getUserById(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      // Explicit select whitelist — do NOT return password, passwordResetToken/
      // Expires, emailVerificationToken/Expires or lastLoginAt: those are live
      // bearer credentials / sensitive metadata.
      const user = await prisma.user.findUnique({
        where: { id },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          phone: true,
          avatar: true,
          role: true,
          isActive: true,
          isVerified: true,
          createdAt: true,
          updatedAt: true,
          virtualMachines: {
            take: 25,
            orderBy: { createdAt: 'desc' },
            select: {
              id: true,
              name: true,
              status: true,
              cpu: true,
              ram: true,
              storage: true,
              createdAt: true,
            },
          },
          invoices: {
            take: 10,
            orderBy: { createdAt: 'desc' },
            select: {
              id: true,
              invoiceNumber: true,
              amount: true,
              status: true,
              createdAt: true,
            },
          },
        },
      });

      if (!user) {
        res.status(404).json({
          success: false,
          error: 'User not found',
        });
        return;
      }

      res.status(200).json({
        success: true,
        message: 'User retrieved successfully',
        data: { user },
      });
    } catch (error) {
      sendError(res, error, 'Failed to get user');
    }
  }

  static async updateUserStatus(req: AdminUserRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { isActive, reason } = req.body as { isActive?: unknown; reason?: string };

      // isActive must be an explicit boolean — an absent/garbage value used to
      // silently no-op while still writing a 'deactivated' audit entry.
      if (typeof isActive !== 'boolean') {
        res.status(400).json({
          success: false,
          error: 'Invalid status: isActive must be a boolean',
        });
        return;
      }

      const target = await prisma.user.findUnique({
        where: { id },
        select: { id: true, role: true, isActive: true },
      });

      if (!target) {
        res.status(404).json({
          success: false,
          error: 'User not found',
        });
        return;
      }

      // Only SUPER_ADMIN may deactivate/activate other admins.
      if (['ADMIN', 'SUPER_ADMIN'].includes(target.role) && req.user.role !== 'SUPER_ADMIN') {
        res.status(403).json({
          success: false,
          error: 'Insufficient permissions to modify an administrator account',
        });
        return;
      }

      // Admins must not be able to deactivate themselves.
      if (isActive === false && target.id === req.user.userId) {
        res.status(403).json({
          success: false,
          error: 'You cannot deactivate your own account',
        });
        return;
      }

      const user = await prisma.user.update({
        where: { id },
        data: { isActive },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          isActive: true,
        },
      });

      await prisma.auditLog.create({
        data: {
          userId: req.user.userId,
          action: isActive ? 'USER_ACTIVATED' : 'USER_DEACTIVATED',
          resource: 'user',
          resourceId: id,
          oldValues: JSON.stringify({
            isActive: target.isActive,
          }),
          newValues: JSON.stringify({
            isActive,
            reason,
            updatedBy: req.user.email,
          }),
        },
      });

      res.status(200).json({
        success: true,
        message: `User ${isActive ? 'activated' : 'deactivated'} successfully`,
        data: { user },
      });
    } catch (error) {
      sendError(res, error, 'Failed to update user status');
    }
  }

  static async updateUserRole(req: AdminUserRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { role } = req.body as { role?: unknown };

      // Whitelist roles — arbitrary strings used to be written straight to
      // the role column, silently stripping the user's access.
      if (typeof role !== 'string' || !VALID_ROLES.has(role)) {
        res.status(400).json({
          success: false,
          error: `Invalid role: must be one of ${Array.from(VALID_ROLES).join(', ')}`,
        });
        return;
      }

      const target = await prisma.user.findUnique({
        where: { id },
        select: { id: true, role: true },
      });

      if (!target) {
        res.status(404).json({
          success: false,
          error: 'User not found',
        });
        return;
      }

      // Only SUPER_ADMIN may grant or revoke the SUPER_ADMIN role.
      if ((role === 'SUPER_ADMIN' || target.role === 'SUPER_ADMIN') && req.user.role !== 'SUPER_ADMIN') {
        res.status(403).json({
          success: false,
          error: 'Only a super admin can grant or revoke the SUPER_ADMIN role',
        });
        return;
      }

      const user = await prisma.user.update({
        where: { id },
        data: { role },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
        },
      });

      await prisma.auditLog.create({
        data: {
          userId: req.user.userId,
          action: 'USER_ROLE_UPDATED',
          resource: 'user',
          resourceId: id,
          oldValues: JSON.stringify({
            role: target.role,
          }),
          newValues: JSON.stringify({
            role,
            updatedBy: req.user.email,
          }),
        },
      });

      res.status(200).json({
        success: true,
        message: 'User role updated successfully',
        data: { user },
      });
    } catch (error) {
      sendError(res, error, 'Failed to update user role');
    }
  }

  static async getRevenueAnalytics(req: Request, res: Response): Promise<void> {
    try {
      const { startDate, endDate, groupBy } = req.query as AdminQuery;

      const analytics = await AdminService.getRevenueAnalytics({
        startDate,
        endDate,
        groupBy,
      });

      res.status(200).json({
        success: true,
        message: 'Revenue analytics retrieved successfully',
        data: analytics,
      });
    } catch (error) {
      sendError(res, error, 'Failed to get revenue analytics');
    }
  }

  static async getUserGrowthAnalytics(req: Request, res: Response): Promise<void> {
    try {
      const { startDate, endDate, groupBy } = req.query as AdminQuery;

      const analytics = await AdminService.getUserGrowthAnalytics({
        startDate,
        endDate,
        groupBy,
      });

      res.status(200).json({
        success: true,
        message: 'User growth analytics retrieved successfully',
        data: analytics,
      });
    } catch (error) {
      sendError(res, error, 'Failed to get user growth analytics');
    }
  }

  static async getAuditLogs(req: Request, res: Response): Promise<void> {
    try {
      const {
        page, limit, userId, action, resource, startDate, endDate, sortBy, sortOrder,
      } = req.query as AdminQuery;

      const result = await AdminService.getAuditLogs({
        page,
        limit,
        userId,
        action,
        resource,
        startDate,
        endDate,
        sortBy,
        sortOrder,
      });

      res.status(200).json({
        success: true,
        message: 'Audit logs retrieved successfully',
        data: result.data,
        pagination: result.pagination,
      });
    } catch (error) {
      sendError(res, error, 'Failed to get audit logs');
    }
  }
}

export = AdminController;
