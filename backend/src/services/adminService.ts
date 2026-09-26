import { Prisma } from '@prisma/client';
import { prisma } from '../config/database';

type AuditLogWithUser = Prisma.AuditLogGetPayload<{
    include: {
        user: {
            select: {
                id: true;
                email: true;
                firstName: true;
                lastName: true;
            };
        };
    };
}>;

type UserStatistics = {
    total: number;
    active: number;
    verified: number;
    inactive: number;
    unverified: number;
    roleDistribution: Record<string, number>;
    recentSignups: number;
};

type VmStatistics = {
    total: number;
    statusDistribution: Record<string, number>;
    resources: {
        totalCPU: number;
        totalRAM: number;
        totalStorage: number;
        totalBandwidth: number;
    };
    averageHourlyRate: number;
};

type InvoiceStatistics = {
    total: number;
    statusDistribution: Record<string, number>;
    amounts: {
        totalRevenue: number;
        totalSubtotal: number;
        totalTax: number;
        totalDiscounts: number;
    };
    recentInvoices: number;
};

type PaymentStatistics = {
    total: number;
    statusDistribution: Record<string, number>;
    totalProcessed: number;
};

type UsageStatistics = {
    totalRecords: number;
    totalCost: number;
    totalDuration: number;
    totalBandwidth: number;
    averages: {
        cpu: number;
        ram: number;
    };
};

type DashboardStats = {
    users: UserStatistics;
    vms: VmStatistics;
    invoices: InvoiceStatistics;
    payments: PaymentStatistics;
    usage: UsageStatistics;
    recentActivity: AuditLogWithUser[];
    timestamp: Date;
};

type SubSystemHealth = {
    status: string;
} & Record<string, unknown>;

type SystemHealth = {
    status: string;
    database?: SubSystemHealth;
    vms?: SubSystemHealth;
    services?: SubSystemHealth;
    error?: string;
    timestamp: Date;
};

type ResourceLimits = {
    cpu: number;
    ram: number;
    storage: number;
    bandwidth: number;
};

type SystemResourceUsage = {
    used: ResourceLimits;
    limits: ResourceLimits;
    usage: ResourceLimits;
    available: ResourceLimits;
};

type AnalyticsOptions = {
    startDate?: string | Date;
    endDate?: string | Date;
    groupBy?: string;
};

type GroupableItem = {
    createdAt: Date | string;
} & Record<string, any>;

type GroupedPeriod = {
    period: string;
    count: number;
    total?: number;
};

type AuditLogOptions = {
    page?: string | number;
    limit?: string | number;
    userId?: string;
    action?: string;
    resource?: string;
    startDate?: string | Date;
    endDate?: string | Date;
    sortBy?: string;
    sortOrder?: string;
};

const getErrorMessage = (error: unknown): string => (error instanceof Error ? error.message : 'Unknown error');

/**
 * Admin Service
 * Handles admin operations, statistics, and system monitoring
 */
class AdminService {
  // ==================== Dashboard Statistics ====================

  /**
     * Get comprehensive dashboard statistics
     */
  static async getDashboardStats(): Promise<DashboardStats> {
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
      throw new Error(`Failed to get dashboard stats: ${getErrorMessage(error)}`);
    }
  }

  /**
     * Get user statistics
     */
  static async getUserStatistics(): Promise<UserStatistics> {
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

      const roleDistribution: Record<string, number> = {};
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
      throw new Error(`Failed to get user statistics: ${getErrorMessage(error)}`);
    }
  }

  /**
     * Get VM statistics
     */
  static async getVMStatistics(): Promise<VmStatistics> {
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

      const statusDistribution: Record<string, number> = {};
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
      throw new Error(`Failed to get VM statistics: ${getErrorMessage(error)}`);
    }
  }

  /**
     * Get invoice statistics
     */
  static async getInvoiceStatistics(): Promise<InvoiceStatistics> {
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

      const statusDistribution: Record<string, number> = {};
      byStatus.forEach((item) => {
        statusDistribution[item.status] = item._count;
      });

      return {
        total,
        statusDistribution,
        amounts: {
          totalRevenue: parseFloat((amounts._sum?.amount || 0).toFixed(2)),
          totalSubtotal: parseFloat((amounts._sum?.subtotal || 0).toFixed(2)),
          totalTax: parseFloat((amounts._sum?.tax || 0).toFixed(2)),
          totalDiscounts: parseFloat((amounts._sum?.discount || 0).toFixed(2)),
        },
        recentInvoices,
      };
    } catch (error) {
      throw new Error(`Failed to get invoice statistics: ${getErrorMessage(error)}`);
    }
  }

  /**
     * Get payment statistics
     */
  static async getPaymentStatistics(): Promise<PaymentStatistics> {
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

      const statusDistribution: Record<string, number> = {};
      byStatus.forEach((item) => {
        statusDistribution[item.status] = item._count;
      });

      return {
        total,
        statusDistribution,
        totalProcessed: parseFloat((amounts._sum.amount || 0).toFixed(2)),
      };
    } catch (error) {
      throw new Error(`Failed to get payment statistics: ${getErrorMessage(error)}`);
    }
  }

  /**
     * Get usage statistics
     */
  static async getUsageStatistics(): Promise<UsageStatistics> {
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
      throw new Error(`Failed to get usage statistics: ${getErrorMessage(error)}`);
    }
  }

  /**
     * Get recent activity
     * @param limit - Number of activities to retrieve
     */
  static async getRecentActivity(limit = 20): Promise<AuditLogWithUser[]> {
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
      throw new Error(`Failed to get recent activity: ${getErrorMessage(error)}`);
    }
  }

  // ==================== System Monitoring ====================

  /**
     * Get system health status
     */
  static async getSystemHealth(): Promise<SystemHealth> {
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
        error: getErrorMessage(error),
        timestamp: new Date(),
      };
    }
  }

  /**
     * Check database health
     */
  static async checkDatabaseHealth(): Promise<SubSystemHealth> {
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
        error: getErrorMessage(error),
      };
    }
  }

  /**
     * Check VM health
     */
  static async checkVMHealth(): Promise<SubSystemHealth> {
    try {
      const [total, running, errorCount] = await Promise.all([
        prisma.virtualMachine.count(),
        prisma.virtualMachine.count({ where: { status: 'RUNNING' } }),
        prisma.virtualMachine.count({ where: { status: 'ERROR' } }),
      ]);

      const healthPercentage = total > 0 ? ((total - errorCount) / total) * 100 : 100;

      return {
        status: healthPercentage >= 95 ? 'healthy' : 'degraded',
        total,
        running,
        error: errorCount,
        healthPercentage: parseFloat(healthPercentage.toFixed(2)),
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: getErrorMessage(error),
      };
    }
  }

  /**
     * Check service health
     */
  static async checkServiceHealth(): Promise<SubSystemHealth> {
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
        error: getErrorMessage(error),
      };
    }
  }

  // ==================== Resource Management ====================

  /**
     * Get system resource usage
     */
  static async getSystemResourceUsage(): Promise<SystemResourceUsage> {
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
      throw new Error(`Failed to get system resource usage: ${getErrorMessage(error)}`);
    }
  }

  /**
     * Get system resource limits
     */
  static async getSystemResourceLimits(): Promise<ResourceLimits> {
    // In production, these would come from system configuration
    return {
      cpu: parseInt(process.env.SYSTEM_CPU_LIMIT ?? '', 10) || 1000,
      ram: parseInt(process.env.SYSTEM_RAM_LIMIT ?? '', 10) || 2048000, // 2TB in MB
      storage: parseInt(process.env.SYSTEM_STORAGE_LIMIT ?? '', 10) || 100000, // 100TB in GB
      bandwidth: parseInt(process.env.SYSTEM_BANDWIDTH_LIMIT ?? '', 10) || 1000000, // 1PB in GB
    };
  }

  // ==================== Analytics ====================

  /**
     * Get revenue analytics
     * @param options - Query options
     */
  static async getRevenueAnalytics(options: AnalyticsOptions = {}): Promise<{
        totalRevenue: number;
        totalPayments: number;
        revenueByPeriod: GroupedPeriod[];
        paymentsByPeriod: GroupedPeriod[];
    }> {
    try {
      const { startDate, endDate, groupBy = 'day' } = options;

      const where: Record<string, any> = {};
      if (startDate || endDate) {
        where.createdAt = {};
        if (startDate) where.createdAt.gte = new Date(startDate);
        if (endDate) where.createdAt.lte = new Date(endDate);
      }

      const [invoices, payments] = await Promise.all([
        prisma.invoice.findMany({
          where,
          select: {
            amount: true,
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
      const revenueByPeriod = this.groupByPeriod(invoices, groupBy, 'amount');
      const paymentsByPeriod = this.groupByPeriod(payments, groupBy, 'amount');

      return {
        totalRevenue: invoices.reduce((sum, inv) => sum + Number(inv.amount), 0),
        totalPayments: payments.reduce((sum, pay) => sum + Number(pay.amount), 0),
        revenueByPeriod,
        paymentsByPeriod,
      };
    } catch (error) {
      throw new Error(`Failed to get revenue analytics: ${getErrorMessage(error)}`);
    }
  }

  /**
     * Get user growth analytics
     * @param options - Query options
     */
  static async getUserGrowthAnalytics(options: AnalyticsOptions = {}): Promise<{
        totalSignups: number;
        signupsByPeriod: GroupedPeriod[];
    }> {
    try {
      const { startDate, endDate, groupBy = 'day' } = options;

      const where: Record<string, any> = {};
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
      throw new Error(`Failed to get user growth analytics: ${getErrorMessage(error)}`);
    }
  }

  /**
     * Group data by time period
     * @param data - Data to group
     * @param groupBy - Grouping period
     * @param sumField - Field to sum (optional)
     */
  static groupByPeriod(data: GroupableItem[], groupBy: string, sumField: string | null = null): GroupedPeriod[] {
    const grouped: Record<string, { period: string; count: number; total: number }> = {};

    data.forEach((item) => {
      const date = new Date(item.createdAt);
      let key: string;

      switch (groupBy) {
        case 'hour':
          key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:00`;
          break;
        case 'day':
          key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
          break;
        case 'week': {
          const weekStart = new Date(date);
          weekStart.setDate(date.getDate() - date.getDay());
          key = `${weekStart.getFullYear()}-W${String(Math.ceil((weekStart.getDate() + 1) / 7)).padStart(2, '0')}`;
          break;
        }
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
     * @param options - Query options
     */
  static async getAuditLogs(options: AuditLogOptions = {}): Promise<{
        data: AuditLogWithUser[];
        pagination: {
            page: number;
            limit: number;
            total: number;
            totalPages: number;
        };
    }> {
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

      const where: Record<string, any> = {};

      if (userId) where.userId = userId;
      if (action) where.action = action;
      if (resource) where.resource = resource;

      if (startDate || endDate) {
        where.timestamp = {};
        if (startDate) where.timestamp.gte = new Date(startDate);
        if (endDate) where.timestamp.lte = new Date(endDate);
      }

      const skip = (parseInt(String(page), 10) - 1) * parseInt(String(limit), 10);
      const [logs, total] = await Promise.all([
        prisma.auditLog.findMany({
          where,
          orderBy: { [sortBy]: sortOrder } as any,
          skip,
          take: parseInt(String(limit), 10),
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
          page: parseInt(String(page), 10),
          limit: parseInt(String(limit), 10),
          total,
          totalPages: Math.ceil(total / parseInt(String(limit), 10)),
        },
      };
    } catch (error) {
      throw new Error(`Failed to get audit logs: ${getErrorMessage(error)}`);
    }
  }
}

export = AdminService;
