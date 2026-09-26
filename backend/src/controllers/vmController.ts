import type { Request, Response } from 'express';

const VMService = require('../services/vmService').default;

type VMUserRequest = Request & {
  user: {
    userId: string;
    role: string;
    email: string;
  };
  params: {
    id?: string;
    vmId?: string;
    backupId?: string;
  };
  query: Record<string, any>;
  body: Record<string, any>;
};

// 'VM not found or access denied' errors from the service map to 404,
// everything else keeps the endpoint's default error status.
const isNotFoundError = (error: any): boolean => /not found|access denied/i.test(String(error?.message || ''));

// Errors caused by the VM's current state (stopped VM, missing container,
// incomplete backup, …) are client-correctable and map to 400, not 500.
const isClientStateError = (error: any): boolean => /must be running|no container|transitional state|not in suspended|not running|not completed/i.test(String(error?.message || ''));

class VMController {
  static async createVM(req: VMUserRequest, res: Response): Promise<void> {
    try {
      const { userId } = req.user;
      const {
        name, description, cpu, ram, storage, bandwidth, dockerImage,
      } = req.body;

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
    } catch (error: any) {
      res.status(400).json({
        success: false,
        error: 'VM creation failed',
        message: error.message,
      });
    }
  }

  static async getUserVMs(req: VMUserRequest, res: Response): Promise<void> {
    try {
      const { userId } = req.user;
      const {
        page, limit, status, search, sortBy, sortOrder,
      } = req.query;

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
    } catch (error: any) {
      res.status(400).json({
        success: false,
        error: 'Failed to get VMs',
        message: error.message,
      });
    }
  }

  static async getVMById(req: VMUserRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { userId } = req.user;
      const isAdmin = ['ADMIN', 'SUPER_ADMIN'].includes(req.user.role);

      const vm = await VMService.getVMById(id, isAdmin ? null : userId);

      if (!vm) {
        res.status(404).json({
          success: false,
          error: 'VM not found',
          message: 'VM not found or access denied',
        });
        return;
      }

      res.status(200).json({
        success: true,
        message: 'VM retrieved successfully',
        data: { vm },
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        error: 'Failed to get VM',
        message: error.message,
      });
    }
  }

  static async updateVM(req: VMUserRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { userId } = req.user;
      const isAdmin = ['ADMIN', 'SUPER_ADMIN'].includes(req.user.role);
      const {
        name, description, cpu, ram, storage, bandwidth,
      } = req.body;

      const targetUserId = isAdmin ? null : userId;

      const vm = await VMService.updateVM(id, targetUserId, {
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
    } catch (error: any) {
      res.status(400).json({
        success: false,
        error: 'VM update failed',
        message: error.message,
      });
    }
  }

  static async deleteVM(req: VMUserRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { userId } = req.user;
      const isAdmin = ['ADMIN', 'SUPER_ADMIN'].includes(req.user.role);

      const targetUserId = isAdmin ? null : userId;

      await VMService.deleteVM(id, targetUserId);

      res.status(200).json({
        success: true,
        message: 'VM deleted successfully',
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        error: 'VM deletion failed',
        message: error.message,
      });
    }
  }

  static async startVM(req: VMUserRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { userId } = req.user;
      const isAdmin = ['ADMIN', 'SUPER_ADMIN'].includes(req.user.role);

      const targetUserId = isAdmin ? null : userId;

      const vm = await VMService.startVM(id, targetUserId);

      res.status(200).json({
        success: true,
        message: 'VM start initiated successfully',
        data: { vm },
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        error: 'VM start failed',
        message: error.message,
      });
    }
  }

  static async stopVM(req: VMUserRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { userId } = req.user;
      const isAdmin = ['ADMIN', 'SUPER_ADMIN'].includes(req.user.role);

      const targetUserId = isAdmin ? null : userId;

      const vm = await VMService.stopVM(id, targetUserId);

      res.status(200).json({
        success: true,
        message: 'VM stop initiated successfully',
        data: { vm },
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        error: 'VM stop failed',
        message: error.message,
      });
    }
  }

  static async restartVM(req: VMUserRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { userId } = req.user;
      const isAdmin = ['ADMIN', 'SUPER_ADMIN'].includes(req.user.role);

      const targetUserId = isAdmin ? null : userId;

      const vm = await VMService.restartVM(id, targetUserId);

      res.status(200).json({
        success: true,
        message: 'VM restart initiated successfully',
        data: { vm },
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        error: 'VM restart failed',
        message: error.message,
      });
    }
  }

  static async getUserResourceUsage(req: VMUserRequest, res: Response): Promise<void> {
    try {
      const { userId } = req.user;

      const [usage, limits] = await Promise.all([
        VMService.getUserResourceUsage(userId),
        VMService.getUserResourceLimits(userId),
      ]);

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
    } catch (error: any) {
      res.status(400).json({
        success: false,
        error: 'Failed to get resource usage',
        message: error.message,
      });
    }
  }

  static async getVMStatistics(req: VMUserRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { userId } = req.user;
      const isAdmin = ['ADMIN', 'SUPER_ADMIN'].includes(req.user.role);
      const { startDate, endDate, granularity } = req.query;

      const targetUserId = isAdmin ? null : userId;

      const stats = await VMService.getVMStatistics(id, targetUserId, {
        startDate,
        endDate,
        granularity,
      });

      res.status(200).json({
        success: true,
        message: 'VM statistics retrieved successfully',
        data: stats,
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        error: 'Failed to get VM statistics',
        message: error.message,
      });
    }
  }

  static async getAllVMs(req: VMUserRequest, res: Response): Promise<void> {
    try {
      const {
        page, limit, status, userId, search, sortBy, sortOrder,
      } = req.query;

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
    } catch (error: any) {
      res.status(400).json({
        success: false,
        error: 'Failed to get all VMs',
        message: error.message,
      });
    }
  }

  static async getSystemStats(_req: VMUserRequest, res: Response): Promise<void> {
    try {
      const stats = await VMService.getSystemResourceStats();

      res.status(200).json({
        success: true,
        message: 'System statistics retrieved successfully',
        data: stats,
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        error: 'Failed to get system statistics',
        message: error.message,
      });
    }
  }

  static async suspendVM(req: VMUserRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { reason } = req.body;

      const vm = await VMService.getVMById(id);
      if (!vm) {
        res.status(404).json({
          success: false,
          error: 'VM not found',
          message: 'VM not found',
        });
        return;
      }

      if (vm.status !== 'RUNNING') {
        res.status(400).json({
          success: false,
          error: 'VM not running',
          message: 'Only a running VM can be suspended',
        });
        return;
      }

      // Admin operation — no ownership filter. The service stops the
      // container so the VM actually stops consuming resources.
      await VMService.suspendVM(id, null);

      await VMService.logVMEvent(req.user.userId, 'VM_SUSPENDED', id, {
        vmName: vm.name,
        reason: reason || 'Administrative action',
        suspendedBy: req.user.email,
      });

      res.status(200).json({
        success: true,
        message: 'VM suspended successfully',
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        error: 'VM suspension failed',
        message: error.message,
      });
    }
  }

  static async resumeVM(req: VMUserRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      const vm = await VMService.getVMById(id);
      if (!vm) {
        res.status(404).json({
          success: false,
          error: 'VM not found',
          message: 'VM not found',
        });
        return;
      }

      if (vm.status !== 'SUSPENDED') {
        res.status(400).json({
          success: false,
          error: 'VM not suspended',
          message: 'VM is not in suspended state',
        });
        return;
      }

      // Admin operation — no ownership filter. The service starts the
      // container again and settles the status on Docker reality.
      await VMService.resumeVM(id, null);

      await VMService.logVMEvent(req.user.userId, 'VM_RESUMED', id, {
        vmName: vm.name,
        resumedBy: req.user.email,
      });

      res.status(200).json({
        success: true,
        message: 'VM resumed successfully',
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        error: 'VM resumption failed',
        message: error.message,
      });
    }
  }

  static async getVMPricingEstimate(req: VMUserRequest, res: Response): Promise<void> {
    try {
      const {
        cpu, ram, storage, bandwidth, duration,
      } = req.body;

      const ValidationHelpers = require('../utils/validation.helpers').default;
      const resourceValidation = ValidationHelpers.validateVMResources({
        cpu,
        ram,
        storage,
        bandwidth: bandwidth || 1000,
      });

      if (!resourceValidation.isValid) {
        res.status(400).json({
          success: false,
          error: 'Invalid resources',
          message: resourceValidation.errors.join(', '),
        });
        return;
      }

      const hourlyRate = ValidationHelpers.calculateVMCost({
        cpu,
        ram,
        storage,
        bandwidth: bandwidth || 1000,
      });

      const estimates: Record<string, number> = {
        hourly: hourlyRate,
        daily: hourlyRate * 24,
        weekly: hourlyRate * 24 * 7,
        monthly: hourlyRate * 24 * 30,
        yearly: hourlyRate * 24 * 365,
      };

      if (duration) {
        // Clamp to one year — the request schema has no upper bound and an
        // absurd duration would produce a meaningless estimate.
        const clampedDuration = Math.min(Math.max(Number(duration) || 0, 0), 8760);
        estimates.custom = hourlyRate * clampedDuration;
      }

      res.status(200).json({
        success: true,
        message: 'Pricing estimate calculated successfully',
        data: {
          resources: {
            cpu, ram, storage, bandwidth: bandwidth || 1000,
          },
          estimates,
          currency: 'USD',
          warnings: resourceValidation.warnings || [],
        },
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        error: 'Pricing calculation failed',
        message: error.message,
      });
    }
  }

  static async getVMContainerStatus(req: VMUserRequest, res: Response): Promise<void> {
    try {
      const { userId } = req.user;
      const isAdmin = ['ADMIN', 'SUPER_ADMIN'].includes(req.user.role);
      const { id: vmId } = req.params;

      const containerStatus = await VMService.getVMContainerStatus(vmId, isAdmin ? null : userId);

      res.json({
        success: true,
        data: containerStatus,
      });
    } catch (error: any) {
      res.status(isNotFoundError(error) ? 404 : 500).json({
        success: false,
        error: 'Failed to get VM container status',
        message: error.message,
      });
    }
  }

  static async getVMContainerLogs(req: VMUserRequest, res: Response): Promise<void> {
    try {
      const { userId } = req.user;
      const isAdmin = ['ADMIN', 'SUPER_ADMIN'].includes(req.user.role);
      const { id: vmId } = req.params;
      const {
        tail = 100, since, until, timestamps = true,
      } = req.query;

      const logs = await VMService.getVMContainerLogs(vmId, isAdmin ? null : userId, {
        tail: Number.parseInt(String(tail), 10),
        since,
        until,
        timestamps: String(timestamps) === 'true',
      });

      res.json({
        success: true,
        data: logs,
      });
    } catch (error: any) {
      res.status(isNotFoundError(error) ? 404 : 500).json({
        success: false,
        error: 'Failed to get VM container logs',
        message: error.message,
      });
    }
  }

  static async execInVMContainer(req: VMUserRequest, res: Response): Promise<void> {
    try {
      const { userId } = req.user;
      const isAdmin = ['ADMIN', 'SUPER_ADMIN'].includes(req.user.role);
      const { id: vmId } = req.params;
      const { command } = req.body;

      if (!command || !Array.isArray(command)) {
        res.status(400).json({
          success: false,
          error: 'Command must be an array of strings',
        });
        return;
      }

      const result = await VMService.execInVMContainer(vmId, isAdmin ? null : userId, command);

      res.json({
        success: true,
        data: result,
      });
    } catch (error: any) {
      const statusCode = isNotFoundError(error) ? 404 : isClientStateError(error) ? 400 : 500;
      res.status(statusCode).json({
        success: false,
        error: 'Failed to execute command in VM container',
        message: error.message,
      });
    }
  }

  static async createVMBackup(req: VMUserRequest, res: Response): Promise<void> {
    try {
      const { userId } = req.user;
      const isAdmin = ['ADMIN', 'SUPER_ADMIN'].includes(req.user.role);
      const { id: vmId } = req.params;
      const { backupName } = req.body;

      if (!backupName) {
        res.status(400).json({
          success: false,
          error: 'Backup name is required',
        });
        return;
      }

      const backup = await VMService.createVMBackup(vmId, isAdmin ? null : userId, backupName);

      res.status(201).json({
        success: true,
        message: 'VM backup created successfully',
        data: backup,
      });
    } catch (error: any) {
      const statusCode = isNotFoundError(error) ? 404 : isClientStateError(error) ? 400 : 500;
      res.status(statusCode).json({
        success: false,
        error: 'Failed to create VM backup',
        message: error.message,
      });
    }
  }

  static async restoreVMFromBackup(req: VMUserRequest, res: Response): Promise<void> {
    try {
      const { userId } = req.user;
      const isAdmin = ['ADMIN', 'SUPER_ADMIN'].includes(req.user.role);
      const { backupId } = req.params;
      const restoreConfig = req.body;

      const restoredVM = await VMService.restoreVMFromBackup(backupId, isAdmin ? null : userId, restoreConfig);

      res.status(201).json({
        success: true,
        message: 'VM restored from backup successfully',
        data: restoredVM,
      });
    } catch (error: any) {
      const statusCode = isNotFoundError(error) ? 404 : isClientStateError(error) ? 400 : 500;
      res.status(statusCode).json({
        success: false,
        error: 'Failed to restore VM from backup',
        message: error.message,
      });
    }
  }

  static async getVMResourceStats(req: VMUserRequest, res: Response): Promise<void> {
    try {
      const { userId } = req.user;
      const isAdmin = ['ADMIN', 'SUPER_ADMIN'].includes(req.user.role);
      const { id: vmId } = req.params;

      const stats = await VMService.getVMResourceStats(vmId, isAdmin ? null : userId);

      res.json({
        success: true,
        data: stats,
      });
    } catch (error: any) {
      res.status(isNotFoundError(error) ? 404 : 500).json({
        success: false,
        error: 'Failed to get VM resource stats',
        message: error.message,
      });
    }
  }
}

export = VMController;
