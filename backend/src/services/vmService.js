const { prisma } = require('../config/database');
const ValidationHelpers = require('../utils/validation.helpers');
const { validateVMResources } = require('../validations/vm.validation');

/**
 * Virtual Machine Service
 * Handles VM creation, management, resource allocation, and state management
 */
class VMService {
  /**
   * Create a new virtual machine
   * @param {string} userId - User ID
   * @param {Object} vmData - VM configuration data
   * @returns {Promise<Object>} Created VM
   */
  static async createVM(userId, vmData) {
    const { name, description, cpu, ram, storage, bandwidth, dockerImage } = vmData;

    try {
      // Validate VM resources
      const resourceValidation = ValidationHelpers.validateVMResources({
        cpu,
        ram,
        storage,
        bandwidth: bandwidth || 1000,
      });

      if (!resourceValidation.isValid) {
        throw new Error(`Resource validation failed: ${resourceValidation.errors.join(', ')}`);
      }

      // Check if VM name is unique for user
      const existingVM = await prisma.virtualMachine.findFirst({
        where: {
          userId,
          name,
        },
      });

      if (existingVM) {
        throw new Error('VM with this name already exists');
      }

      // Check user's VM limits (basic implementation)
      const userVMCount = await prisma.virtualMachine.count({
        where: { userId, status: { not: 'DELETED' } },
      });

      const maxVMs = 5; // This should come from user's plan
      if (userVMCount >= maxVMs) {
        throw new Error(`Maximum VM limit reached (${maxVMs})`);
      }

      // Check resource availability (simplified)
      const totalResourceUsage = await this.getUserResourceUsage(userId);
      const maxResources = await this.getUserResourceLimits(userId);

      if (totalResourceUsage.cpu + cpu > maxResources.cpu) {
        throw new Error('Insufficient CPU resources available');
      }

      if (totalResourceUsage.ram + ram > maxResources.ram) {
        throw new Error('Insufficient RAM resources available');
      }

      if (totalResourceUsage.storage + storage > maxResources.storage) {
        throw new Error('Insufficient storage resources available');
      }

      // Calculate hourly rate
      const hourlyRate = ValidationHelpers.calculateVMCost({
        cpu,
        ram,
        storage,
        bandwidth: bandwidth || 1000,
      });

      // Create VM
      const vm = await prisma.virtualMachine.create({
        data: {
          name,
          description: description || null,
          cpu,
          ram,
          storage,
          bandwidth: bandwidth || 1000,
          dockerImage: dockerImage || 'ubuntu:latest',
          hourlyRate,
          status: 'STOPPED',
          userId,
        },
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

      // Log VM creation
      await this.logVMEvent(userId, 'VM_CREATED', vm.id, {
        vmName: vm.name,
        resources: { cpu, ram, storage, bandwidth },
        hourlyRate,
      });

      return vm;
    } catch (error) {
      throw new Error(`VM creation failed: ${error.message}`);
    }
  }

  /**
   * Get VM by ID
   * @param {string} vmId - VM ID
   * @param {string} userId - User ID (for ownership check)
   * @returns {Promise<Object|null>} VM data
   */
  static async getVMById(vmId, userId = null) {
    try {
      const whereClause = { id: vmId };
      if (userId) {
        whereClause.userId = userId;
      }

      const vm = await prisma.virtualMachine.findUnique({
        where: whereClause,
        include: {
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
            },
          },
          usageRecords: {
            take: 10,
            orderBy: { timestamp: 'desc' },
            select: {
              id: true,
              cpuUsage: true,
              ramUsage: true,
              storageUsage: true,
              bandwidthUsage: true,
              duration: true,
              cost: true,
              timestamp: true,
            },
          },
          backups: {
            take: 5,
            orderBy: { createdAt: 'desc' },
            select: {
              id: true,
              name: true,
              status: true,
              size: true,
              backupType: true,
              createdAt: true,
              completedAt: true,
            },
          },
        },
      });

      return vm;
    } catch (error) {
      throw new Error(`Failed to get VM: ${error.message}`);
    }
  }

  /**
   * Get user's VMs with pagination and filtering
   * @param {string} userId - User ID
   * @param {Object} options - Query options
   * @returns {Promise<Object>} Paginated VMs
   */
  static async getUserVMs(userId, options = {}) {
    try {
      const {
        page = 1,
        limit = 10,
        status,
        search,
        sortBy = 'createdAt',
        sortOrder = 'desc',
      } = options;

      // Build where clause
      const where = { userId };

      if (status) {
        where.status = status;
      }

      if (search) {
        where.OR = [
          { name: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
        ];
      }

      // Get paginated results
      const { getPaginatedResults } = require('../utils/prisma');
      const result = await getPaginatedResults(prisma.virtualMachine, {
        page: parseInt(page),
        limit: parseInt(limit),
        where,
        orderBy: { [sortBy]: sortOrder },
        include: {
          usageRecords: {
            take: 1,
            orderBy: { timestamp: 'desc' },
            select: {
              cpuUsage: true,
              ramUsage: true,
              storageUsage: true,
              timestamp: true,
            },
          },
        },
      });

      return result;
    } catch (error) {
      throw new Error(`Failed to get user VMs: ${error.message}`);
    }
  }

  /**
   * Update VM configuration
   * @param {string} vmId - VM ID
   * @param {string} userId - User ID
   * @param {Object} updateData - Update data
   * @returns {Promise<Object>} Updated VM
   */
  static async updateVM(vmId, userId, updateData) {
    try {
      // Get existing VM
      const existingVM = await this.getVMById(vmId, userId);
      if (!existingVM) {
        throw new Error('VM not found or access denied');
      }

      // Check if VM can be updated (not in transitional state)
      if (['STARTING', 'STOPPING', 'RESTARTING'].includes(existingVM.status)) {
        throw new Error('Cannot update VM while it is in transitional state');
      }

      const { name, description, cpu, ram, storage, bandwidth } = updateData;

      // Validate new resources if provided
      if (cpu || ram || storage || bandwidth) {
        const newResources = {
          cpu: cpu || existingVM.cpu,
          ram: ram || existingVM.ram,
          storage: storage || existingVM.storage,
          bandwidth: bandwidth || existingVM.bandwidth,
        };

        const resourceValidation = ValidationHelpers.validateVMResources(newResources);
        if (!resourceValidation.isValid) {
          throw new Error(`Resource validation failed: ${resourceValidation.errors.join(', ')}`);
        }

        // Check resource availability for increases
        if (cpu > existingVM.cpu || ram > existingVM.ram || storage > existingVM.storage) {
          const totalResourceUsage = await this.getUserResourceUsage(userId);
          const maxResources = await this.getUserResourceLimits(userId);

          const cpuIncrease = Math.max(0, (cpu || existingVM.cpu) - existingVM.cpu);
          const ramIncrease = Math.max(0, (ram || existingVM.ram) - existingVM.ram);
          const storageIncrease = Math.max(0, (storage || existingVM.storage) - existingVM.storage);

          if (totalResourceUsage.cpu + cpuIncrease > maxResources.cpu) {
            throw new Error('Insufficient CPU resources for upgrade');
          }

          if (totalResourceUsage.ram + ramIncrease > maxResources.ram) {
            throw new Error('Insufficient RAM resources for upgrade');
          }

          if (totalResourceUsage.storage + storageIncrease > maxResources.storage) {
            throw new Error('Insufficient storage resources for upgrade');
          }
        }
      }

      // Check name uniqueness if changed
      if (name && name !== existingVM.name) {
        const nameExists = await prisma.virtualMachine.findFirst({
          where: {
            userId,
            name,
            id: { not: vmId },
          },
        });

        if (nameExists) {
          throw new Error('VM with this name already exists');
        }
      }

      // Calculate new hourly rate if resources changed
      let newHourlyRate = existingVM.hourlyRate;
      if (cpu || ram || storage || bandwidth) {
        newHourlyRate = ValidationHelpers.calculateVMCost({
          cpu: cpu || existingVM.cpu,
          ram: ram || existingVM.ram,
          storage: storage || existingVM.storage,
          bandwidth: bandwidth || existingVM.bandwidth,
        });
      }

      // Update VM
      const updatedVM = await prisma.virtualMachine.update({
        where: { id: vmId },
        data: {
          ...(name && { name }),
          ...(description !== undefined && { description }),
          ...(cpu && { cpu }),
          ...(ram && { ram }),
          ...(storage && { storage }),
          ...(bandwidth && { bandwidth }),
          hourlyRate: newHourlyRate,
        },
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

      // Log VM update
      await this.logVMEvent(userId, 'VM_UPDATED', vmId, {
        vmName: updatedVM.name,
        changes: updateData,
        oldHourlyRate: existingVM.hourlyRate,
        newHourlyRate,
      });

      return updatedVM;
    } catch (error) {
      throw new Error(`VM update failed: ${error.message}`);
    }
  }

  /**
   * Delete VM
   * @param {string} vmId - VM ID
   * @param {string} userId - User ID
   * @returns {Promise<void>}
   */
  static async deleteVM(vmId, userId) {
    try {
      // Get existing VM
      const existingVM = await this.getVMById(vmId, userId);
      if (!existingVM) {
        throw new Error('VM not found or access denied');
      }

      // Check if VM can be deleted (must be stopped)
      if (existingVM.status === 'RUNNING') {
        throw new Error('Cannot delete running VM. Please stop it first.');
      }

      if (['STARTING', 'STOPPING', 'RESTARTING'].includes(existingVM.status)) {
        throw new Error('Cannot delete VM while it is in transitional state');
      }

      // Delete related records first
      await prisma.usageRecord.deleteMany({
        where: { vmId },
      });

      await prisma.backup.deleteMany({
        where: { vmId },
      });

      // Delete VM
      await prisma.virtualMachine.delete({
        where: { id: vmId },
      });

      // Log VM deletion
      await this.logVMEvent(userId, 'VM_DELETED', vmId, {
        vmName: existingVM.name,
        resources: {
          cpu: existingVM.cpu,
          ram: existingVM.ram,
          storage: existingVM.storage,
        },
      });
    } catch (error) {
      throw new Error(`VM deletion failed: ${error.message}`);
    }
  }

  /**
   * Start VM
   * @param {string} vmId - VM ID
   * @param {string} userId - User ID
   * @returns {Promise<Object>} Updated VM
   */
  static async startVM(vmId, userId) {
    try {
      // Get existing VM
      const existingVM = await this.getVMById(vmId, userId);
      if (!existingVM) {
        throw new Error('VM not found or access denied');
      }

      // Check if VM can be started
      if (existingVM.status === 'RUNNING') {
        throw new Error('VM is already running');
      }

      if (['STARTING', 'STOPPING', 'RESTARTING'].includes(existingVM.status)) {
        throw new Error('VM is in transitional state');
      }

      if (existingVM.status === 'ERROR') {
        throw new Error('VM is in error state. Please check logs.');
      }

      // Update status to STARTING
      await prisma.virtualMachine.update({
        where: { id: vmId },
        data: { status: 'STARTING' },
      });

      // Simulate VM start process (in real implementation, this would interact with Docker/container orchestrator)
      setTimeout(async () => {
        try {
          // Assign IP address if not already assigned
          let ipAddress = existingVM.ipAddress;
          if (!ipAddress) {
            ipAddress = await this.assignIPAddress();
          }

          // Update status to RUNNING
          await prisma.virtualMachine.update({
            where: { id: vmId },
            data: {
              status: 'RUNNING',
              startedAt: new Date(),
              ipAddress,
            },
          });

          // Log VM start
          await this.logVMEvent(userId, 'VM_STARTED', vmId, {
            vmName: existingVM.name,
            ipAddress,
          });
        } catch (error) {
          // Update status to ERROR if start fails
          await prisma.virtualMachine.update({
            where: { id: vmId },
            data: { status: 'ERROR' },
          });

          await this.logVMEvent(userId, 'VM_START_FAILED', vmId, {
            vmName: existingVM.name,
            error: error.message,
          });
        }
      }, 2000); // 2 second delay to simulate start process

      // Return VM with STARTING status
      return await this.getVMById(vmId, userId);
    } catch (error) {
      throw new Error(`VM start failed: ${error.message}`);
    }
  }

  /**
   * Stop VM
   * @param {string} vmId - VM ID
   * @param {string} userId - User ID
   * @returns {Promise<Object>} Updated VM
   */
  static async stopVM(vmId, userId) {
    try {
      // Get existing VM
      const existingVM = await this.getVMById(vmId, userId);
      if (!existingVM) {
        throw new Error('VM not found or access denied');
      }

      // Check if VM can be stopped
      if (existingVM.status === 'STOPPED') {
        throw new Error('VM is already stopped');
      }

      if (['STARTING', 'STOPPING', 'RESTARTING'].includes(existingVM.status)) {
        throw new Error('VM is in transitional state');
      }

      // Update status to STOPPING
      await prisma.virtualMachine.update({
        where: { id: vmId },
        data: { status: 'STOPPING' },
      });

      // Simulate VM stop process
      setTimeout(async () => {
        try {
          // Update status to STOPPED
          await prisma.virtualMachine.update({
            where: { id: vmId },
            data: {
              status: 'STOPPED',
              stoppedAt: new Date(),
            },
          });

          // Log VM stop
          await this.logVMEvent(userId, 'VM_STOPPED', vmId, {
            vmName: existingVM.name,
          });
        } catch (error) {
          // Update status to ERROR if stop fails
          await prisma.virtualMachine.update({
            where: { id: vmId },
            data: { status: 'ERROR' },
          });

          await this.logVMEvent(userId, 'VM_STOP_FAILED', vmId, {
            vmName: existingVM.name,
            error: error.message,
          });
        }
      }, 1500); // 1.5 second delay to simulate stop process

      // Return VM with STOPPING status
      return await this.getVMById(vmId, userId);
    } catch (error) {
      throw new Error(`VM stop failed: ${error.message}`);
    }
  }

  /**
   * Restart VM
   * @param {string} vmId - VM ID
   * @param {string} userId - User ID
   * @returns {Promise<Object>} Updated VM
   */
  static async restartVM(vmId, userId) {
    try {
      // Get existing VM
      const existingVM = await this.getVMById(vmId, userId);
      if (!existingVM) {
        throw new Error('VM not found or access denied');
      }

      // Check if VM can be restarted
      if (existingVM.status !== 'RUNNING') {
        throw new Error('VM must be running to restart');
      }

      // Update status to RESTARTING
      await prisma.virtualMachine.update({
        where: { id: vmId },
        data: { status: 'RESTARTING' },
      });

      // Simulate VM restart process
      setTimeout(async () => {
        try {
          // Update status to RUNNING
          await prisma.virtualMachine.update({
            where: { id: vmId },
            data: {
              status: 'RUNNING',
              startedAt: new Date(),
            },
          });

          // Log VM restart
          await this.logVMEvent(userId, 'VM_RESTARTED', vmId, {
            vmName: existingVM.name,
          });
        } catch (error) {
          // Update status to ERROR if restart fails
          await prisma.virtualMachine.update({
            where: { id: vmId },
            data: { status: 'ERROR' },
          });

          await this.logVMEvent(userId, 'VM_RESTART_FAILED', vmId, {
            vmName: existingVM.name,
            error: error.message,
          });
        }
      }, 3000); // 3 second delay to simulate restart process

      // Return VM with RESTARTING status
      return await this.getVMById(vmId, userId);
    } catch (error) {
      throw new Error(`VM restart failed: ${error.message}`);
    }
  }

  /**
   * Get user's resource usage
   * @param {string} userId - User ID
   * @returns {Promise<Object>} Resource usage
   */
  static async getUserResourceUsage(userId) {
    try {
      const result = await prisma.virtualMachine.aggregate({
        where: {
          userId,
          status: { not: 'DELETED' },
        },
        _sum: {
          cpu: true,
          ram: true,
          storage: true,
          bandwidth: true,
        },
      });

      return {
        cpu: result._sum.cpu || 0,
        ram: result._sum.ram || 0,
        storage: result._sum.storage || 0,
        bandwidth: result._sum.bandwidth || 0,
      };
    } catch (error) {
      throw new Error(`Failed to get resource usage: ${error.message}`);
    }
  }

  /**
   * Get user's resource limits (from pricing plan)
   * @param {string} userId - User ID
   * @returns {Promise<Object>} Resource limits
   */
  static async getUserResourceLimits(userId) {
    try {
      // This is a simplified implementation
      // In a real system, this would check the user's pricing plan
      return {
        cpu: 16, // 16 CPU cores
        ram: 32768, // 32 GB RAM
        storage: 1024, // 1 TB storage
        bandwidth: 10000, // 10 TB bandwidth
      };
    } catch (error) {
      throw new Error(`Failed to get resource limits: ${error.message}`);
    }
  }

  /**
   * Assign IP address to VM
   * @returns {Promise<string>} Assigned IP address
   */
  static async assignIPAddress() {
    // Simplified IP assignment
    // In a real system, this would manage IP pools
    const baseIP = '192.168.1.';
    const lastOctet = Math.floor(Math.random() * 200) + 50; // 50-249
    return `${baseIP}${lastOctet}`;
  }

  /**
   * Get VM statistics
   * @param {string} vmId - VM ID
   * @param {string} userId - User ID
   * @param {Object} options - Query options
   * @returns {Promise<Object>} VM statistics
   */
  static async getVMStatistics(vmId, userId, options = {}) {
    try {
      const { startDate, endDate, granularity = 'hour' } = options;

      // Verify VM ownership
      const vm = await this.getVMById(vmId, userId);
      if (!vm) {
        throw new Error('VM not found or access denied');
      }

      // Build date filter
      const dateFilter = {};
      if (startDate) dateFilter.gte = new Date(startDate);
      if (endDate) dateFilter.lte = new Date(endDate);

      // Get usage records
      const usageRecords = await prisma.usageRecord.findMany({
        where: {
          vmId,
          ...(Object.keys(dateFilter).length > 0 && { timestamp: dateFilter }),
        },
        orderBy: { timestamp: 'asc' },
        select: {
          cpuUsage: true,
          ramUsage: true,
          storageUsage: true,
          bandwidthUsage: true,
          cost: true,
          timestamp: true,
        },
      });

      // Calculate statistics
      const stats = {
        totalRecords: usageRecords.length,
        totalCost: usageRecords.reduce((sum, record) => sum + parseFloat(record.cost), 0),
        averageCPU: usageRecords.length > 0 
          ? usageRecords.reduce((sum, record) => sum + record.cpuUsage, 0) / usageRecords.length 
          : 0,
        averageRAM: usageRecords.length > 0 
          ? usageRecords.reduce((sum, record) => sum + record.ramUsage, 0) / usageRecords.length 
          : 0,
        totalBandwidth: usageRecords.reduce((sum, record) => sum + record.bandwidthUsage, 0),
        peakCPU: Math.max(...usageRecords.map(r => r.cpuUsage), 0),
        peakRAM: Math.max(...usageRecords.map(r => r.ramUsage), 0),
        records: usageRecords,
      };

      return stats;
    } catch (error) {
      throw new Error(`Failed to get VM statistics: ${error.message}`);
    }
  }

  /**
   * Log VM event
   * @param {string} userId - User ID
   * @param {string} action - Action performed
   * @param {string} vmId - VM ID
   * @param {Object} metadata - Additional metadata
   * @returns {Promise<void>}
   */
  static async logVMEvent(userId, action, vmId, metadata = {}) {
    try {
      await prisma.auditLog.create({
        data: {
          userId,
          action,
          resource: 'vm',
          resourceId: vmId,
          newValues: metadata,
        },
      });
    } catch (error) {
      console.error('Failed to log VM event:', error);
    }
  }

  /**
   * Get all VMs (admin only)
   * @param {Object} options - Query options
   * @returns {Promise<Object>} Paginated VMs
   */
  static async getAllVMs(options = {}) {
    try {
      const {
        page = 1,
        limit = 20,
        status,
        userId,
        search,
        sortBy = 'createdAt',
        sortOrder = 'desc',
      } = options;

      // Build where clause
      const where = {};

      if (status) {
        where.status = status;
      }

      if (userId) {
        where.userId = userId;
      }

      if (search) {
        where.OR = [
          { name: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
          { user: { email: { contains: search, mode: 'insensitive' } } },
        ];
      }

      // Get paginated results
      const { getPaginatedResults } = require('../utils/prisma');
      const result = await getPaginatedResults(prisma.virtualMachine, {
        page: parseInt(page),
        limit: parseInt(limit),
        where,
        orderBy: { [sortBy]: sortOrder },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
            },
          },
          usageRecords: {
            take: 1,
            orderBy: { timestamp: 'desc' },
            select: {
              cpuUsage: true,
              ramUsage: true,
              storageUsage: true,
              cost: true,
              timestamp: true,
            },
          },
        },
      });

      return result;
    } catch (error) {
      throw new Error(`Failed to get all VMs: ${error.message}`);
    }
  }

  /**
   * Get system resource statistics (admin only)
   * @returns {Promise<Object>} System statistics
   */
  static async getSystemResourceStats() {
    try {
      const [
        totalVMs,
        runningVMs,
        stoppedVMs,
        errorVMs,
        totalResources,
        totalCost,
      ] = await Promise.all([
        prisma.virtualMachine.count(),
        prisma.virtualMachine.count({ where: { status: 'RUNNING' } }),
        prisma.virtualMachine.count({ where: { status: 'STOPPED' } }),
        prisma.virtualMachine.count({ where: { status: 'ERROR' } }),
        prisma.virtualMachine.aggregate({
          _sum: {
            cpu: true,
            ram: true,
            storage: true,
            bandwidth: true,
          },
        }),
        prisma.usageRecord.aggregate({
          _sum: { cost: true },
        }),
      ]);

      return {
        vms: {
          total: totalVMs,
          running: runningVMs,
          stopped: stoppedVMs,
          error: errorVMs,
        },
        resources: {
          totalCPU: totalResources._sum.cpu || 0,
          totalRAM: totalResources._sum.ram || 0,
          totalStorage: totalResources._sum.storage || 0,
          totalBandwidth: totalResources._sum.bandwidth || 0,
        },
        totalRevenue: parseFloat(totalCost._sum.cost || 0),
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      throw new Error(`Failed to get system stats: ${error.message}`);
    }
  }
}

module.exports = VMService;