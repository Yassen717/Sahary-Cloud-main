import type { Request, Response } from 'express';
const { validationResult } = require('express-validator');

const dockerService = require('../services/dockerService');

type DockerQuery = {
  vmId?: string;
  status?: string;
  tail?: string | number;
  since?: string;
  until?: string;
  timestamps?: string | boolean;
};

type DockerBody = {
  timeout?: number | string;
  force?: boolean;
  imageName?: string;
  networkName?: string;
  command?: string[];
  backupName?: string;
  [key: string]: unknown;
};

type DockerRequest = Request & {
  params: {
    containerId?: string;
    backupId?: string;
  };
  query: DockerQuery;
  body: DockerBody;
};

const requireDocker = (res: Response): boolean => {
  if (!dockerService.isReady()) {
    res.status(503).json({
      success: false,
      message: 'Docker service is not available. VM management features are disabled.',
    });
    return true;
  }

  return false;
};

const dockerController = {
  async createContainer(req: DockerRequest, res: Response): Promise<void> {
    try {
      if (requireDocker(res)) return;

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array(),
        });
        return;
      }

      const containerInfo = await dockerService.createContainer(req.body);

      res.status(201).json({
        success: true,
        message: 'Container created successfully',
        data: containerInfo,
      });
    } catch (error: any) {
      console.error('Create container error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to create container',
        error: error.message,
      });
    }
  },

  async startContainer(req: DockerRequest, res: Response): Promise<void> {
    try {
      if (requireDocker(res)) return;

      const { containerId } = req.params;
      const containerStatus = await dockerService.startContainer(containerId);

      res.json({
        success: true,
        message: 'Container started successfully',
        data: containerStatus,
      });
    } catch (error: any) {
      console.error('Start container error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to start container',
        error: error.message,
      });
    }
  },

  async stopContainer(req: DockerRequest, res: Response): Promise<void> {
    try {
      if (requireDocker(res)) return;

      const { containerId } = req.params;
      const { timeout = 10 } = req.body;
      const containerStatus = await dockerService.stopContainer(containerId, timeout);

      res.json({
        success: true,
        message: 'Container stopped successfully',
        data: containerStatus,
      });
    } catch (error: any) {
      console.error('Stop container error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to stop container',
        error: error.message,
      });
    }
  },

  async restartContainer(req: DockerRequest, res: Response): Promise<void> {
    try {
      if (requireDocker(res)) return;

      const { containerId } = req.params;
      const { timeout = 10 } = req.body;
      const containerStatus = await dockerService.restartContainer(containerId, timeout);

      res.json({
        success: true,
        message: 'Container restarted successfully',
        data: containerStatus,
      });
    } catch (error: any) {
      console.error('Restart container error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to restart container',
        error: error.message,
      });
    }
  },

  async removeContainer(req: DockerRequest, res: Response): Promise<void> {
    try {
      if (requireDocker(res)) return;

      const { containerId } = req.params;
      const { force = false } = req.body;
      await dockerService.removeContainer(containerId, force);

      res.json({
        success: true,
        message: 'Container removed successfully',
      });
    } catch (error: any) {
      console.error('Remove container error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to remove container',
        error: error.message,
      });
    }
  },

  async getContainerStatus(req: DockerRequest, res: Response): Promise<void> {
    try {
      if (requireDocker(res)) return;

      const { containerId } = req.params;
      const containerStatus = await dockerService.getContainerStatus(containerId);

      if (!containerStatus) {
        res.status(404).json({
          success: false,
          message: 'Container not found',
        });
        return;
      }

      res.json({
        success: true,
        data: containerStatus,
      });
    } catch (error: any) {
      console.error('Get container status error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get container status',
        error: error.message,
      });
    }
  },

  async getContainerStats(req: DockerRequest, res: Response): Promise<void> {
    try {
      if (requireDocker(res)) return;

      const { containerId } = req.params;
      const stats = await dockerService.getContainerStats(containerId);

      res.json({
        success: true,
        data: stats,
      });
    } catch (error: any) {
      console.error('Get container stats error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get container stats',
        error: error.message,
      });
    }
  },

  async listContainers(req: DockerRequest, res: Response): Promise<void> {
    try {
      if (requireDocker(res)) return;

      const { vmId, status } = req.query;
      const filters: Record<string, string[]> = {};

      if (vmId) filters.label = [`sahary.vm.id=${vmId}`];
      if (status) filters.status = [status];

      const containers = await dockerService.listContainers(filters);

      res.json({
        success: true,
        data: containers,
        count: containers.length,
      });
    } catch (error: any) {
      console.error('List containers error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to list containers',
        error: error.message,
      });
    }
  },

  async pullImage(req: DockerRequest, res: Response): Promise<void> {
    try {
      if (requireDocker(res)) return;

      const { imageName } = req.body;

      if (!imageName) {
        res.status(400).json({
          success: false,
          message: 'Image name is required',
        });
        return;
      }

      await dockerService.pullImage(imageName);

      res.json({
        success: true,
        message: `Image ${imageName} pulled successfully`,
      });
    } catch (error: any) {
      console.error('Pull image error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to pull image',
        error: error.message,
      });
    }
  },

  async getSystemInfo(_req: Request, res: Response): Promise<void> {
    try {
      const systemInfo = await dockerService.getSystemInfo();

      res.json({
        success: true,
        data: systemInfo,
      });
    } catch (error: any) {
      console.error('Get system info error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get Docker system info',
        error: error.message,
      });
    }
  },

  async createNetwork(req: DockerRequest, res: Response): Promise<void> {
    try {
      const { networkName = 'sahary-network' } = req.body;
      const network = await dockerService.createNetwork(networkName);

      res.json({
        success: true,
        message: 'Network created successfully',
        data: network,
      });
    } catch (error: any) {
      console.error('Create network error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to create network',
        error: error.message,
      });
    }
  },

  async checkContainerHealth(req: DockerRequest, res: Response): Promise<void> {
    try {
      const { containerId } = req.params;
      const health = await dockerService.checkContainerHealth(containerId);

      res.json({
        success: true,
        data: health,
      });
    } catch (error: any) {
      console.error('Check container health error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to check container health',
        error: error.message,
      });
    }
  },

  async getContainerLogs(req: DockerRequest, res: Response): Promise<void> {
    try {
      const { containerId } = req.params;
      const { tail = 100, since, until, timestamps = true } = req.query;

      const logs = await dockerService.getContainerLogs(containerId, {
        tail: Number.parseInt(String(tail), 10),
        since,
        until,
        timestamps: String(timestamps) === 'true',
      });

      res.json({
        success: true,
        data: {
          containerId,
          logs,
        },
      });
    } catch (error: any) {
      console.error('Get container logs error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get container logs',
        error: error.message,
      });
    }
  },

  async execInContainer(req: DockerRequest, res: Response): Promise<void> {
    try {
      const { containerId } = req.params;
      const { command } = req.body;

      if (!command || !Array.isArray(command)) {
        res.status(400).json({
          success: false,
          message: 'Command must be an array of strings',
        });
        return;
      }

      const result = await dockerService.execInContainer(containerId, command);

      res.json({
        success: true,
        data: result,
      });
    } catch (error: any) {
      console.error('Execute in container error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to execute command in container',
        error: error.message,
      });
    }
  },

  async createContainerBackup(req: DockerRequest, res: Response): Promise<void> {
    try {
      const { containerId } = req.params;
      const { backupName } = req.body;

      if (!backupName) {
        res.status(400).json({
          success: false,
          message: 'Backup name is required',
        });
        return;
      }

      const backup = await dockerService.createContainerBackup(containerId, backupName);

      res.json({
        success: true,
        message: 'Container backup created successfully',
        data: backup,
      });
    } catch (error: any) {
      console.error('Create container backup error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to create container backup',
        error: error.message,
      });
    }
  },

  async restoreFromBackup(req: DockerRequest, res: Response): Promise<void> {
    try {
      const { backupId } = req.params;
      const vmConfig = req.body;
      const containerInfo = await dockerService.restoreFromBackup(backupId, vmConfig);

      res.json({
        success: true,
        message: 'Container restored from backup successfully',
        data: containerInfo,
      });
    } catch (error: any) {
      console.error('Restore from backup error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to restore container from backup',
        error: error.message,
      });
    }
  },

  async cleanup(_req: Request, res: Response): Promise<void> {
    try {
      const results = await dockerService.cleanup();

      res.json({
        success: true,
        message: 'Docker cleanup completed successfully',
        data: results,
      });
    } catch (error: any) {
      console.error('Docker cleanup error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to cleanup Docker resources',
        error: error.message,
      });
    }
  },

  async checkConnection(_req: Request, res: Response): Promise<void> {
    try {
      const isConnected = await dockerService.checkConnection();

      res.json({
        success: true,
        data: {
          connected: isConnected,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error: any) {
      console.error('Check Docker connection error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to check Docker connection',
        error: error.message,
      });
    }
  },
};

export = dockerController;