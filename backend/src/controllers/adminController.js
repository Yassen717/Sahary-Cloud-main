const AdminService = require('../services/adminService');
const { prisma } = require('../config/database');

/**
 * Admin Controller
 * Handles HTTP requests for admin operations
 */
class AdminController {
    // ==================== Dashboard ====================

    /**
     * Get dashboard statistics
     */
    static async getDashboardStats(req, res) {
        try {
            const stats = await AdminService.getDashboardStats();

            res.status(200).json({
                success: true,
                message: 'Dashboard statistics retrieved successfully',
                data: stats,
            });
        } catch (error) {
            res.status(400).json({
                success: false,
                error: 'Failed to get dashboard statistics',
                message: error.message,
            });
        }
    }

    /**
     * Get system health
     */
    static async getSystemHealth(req, res) {
        try {
            const health = await AdminService.getSystemHealth();

            res.status(200).json({
                success: true,
                message: 'System health retrieved successfully',
                data: health,
            });
        } catch (error) {
            res.status(400).json({
                success: false,
                error: 'Failed to get system health',
                message: error.message,
            });
        }
    }

    /**
     * Get system resource usage
     */
    static async getSystemResourceUsage(req, res) {
        try {
            const usage = await AdminService.getSystemResourceUsage();

            res.status(200).json({
                success: true,
                message: 'System resource usage retrieved successfully',
                data: usage,
            });
        } catch (error) {
            res.status(400).json({
                success: false,
                error: 'Failed to get system resource usage',
                message: error.message,
            });
        }
    }

    // ==================== User Management ====================

    /**
     * Get all users
     */
    static async getAllUsers(req, res) {
        try {
            const { page = 1, limit = 20, role, isActive, isVerified, search, sortBy = 'createdAt', sortOrder = 'desc' } = req.query;

            const where = {};
            if (role) where.role = role;
            if (isActive !== undefined) where.isActive = isActive === 'true';
            if (isVerified !== undefined) where.isVerified = isVerified === 'true';
            if (search) {
                where.OR = [
                    { email: { contains: search, mode: 'insensitive' } },
                    { firstName: { contains: search, mode: 'insensitive' } },
                    { lastName: { contains: search, mode: 'insensitive' } },
                ];
            }

            const skip = (parseInt(page) - 1) * parseInt(limit);
            const [users, total] = await Promise.all([
                prisma.user.findMany({
                    where,
                    orderBy: { [sortBy]: sortOrder },
                    skip,
                    take: parseInt(limit),
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
                                vms: true,
                                invoices: true,
                                payments: true,
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
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total,
                    totalPages: Math.ceil(total / parseInt(limit)),
                },
            });
        } catch (error) {
            res.status(400).json({
                success: false,
                error: 'Failed to get users',
                message: error.message,
            });
        }
    }

    /**
     * Get user by ID
     */
    static async getUserById(req, res) {
        try {
            const { id } = req.params;

            const user = await prisma.user.findUnique({
                where: { id },
                include: {
                    vms: {
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
                            total: true,
                            status: true,
                            createdAt: true,
                        },
                    },
                    payments: {
                        take: 10,
                        orderBy: { createdAt: 'desc' },
                        select: {
                            id: true,
                            amount: true,
                            status: true,
                            createdAt: true,
                        },
                    },
                },
            });

            if (!user) {
                return res.status(404).json({
                    success: false,
                    error: 'User not found',
                });
            }

            // Remove password from response
            delete user.password;

            res.status(200).json({
                success: true,
                message: 'User retrieved successfully',
                data: { user },
            });
        } catch (error) {
            res.status(400).json({
                success: false,
                error: 'Failed to get user',
                message: error.message,
            });
        }
    }

    /**
     * Update user status
     */
    static async updateUserStatus(req, res) {
        try {
            const { id } = req.params;
            const { isActive, reason } = req.body;

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

            // Log action
            await prisma.auditLog.create({
                data: {
                    userId: req.user.userId,
                    action: isActive ? 'USER_ACTIVATED' : 'USER_DEACTIVATED',
                    resource: 'user',
                    resourceId: id,
                    newValues: {
                        isActive,
                        reason,
                        updatedBy: req.user.email,
                    },
                },
            });

            res.status(200).json({
                success: true,
                message: `User ${isActive ? 'activated' : 'deactivated'} successfully`,
                data: { user },
            });
        } catch (error) {
            res.status(400).json({
                success: false,
                error: 'Failed to update user status',
                message: error.message,
            });
        }
    }

    /**
     * Update user role
     */
    static async updateUserRole(req, res) {
        try {
            const { id } = req.params;
            const { role } = req.body;

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

            // Log action
            await prisma.auditLog.create({
                data: {
                    userId: req.user.userId,
                    action: 'USER_ROLE_UPDATED',
                    resource: 'user',
                    resourceId: id,
                    newValues: {
                        role,
                        updatedBy: req.user.email,
                    },
                },
            });

            res.status(200).json({
                success: true,
                message: 'User role updated successfully',
                data: { user },
            });
        } catch (error) {
            res.status(400).json({
                success: false,
                error: 'Failed to update user role',
                message: error.message,
            });
        }
    }

    // ==================== Analytics ====================

    /**
     * Get revenue analytics
     */
    static async getRevenueAnalytics(req, res) {
        try {
            const { startDate, endDate, groupBy } = req.query;

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
            res.status(400).json({
                success: false,
                error: 'Failed to get revenue analytics',
                message: error.message,
            });
        }
    }

    /**
     * Get user growth analytics
     */
    static async getUserGrowthAnalytics(req, res) {
        try {
            const { startDate, endDate, groupBy } = req.query;

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
            res.status(400).json({
                success: false,
                error: 'Failed to get user growth analytics',
                message: error.message,
            });
        }
    }

    // ==================== Audit Logs ====================

    /**
     * Get audit logs
     */
    static async getAuditLogs(req, res) {
        try {
            const { page, limit, userId, action, resource, startDate, endDate, sortBy, sortOrder } = req.query;

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
            res.status(400).json({
                success: false,
                error: 'Failed to get audit logs',
                message: error.message,
            });
        }
    }
}

module.exports = AdminController;
