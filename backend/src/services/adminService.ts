// @ts-nocheck
const { prisma } = require('../config/database');

const ANALYTICS_MAX_RANGE_MS = 366 * 24 * 60 * 60 * 1000; // ~1 year
const ANALYTICS_DEFAULT_RANGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

const badRequest = (message) => {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
};

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
          totalCPU: resourceUsage._sum.cpu || 0, // cores
          totalRAM: resourceUsage._sum.ram || 0, // MB
          totalStorage: resourceUsage._sum.storage || 0, // GB
          totalBandwidth: resourceUsage._sum.bandwidth || 0, // GB/month
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
            amount: true,
            subtotal: true,
            tax: true,
            discount: true,
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
          totalRevenue: parseFloat((amounts._sum.amount || 0).toFixed(2)),
          totalSubtotal: parseFloat((amounts._sum.subtotal || 0).toFixed(2)),
          totalTax: parseFloat((amounts._sum.tax || 0).toFixed(2)),
          totalDiscounts: parseFloat((amounts._sum.discount || 0).toFixed(2)),
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
        // bandwidthUsage is stored in GB; reported here in TB (GB / 1024).
        totalBandwidthTB: parseFloat(((aggregation._sum.bandwidthUsage || 0) / 1024).toFixed(2)),
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
        orderBy: { timestamp: 'desc' },
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

      const overallHealth = dbHealth.status === 'healthy'
                && vmHealth.status === 'healthy'
                && serviceHealth.status === 'healthy'
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
     * Resolve a bounded [start, end] date range for analytics queries.
     * Defaults to the last 30 days and clamps oversized ranges so the
     * analytics endpoints never scan the full table.
     * @param {Object} options - Query options with startDate/endDate
     * @returns {Object} { start, end } Date range
     */
  static resolveAnalyticsRange(options = {}) {
    const { startDate, endDate } = options;

    let start = startDate ? new Date(startDate) : null;
    let end = endDate ? new Date(endDate) : null;

    if (start && Number.isNaN(start.getTime())) {
      throw badRequest('Invalid startDate');
    }
    if (end && Number.isNaN(end.getTime())) {
      throw badRequest('Invalid endDate');
    }

    if (!end) end = new Date();
    if (!start) start = new Date(end.getTime() - ANALYTICS_DEFAULT_RANGE_MS);

    if (start > end) {
      throw badRequest('startDate must be before endDate');
    }

    if (end.getTime() - start.getTime() > ANALYTICS_MAX_RANGE_MS) {
      start = new Date(end.getTime() - ANALYTICS_MAX_RANGE_MS);
    }

    return { start, end };
  }

  /**
     * Get revenue analytics
     * @param {Object} options - Query options
     * @returns {Promise<Object>} Revenue analytics
     */
  static async getRevenueAnalytics(options = {}) {
    try {
      const { start, end } = this.resolveAnalyticsRange(options);
      const groupBy = ['hour', 'day', 'week', 'month'].includes(options.groupBy)
        ? options.groupBy
        : 'day';

      const where = { createdAt: { gte: start, lte: end } };

      // Revenue counts PAID invoices only; payments stay COMPLETED.
      const [revenueAggregate, paidInvoices, payments] = await Promise.all([
        prisma.invoice.aggregate({
          where: { ...where, status: 'PAID' },
          _sum: { amount: true },
          _count: true,
        }),
        prisma.invoice.findMany({
          where: { ...where, status: 'PAID' },
          select: {
            amount: true,
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
      const revenueByPeriod = this.groupByPeriod(paidInvoices, groupBy, 'amount');
      const paymentsByPeriod = this.groupByPeriod(payments, groupBy, 'amount');

      return {
        totalRevenue: parseFloat((revenueAggregate._sum.amount || 0).toFixed(2)),
        paidInvoiceCount: revenueAggregate._count,
        totalPayments: parseFloat(
          payments.reduce((sum, pay) => sum + parseFloat(pay.amount), 0).toFixed(2),
        ),
        revenueByPeriod,
        paymentsByPeriod,
        range: { startDate: start.toISOString(), endDate: end.toISOString() },
      };
    } catch (error) {
      if (error.statusCode) throw error;
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
      const { start, end } = this.resolveAnalyticsRange(options);
      const groupBy = ['hour', 'day', 'week', 'month'].includes(options.groupBy)
        ? options.groupBy
        : 'day';

      const where = { createdAt: { gte: start, lte: end } };

      const users = await prisma.user.findMany({
        where,
        select: {
          createdAt: true,
        },
        orderBy: { createdAt: 'asc' },
      });

      const signupsByPeriod = this.groupByPeriod(users, groupBy);

      return {
        totalSignups: users.length,
        signupsByPeriod,
        range: { startDate: start.toISOString(), endDate: end.toISOString() },
      };
    } catch (error) {
      if (error.statusCode) throw error;
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
          // Key by the week-start date so weeks can never collide
          // across months or years.
          key = `${weekStart.getFullYear()}-${String(weekStart.getMonth() + 1).padStart(2, '0')}-${String(weekStart.getDate()).padStart(2, '0')}`;
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
        sortBy = 'timestamp',
        sortOrder = 'desc',
      } = options;

      const where = {};

      if (userId) where.userId = userId;
      if (action) where.action = action;
      if (resource) where.resource = resource;

      if (startDate || endDate) {
        where.timestamp = {};
        if (startDate) where.timestamp.gte = new Date(startDate);
        if (endDate) where.timestamp.lte = new Date(endDate);
      }

      // Clamp pagination and whitelist sortable columns — the column
      // name and direction come straight from the client otherwise.
      const SORTABLE_FIELDS = ['timestamp', 'action', 'resource', 'userId'];
      const sortField = SORTABLE_FIELDS.includes(sortBy) ? sortBy : 'timestamp';
      const sortDirection = String(sortOrder).toLowerCase() === 'asc' ? 'asc' : 'desc';
      const pageNumber = Math.max(1, parseInt(page) || 1);
      const limitNumber = Math.min(200, Math.max(1, parseInt(limit) || 50));

      const skip = (pageNumber - 1) * limitNumber;
      const [logs, total] = await Promise.all([
        prisma.auditLog.findMany({
          where,
          orderBy: { [sortField]: sortDirection },
          skip,
          take: limitNumber,
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
          page: pageNumber,
          limit: limitNumber,
          total,
          totalPages: Math.ceil(total / limitNumber),
        },
      };
    } catch (error) {
      throw new Error(`Failed to get audit logs: ${error.message}`);
    }
  }
}

module.exports = AdminService;
