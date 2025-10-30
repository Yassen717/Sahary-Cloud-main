const dockerService = require('../services/dockerService');
const { validationResult } = require('express-validator');

/**
 * Docker Controller
 * Handles HTTP requests for Docker container operations
 */
class DockerController {
  /**
   * Create a new container
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  async createContainer(req, res) {
    try {
      // Check validation errors
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array(),
        });
      }

      const containerInfo = await dockerService.createContainer(req.body);

      res.status(201).json({
        success: true,
        message: 'Container created successfully',
        data: containerInfo,
      });
    } catch (error) {
      console.error('Create container error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to create container',
        error: error.message,
      });
    }
  }

  /**
   * Start a container
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  async startContainer(req, res) {
    try {
      const { containerId } = req.params;

      const containerStatus = await dockerService.startContainer(containerId);

      res.json({
        success: true,
        message: 'Container started successfully',
        data: containerStatus,
      });
    } catch (error) {
      console.error('Start container error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to start container',
        error: error.message,
      });
    }
  }

  /**
   * Stop a container
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  async stopContainer(req, res) {
    try {
      const { containerId } = req.params;
      const { timeout = 10 } = req.body;

      const containerStatus = await dockerService.stopContainer(containerId, timeout);

      res.json({
        success: true,
        message: 'Container stopped successfully',
        data: containerStatus,
      });
    } catch (error) {
      console.error('Stop container error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to stop container',
        error: error.message,
      });
    }
  }

  /**
   * Restart a container
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  async restartContainer(req, res) {
    try {
      const { containerId } = req.params;
      const { timeout = 10 } = req.body;

      const containerStatus = await dockerService.restartContainer(containerId, timeout);

      res.json({
        success: true,
        message: 'Container restarted successfully',
        data: containerStatus,
      });
    } catch (error) {
      console.error('Restart container error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to restart container',
        error: error.message,
      });
    }
  }

  /**
   * Remove a container
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  async removeContainer(req, res) {
    try {
      const { containerId } = req.params;
      const { force = false } = req.body;

      await dockerService.removeContainer(containerId, force);

      res.json({
        success: true,
        message: 'Container removed successfully',
      });
    } catch (error) {
      console.error('Remove container error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to remove container',
        error: error.message,
      });
    }
  }

  /**
   * Get container status and stats
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  async getContainerStatus(req, res) {
    try {
      const { containerId } = req.params;

      const containerStatus = await dockerService.getContainerStatus(containerId);

      if (!containerStatus) {
        return res.status(404).json({
          success: false,
          message: 'Container not found',
        });
      }

      res.json({
        success: true,
        data: containerStatus,
      });
    } catch (error) {
      console.error('Get container status error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get container status',
        error: error.message,
      });
    }
  }

  /**
   * Get container resource usage stats
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  async getContainerStats(req, res) {
    try {
      const { containerId } = req.params;

      const stats = await dockerService.getContainerStats(containerId);

      res.json({
        success: true,
        data: stats,
      });
    } catch (error) {
      console.error('Get container stats error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get container stats',
        error: error.message,
      });
    }
  }

  /**
   * List all containers
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  async listContainers(req, res) {
    try {
      const { vmId, status } = req.query;
      
      const filters = {};
      if (vmId) filters['label'] = [`sahary.vm.id=${vmId}`];
      if (status) filters['status'] = [status];

      const containers = await dockerService.listContainers(filters);

      res.json({
        success: true,
        data: containers,
        count: containers.length,
      });
    } catch (error) {
      console.error('List containers error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to list containers',
        error: error.message,
      });
    }
  }

  /**
   * Pull Docker image
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  async pullImage(req, res) {
    try {
      const { imageName } = req.body;

      if (!imageName) {
        return res.status(400).json({
          success: false,
          message: 'Image name is required',
        });
      }

      await dockerService.pullImage(imageName);

      res.json({
        success: true,
        message: `Image ${imageName} pulled successfully`,
      });
    } catch (error) {
      console.error('Pull image error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to pull image',
        error: error.message,
      });
    }
  }

  /**
   * Get Docker system information
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  async getSystemInfo(req, res) {
    try {
      const systemInfo = await dockerService.getSystemInfo();

      res.json({
        success: true,
        data: systemInfo,
      });
    } catch (error) {
      console.error('Get system info error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get Docker system info',
        error: error.message,
      });
    }
  }

  /**
   * Create Docker network
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  async createNetwork(req, res) {
    try {
      const { networkName = 'sahary-network' } = req.body;

      const network = await dockerService.createNetwork(networkName);

      res.json({
        success: true,
        message: 'Network created successfully',
        data: network,
      });
    } catch (error) {
      console.error('Create network error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to create network',
        error: error.message,
      });
    }
  }

  /**
   * Check container health
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  async checkContainerHealth(req, res) {
    try {
      const { containerId } = req.params;

      const health = await dockerService.checkContainerHealth(containerId);

      res.json({
        success: true,
        data: health,
      });
    } catch (error) {
      console.error('Check container health error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to check container health',
        error: error.message,
      });
    }
  }

  /**
   * Get container logs
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  async getContainerLogs(req, res) {
    try {
      const { containerId } = req.params;
      const { tail = 100, since, until, timestamps = true } = req.query;

      const logs = await dockerService.getContainerLogs(containerId, {
        tail: parseInt(tail),
        since,
        until,
        timestamps: timestamps === 'true',
      });

      res.json({
        success: true,
        data: {
          containerId,
          logs,
        },
      });
    } catch (error) {
      console.error('Get container logs error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get container logs',
        error: error.message,
      });
    }
  }

  /**
   * Execute command in container
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  async execInContainer(req, res) {
    try {
      const { containerId } = req.params;
      const { command } = req.body;

      if (!command || !Array.isArray(command)) {
        return res.status(400).json({
          success: false,
          message: 'Command must be an array of strings',
        });
      }

      const result = await dockerService.execInContainer(containerId, command);

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      console.error('Execute in container error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to execute command in container',
        error: error.message,
      });
    }
  }

  /**
   * Create container backup
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  async createContainerBackup(req, res) {
    try {
      const { containerId } = req.params;
      const { backupName } = req.body;

      if (!backupName) {
        return res.status(400).json({
          success: false,
          message: 'Backup name is required',
        });
      }

      const backup = await dockerService.createContainerBackup(containerId, backupName);

      res.json({
        success: true,
        message: 'Container backup created successfully',
        data: backup,
      });
    } catch (error) {
      console.error('Create container backup error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to create container backup',
        error: error.message,
      });
    }
  }

  /**
   * Restore container from backup
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  async restoreFromBackup(req, res) {
    try {
      const { backupId } = req.params;
      const vmConfig = req.body;

      const containerInfo = await dockerService.restoreFromBackup(backupId, vmConfig);

      res.json({
        success: true,
        message: 'Container restored from backup successfully',
        data: containerInfo,
      });
    } catch (error) {
      console.error('Restore from backup error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to restore container from backup',
        error: error.message,
      });
    }
  }

  /**
   * Clean up unused Docker resources
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  async cleanup(req, res) {
    try {
      const results = await dockerService.cleanup();

      res.json({
        success: true,
        message: 'Docker cleanup completed successfully',
        data: results,
      });
    } catch (error) {
      console.error('Docker cleanup error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to cleanup Docker resources',
        error: error.message,
      });
    }
  }

  /**
   * Check Docker daemon connectivity
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  async checkConnection(req, res) {
    try {
      const isConnected = await dockerService.checkConnection();

      res.json({
        success: true,
        data: {
          connected: isConnected,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      console.error('Check Docker connection error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to check Docker connection',
        error: error.message,
      });
    }
  }
}

module.exports = new DockerController();