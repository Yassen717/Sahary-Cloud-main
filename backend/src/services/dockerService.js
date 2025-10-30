const Docker = require('dockerode');
const config = require('../config');

/**
 * Docker Service
 * Handles Docker container operations for VM management
 */
class DockerService {
  constructor() {
    // Initialize Docker client
    this.docker = new Docker({
      socketPath: process.env.DOCKER_HOST || '/var/run/docker.sock',
      timeout: 30000, // 30 seconds timeout
    });
  }

  /**
   * Create and start a new container for VM
   * @param {Object} vmConfig - VM configuration
   * @returns {Promise<Object>} Container info
   */
  async createContainer(vmConfig) {
    const {
      vmId,
      name,
      image = 'ubuntu:latest',
      cpu,
      ram,
      storage,
      ports = [],
      environment = [],
      volumes = [],
    } = vmConfig;

    try {
      // Container configuration
      const containerConfig = {
        name: `sahary-vm-${vmId}`,
        Image: image,
        
        // Resource limits
        HostConfig: {
          // CPU limits (in nano CPUs: 1 CPU = 1000000000 nano CPUs)
          NanoCpus: cpu * 1000000000,
          
          // Memory limit in bytes
          Memory: ram * 1024 * 1024,
          
          // Storage limit (using device mapper or overlay2)
          StorageOpt: {
            size: `${storage}G`,
          },
          
          // Port mappings
          PortBindings: this.formatPortBindings(ports),
          
          // Volume mounts
          Binds: volumes,
          
          // Network mode
          NetworkMode: 'sahary-network',
          
          // Restart policy
          RestartPolicy: {
            Name: 'unless-stopped',
            MaximumRetryCount: 3,
          },
          
          // Security options
          SecurityOpt: ['no-new-privileges:true'],
          
          // Resource constraints
          CpuShares: cpu * 1024, // CPU shares (relative weight)
          MemorySwap: ram * 1024 * 1024 * 2, // Allow 2x RAM as swap
          
          // Logging
          LogConfig: {
            Type: 'json-file',
            Config: {
              'max-size': '10m',
              'max-file': '3',
            },
          },
        },
        
        // Environment variables
        Env: [
          `VM_ID=${vmId}`,
          `VM_NAME=${name}`,
          `CPU_LIMIT=${cpu}`,
          `RAM_LIMIT=${ram}`,
          `STORAGE_LIMIT=${storage}`,
          ...environment,
        ],
        
        // Labels for identification
        Labels: {
          'sahary.vm.id': vmId,
          'sahary.vm.name': name,
          'sahary.service': 'vm',
          'sahary.managed': 'true',
        },
        
        // Working directory
        WorkingDir: '/app',
        
        // User (non-root for security)
        User: '1000:1000',
        
        // Exposed ports
        ExposedPorts: this.formatExposedPorts(ports),
        
        // Health check
        Healthcheck: {
          Test: ['CMD-SHELL', 'echo "healthy"'],
          Interval: 30000000000, // 30 seconds in nanoseconds
          Timeout: 10000000000,  // 10 seconds
          Retries: 3,
          StartPeriod: 60000000000, // 60 seconds
        },
      };

      // Create container
      const container = await this.docker.createContainer(containerConfig);
      
      // Get container info
      const containerInfo = await container.inspect();
      
      return {
        containerId: containerInfo.Id,
        name: containerInfo.Name,
        status: containerInfo.State.Status,
        created: containerInfo.Created,
        image: containerInfo.Config.Image,
        ports: this.extractPortMappings(containerInfo.NetworkSettings.Ports),
        ipAddress: this.extractIPAddress(containerInfo.NetworkSettings),
      };
    } catch (error) {
      throw new Error(`Failed to create container: ${error.message}`);
    }
  }

  /**
   * Start container
   * @param {string} containerId - Container ID
   * @returns {Promise<Object>} Container status
   */
  async startContainer(containerId) {
    try {
      const container = this.docker.getContainer(containerId);
      
      // Start container
      await container.start();
      
      // Wait a moment for container to initialize
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Get updated container info
      const containerInfo = await container.inspect();
      
      return {
        containerId: containerInfo.Id,
        status: containerInfo.State.Status,
        startedAt: containerInfo.State.StartedAt,
        ipAddress: this.extractIPAddress(containerInfo.NetworkSettings),
        ports: this.extractPortMappings(containerInfo.NetworkSettings.Ports),
      };
    } catch (error) {
      throw new Error(`Failed to start container: ${error.message}`);
    }
  }

  /**
   * Stop container
   * @param {string} containerId - Container ID
   * @param {number} timeout - Stop timeout in seconds
   * @returns {Promise<Object>} Container status
   */
  async stopContainer(containerId, timeout = 10) {
    try {
      const container = this.docker.getContainer(containerId);
      
      // Stop container gracefully
      await container.stop({ t: timeout });
      
      // Get updated container info
      const containerInfo = await container.inspect();
      
      return {
        containerId: containerInfo.Id,
        status: containerInfo.State.Status,
        finishedAt: containerInfo.State.FinishedAt,
      };
    } catch (error) {
      throw new Error(`Failed to stop container: ${error.message}`);
    }
  }

  /**
   * Restart container
   * @param {string} containerId - Container ID
   * @param {number} timeout - Restart timeout in seconds
   * @returns {Promise<Object>} Container status
   */
  async restartContainer(containerId, timeout = 10) {
    try {
      const container = this.docker.getContainer(containerId);
      
      // Restart container
      await container.restart({ t: timeout });
      
      // Wait for container to stabilize
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // Get updated container info
      const containerInfo = await container.inspect();
      
      return {
        containerId: containerInfo.Id,
        status: containerInfo.State.Status,
        startedAt: containerInfo.State.StartedAt,
        ipAddress: this.extractIPAddress(containerInfo.NetworkSettings),
      };
    } catch (error) {
      throw new Error(`Failed to restart container: ${error.message}`);
    }
  }

  /**
   * Remove container
   * @param {string} containerId - Container ID
   * @param {boolean} force - Force removal
   * @returns {Promise<void>}
   */
  async removeContainer(containerId, force = false) {
    try {
      const container = this.docker.getContainer(containerId);
      
      // Stop container first if running
      try {
        const containerInfo = await container.inspect();
        if (containerInfo.State.Running) {
          await container.stop({ t: 10 });
        }
      } catch (stopError) {
        console.warn('Container might already be stopped:', stopError.message);
      }
      
      // Remove container
      await container.remove({ force, v: true }); // v: true removes associated volumes
      
    } catch (error) {
      throw new Error(`Failed to remove container: ${error.message}`);
    }
  }

  /**
   * Get container status and stats
   * @param {string} containerId - Container ID
   * @returns {Promise<Object>} Container status and stats
   */
  async getContainerStatus(containerId) {
    try {
      const container = this.docker.getContainer(containerId);
      
      // Get container info and stats
      const [containerInfo, stats] = await Promise.all([
        container.inspect(),
        this.getContainerStats(containerId).catch(() => null), // Stats might fail if container is stopped
      ]);
      
      return {
        containerId: containerInfo.Id,
        name: containerInfo.Name,
        status: containerInfo.State.Status,
        running: containerInfo.State.Running,
        paused: containerInfo.State.Paused,
        restarting: containerInfo.State.Restarting,
        exitCode: containerInfo.State.ExitCode,
        error: containerInfo.State.Error,
        startedAt: containerInfo.State.StartedAt,
        finishedAt: containerInfo.State.FinishedAt,
        image: containerInfo.Config.Image,
        ipAddress: this.extractIPAddress(containerInfo.NetworkSettings),
        ports: this.extractPortMappings(containerInfo.NetworkSettings.Ports),
        stats: stats || null,
      };
    } catch (error) {
      if (error.statusCode === 404) {
        return null; // Container not found
      }
      throw new Error(`Failed to get container status: ${error.message}`);
    }
  }

  /**
   * Get container resource usage stats
   * @param {string} containerId - Container ID
   * @returns {Promise<Object>} Resource usage stats
   */
  async getContainerStats(containerId) {
    try {
      const container = this.docker.getContainer(containerId);
      
      // Get stats (single reading)
      const stats = await container.stats({ stream: false });
      
      // Calculate CPU usage percentage
      const cpuUsage = this.calculateCPUUsage(stats);
      
      // Calculate memory usage
      const memoryUsage = {
        used: stats.memory_stats.usage || 0,
        limit: stats.memory_stats.limit || 0,
        percentage: stats.memory_stats.limit > 0 
          ? (stats.memory_stats.usage / stats.memory_stats.limit) * 100 
          : 0,
      };
      
      // Calculate network I/O
      const networkIO = this.calculateNetworkIO(stats.networks);
      
      // Calculate block I/O
      const blockIO = this.calculateBlockIO(stats.blkio_stats);
      
      return {
        timestamp: new Date().toISOString(),
        cpu: {
          usage: cpuUsage,
          systemUsage: stats.cpu_stats.system_cpu_usage,
        },
        memory: memoryUsage,
        network: networkIO,
        blockIO: blockIO,
        pids: stats.pids_stats?.current || 0,
      };
    } catch (error) {
      throw new Error(`Failed to get container stats: ${error.message}`);
    }
  }

  /**
   * List all containers managed by Sahary
   * @param {Object} filters - Container filters
   * @returns {Promise<Array>} List of containers
   */
  async listContainers(filters = {}) {
    try {
      const listOptions = {
        all: true, // Include stopped containers
        filters: {
          label: ['sahary.managed=true'],
          ...filters,
        },
      };
      
      const containers = await this.docker.listContainers(listOptions);
      
      return containers.map(container => ({
        containerId: container.Id,
        names: container.Names,
        image: container.Image,
        status: container.Status,
        state: container.State,
        created: container.Created,
        ports: container.Ports,
        labels: container.Labels,
        vmId: container.Labels['sahary.vm.id'],
        vmName: container.Labels['sahary.vm.name'],
      }));
    } catch (error) {
      throw new Error(`Failed to list containers: ${error.message}`);
    }
  }

  /**
   * Pull Docker image
   * @param {string} imageName - Image name to pull
   * @returns {Promise<void>}
   */
  async pullImage(imageName) {
    try {
      console.log(`Pulling Docker image: ${imageName}`);
      
      const stream = await this.docker.pull(imageName);
      
      // Wait for pull to complete
      await new Promise((resolve, reject) => {
        this.docker.modem.followProgress(stream, (err, res) => {
          if (err) reject(err);
          else resolve(res);
        });
      });
      
      console.log(`Successfully pulled image: ${imageName}`);
    } catch (error) {
      throw new Error(`Failed to pull image ${imageName}: ${error.message}`);
    }
  }

  /**
   * Get Docker system info
   * @returns {Promise<Object>} Docker system information
   */
  async getSystemInfo() {
    try {
      const info = await this.docker.info();
      
      return {
        containers: info.Containers,
        containersRunning: info.ContainersRunning,
        containersPaused: info.ContainersPaused,
        containersStopped: info.ContainersStopped,
        images: info.Images,
        serverVersion: info.ServerVersion,
        architecture: info.Architecture,
        operatingSystem: info.OperatingSystem,
        totalMemory: info.MemTotal,
        cpus: info.NCPU,
        dockerRootDir: info.DockerRootDir,
        storageDriver: info.Driver,
        kernelVersion: info.KernelVersion,
      };
    } catch (error) {
      throw new Error(`Failed to get Docker system info: ${error.message}`);
    }
  }

  /**
   * Create Docker network for VMs
   * @param {string} networkName - Network name
   * @returns {Promise<Object>} Network info
   */
  async createNetwork(networkName = 'sahary-network') {
    try {
      // Check if network already exists
      const networks = await this.docker.listNetworks({
        filters: { name: [networkName] }
      });
      
      if (networks.length > 0) {
        return networks[0];
      }
      
      // Create network
      const network = await this.docker.createNetwork({
        Name: networkName,
        Driver: 'bridge',
        IPAM: {
          Config: [{
            Subnet: '172.20.0.0/16',
            Gateway: '172.20.0.1',
          }],
        },
        Options: {
          'com.docker.network.bridge.name': networkName,
          'com.docker.network.driver.mtu': '1500',
        },
        Labels: {
          'sahary.network': 'true',
          'sahary.managed': 'true',
        },
      });
      
      return network;
    } catch (error) {
      throw new Error(`Failed to create network: ${error.message}`);
    }
  }

  /**
   * Monitor container health
   * @param {string} containerId - Container ID
   * @returns {Promise<Object>} Health status
   */
  async checkContainerHealth(containerId) {
    try {
      const container = this.docker.getContainer(containerId);
      const containerInfo = await container.inspect();
      
      const health = containerInfo.State.Health;
      
      return {
        containerId,
        healthy: health?.Status === 'healthy',
        status: health?.Status || 'no-healthcheck',
        failingStreak: health?.FailingStreak || 0,
        log: health?.Log?.slice(-5) || [], // Last 5 health check results
      };
    } catch (error) {
      throw new Error(`Failed to check container health: ${error.message}`);
    }
  }

  /**
   * Get container logs
   * @param {string} containerId - Container ID
   * @param {Object} options - Log options
   * @returns {Promise<string>} Container logs
   */
  async getContainerLogs(containerId, options = {}) {
    try {
      const {
        tail = 100,
        since,
        until,
        timestamps = true,
      } = options;
      
      const container = this.docker.getContainer(containerId);
      
      const logStream = await container.logs({
        stdout: true,
        stderr: true,
        tail,
        since,
        until,
        timestamps,
      });
      
      return logStream.toString();
    } catch (error) {
      throw new Error(`Failed to get container logs: ${error.message}`);
    }
  }

  /**
   * Execute command in container
   * @param {string} containerId - Container ID
   * @param {Array} command - Command to execute
   * @returns {Promise<Object>} Execution result
   */
  async execInContainer(containerId, command) {
    try {
      const container = this.docker.getContainer(containerId);
      
      // Create exec instance
      const exec = await container.exec({
        Cmd: command,
        AttachStdout: true,
        AttachStderr: true,
        Tty: false,
      });
      
      // Start exec
      const stream = await exec.start({ Detach: false, Tty: false });
      
      // Collect output
      let output = '';
      stream.on('data', (chunk) => {
        output += chunk.toString();
      });
      
      // Wait for completion
      await new Promise((resolve) => {
        stream.on('end', resolve);
      });
      
      // Get exec info
      const execInfo = await exec.inspect();
      
      return {
        exitCode: execInfo.ExitCode,
        output: output.trim(),
        command: command.join(' '),
      };
    } catch (error) {
      throw new Error(`Failed to execute command in container: ${error.message}`);
    }
  }

  /**
   * Create container backup
   * @param {string} containerId - Container ID
   * @param {string} backupName - Backup name
   * @returns {Promise<Object>} Backup info
   */
  async createContainerBackup(containerId, backupName) {
    try {
      const container = this.docker.getContainer(containerId);
      
      // Create image from container
      const image = await container.commit({
        repo: `sahary-backup/${backupName}`,
        tag: new Date().toISOString().replace(/[:.]/g, '-'),
        comment: `Backup created at ${new Date().toISOString()}`,
        author: 'Sahary Cloud Backup System',
      });
      
      // Get image info
      const imageInfo = await this.docker.getImage(image.Id).inspect();
      
      return {
        backupId: image.Id,
        name: backupName,
        size: imageInfo.Size,
        created: imageInfo.Created,
        tags: imageInfo.RepoTags,
      };
    } catch (error) {
      throw new Error(`Failed to create container backup: ${error.message}`);
    }
  }

  /**
   * Restore container from backup
   * @param {string} backupId - Backup image ID
   * @param {Object} vmConfig - VM configuration
   * @returns {Promise<Object>} Restored container info
   */
  async restoreFromBackup(backupId, vmConfig) {
    try {
      // Use backup image instead of original image
      const restoreConfig = {
        ...vmConfig,
        image: backupId,
      };
      
      return await this.createContainer(restoreConfig);
    } catch (error) {
      throw new Error(`Failed to restore from backup: ${error.message}`);
    }
  }

  /**
   * Clean up unused resources
   * @returns {Promise<Object>} Cleanup results
   */
  async cleanup() {
    try {
      const results = {
        containers: 0,
        images: 0,
        volumes: 0,
        networks: 0,
        reclaimedSpace: 0,
      };
      
      // Prune stopped containers
      const containerPrune = await this.docker.pruneContainers({
        filters: {
          label: ['sahary.managed=true'],
        },
      });
      
      results.containers = containerPrune.ContainersDeleted?.length || 0;
      results.reclaimedSpace += containerPrune.SpaceReclaimed || 0;
      
      // Prune unused images
      const imagePrune = await this.docker.pruneImages({
        filters: {
          dangling: ['false'], // Remove unused images
        },
      });
      
      results.images = imagePrune.ImagesDeleted?.length || 0;
      results.reclaimedSpace += imagePrune.SpaceReclaimed || 0;
      
      // Prune unused volumes
      const volumePrune = await this.docker.pruneVolumes();
      results.volumes = volumePrune.VolumesDeleted?.length || 0;
      results.reclaimedSpace += volumePrune.SpaceReclaimed || 0;
      
      return results;
    } catch (error) {
      throw new Error(`Failed to cleanup Docker resources: ${error.message}`);
    }
  }

  // Helper methods

  /**
   * Format port bindings for Docker
   * @param {Array} ports - Port configurations
   * @returns {Object} Docker port bindings
   */
  formatPortBindings(ports) {
    const bindings = {};
    
    ports.forEach(port => {
      const containerPort = `${port.containerPort}/tcp`;
      bindings[containerPort] = [{ HostPort: port.hostPort.toString() }];
    });
    
    return bindings;
  }

  /**
   * Format exposed ports for Docker
   * @param {Array} ports - Port configurations
   * @returns {Object} Docker exposed ports
   */
  formatExposedPorts(ports) {
    const exposed = {};
    
    ports.forEach(port => {
      exposed[`${port.containerPort}/tcp`] = {};
    });
    
    return exposed;
  }

  /**
   * Extract IP address from network settings
   * @param {Object} networkSettings - Docker network settings
   * @returns {string|null} IP address
   */
  extractIPAddress(networkSettings) {
    if (networkSettings.Networks) {
      const networks = Object.values(networkSettings.Networks);
      if (networks.length > 0) {
        return networks[0].IPAddress;
      }
    }
    return networkSettings.IPAddress || null;
  }

  /**
   * Extract port mappings from network settings
   * @param {Object} ports - Docker port mappings
   * @returns {Array} Port mappings
   */
  extractPortMappings(ports) {
    const mappings = [];
    
    if (ports) {
      Object.entries(ports).forEach(([containerPort, hostPorts]) => {
        if (hostPorts) {
          hostPorts.forEach(hostPort => {
            mappings.push({
              containerPort: parseInt(containerPort.split('/')[0]),
              hostPort: parseInt(hostPort.HostPort),
              protocol: containerPort.split('/')[1] || 'tcp',
            });
          });
        }
      });
    }
    
    return mappings;
  }

  /**
   * Calculate CPU usage percentage
   * @param {Object} stats - Container stats
   * @returns {number} CPU usage percentage
   */
  calculateCPUUsage(stats) {
    const cpuStats = stats.cpu_stats;
    const preCpuStats = stats.precpu_stats;
    
    if (!cpuStats || !preCpuStats) return 0;
    
    const cpuDelta = cpuStats.cpu_usage.total_usage - preCpuStats.cpu_usage.total_usage;
    const systemDelta = cpuStats.system_cpu_usage - preCpuStats.system_cpu_usage;
    const cpuCount = cpuStats.online_cpus || 1;
    
    if (systemDelta > 0 && cpuDelta > 0) {
      return (cpuDelta / systemDelta) * cpuCount * 100;
    }
    
    return 0;
  }

  /**
   * Calculate network I/O
   * @param {Object} networks - Network stats
   * @returns {Object} Network I/O stats
   */
  calculateNetworkIO(networks) {
    let rxBytes = 0;
    let txBytes = 0;
    
    if (networks) {
      Object.values(networks).forEach(network => {
        rxBytes += network.rx_bytes || 0;
        txBytes += network.tx_bytes || 0;
      });
    }
    
    return {
      rxBytes,
      txBytes,
      totalBytes: rxBytes + txBytes,
    };
  }

  /**
   * Calculate block I/O
   * @param {Object} blkioStats - Block I/O stats
   * @returns {Object} Block I/O stats
   */
  calculateBlockIO(blkioStats) {
    let readBytes = 0;
    let writeBytes = 0;
    
    if (blkioStats?.io_service_bytes_recursive) {
      blkioStats.io_service_bytes_recursive.forEach(stat => {
        if (stat.op === 'Read') readBytes += stat.value;
        if (stat.op === 'Write') writeBytes += stat.value;
      });
    }
    
    return {
      readBytes,
      writeBytes,
      totalBytes: readBytes + writeBytes,
    };
  }

  /**
   * Check Docker daemon connectivity
   * @returns {Promise<boolean>} Connection status
   */
  async checkConnection() {
    try {
      await this.docker.ping();
      return true;
    } catch (error) {
      console.error('Docker connection failed:', error.message);
      return false;
    }
  }
}

// Create singleton instance
const dockerService = new DockerService();

module.exports = dockerService;