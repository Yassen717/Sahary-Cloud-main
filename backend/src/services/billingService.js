const { prisma } = require('../config/database');
const ValidationHelpers = require('../utils/validation.helpers');

/**
 * Billing Service
 * Handles usage tracking, cost calculation, and billing operations
 */
class BillingService {
  /**
   * Record VM usage for billing
   * @param {string} vmId - Virtual Machine ID
   * @param {Object} usageData - Usage data
   * @returns {Promise<Object>} Created usage record
   */
  static async recordUsage(vmId, usageData) {
    try {
      const { cpuUsage, ramUsage, storageUsage, bandwidthUsage, duration } = usageData;

      // Get VM details for cost calculation
      const vm = await prisma.virtualMachine.findUnique({
        where: { id: vmId },
        select: {
          id: true,
          cpu: true,
          ram: true,
          storage: true,
          bandwidth: true,
          hourlyRate: true,
          userId: true,
        },
      });

      if (!vm) {
        throw new Error('VM not found');
      }

      // Calculate cost for this usage period
      const cost = this.calculateUsageCost({
        vm,
        cpuUsage,
        ramUsage,
        storageUsage,
        bandwidthUsage,
        duration,
      });

      // Create usage record
      const usageRecord = await prisma.usageRecord.create({
        data: {
          vmId,
          cpuUsage: parseFloat(cpuUsage),
          ramUsage: parseFloat(ramUsage),
          storageUsage: parseFloat(storageUsage),
          bandwidthUsage: parseFloat(bandwidthUsage),
          duration: parseInt(duration),
          cost: parseFloat(cost.toFixed(4)),
          timestamp: new Date(),
        },
      });

      return usageRecord;
    } catch (error) {
      throw new Error(`Failed to record usage: ${error.message}`);
    }
  }

  /**
   * Calculate cost for usage period
   * @param {Object} params - Calculation parameters
   * @returns {number} Calculated cost
   */
  static calculateUsageCost(params) {
    const { vm, cpuUsage, ramUsage, storageUsage, bandwidthUsage, duration } = params;

    // Base hourly rate from VM configuration
    const baseHourlyRate = parseFloat(vm.hourlyRate);

    // Calculate actual usage percentage
    const cpuUtilization = cpuUsage / 100; // Convert percentage to decimal
    const ramUtilization = ramUsage / vm.ram; // Actual RAM used / Total RAM
    const storageUtilization = storageUsage / vm.storage; // Actual storage / Total storage

    // Bandwidth cost (per GB)
    const bandwidthCostPerGB = 0.01; // $0.01 per GB
    const bandwidthCost = (bandwidthUsage / 1024) * bandwidthCostPerGB; // Convert MB to GB

    // Calculate weighted cost based on actual usage
    // CPU and RAM are the primary cost factors
    const cpuWeight = 0.4;
    const ramWeight = 0.4;
    const storageWeight = 0.2;

    const utilizationFactor =
      cpuUtilization * cpuWeight +
      ramUtilization * ramWeight +
      storageUtilization * storageWeight;

    // Calculate cost for the duration (in minutes)
    const hourlyUsageCost = baseHourlyRate * utilizationFactor;
    const minuteCost = hourlyUsageCost / 60;
    const totalCost = minuteCost * duration + bandwidthCost;

    return totalCost;
  }

  /**
   * Get usage records for a VM
   * @param {string} vmId - Virtual Machine ID
   * @param {Object} options - Query options
   * @returns {Promise<Object>} Usage records with pagination
   */
  static async getVMUsage(vmId, options = {}) {
    try {
      const {
        startDate,
        endDate,
        page = 1,
        limit = 100,
        groupBy = 'hour',
      } = options;

      // Build where clause
      const where = { vmId };

      if (startDate || endDate) {
        where.timestamp = {};
        if (startDate) where.timestamp.gte = new Date(startDate);
        if (endDate) where.timestamp.lte = new Date(endDate);
      }

      // Get paginated records
      const skip = (parseInt(page) - 1) * parseInt(limit);
      const [records, total] = await Promise.all([
        prisma.usageRecord.findMany({
          where,
          orderBy: { timestamp: 'desc' },
          skip,
          take: parseInt(limit),
        }),
        prisma.usageRecord.count({ where }),
      ]);

      // Calculate aggregated statistics
      const stats = await this.calculateUsageStatistics(vmId, { startDate, endDate });

      return {
        data: records,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          totalPages: Math.ceil(total / parseInt(limit)),
        },
        statistics: stats,
      };
    } catch (error) {
      throw new Error(`Failed to get VM usage: ${error.message}`);
    }
  }

  /**
   * Calculate usage statistics for a VM
   * @param {string} vmId - Virtual Machine ID
   * @param {Object} options - Query options
   * @returns {Promise<Object>} Usage statistics
   */
  static async calculateUsageStatistics(vmId, options = {}) {
    try {
      const { startDate, endDate } = options;

      const where = { vmId };
      if (startDate || endDate) {
        where.timestamp = {};
        if (startDate) where.timestamp.gte = new Date(startDate);
        if (endDate) where.timestamp.lte = new Date(endDate);
      }

      const aggregation = await prisma.usageRecord.aggregate({
        where,
        _avg: {
          cpuUsage: true,
          ramUsage: true,
          storageUsage: true,
          bandwidthUsage: true,
        },
        _max: {
          cpuUsage: true,
          ramUsage: true,
          storageUsage: true,
          bandwidthUsage: true,
        },
        _sum: {
          cost: true,
          duration: true,
          bandwidthUsage: true,
        },
        _count: true,
      });

      return {
        totalRecords: aggregation._count,
        totalCost: parseFloat((aggregation._sum.cost || 0).toFixed(2)),
        totalDuration: aggregation._sum.duration || 0,
        totalBandwidth: parseFloat(((aggregation._sum.bandwidthUsage || 0) / 1024).toFixed(2)), // Convert to GB
        averages: {
          cpu: parseFloat((aggregation._avg.cpuUsage || 0).toFixed(2)),
          ram: parseFloat((aggregation._avg.ramUsage || 0).toFixed(2)),
          storage: parseFloat((aggregation._avg.storageUsage || 0).toFixed(2)),
          bandwidth: parseFloat((aggregation._avg.bandwidthUsage || 0).toFixed(2)),
        },
        peaks: {
          cpu: parseFloat((aggregation._max.cpuUsage || 0).toFixed(2)),
          ram: parseFloat((aggregation._max.ramUsage || 0).toFixed(2)),
          storage: parseFloat((aggregation._max.storageUsage || 0).toFixed(2)),
          bandwidth: parseFloat((aggregation._max.bandwidthUsage || 0).toFixed(2)),
        },
      };
    } catch (error) {
      throw new Error(`Failed to calculate usage statistics: ${error.message}`);
    }
  }

  /**
   * Get user's total usage across all VMs
   * @param {string} userId - User ID
   * @param {Object} options - Query options
   * @returns {Promise<Object>} User usage summary
   */
  static async getUserUsage(userId, options = {}) {
    try {
      const { startDate, endDate } = options;

      // Get all user's VMs
      const userVMs = await prisma.virtualMachine.findMany({
        where: { userId },
        select: { id: true, name: true },
      });

      const vmIds = userVMs.map((vm) => vm.id);

      if (vmIds.length === 0) {
        return {
          totalCost: 0,
          totalDuration: 0,
          totalBandwidth: 0,
          vmCount: 0,
          vms: [],
        };
      }

      // Build where clause
      const where = { vmId: { in: vmIds } };
      if (startDate || endDate) {
        where.timestamp = {};
        if (startDate) where.timestamp.gte = new Date(startDate);
        if (endDate) where.timestamp.lte = new Date(endDate);
      }

      // Get aggregated usage
      const aggregation = await prisma.usageRecord.aggregate({
        where,
        _sum: {
          cost: true,
          duration: true,
          bandwidthUsage: true,
        },
      });

      // Get usage per VM
      const vmUsage = await Promise.all(
        userVMs.map(async (vm) => {
          const stats = await this.calculateUsageStatistics(vm.id, { startDate, endDate });
          return {
            vmId: vm.id,
            vmName: vm.name,
            ...stats,
          };
        })
      );

      return {
        totalCost: parseFloat((aggregation._sum.cost || 0).toFixed(2)),
        totalDuration: aggregation._sum.duration || 0,
        totalBandwidth: parseFloat(((aggregation._sum.bandwidthUsage || 0) / 1024).toFixed(2)),
        vmCount: userVMs.length,
        vms: vmUsage,
      };
    } catch (error) {
      throw new Error(`Failed to get user usage: ${error.message}`);
    }
  }

  /**
   * Start real-time usage tracking for a VM
   * @param {string} vmId - Virtual Machine ID
   * @returns {Promise<void>}
   */
  static async startUsageTracking(vmId) {
    try {
      // Verify VM exists and is running
      const vm = await prisma.virtualMachine.findUnique({
        where: { id: vmId },
      });

      if (!vm) {
        throw new Error('VM not found');
      }

      if (vm.status !== 'RUNNING') {
        throw new Error('VM must be running to track usage');
      }

      // Create initial usage record
      await this.recordUsage(vmId, {
        cpuUsage: 0,
        ramUsage: 0,
        storageUsage: 0,
        bandwidthUsage: 0,
        duration: 0,
      });

      // Log tracking start
      await prisma.auditLog.create({
        data: {
          userId: vm.userId,
          action: 'USAGE_TRACKING_STARTED',
          resource: 'usage',
          resourceId: vmId,
          newValues: {
            vmId,
            vmName: vm.name,
            startedAt: new Date(),
          },
        },
      });

      return { success: true, message: 'Usage tracking started' };
    } catch (error) {
      throw new Error(`Failed to start usage tracking: ${error.message}`);
    }
  }

  /**
   * Stop usage tracking for a VM
   * @param {string} vmId - Virtual Machine ID
   * @returns {Promise<void>}
   */
  static async stopUsageTracking(vmId) {
    try {
      const vm = await prisma.virtualMachine.findUnique({
        where: { id: vmId },
      });

      if (!vm) {
        throw new Error('VM not found');
      }

      // Log tracking stop
      await prisma.auditLog.create({
        data: {
          userId: vm.userId,
          action: 'USAGE_TRACKING_STOPPED',
          resource: 'usage',
          resourceId: vmId,
          newValues: {
            vmId,
            vmName: vm.name,
            stoppedAt: new Date(),
          },
        },
      });

      return { success: true, message: 'Usage tracking stopped' };
    } catch (error) {
      throw new Error(`Failed to stop usage tracking: ${error.message}`);
    }
  }

  /**
   * Collect current usage metrics from Docker container
   * @param {string} vmId - Virtual Machine ID
   * @returns {Promise<Object>} Current usage metrics
   */
  static async collectCurrentUsage(vmId) {
    try {
      const vm = await prisma.virtualMachine.findUnique({
        where: { id: vmId },
        select: {
          id: true,
          dockerContainerId: true,
          cpu: true,
          ram: true,
          storage: true,
          status: true,
        },
      });

      if (!vm) {
        throw new Error('VM not found');
      }

      if (vm.status !== 'RUNNING' || !vm.dockerContainerId) {
        return {
          cpuUsage: 0,
          ramUsage: 0,
          storageUsage: 0,
          bandwidthUsage: 0,
        };
      }

      // Get Docker service for container stats
      const dockerService = require('./dockerService');
      const containerStats = await dockerService.getContainerStats(vm.dockerContainerId);

      // Extract usage metrics
      const cpuUsage = containerStats.cpu_stats?.cpu_usage?.total_usage || 0;
      const ramUsage = containerStats.memory_stats?.usage || 0;

      // Calculate percentages and actual values
      const cpuPercent = this.calculateCPUPercent(containerStats);
      const ramMB = ramUsage / (1024 * 1024); // Convert bytes to MB

      // Storage usage (simplified - would need actual disk usage check)
      const storageUsage = vm.storage * 0.5; // Assume 50% usage for now

      // Bandwidth usage (from network stats)
      const networkStats = containerStats.networks || {};
      const bandwidthUsage = Object.values(networkStats).reduce(
        (total, net) => total + (net.rx_bytes || 0) + (net.tx_bytes || 0),
        0
      ) / (1024 * 1024); // Convert to MB

      return {
        cpuUsage: parseFloat(cpuPercent.toFixed(2)),
        ramUsage: parseFloat(ramMB.toFixed(2)),
        storageUsage: parseFloat(storageUsage.toFixed(2)),
        bandwidthUsage: parseFloat(bandwidthUsage.toFixed(2)),
      };
    } catch (error) {
      console.error('Error collecting usage:', error);
      // Return zero usage on error
      return {
        cpuUsage: 0,
        ramUsage: 0,
        storageUsage: 0,
        bandwidthUsage: 0,
      };
    }
  }

  /**
   * Calculate CPU usage percentage from Docker stats
   * @param {Object} stats - Docker container stats
   * @returns {number} CPU usage percentage
   */
  static calculateCPUPercent(stats) {
    try {
      const cpuDelta =
        stats.cpu_stats.cpu_usage.total_usage -
        stats.precpu_stats.cpu_usage.total_usage;
      const systemDelta =
        stats.cpu_stats.system_cpu_usage - stats.precpu_stats.system_cpu_usage;
      const numberCpus = stats.cpu_stats.online_cpus || 1;

      if (systemDelta > 0 && cpuDelta > 0) {
        return (cpuDelta / systemDelta) * numberCpus * 100;
      }
      return 0;
    } catch (error) {
      return 0;
    }
  }

  /**
   * Periodic usage collection job (to be called by scheduler)
   * @returns {Promise<Object>} Collection results
   */
  static async collectAllRunningVMsUsage() {
    try {
      // Get all running VMs
      const runningVMs = await prisma.virtualMachine.findMany({
        where: { status: 'RUNNING' },
        select: { id: true, name: true, userId: true },
      });

      const results = {
        success: 0,
        failed: 0,
        total: runningVMs.length,
        errors: [],
      };

      // Collect usage for each VM
      for (const vm of runningVMs) {
        try {
          const currentUsage = await this.collectCurrentUsage(vm.id);

          // Record usage with 5-minute duration (typical collection interval)
          await this.recordUsage(vm.id, {
            ...currentUsage,
            duration: 5,
          });

          results.success++;
        } catch (error) {
          results.failed++;
          results.errors.push({
            vmId: vm.id,
            vmName: vm.name,
            error: error.message,
          });
        }
      }

      return results;
    } catch (error) {
      throw new Error(`Failed to collect usage for running VMs: ${error.message}`);
    }
  }

  /**
   * Get usage summary for date range
   * @param {string} userId - User ID
   * @param {Object} options - Query options
   * @returns {Promise<Object>} Usage summary
   */
  static async getUsageSummary(userId, options = {}) {
    try {
      const { startDate, endDate, groupBy = 'day' } = options;

      const usage = await this.getUserUsage(userId, { startDate, endDate });

      // Get daily/hourly breakdown
      const breakdown = await this.getUsageBreakdown(userId, {
        startDate,
        endDate,
        groupBy,
      });

      return {
        summary: {
          totalCost: usage.totalCost,
          totalDuration: usage.totalDuration,
          totalBandwidth: usage.totalBandwidth,
          vmCount: usage.vmCount,
        },
        breakdown,
        vms: usage.vms,
      };
    } catch (error) {
      throw new Error(`Failed to get usage summary: ${error.message}`);
    }
  }

  /**
   * Get usage breakdown by time period
   * @param {string} userId - User ID
   * @param {Object} options - Query options
   * @returns {Promise<Array>} Usage breakdown
   */
  static async getUsageBreakdown(userId, options = {}) {
    try {
      const { startDate, endDate, groupBy = 'day' } = options;

      // Get all user's VMs
      const userVMs = await prisma.virtualMachine.findMany({
        where: { userId },
        select: { id: true },
      });

      const vmIds = userVMs.map((vm) => vm.id);

      if (vmIds.length === 0) {
        return [];
      }

      // Build where clause
      const where = { vmId: { in: vmIds } };
      if (startDate || endDate) {
        where.timestamp = {};
        if (startDate) where.timestamp.gte = new Date(startDate);
        if (endDate) where.timestamp.lte = new Date(endDate);
      }

      // Get all records
      const records = await prisma.usageRecord.findMany({
        where,
        orderBy: { timestamp: 'asc' },
      });

      // Group by time period
      const grouped = this.groupUsageByPeriod(records, groupBy);

      return grouped;
    } catch (error) {
      throw new Error(`Failed to get usage breakdown: ${error.message}`);
    }
  }

  /**
   * Group usage records by time period
   * @param {Array} records - Usage records
   * @param {string} groupBy - Grouping period (hour, day, week, month)
   * @returns {Array} Grouped usage data
   */
  static groupUsageByPeriod(records, groupBy) {
    const grouped = {};

    records.forEach((record) => {
      const date = new Date(record.timestamp);
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
          cost: 0,
          duration: 0,
          bandwidth: 0,
          records: 0,
        };
      }

      grouped[key].cost += parseFloat(record.cost);
      grouped[key].duration += record.duration;
      grouped[key].bandwidth += record.bandwidthUsage;
      grouped[key].records += 1;
    });

    // Convert to array and format
    return Object.values(grouped).map((item) => ({
      period: item.period,
      cost: parseFloat(item.cost.toFixed(2)),
      duration: item.duration,
      bandwidth: parseFloat((item.bandwidth / 1024).toFixed(2)), // Convert to GB
      records: item.records,
    }));
  }
}

module.exports = BillingService;
