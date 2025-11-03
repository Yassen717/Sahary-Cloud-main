const VMService = require('../services/vmService');
const { prisma } = require('../config/database');

/**
 * Virtual Machine Controller
 * Handles HTTP requests for VM operations
 */
class VMController {
  /**
   * Create a new VM
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async createVM(req, res) {
    try {
      const userId = req.user.userId;
      const { name, description, cpu, ram, storage, bandwidth, dockerImage } = req.body;

      const vm = await VMService.createVM(userId, {
        name,
        description,
        cpu,
        ram,
        storage,
        bandwidth,
        dockerImage,
      });

      res.status(201).json({
        success: true,
        message: 'VM created successfully',
        data: { vm },
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: 'VM creation failed',
        message: error.message,
      });
    }
  }

  /**
   * Get user's VMs
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async getUserVMs(req, res) {
    try {
      const userId = req.user.userId;
      const { page, limit, status, search, sortBy, sortOrder } = req.query;

      const result = await VMService.getUserVMs(userId, {
        page,
        limit,
        status,
        search,
        sortBy,
        sortOrder,
      });

      res.status(200).json({
        success: true,
        message: 'VMs retrieved successfully',
        data: result.data,
        pagination: result.pagination,
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: 'Failed to get VMs',
        message: error.message,
      });
    }
  }

  /**
   * Get VM by ID
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async getVMById(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user.userId;
      const isAdmin = ['ADMIN', 'SUPER_ADMIN'].includes(req.user.role);

      const vm = await VMService.getVMById(id, isAdmin ? null : userId);

      if (!vm) {
        return res.status(404).json({
          success: false,
          error: 'VM not found',
          message: 'VM not found or access denied',
        });
      }

      res.status(200).json({
        success: true,
        message: 'VM retrieved successfully',
        data: { vm },
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: 'Failed to get VM',
        message: error.message,
      });
    }
  }

  /**
   * Update VM
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async updateVM(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user.userId;
      const isAdmin = ['ADMIN', 'SUPER_ADMIN'].includes(req.user.role);
      const { name, description, cpu, ram, storage, bandwidth } = req.body;

      // For admin users, allow updating any VM
      const targetUserId = isAdmin ? null : userId;

      const vm = await VMService.updateVM(id, targetUserId || userId, {
        name,
        description,
        cpu,
        ram,
        storage,
        bandwidth,
      });

      res.status(200).json({
        success: true,
        message: 'VM updated successfully',
        data: { vm },
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: 'VM update failed',
        message: error.message,
      });
    }
  }

  /**
   * Delete VM
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async deleteVM(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user.userId;
      const isAdmin = ['ADMIN', 'SUPER_ADMIN'].includes(req.user.role);

      // For admin users, allow deleting any VM
      const targetUserId = isAdmin ? null : userId;

      await VMService.deleteVM(id, targetUserId || userId);

      res.status(200).json({
        success: true,
        message: 'VM deleted successfully',
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: 'VM deletion failed',
        message: error.message,
      });
    }
  }

  /**
   * Start VM
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async startVM(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user.userId;
      const isAdmin = ['ADMIN', 'SUPER_ADMIN'].includes(req.user.role);

      // For admin users, allow starting any VM
      const targetUserId = isAdmin ? null : userId;

      const vm = await VMService.startVM(id, targetUserId || userId);

      res.status(200).json({
        success: true,
        message: 'VM start initiated successfully',
        data: { vm },
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: 'VM start failed',
        message: error.message,
      });
    }
  }

  /**
   * Stop VM
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async stopVM(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user.userId;
      const isAdmin = ['ADMIN', 'SUPER_ADMIN'].includes(req.user.role);

      // For admin users, allow stopping any VM
      const targetUserId = isAdmin ? null : userId;

      const vm = await VMService.stopVM(id, targetUserId || userId);

      res.status(200).json({
        success: true,
        message: 'VM stop initiated successfully',
        data: { vm },
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: 'VM stop failed',
        message: error.message,
      });
    }
  }

  /**
   * Restart VM
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async restartVM(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user.userId;
      const isAdmin = ['ADMIN', 'SUPER_ADMIN'].includes(req.user.role);

      // For admin users, allow restarting any VM
      const targetUserId = isAdmin ? null : userId;

      const vm = await VMService.restartVM(id, targetUserId || userId);

      res.status(200).json({
        success: true,
        message: 'VM restart initiated successfully',
        data: { vm },
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: 'VM restart failed',
        message: error.message,
      });
    }
  }

  /**
   * Get user resource usage
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async getUserResourceUsage(req, res) {
    try {
      const userId = req.user.userId;

      const [usage, limits] = await Promise.all([
        VMService.getUserResourceUsage(userId),
        VMService.getUserResourceLimits(userId),
      ]);

      // Calculate usage percentages
      const usagePercentages = {
        cpu: limits.cpu > 0 ? (usage.cpu / limits.cpu) * 100 : 0,
        ram: limits.ram > 0 ? (usage.ram / limits.ram) * 100 : 0,
        storage: limits.storage > 0 ? (usage.storage / limits.storage) * 100 : 0,
        bandwidth: limits.bandwidth > 0 ? (usage.bandwidth / limits.bandwidth) * 100 : 0,
      };

      res.status(200).json({
        success: true,
        message: 'Resource usage retrieved successfully',
        data: {
          usage,
          limits,
          usagePercentages,
          available: {
            cpu: limits.cpu - usage.cpu,
            ram: limits.ram - usage.ram,
            storage: limits.storage - usage.storage,
            bandwidth: limits.bandwidth - usage.bandwidth,
          },
        },
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: 'Failed to get resource usage',
        message: error.message,
      });
    }
  }

  /**
   * Get VM statistics
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async getVMStatistics(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user.userId;
      const isAdmin = ['ADMIN', 'SUPER_ADMIN'].includes(req.user.role);
      const { startDate, endDate, granularity } = req.query;

      // For admin users, allow accessing any VM stats
      const targetUserId = isAdmin ? null : userId;

      const stats = await VMService.getVMStatistics(id, targetUserId || userId, {
        startDate,
        endDate,
        granularity,
      });

      res.status(200).json({
        success: true,
        message: 'VM statistics retrieved successfully',
        data: stats,
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: 'Failed to get VM statistics',
        message: error.message,
      });
    }
  }

  /**
   * Get all VMs (admin only)
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async getAllVMs(req, res) {
    try {
      const { page, limit, status, userId, search, sortBy, sortOrder } = req.query;

      const result = await VMService.getAllVMs({
        page,
        limit,
        status,
        userId,
        search,
        sortBy,
        sortOrder,
      });

      res.status(200).json({
        success: true,
        message: 'All VMs retrieved successfully',
        data: result.data,
        pagination: result.pagination,
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: 'Failed to get all VMs',
        message: error.message,
      });
    }
  }

  /**
   * Get system resource statistics (admin only)
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async getSystemStats(req, res) {
    try {
      const stats = await VMService.getSystemResourceStats();

      res.status(200).json({
        success: true,
        message: 'System statistics retrieved successfully',
        data: stats,
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: 'Failed to get system statistics',
        message: error.message,
      });
    }
  }

  /**
   * Suspend VM (admin only)
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async suspendVM(req, res) {
    try {
      const { id } = req.params;
      const { reason } = req.body;

      // Get VM first
      const vm = await VMService.getVMById(id);
      if (!vm) {
        return res.status(404).json({
          success: false,
          error: 'VM not found',
          message: 'VM not found',
        });
      }

      // Update VM status to SUSPENDED
      await prisma.virtualMachine.update({
        where: { id },
        data: { status: 'SUSPENDED' },
      });

      // Log suspension
      await VMService.logVMEvent(req.user.userId, 'VM_SUSPENDED', id, {
        vmName: vm.name,
        reason: reason || 'Administrative action',
        suspendedBy: req.user.email,
      });

      res.status(200).json({
        success: true,
        message: 'VM suspended successfully',
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: 'VM suspension failed',
        message: error.message,
      });
    }
  }

  /**
   * Resume VM (admin only)
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async resumeVM(req, res) {
    try {
      const { id } = req.params;

      // Get VM first
      const vm = await VMService.getVMById(id);
      if (!vm) {
        return res.status(404).json({
          success: false,
          error: 'VM not found',
          message: 'VM not found',
        });
      }

      if (vm.status !== 'SUSPENDED') {
        return res.status(400).json({
          success: false,
          error: 'VM not suspended',
          message: 'VM is not in suspended state',
        });
      }

      // Update VM status to STOPPED (user can then start it)
      await prisma.virtualMachine.update({
        where: { id },
        data: { status: 'STOPPED' },
      });

      // Log resumption
      await VMService.logVMEvent(req.user.userId, 'VM_RESUMED', id, {
        vmName: vm.name,
        resumedBy: req.user.email,
      });

      res.status(200).json({
        success: true,
        message: 'VM resumed successfully',
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: 'VM resumption failed',
        message: error.message,
      });
    }
  }

  /**
   * Get VM pricing estimate
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async getVMPricingEstimate(req, res) {
    try {
      const { cpu, ram, storage, bandwidth, duration } = req.body;

      // Validate resources
      const ValidationHelpers = require('../utils/validation.helpers');
      const resourceValidation = ValidationHelpers.validateVMResources({
        cpu,
        ram,
        storage,
        bandwidth: bandwidth || 1000,
      });

      if (!resourceValidation.isValid) {
        return res.status(400).json({
          success: false,
          error: 'Invalid resources',
          message: resourceValidation.errors.join(', '),
        });
      }

      // Calculate pricing
      const hourlyRate = ValidationHelpers.calculateVMCost({
        cpu,
        ram,
        storage,
        bandwidth: bandwidth || 1000,
      });

      const estimates = {
        hourly: hourlyRate,
        daily: hourlyRate * 24,
        weekly: hourlyRate * 24 * 7,
        monthly: hourlyRate * 24 * 30,
        yearly: hourlyRate * 24 * 365,
      };

      if (duration) {
        estimates.custom = hourlyRate * duration;
      }

      res.status(200).json({
        success: true,
        message: 'Pricing estimate calculated successfully',
        data: {
          resources: { cpu, ram, storage, bandwidth: bandwidth || 1000 },
          estimates,
          currency: 'USD',
          warnings: resourceValidation.warnings || [],
        },
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: 'Pricing calculation failed',
        message: error.message,
      });
    }
  }
  /**
   * Get VM container status
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async getVMContainerStatus(req, res) {
    try {
      const userId = req.user.userId;
      const { vmId } = req.params;

      const containerStatus = await VMService.getVMContainerStatus(vmId, userId);

      res.json({
        success: true,
        data: containerStatus,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to get VM container status',
        message: error.message,
      });
    }
  }

  /**
   * Get VM container logs
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async getVMContainerLogs(req, res) {
    try {
      const userId = req.user.userId;
      const { vmId } = req.params;
      const { tail = 100, since, until, timestamps = true } = req.query;

      const logs = await VMService.getVMContainerLogs(vmId, userId, {
        tail: parseInt(tail),
        since,
        until,
        timestamps: timestamps === 'true',
      });

      res.json({
        success: true,
        data: logs,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to get VM container logs',
        message: error.message,
      });
    }
  }

  /**
   * Execute command in VM container
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async execInVMContainer(req, res) {
    try {
      const userId = req.user.userId;
      const { vmId } = req.params;
      const { command } = req.body;

      if (!command || !Array.isArray(command)) {
        return res.status(400).json({
          success: false,
          error: 'Command must be an array of strings',
        });
      }

      const result = await VMService.execInVMContainer(vmId, userId, command);

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to execute command in VM container',
        message: error.message,
      });
    }
  }

  /**
   * Create VM backup
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async createVMBackup(req, res) {
    try {
      const userId = req.user.userId;
      const { vmId } = req.params;
      const { backupName } = req.body;

      if (!backupName) {
        return res.status(400).json({
          success: false,
          error: 'Backup name is required',
        });
      }

      const backup = await VMService.createVMBackup(vmId, userId, backupName);

      res.status(201).json({
        success: true,
        message: 'VM backup created successfully',
        data: backup,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to create VM backup',
        message: error.message,
      });
    }
  }

  /**
   * Restore VM from backup
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async restoreVMFromBackup(req, res) {
    try {
      const userId = req.user.userId;
      const { backupId } = req.params;
      const restoreConfig = req.body;

      const restoredVM = await VMService.restoreVMFromBackup(backupId, userId, restoreConfig);

      res.status(201).json({
        success: true,
        message: 'VM restored from backup successfully',
        data: restoredVM,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to restore VM from backup',
        message: error.message,
      });
    }
  }

  /**
   * Get VM resource usage stats
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async getVMResourceStats(req, res) {
    try {
      const userId = req.user.userId;
      const { vmId } = req.params;

      const stats = await VMService.getVMResourceStats(vmId, userId);

      res.json({
        success: true,
        data: stats,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to get VM resource stats',
        message: error.message,
      });
    }
  }
}

module.exports = VMController;