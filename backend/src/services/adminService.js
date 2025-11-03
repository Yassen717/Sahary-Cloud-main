const { prisma } = require('../config/database');

/**
 * Admin Service
 * Handles admin operations, statistics, and system monitoring
 */
class AdminService {
    // ==================== Dashboard Statistics ====================

    /**
     * Get comprehensive dashboard statistics
     * @returns {Promise<Object>} Dashboard statistics
     */
    static async getDashboardStats() {
        try {
            const [
                userStats,
                vmStats,
                invoiceStats,
                paymentStats,
                usageStats,
                recentActivity,
            ] = await Promise.all([
                this.getUserStatistics(),
                this.getVMStatistics(),
                this.getInvoiceStatistics(),
                this.getPaymentStatistics(),
                this.getUsageStatistics(),
                this.getRecentActivity(),
            ]);

            return {
                users: userStats,
                vms: vmStats,
                invoices: invoiceStats,
                payments: paymentStats,
                usage: usageStats,
                recentActivity,
                timestamp: new Date(),
            };
        } catch (error) {
            throw new Error(`Failed to get dashboard stats: ${error.message}`);
        }
    }

    /**
     * Get user statistics
     * @returns {Promise<Object>} User statistics
     */
    static async getUserStatistics() {
        try {
            const [total, active, verified, byRole, recentSignups] = await Promise.all([
                prisma.user.count(),
                prisma.user.count({ where: { isActive: true } }),
                prisma.user.count({ where: { isVerified: true } }),
                prisma.user.groupBy({
                    by: ['role'],
                    _count: true,
                }),
                prisma.user.count({
                    where: {
                        createdAt: {
                            gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Last 30 days
                        },
                    },
                }),
            ]);

            const roleDistribution = {};
            byRole.forEach((item) => {
                roleDistribution[item.role] = item._count;
            });

            return {
                total,
                active,
                verified,
                inactive: total - active,
                unverified: total - verified,
                roleDistribution,
                recentSignups,
            };
        } catch (error) {
            throw new Error(`Failed to get user statistics: ${error.message}`);
        }
    }

    /**
     * Get VM statistics
     * @returns {Promise<Object>} VM statistics
     */
    static async getVMStatistics() {
        try {
            const [total, byStatus, resourceUsage] = await Promise.all([
                prisma.virtualMachine.count(),
                prisma.virtualMachine.groupBy({
                    by: ['status'],
                    _count: true,
                }),
                prisma.virtualMachine.aggregate({
                    _sum: {
                        cpu: true,
                        ram: true,
                        storage: true,
                        bandwidth: true,
                    },
                    _avg: {
                        hourlyRate: true,
                    },
                }),
            ]);

            const statusDistribution = {};
            byStatus.forEach((item) => {
                statusDistribution[item.status] = item._count;
            });

            return {
                total,
                statusDistribution,
                resources: {
                    totalCPU: resourceUsage._sum.cpu || 0,
                    totalRAM: resourceUsage._sum.ram || 0,
                    totalStorage: resourceUsage._sum.storage || 0,
                    totalBandwidth: resourceUsage._sum.bandwidth || 0,
                },
                averageHourlyRate: parseFloat((resourceUsage._avg.hourlyRate || 0).toFixed(4)),
            };
        } catch (error) {
            throw new Error(`Failed to get VM statistics: ${error.message}`);
        }
    }

    /**
     * Get invoice statistics
     * @returns {Promise<Object>} Invoice statistics
     */
    static async getInvoiceStatistics() {
        try {
            const [total, byStatus, amounts, recentInvoices] = await Promise.all([
                prisma.invoice.count(),
                prisma.invoice.groupBy({
                    by: ['status'],
                    _count: true,
                }),
                prisma.invoice.aggregate({
                    _sum: {
                        total: true,
                        subtotal: true,
                        taxAmount: true,
                        discountAmount: true,
                    },
                }),
                prisma.invoice.count({
                    where: {
                        createdAt: {
                            gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
                        },
                    },
                }),
            ]);

            const statusDistribution = {};
            byStatus.forEach((item) => {
                statusDistribution[item.status] = item._count;
            });

            return {
                total,
                statusDistribution,
                amounts: {
                    totalRevenue: parseFloat((amounts._sum.total || 0).toFixed(2)),
                    totalSubtotal: parseFloat((amounts._sum.subtotal || 0).toFixed(2)),
                    totalTax: parseFloat((amounts._sum.taxAmount || 0).toFixed(2)),
                    totalDiscounts: parseFloat((amounts._sum.discountAmount || 0).toFixed(2)),
                },
                recentInvoices,
            };
        } catch (error) {
            throw new Error(`Failed to get invoice statistics: ${error.message}`);
        }
    }

    /**
     * Get payment statistics
     * @returns {Promise<Object>} Payment statistics
     */
    static async getPaymentStatistics() {
        try {
            const [total, byStatus, amounts] = await Promise.all([
                prisma.payment.count(),
                prisma.payment.groupBy({
                    by: ['status'],
                    _count: true,
                }),
                prisma.payment.aggregate({
                    where: { status: 'COMPLETED' },
                    _sum: {
                        amount: true,
                    },
                }),
            ]);

            const statusDistribution = {};
            byStatus.forEach((item) => {
                statusDistribution[item.status] = item._count;
            });

            return {
                total,
                statusDistribution,
                totalProcessed: parseFloat((amounts._sum.amount || 0).toFixed(2)),
            };
        } catch (error) {
            throw new Error(`Failed to get payment statistics: ${error.message}`);
        }
    }

    /**
     * Get usage statistics
     * @returns {Promise<Object>} Usage statistics
     */
    static async getUsageStatistics() {
        try {
            const [totalRecords, aggregation] = await Promise.all([
                prisma.usageRecord.count(),
                prisma.usageRecord.aggregate({
                    _sum: {
                        cost: true,
                        duration: true,
                        bandwidthUsage: true,
                    },
                    _avg: {
                        cpuUsage: true,
                        ramUsage: true,
                    },
                }),
            ]);

            return {
                totalRecords,
                totalCost: parseFloat((aggregation._sum.cost || 0).toFixed(2)),
                totalDuration: aggregation._sum.duration || 0,
                totalBandwidth: parseFloat(((aggregation._sum.bandwidthUsage || 0) / 1024).toFixed(2)),
                averages: {
                    cpu: parseFloat((aggregation._avg.cpuUsage || 0).toFixed(2)),
                    ram: parseFloat((aggregation._avg.ramUsage || 0).toFixed(2)),
                },
            };
        } catch (error) {
            throw new Error(`Failed to get usage statistics: ${error.message}`);
        }
    }

    /**
     * Get recent activity
     * @param {number} limit - Number of activities to retrieve
     * @returns {Promise<Array>} Recent activities
     */
    static async getRecentActivity(limit = 20) {
        try {
            const activities = await prisma.auditLog.findMany({
                take: limit,
                orderBy: { createdAt: 'desc' },
                include: {
                    user: {
                        select: {
                            id: true,
                            email: true,
                            firstName: true,
                            lastName: true,
                        },
                    },
                },
            });

            return activities;
        } catch (error) {
            throw new Error(`Failed to get recent activity: ${error.message}`);
        }
    }

    // ==================== System Monitoring ====================

    /**
     * Get system health status
     * @returns {Promise<Object>} System health
     */
    static async getSystemHealth() {
        try {
            const [dbHealth, vmHealth, serviceHealth] = await Promise.all([
                this.checkDatabaseHealth(),
                this.checkVMHealth(),
                this.checkServiceHealth(),
            ]);

            const overallHealth =
                dbHealth.status === 'healthy' &&
                vmHealth.status === 'healthy' &&
                serviceHealth.status === 'healthy'
                    ? 'healthy'
                    : 'degraded';

            return {
                status: overallHealth,
                database: dbHealth,
                vms: vmHealth,
                services: serviceHealth,
                timestamp: new Date(),
            };
        } catch (error) {
            return {
                status: 'error',
                error: error.message,
                timestamp: new Date(),
            };
        }
    }

    /**
     * Check database health
     * @returns {Promise<Object>} Database health status
     */
    static async checkDatabaseHealth() {
        try {
            const start = Date.now();
            await prisma.$queryRaw`SELECT 1`;
            const responseTime = Date.now() - start;

            return {
                status: 'healthy',
                responseTime: `${responseTime}ms`,
            };
        } catch (error) {
            return {
                status: 'unhealthy',
                error: error.message,
            };
        }
    }

    /**
     * Check VM health
     * @returns {Promise<Object>} VM health status
     */
    static async checkVMHealth() {
        try {
            const [total, running, error] = await Promise.all([
                prisma.virtualMachine.count(),
                prisma.virtualMachine.count({ where: { status: 'RUNNING' } }),
                prisma.virtualMachine.count({ where: { status: 'ERROR' } }),
            ]);

            const healthPercentage = total > 0 ? ((total - error) / total) * 100 : 100;

            return {
                status: healthPercentage >= 95 ? 'healthy' : 'degraded',
                total,
                running,
                error,
                healthPercentage: parseFloat(healthPercentage.toFixed(2)),
            };
        } catch (error) {
            return {
                status: 'unhealthy',
                error: error.message,
            };
        }
    }

    /**
     * Check service health
     * @returns {Promise<Object>} Service health status
     */
    static async checkServiceHealth() {
        try {
            // Check if critical services are running
            const checks = {
                usageCollector: true, // Would check actual service status
                invoiceGenerator: true,
                database: true,
            };

            const allHealthy = Object.values(checks).every((status) => status === true);

            return {
                status: allHealthy ? 'healthy' : 'degraded',
                services: checks,
            };
        } catch (error) {
            return {
                status: 'unhealthy',
                error: error.message,
            };
        }
    }

    // ==================== Resource Management ====================

    /**
     * Get system resource usage
     * @returns {Promise<Object>} Resource usage
     */
    static async getSystemResourceUsage() {
        try {
            const [vmResources, limits] = await Promise.all([
                prisma.virtualMachine.aggregate({
                    _sum: {
                        cpu: true,
                        ram: true,
                        storage: true,
                        bandwidth: true,
                    },
                }),
                this.getSystemResourceLimits(),
            ]);

            const used = {
                cpu: vmResources._sum.cpu || 0,
                ram: vmResources._sum.ram || 0,
                storage: vmResources._sum.storage || 0,
                bandwidth: vmResources._sum.bandwidth || 0,
            };

            const usage = {
                cpu: limits.cpu > 0 ? (used.cpu / limits.cpu) * 100 : 0,
                ram: limits.ram > 0 ? (used.ram / limits.ram) * 100 : 0,
                storage: limits.storage > 0 ? (used.storage / limits.storage) * 100 : 0,
                bandwidth: limits.bandwidth > 0 ? (used.bandwidth / limits.bandwidth) * 100 : 0,
            };

            return {
                used,
                limits,
                usage: {
                    cpu: parseFloat(usage.cpu.toFixed(2)),
                    ram: parseFloat(usage.ram.toFixed(2)),
                    storage: parseFloat(usage.storage.toFixed(2)),
                    bandwidth: parseFloat(usage.bandwidth.toFixed(2)),
                },
                available: {
                    cpu: limits.cpu - used.cpu,
                    ram: limits.ram - used.ram,
                    storage: limits.storage - used.storage,
                    bandwidth: limits.bandwidth - used.bandwidth,
                },
            };
        } catch (error) {
            throw new Error(`Failed to get system resource usage: ${error.message}`);
        }
    }

    /**
     * Get system resource limits
     * @returns {Promise<Object>} Resource limits
     */
    static async getSystemResourceLimits() {
        // In production, these would come from system configuration
        return {
            cpu: parseInt(process.env.SYSTEM_CPU_LIMIT) || 1000,
            ram: parseInt(process.env.SYSTEM_RAM_LIMIT) || 2048000, // 2TB in MB
            storage: parseInt(process.env.SYSTEM_STORAGE_LIMIT) || 100000, // 100TB in GB
            bandwidth: parseInt(process.env.SYSTEM_BANDWIDTH_LIMIT) || 1000000, // 1PB in GB
        };
    }

    // ==================== Analytics ====================

    /**
     * Get revenue analytics
     * @param {Object} options - Query options
     * @returns {Promise<Object>} Revenue analytics
     */
    static async getRevenueAnalytics(options = {}) {
        try {
            const { startDate, endDate, groupBy = 'day' } = options;

            const where = {};
            if (startDate || endDate) {
                where.createdAt = {};
                if (startDate) where.createdAt.gte = new Date(startDate);
                if (endDate) where.createdAt.lte = new Date(endDate);
            }

            const [invoices, payments] = await Promise.all([
                prisma.invoice.findMany({
                    where,
                    select: {
                        total: true,
                        status: true,
                        createdAt: true,
                    },
                    orderBy: { createdAt: 'asc' },
                }),
                prisma.payment.findMany({
                    where: {
                        ...where,
                        status: 'COMPLETED',
                    },
                    select: {
                        amount: true,
                        createdAt: true,
                    },
                    orderBy: { createdAt: 'asc' },
                }),
            ]);

            // Group by time period
            const revenueByPeriod = this.groupByPeriod(invoices, groupBy, 'total');
            const paymentsByPeriod = this.groupByPeriod(payments, groupBy, 'amount');

            return {
                totalRevenue: invoices.reduce((sum, inv) => sum + parseFloat(inv.total), 0),
                totalPayments: payments.reduce((sum, pay) => sum + parseFloat(pay.amount), 0),
                revenueByPeriod,
                paymentsByPeriod,
            };
        } catch (error) {
            throw new Error(`Failed to get revenue analytics: ${error.message}`);
        }
    }

    /**
     * Get user growth analytics
     * @param {Object} options - Query options
     * @returns {Promise<Object>} User growth analytics
     */
    static async getUserGrowthAnalytics(options = {}) {
        try {
            const { startDate, endDate, groupBy = 'day' } = options;

            const where = {};
            if (startDate || endDate) {
                where.createdAt = {};
                if (startDate) where.createdAt.gte = new Date(startDate);
                if (endDate) where.createdAt.lte = new Date(endDate);
            }

            const users = await prisma.user.findMany({
                where,
                select: {
                    createdAt: true,
                    isActive: true,
                    isVerified: true,
                },
                orderBy: { createdAt: 'asc' },
            });

            const signupsByPeriod = this.groupByPeriod(users, groupBy);

            return {
                totalSignups: users.length,
                signupsByPeriod,
            };
        } catch (error) {
            throw new Error(`Failed to get user growth analytics: ${error.message}`);
        }
    }

    /**
     * Group data by time period
     * @param {Array} data - Data to group
     * @param {string} groupBy - Grouping period
     * @param {string} sumField - Field to sum (optional)
     * @returns {Array} Grouped data
     */
    static groupByPeriod(data, groupBy, sumField = null) {
        const grouped = {};

        data.forEach((item) => {
            const date = new Date(item.createdAt);
            let key;

            switch (groupBy) {
                case 'hour':
                    key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:00`;
                    break;
                case 'day':
                    key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
                    break;
                case 'week':
                    const weekStart = new Date(date);
                    weekStart.setDate(date.getDate() - date.getDay());
                    key = `${weekStart.getFullYear()}-W${String(Math.ceil((weekStart.getDate() + 1) / 7)).padStart(2, '0')}`;
                    break;
                case 'month':
                    key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
                    break;
                default:
                    key = date.toISOString().split('T')[0];
            }

            if (!grouped[key]) {
                grouped[key] = {
                    period: key,
                    count: 0,
                    total: 0,
                };
            }

            grouped[key].count += 1;
            if (sumField && item[sumField]) {
                grouped[key].total += parseFloat(item[sumField]);
            }
        });

        return Object.values(grouped).map((item) => ({
            period: item.period,
            count: item.count,
            ...(sumField && { total: parseFloat(item.total.toFixed(2)) }),
        }));
    }

    // ==================== Audit Logs ====================

    /**
     * Get audit logs with filtering
     * @param {Object} options - Query options
     * @returns {Promise<Object>} Paginated audit logs
     */
    static async getAuditLogs(options = {}) {
        try {
            const {
                page = 1,
                limit = 50,
                userId,
                action,
                resource,
                startDate,
                endDate,
                sortBy = 'createdAt',
                sortOrder = 'desc',
            } = options;

            const where = {};

            if (userId) where.userId = userId;
            if (action) where.action = action;
            if (resource) where.resource = resource;

            if (startDate || endDate) {
                where.createdAt = {};
                if (startDate) where.createdAt.gte = new Date(startDate);
                if (endDate) where.createdAt.lte = new Date(endDate);
            }

            const skip = (parseInt(page) - 1) * parseInt(limit);
            const [logs, total] = await Promise.all([
                prisma.auditLog.findMany({
                    where,
                    orderBy: { [sortBy]: sortOrder },
                    skip,
                    take: parseInt(limit),
                    include: {
                        user: {
                            select: {
                                id: true,
                                email: true,
                                firstName: true,
                                lastName: true,
                            },
                        },
                    },
                }),
                prisma.auditLog.count({ where }),
            ]);

            return {
                data: logs,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total,
                    totalPages: Math.ceil(total / parseInt(limit)),
                },
            };
        } catch (error) {
            throw new Error(`Failed to get audit logs: ${error.message}`);
        }
    }
}

module.exports = AdminService;
