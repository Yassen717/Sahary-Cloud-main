import type { Request, Response } from 'express';

const AdminService = require('../services/adminService');
const { prisma } = require('../config/database');

type AdminUserRequest = Request & {
  user: {
    userId: string;
    email: string;
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
      const message = error instanceof Error ? error.message : 'Failed to get dashboard statistics';
      res.status(400).json({
        success: false,
        error: 'Failed to get dashboard statistics',
        message,
      });
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
      const message = error instanceof Error ? error.message : 'Failed to get system health';
      res.status(400).json({
        success: false,
        error: 'Failed to get system health',
        message,
      });
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
      const message = error instanceof Error ? error.message : 'Failed to get system resource usage';
      res.status(400).json({
        success: false,
        error: 'Failed to get system resource usage',
        message,
      });
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

      const where: Record<string, unknown> = {};

      if (role) where.role = role;
      if (isActive !== undefined) where.isActive = String(isActive) === 'true';
      if (isVerified !== undefined) where.isVerified = String(isVerified) === 'true';
      if (search) {
        where.OR = [
          { email: { contains: search, mode: 'insensitive' } },
          { firstName: { contains: search, mode: 'insensitive' } },
          { lastName: { contains: search, mode: 'insensitive' } },
        ];
      }

      const pageNumber = Number.parseInt(String(page), 10);
      const limitNumber = Number.parseInt(String(limit), 10);
      const skip = (pageNumber - 1) * limitNumber;

      const [users, total] = await Promise.all([
        prisma.user.findMany({
          where,
          orderBy: { [sortBy]: sortOrder },
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
      const message = error instanceof Error ? error.message : 'Failed to get users';
      res.status(400).json({
        success: false,
        error: 'Failed to get users',
        message,
      });
    }
  }

  static async getUserById(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      const user = await prisma.user.findUnique({
        where: { id },
        include: {
          virtualMachines: {
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

      delete user.password;

      res.status(200).json({
        success: true,
        message: 'User retrieved successfully',
        data: { user },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to get user';
      res.status(400).json({
        success: false,
        error: 'Failed to get user',
        message,
      });
    }
  }

  static async updateUserStatus(req: AdminUserRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { isActive, reason } = req.body as { isActive: boolean; reason?: string };

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
      const message = error instanceof Error ? error.message : 'Failed to update user status';
      res.status(400).json({
        success: false,
        error: 'Failed to update user status',
        message,
      });
    }
  }

  static async updateUserRole(req: AdminUserRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { role } = req.body as { role: string };

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
      const message = error instanceof Error ? error.message : 'Failed to update user role';
      res.status(400).json({
        success: false,
        error: 'Failed to update user role',
        message,
      });
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
      const message = error instanceof Error ? error.message : 'Failed to get revenue analytics';
      res.status(400).json({
        success: false,
        error: 'Failed to get revenue analytics',
        message,
      });
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
      const message = error instanceof Error ? error.message : 'Failed to get user growth analytics';
      res.status(400).json({
        success: false,
        error: 'Failed to get user growth analytics',
        message,
      });
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
      const message = error instanceof Error ? error.message : 'Failed to get audit logs';
      res.status(400).json({
        success: false,
        error: 'Failed to get audit logs',
        message,
      });
    }
  }
}

export = AdminController;
