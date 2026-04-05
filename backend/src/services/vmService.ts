import { prisma } from '../config/database';
import ValidationHelpers from '../utils/validation.helpers';
import dockerService from './dockerService';
import { getPaginatedResults } from '../utils/prisma';
import { validateVMResources } from '../validations/vm.validation';
import type {
  CreateVmInput,
  VmListOptions,
  VmRecord,
  VmResourceInput,
  VmResourceLimits,
  VmResourceStatsResult,
  VmResourceUsage,
  VmStatisticsOptions,
  VmStatisticsResult,
  UpdateVmInput,
  VmStatus,
} from '../types/vm';

type PrismaVmRecord = VmRecord & {
  hourlyRate: string | number;
};

/**
 * Virtual Machine Service
 * Handles VM creation, management, resource allocation, and state management
 */
class VMService {
  static async createVM(userId: string, vmData: CreateVmInput): Promise<VmRecord> {
    const { name, description, cpu, ram, storage, bandwidth, dockerImage } = vmData;

    try {
      const resourceValidation = ValidationHelpers.validateVMResources({
        cpu,
        ram,
        storage,
        bandwidth: bandwidth || 1000,
      });

      if (!resourceValidation.isValid) {
        throw new Error(`Resource validation failed: ${resourceValidation.errors.join(', ')}`);
      }

      const existingVM = await prisma.virtualMachine.findFirst({
        where: {
          userId,
          name,
        },
      });

      if (existingVM) {
        throw new Error('VM with this name already exists');
      }

      const userVMCount = await prisma.virtualMachine.count({
        where: { userId, status: { not: 'DELETED' } },
      });

      const maxVMs = 5;
      if (userVMCount >= maxVMs) {
        throw new Error(`Maximum VM limit reached (${maxVMs})`);
      }

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

      const hourlyRate = ValidationHelpers.calculateVMCost({
        cpu,
        ram,
        storage,
        bandwidth: bandwidth || 1000,
      });

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
      }) as VmRecord;

      await this.logVMEvent(userId, 'VM_CREATED', vm.id, {
        vmName: vm.name,
        resources: { cpu, ram, storage, bandwidth },
        hourlyRate,
      });

      return vm;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`VM creation failed: ${message}`);
    }
  }

  static async getVMById(vmId: string, userId: string | null = null): Promise<VmRecord | null> {
    try {
      const whereClause: Record<string, unknown> = { id: vmId };
      if (userId) {
        whereClause.userId = userId;
      }

      const vm = await prisma.virtualMachine.findUnique({
        where: whereClause as any,
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
      }) as VmRecord | null;

      return vm;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to get VM: ${message}`);
    }
  }

  static async getUserVMs(userId: string, options: VmListOptions = {}): Promise<{ data: VmRecord[]; pagination: Record<string, unknown> }> {
    try {
      const {
        page = 1,
        limit = 10,
        status,
        search,
        sortBy = 'createdAt',
        sortOrder = 'desc',
      } = options;

      const where: Record<string, unknown> = { userId };

      if (status) {
        where.status = status;
      }

      if (search) {
        where.OR = [
          { name: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
        ];
      }

      const result = await getPaginatedResults<VmRecord>(prisma.virtualMachine, {
        page: parseInt(String(page), 10),
        limit: parseInt(String(limit), 10),
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
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to get user VMs: ${message}`);
    }
  }

  static async updateVM(vmId: string, userId: string, updateData: UpdateVmInput): Promise<VmRecord> {
    try {
      const existingVM = await this.getVMById(vmId, userId);
      if (!existingVM) {
        throw new Error('VM not found or access denied');
      }

      if (['STARTING', 'STOPPING', 'RESTARTING'].includes(existingVM.status)) {
        throw new Error('Cannot update VM while it is in transitional state');
      }

      const { name, description, cpu, ram, storage, bandwidth } = updateData;

      if (cpu || ram || storage || bandwidth) {
        const newResources = {
          cpu: cpu || existingVM.cpu,
          ram: ram || existingVM.ram,
          storage: storage || existingVM.storage,
          bandwidth: bandwidth || existingVM.bandwidth || 1000,
        };

        const resourceValidation = ValidationHelpers.validateVMResources(newResources);
        if (!resourceValidation.isValid) {
          throw new Error(`Resource validation failed: ${resourceValidation.errors.join(', ')}`);
        }

        if ((cpu || existingVM.cpu) > existingVM.cpu || (ram || existingVM.ram) > existingVM.ram || (storage || existingVM.storage) > existingVM.storage) {
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

      let newHourlyRate = Number(existingVM.hourlyRate);
      if (cpu || ram || storage || bandwidth) {
        newHourlyRate = ValidationHelpers.calculateVMCost({
          cpu: cpu || existingVM.cpu,
          ram: ram || existingVM.ram,
          storage: storage || existingVM.storage,
          bandwidth: bandwidth || existingVM.bandwidth || 1000,
        });
      }

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
      }) as VmRecord;

      await this.logVMEvent(userId, 'VM_UPDATED', vmId, {
        vmName: updatedVM.name,
        changes: updateData,
        oldHourlyRate: existingVM.hourlyRate,
        newHourlyRate,
      });

      return updatedVM;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`VM update failed: ${message}`);
    }
  }

  static async deleteVM(vmId: string, userId: string): Promise<void> {
    try {
      const existingVM = await this.getVMById(vmId, userId);
      if (!existingVM) {
        throw new Error('VM not found or access denied');
      }

      if (existingVM.status === 'RUNNING') {
        throw new Error('Cannot delete running VM. Please stop it first.');
      }

      if (['STARTING', 'STOPPING', 'RESTARTING'].includes(existingVM.status)) {
        throw new Error('Cannot delete VM while it is in transitional state');
      }

      if (existingVM.dockerContainerId) {
        try {
          await dockerService.removeContainer(existingVM.dockerContainerId, true);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.warn(`Failed to remove container ${existingVM.dockerContainerId}:`, message);
        }
      }

      await prisma.usageRecord.deleteMany({ where: { vmId } });
      await prisma.backup.deleteMany({ where: { vmId } });
      await prisma.virtualMachine.delete({ where: { id: vmId } });

      await this.logVMEvent(userId, 'VM_DELETED', vmId, {
        vmName: existingVM.name,
        resources: {
          cpu: existingVM.cpu,
          ram: existingVM.ram,
          storage: existingVM.storage,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`VM deletion failed: ${message}`);
    }
  }

  static async startVM(vmId: string, userId: string): Promise<VmRecord> {
    try {
      const existingVM = await this.getVMById(vmId, userId);
      if (!existingVM) {
        throw new Error('VM not found or access denied');
      }

      if (existingVM.status === 'RUNNING') {
        throw new Error('VM is already running');
      }

      if (['STARTING', 'STOPPING', 'RESTARTING'].includes(existingVM.status)) {
        throw new Error('VM is in transitional state');
      }

      if (existingVM.status === 'ERROR') {
        throw new Error('VM is in error state. Please check logs.');
      }

      await prisma.virtualMachine.update({
        where: { id: vmId },
        data: { status: 'STARTING' },
      });

      try {
        let containerInfo: { containerId: string; ipAddress?: string | null };

        if (existingVM.dockerContainerId) {
          containerInfo = await dockerService.startContainer(existingVM.dockerContainerId);
        } else {
          const containerConfig = {
            vmId: existingVM.id,
            name: existingVM.name,
            image: existingVM.dockerImage || 'ubuntu:latest',
            cpu: existingVM.cpu,
            ram: existingVM.ram,
            storage: existingVM.storage,
            ports: [],
            environment: [
              `VM_ID=${existingVM.id}`,
              `VM_NAME=${existingVM.name}`,
              `USER_ID=${userId}`,
            ],
            volumes: [`sahary-vm-${existingVM.id}-data:/data`],
          };

          containerInfo = await dockerService.createContainer(containerConfig);
          containerInfo = await dockerService.startContainer(containerInfo.containerId);
        }

        await prisma.virtualMachine.update({
          where: { id: vmId },
          data: {
            status: 'RUNNING',
            startedAt: new Date(),
            dockerContainerId: containerInfo.containerId,
            ipAddress: containerInfo.ipAddress || existingVM.ipAddress,
          },
        });

        await this.logVMEvent(userId, 'VM_STARTED', vmId, {
          vmName: existingVM.name,
          dockerContainerId: containerInfo.containerId,
          ipAddress: containerInfo.ipAddress,
        });
      } catch (error) {
        await prisma.virtualMachine.update({
          where: { id: vmId },
          data: { status: 'ERROR' },
        });

        await this.logVMEvent(userId, 'VM_START_FAILED', vmId, {
          vmName: existingVM.name,
          error: error instanceof Error ? error.message : String(error),
        });

        throw error;
      }

      return await this.getVMById(vmId, userId) as VmRecord;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`VM start failed: ${message}`);
    }
  }

  static async stopVM(vmId: string, userId: string): Promise<VmRecord> {
    try {
      const existingVM = await this.getVMById(vmId, userId);
      if (!existingVM) {
        throw new Error('VM not found or access denied');
      }

      if (existingVM.status === 'STOPPED') {
        throw new Error('VM is already stopped');
      }

      if (['STARTING', 'STOPPING', 'RESTARTING'].includes(existingVM.status)) {
        throw new Error('VM is in transitional state');
      }

      await prisma.virtualMachine.update({
        where: { id: vmId },
        data: { status: 'STOPPING' },
      });

      try {
        if (existingVM.dockerContainerId) {
          await dockerService.stopContainer(existingVM.dockerContainerId, 10);
        }

        await prisma.virtualMachine.update({
          where: { id: vmId },
          data: {
            status: 'STOPPED',
            stoppedAt: new Date(),
          },
        });

        await this.logVMEvent(userId, 'VM_STOPPED', vmId, {
          vmName: existingVM.name,
          dockerContainerId: existingVM.dockerContainerId,
        });
      } catch (error) {
        await prisma.virtualMachine.update({
          where: { id: vmId },
          data: { status: 'ERROR' },
        });

        await this.logVMEvent(userId, 'VM_STOP_FAILED', vmId, {
          vmName: existingVM.name,
          error: error instanceof Error ? error.message : String(error),
        });

        throw error;
      }

      return await this.getVMById(vmId, userId) as VmRecord;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`VM stop failed: ${message}`);
    }
  }

  static async restartVM(vmId: string, userId: string): Promise<VmRecord> {
    try {
      const existingVM = await this.getVMById(vmId, userId);
      if (!existingVM) {
        throw new Error('VM not found or access denied');
      }

      if (existingVM.status !== 'RUNNING') {
        throw new Error('VM must be running to restart');
      }

      await prisma.virtualMachine.update({
        where: { id: vmId },
        data: { status: 'RESTARTING' },
      });

      setTimeout(async () => {
        try {
          await prisma.virtualMachine.update({
            where: { id: vmId },
            data: {
              status: 'RUNNING',
              startedAt: new Date(),
            },
          });

          await this.logVMEvent(userId, 'VM_RESTARTED', vmId, {
            vmName: existingVM.name,
          });
        } catch (error) {
          await prisma.virtualMachine.update({
            where: { id: vmId },
            data: { status: 'ERROR' },
          });

          await this.logVMEvent(userId, 'VM_RESTART_FAILED', vmId, {
            vmName: existingVM.name,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }, 3000);

      return await this.getVMById(vmId, userId) as VmRecord;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`VM restart failed: ${message}`);
    }
  }

  static async getUserResourceUsage(userId: string): Promise<VmResourceUsage> {
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
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to get resource usage: ${message}`);
    }
  }

  static async getUserResourceLimits(_userId: string): Promise<VmResourceLimits> {
    try {
      return {
        cpu: 16,
        ram: 32768,
        storage: 1024,
        bandwidth: 10000,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to get resource limits: ${message}`);
    }
  }

  static async assignIPAddress(): Promise<string> {
    const baseIP = '192.168.1.';
    const lastOctet = Math.floor(Math.random() * 200) + 50;
    return `${baseIP}${lastOctet}`;
  }

  static async getVMStatistics(vmId: string, userId: string, options: VmStatisticsOptions = {}): Promise<VmStatisticsResult> {
    try {
      const { startDate, endDate } = options;

      const vm = await this.getVMById(vmId, userId);
      if (!vm) {
        throw new Error('VM not found or access denied');
      }

      const dateFilter: Record<string, Date> = {};
      if (startDate) dateFilter.gte = new Date(startDate);
      if (endDate) dateFilter.lte = new Date(endDate);

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

      return {
        totalRecords: usageRecords.length,
        totalCost: usageRecords.reduce((sum, record) => sum + Number(record.cost), 0),
        averageCPU: usageRecords.length > 0 ? usageRecords.reduce((sum, record) => sum + record.cpuUsage, 0) / usageRecords.length : 0,
        averageRAM: usageRecords.length > 0 ? usageRecords.reduce((sum, record) => sum + record.ramUsage, 0) / usageRecords.length : 0,
        totalBandwidth: usageRecords.reduce((sum, record) => sum + record.bandwidthUsage, 0),
        peakCPU: Math.max(...usageRecords.map((record) => record.cpuUsage), 0),
        peakRAM: Math.max(...usageRecords.map((record) => record.ramUsage), 0),
        records: usageRecords,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to get VM statistics: ${message}`);
    }
  }

  static async logVMEvent(
    userId: string,
    action: string,
    vmId: string,
    metadata: Record<string, unknown> = {},
  ): Promise<void> {
    try {
      await prisma.auditLog.create({
        data: {
          userId,
          action,
          resource: 'vm',
          resourceId: vmId,
          newValues: Object.keys(metadata).length > 0 ? JSON.stringify(metadata) : null,
        },
      });
    } catch (error) {
      console.error('Failed to log VM event:', error);
    }
  }

  static async getAllVMs(options: VmListOptions = {}): Promise<{ data: VmRecord[]; pagination: Record<string, unknown> }> {
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

      const where: Record<string, unknown> = {};

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

      const result = await getPaginatedResults<VmRecord>(prisma.virtualMachine, {
        page: parseInt(String(page), 10),
        limit: parseInt(String(limit), 10),
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
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to get all VMs: ${message}`);
    }
  }

  static async getSystemResourceStats(): Promise<Record<string, unknown>> {
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
          _sum: {
            cost: true,
          },
        }),
      ]);

      return {
        totalVMs,
        runningVMs,
        stoppedVMs,
        errorVMs,
        totalResources: {
          cpu: totalResources._sum.cpu || 0,
          ram: totalResources._sum.ram || 0,
          storage: totalResources._sum.storage || 0,
          bandwidth: totalResources._sum.bandwidth || 0,
        },
        totalCost: totalCost._sum.cost || 0,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to get system resource stats: ${message}`);
    }
  }

  static async getVMContainerStatus(vmId: string, userId: string): Promise<Record<string, unknown>> {
    try {
      const vm = await this.getVMById(vmId, userId);
      if (!vm) {
        throw new Error('VM not found or access denied');
      }

      if (!vm.dockerContainerId) {
        return {
          vmId,
          vmName: vm.name,
          status: 'no-container',
          message: 'No container associated with this VM',
        };
      }

      const info = await dockerService.getContainerStatus(vm.dockerContainerId);

      if (!info) {
        return {
          vmId,
          vmName: vm.name,
          status: 'not-found',
          dockerContainerId: vm.dockerContainerId,
          message: 'Container not found in Docker',
        };
      }

      return {
        vmId,
        vmName: vm.name,
        status: info.status,
        dockerContainerId: vm.dockerContainerId,
        startedAt: info.startedAt,
        finishedAt: info.finishedAt,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to get VM container status: ${message}`);
    }
  }

  static async getVMContainerLogs(vmId: string, userId: string, options: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
    try {
      const vm = await this.getVMById(vmId, userId);
      if (!vm) {
        throw new Error('VM not found or access denied');
      }

      if (!vm.dockerContainerId) {
        return {
          vmId,
          vmName: vm.name,
          logs: [],
          message: 'No container associated with this VM',
        };
      }

      const logs = await dockerService.getContainerLogs(vm.dockerContainerId, options);

      return {
        vmId,
        vmName: vm.name,
        dockerContainerId: vm.dockerContainerId,
        logs,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to get VM container logs: ${message}`);
    }
  }

  static async execInVMContainer(vmId: string, userId: string, command: string[]): Promise<Record<string, unknown>> {
    try {
      const vm = await this.getVMById(vmId, userId);
      if (!vm) {
        throw new Error('VM not found or access denied');
      }

      if (!vm.dockerContainerId) {
        throw new Error('No container associated with this VM');
      }

      const result = await dockerService.execInContainer(vm.dockerContainerId, command);

      return {
        vmId,
        vmName: vm.name,
        dockerContainerId: vm.dockerContainerId,
        result,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to execute command in VM container: ${message}`);
    }
  }

  static async createVMBackup(vmId: string, userId: string, backupName: string): Promise<Record<string, unknown>> {
    try {
      const vm = await this.getVMById(vmId, userId);
      if (!vm) {
        throw new Error('VM not found or access denied');
      }

      const backup = await prisma.backup.create({
        data: {
          vmId,
          userId,
          name: backupName,
          status: 'PENDING',
          backupType: 'FULL',
        },
      });

      await this.logVMEvent(userId, 'VM_BACKUP_CREATED', vmId, {
        backupId: (backup as Record<string, unknown>).id,
        backupName,
      });

      return backup as Record<string, unknown>;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to create VM backup: ${message}`);
    }
  }

  static async restoreVMFromBackup(backupId: string, userId: string, restoreConfig: UpdateVmInput = {}): Promise<Record<string, unknown>> {
    try {
      const backup = await prisma.backup.findFirst({
        where: { id: backupId, userId },
      });

      if (!backup) {
        throw new Error('Backup not found or access denied');
      }

      await this.logVMEvent(userId, 'VM_BACKUP_RESTORE_REQUESTED', (backup as any).vmId, {
        backupId,
        restoreConfig,
      });

      return {
        backupId,
        restoreConfig,
        status: 'REQUESTED',
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to restore VM from backup: ${message}`);
    }
  }

  static async getVMResourceStats(vmId: string, userId: string): Promise<VmResourceStatsResult> {
    try {
      const vm = await this.getVMById(vmId, userId);
      if (!vm) {
        throw new Error('VM not found or access denied');
      }

      if (!vm.dockerContainerId) {
        return {
          vmId,
          vmName: vm.name,
          stats: null,
          message: 'No container associated with this VM',
        };
      }

      if (vm.status !== 'RUNNING') {
        return {
          vmId,
          vmName: vm.name,
          vmStatus: vm.status,
          stats: null,
          message: 'VM is not running',
        };
      }

      const stats = await dockerService.getContainerStats(vm.dockerContainerId);

      return {
        vmId,
        vmName: vm.name,
        vmStatus: vm.status,
        dockerContainerId: vm.dockerContainerId,
        stats,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to get VM resource stats: ${message}`);
    }
  }
}

export default VMService;
