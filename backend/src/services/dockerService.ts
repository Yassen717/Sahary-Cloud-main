import config from '../config';

const Docker = require('dockerode');

export interface DockerPortConfig {
  containerPort: number;
  hostPort: number;
}

export interface DockerVmConfig {
  vmId: string;
  name: string;
  image?: string;
  cpu: number;
  ram: number;
  storage: number;
  ports?: DockerPortConfig[];
  environment?: string[];
  volumes?: string[];
}

export interface DockerContainerInfo {
  containerId: string;
  name?: string;
  status?: string;
  created?: string;
  image?: string;
  ports?: DockerPortMapping[];
  ipAddress?: string | null;
}

export interface DockerPortMapping {
  containerPort: number;
  hostPort: number;
  protocol: string;
}

export interface DockerResourceValidationResult {
  valid: boolean;
  errors: string[];
}

export interface DockerStatsResult {
  timestamp: string;
  cpu: {
    usage: number;
    systemUsage?: number;
  };
  memory: {
    used: number;
    limit: number;
    percentage: number;
  };
  network: {
    rxBytes: number;
    txBytes: number;
    totalBytes: number;
  };
  blockIO: {
    readBytes: number;
    writeBytes: number;
    totalBytes: number;
  };
  pids: number;
}

export interface DockerHealthStatus {
  status: 'disconnected' | 'healthy' | 'unhealthy';
  connected: boolean;
  error?: string;
  serverVersion?: string;
  containers?: {
    total?: number;
    running?: number;
    paused?: number;
    stopped?: number;
  };
  resources?: {
    cpus?: number;
    memoryTotal?: string;
    storageDriver?: string;
  };
}

type DockerSystemInfo = {
  ServerVersion?: string;
  NCPU?: number;
  MemTotal?: number;
  Containers?: number;
  ContainersRunning?: number;
  ContainersPaused?: number;
  ContainersStopped?: number;
  Images?: number;
  Architecture?: string;
  OperatingSystem?: string;
  DockerRootDir?: string;
  Driver?: string;
  KernelVersion?: string;
};

type ContainerNetwork = {
  IPAddress?: string;
  rx_bytes?: number;
  tx_bytes?: number;
};

type ContainerNetworkSettings = {
  NetworkSettings?: {
    Networks?: Record<string, ContainerNetwork>;
    Ports?: Record<string, Array<{ HostPort: string }> | null>;
    IPAddress?: string;
  };
  Networks?: Record<string, ContainerNetwork>;
  Ports?: Record<string, Array<{ HostPort: string }> | null>;
  IPAddress?: string;
};

type ContainerStatsPayload = {
  cpu_stats?: {
    cpu_usage?: {
      total_usage?: number;
    };
    system_cpu_usage?: number;
    online_cpus?: number;
  };
  precpu_stats?: {
    cpu_usage?: {
      total_usage?: number;
    };
    system_cpu_usage?: number;
  };
  memory_stats?: {
    usage?: number;
    limit?: number;
  };
  networks?: Record<string, ContainerNetwork>;
  blkio_stats?: {
    io_service_bytes_recursive?: Array<{ op?: string; value?: number }>;
  };
  pids_stats?: {
    current?: number;
  };
};

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }

  return 'Unknown error';
};

class DockerService {
  private _connected: boolean;

  private _systemInfo: DockerSystemInfo | null;

  private docker: any;

  constructor() {
    this._connected = false;
    this._systemInfo = null;

    const dockerConfig = config.docker || {};
    const opts: Record<string, unknown> = { timeout: 30000 };

    if (dockerConfig.tlsVerify && dockerConfig.certPath) {
      const fs = require('fs');
      const path = require('path');

      opts.host = String(dockerConfig.host).replace(/^tcp:\/\//, '');
      opts.protocol = 'https';
      opts.ca = fs.readFileSync(path.join(dockerConfig.certPath, 'ca.pem'));
      opts.cert = fs.readFileSync(path.join(dockerConfig.certPath, 'cert.pem'));
      opts.key = fs.readFileSync(path.join(dockerConfig.certPath, 'key.pem'));
    } else {
      opts.socketPath = (dockerConfig.host === 'unix:///var/run/docker.sock'
        ? '/var/run/docker.sock'
        : process.env.DOCKER_HOST || '/var/run/docker.sock'
      ).replace(/^(npipe|unix):\/\//, '');
    }

    this.docker = new Docker(opts);
  }

  async connect(): Promise<boolean> {
    try {
      await this.docker.ping();
      this._connected = true;

      this._systemInfo = await this.docker.info();
      await this.ensureNetwork();

      const systemInfo = this._systemInfo;

      console.log('✅ Docker daemon connected successfully');
      console.log(`   ├─ Server:  Docker ${systemInfo?.ServerVersion}`);
      console.log(`   ├─ CPUs:    ${systemInfo?.NCPU}`);
      console.log(`   ├─ Memory:  ${(Number(systemInfo?.MemTotal || 0) / (1024 ** 3)).toFixed(1)} GB`);
      console.log(`   └─ Running: ${systemInfo?.ContainersRunning} containers`);

      return true;
    } catch (error) {
      this._connected = false;
      console.warn('⚠️  Docker daemon not available:', getErrorMessage(error));
      console.warn('⚠️  VM management features will be disabled');
      // In development: resolve so the server still starts.
      // In production Docker is required: propagate so startup fails hard.
      if (process.env.NODE_ENV === 'production') {
        throw error;
      }
      return false;
    }
  }

  async disconnect(): Promise<void> {
    this._connected = false;
    this._systemInfo = null;
    console.log('🐳 Docker service disconnected');
  }

  isReady(): boolean {
    return this._connected;
  }

  getContainer(containerId: string): any {
    return this.docker.getContainer(containerId);
  }

  async ensureNetwork(): Promise<unknown> {
    const networkName = config.docker?.vmNetwork || 'sahary-vm-network';
    const subnet = config.docker?.vmSubnet || '172.25.0.0/16';

    try {
      const networks = await this.docker.listNetworks({
        filters: { name: [networkName] },
      });

      if (networks.length > 0) {
        return networks[0];
      }

      const network = await this.docker.createNetwork({
        Name: networkName,
        Driver: 'bridge',
        Internal: false,
        IPAM: {
          Config: [{ Subnet: subnet, Gateway: subnet.replace('/16', '').replace(/\.0$/, '.1') }],
        },
        Options: {
          'com.docker.network.bridge.enable_icc': 'true',
          'com.docker.network.bridge.enable_ip_masquerade': 'true',
          'com.docker.network.bridge.name': `br-${networkName}`,
          'com.docker.network.driver.mtu': '1500',
        },
        Labels: {
          'sahary.network': 'true',
          'sahary.managed': 'true',
          'sahary.purpose': 'vm-isolation',
        },
      });

      console.log(`   🔗 Created VM network: ${networkName} (${subnet})`);
      return network;
    } catch (error) {
      console.warn(`⚠️  Could not ensure VM network '${networkName}':`, getErrorMessage(error));
      return null;
    }
  }

  validateResourceLimits(resources: { cpu: number; ram: number; storage: number }): DockerResourceValidationResult {
    const errors: string[] = [];
    const { cpu, ram, storage } = resources;

    if (!this._systemInfo) {
      return { valid: false, errors: ['Docker system info not available — cannot validate resources'] };
    }

    const hostCPUs = this._systemInfo.NCPU || 1;
    const hostMemMB = Math.floor((this._systemInfo.MemTotal || 0) / (1024 * 1024));

    const maxCPU = Math.max(hostCPUs * 0.8, 0.5);
    if (cpu > maxCPU) {
      errors.push(`CPU ${cpu} cores exceeds max allowed ${maxCPU.toFixed(1)} (80% of ${hostCPUs} host CPUs)`);
    }
    if (cpu < 0.1) {
      errors.push('CPU must be at least 0.1 cores');
    }

    const maxRAM = Math.floor(hostMemMB * 0.8);
    if (ram > maxRAM) {
      errors.push(`RAM ${ram}MB exceeds max allowed ${maxRAM}MB (80% of ${hostMemMB}MB host memory)`);
    }
    if (ram < 64) {
      errors.push('RAM must be at least 64MB');
    }

    if (storage < 1) {
      errors.push('Storage must be at least 1GB');
    }
    if (storage > 1000) {
      errors.push('Storage cannot exceed 1000GB');
    }

    return { valid: errors.length === 0, errors };
  }

  async getHealthStatus(): Promise<DockerHealthStatus> {
    if (!this._connected) {
      return {
        status: 'disconnected',
        connected: false,
      };
    }

    try {
      await this.docker.ping();
      const info = await this.docker.info();

      return {
        status: 'healthy',
        connected: true,
        serverVersion: info.ServerVersion,
        containers: {
          total: info.Containers,
          running: info.ContainersRunning,
          paused: info.ContainersPaused,
          stopped: info.ContainersStopped,
        },
        resources: {
          cpus: info.NCPU,
          memoryTotal: `${(info.MemTotal / (1024 ** 3)).toFixed(1)} GB`,
          storageDriver: info.Driver,
        },
      };
    } catch (error) {
      this._connected = false;
      return {
        status: 'unhealthy',
        connected: false,
        error: getErrorMessage(error),
      };
    }
  }

  async createContainer(vmConfig: DockerVmConfig): Promise<DockerContainerInfo> {
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
      const validation = this.validateResourceLimits({ cpu, ram, storage });
      if (!validation.valid) {
        throw new Error(`Resource validation failed: ${validation.errors.join('; ')}`);
      }

      const networkName = config.docker?.vmNetwork || 'sahary-vm-network';

      const containerConfig = {
        name: `sahary-vm-${vmId}`,
        Image: image,
        // Keep the container running — the base image's default command
        // exits immediately.
        Cmd: ['sleep', 'infinity'],
        HostConfig: {
          // Run an init process so SIGTERM reaches the workload — as PID 1
          // a plain process ignores unhandled signals, which would make
          // every stop wait the full grace period.
          Init: true,
          NanoCpus: cpu * 1000000000,
          Memory: ram * 1024 * 1024,
          StorageOpt: {
            size: `${storage}G`,
          },
          PortBindings: this.formatPortBindings(ports),
          Binds: volumes,
          NetworkMode: networkName,
          RestartPolicy: {
            // MaximumRetryCount is only valid with 'on-failure'
            Name: 'on-failure',
            MaximumRetryCount: 3,
          },
          SecurityOpt: ['no-new-privileges:true'],
          CpuShares: cpu * 1024,
          MemorySwap: ram * 1024 * 1024 * 2,
          LogConfig: {
            Type: 'json-file',
            Config: {
              'max-size': '10m',
              'max-file': '3',
            },
          },
        },
        Env: [
          `VM_ID=${vmId}`,
          `VM_NAME=${name}`,
          `CPU_LIMIT=${cpu}`,
          `RAM_LIMIT=${ram}`,
          `STORAGE_LIMIT=${storage}`,
          ...environment,
        ],
        Labels: {
          'sahary.vm.id': vmId,
          'sahary.vm.name': name,
          'sahary.service': 'vm',
          'sahary.managed': 'true',
        },
        WorkingDir: '/app',
        User: '1000:1000',
        ExposedPorts: this.formatExposedPorts(ports),
        Healthcheck: {
          Test: ['CMD-SHELL', 'echo "healthy"'],
          Interval: 30000000000,
          Timeout: 10000000000,
          Retries: 3,
          StartPeriod: 60000000000,
        },
      };

      const toInfo = async (container: any): Promise<DockerContainerInfo> => {
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
      };

      try {
        return await toInfo(await this.docker.createContainer(containerConfig));
      } catch (createError: any) {
        // A stale container left behind by a previous failed start holds
        // the same deterministic name — remove it and retry once.
        if (createError?.statusCode !== 409) {
          throw createError;
        }
        await this.docker
          .getContainer(`sahary-vm-${vmId}`)
          .remove({ force: true });
        return await toInfo(await this.docker.createContainer(containerConfig));
      }
    } catch (error) {
      throw new Error(`Failed to create container: ${getErrorMessage(error)}`);
    }
  }

  async startContainer(containerId: string): Promise<DockerContainerInfo> {
    try {
      const container = this.docker.getContainer(containerId);

      await container.start();
      await new Promise<void>((resolve) => setTimeout(resolve, 2000));

      const containerInfo = await container.inspect();

      return {
        containerId: containerInfo.Id,
        status: containerInfo.State.Status,
        created: containerInfo.Created,
        image: containerInfo.Config.Image,
        name: containerInfo.Name,
        ipAddress: this.extractIPAddress(containerInfo.NetworkSettings),
        ports: this.extractPortMappings(containerInfo.NetworkSettings.Ports),
      };
    } catch (error) {
      throw new Error(`Failed to start container: ${getErrorMessage(error)}`);
    }
  }

  async stopContainer(containerId: string, timeout = 10): Promise<DockerContainerInfo> {
    try {
      const container = this.docker.getContainer(containerId);

      try {
        await container.stop({ t: timeout });
      } catch (stopError: any) {
        // Stopping an already-stopped container is a no-op, not an error.
        if (stopError?.statusCode !== 304) {
          throw stopError;
        }
      }

      const containerInfo = await container.inspect();

      return {
        containerId: containerInfo.Id,
        status: containerInfo.State.Status,
        created: containerInfo.Created,
        image: containerInfo.Config.Image,
      };
    } catch (error) {
      throw new Error(`Failed to stop container: ${getErrorMessage(error)}`);
    }
  }

  async restartContainer(containerId: string, timeout = 10): Promise<DockerContainerInfo> {
    try {
      const container = this.docker.getContainer(containerId);

      await container.restart({ t: timeout });
      await new Promise<void>((resolve) => setTimeout(resolve, 3000));

      const containerInfo = await container.inspect();

      return {
        containerId: containerInfo.Id,
        status: containerInfo.State.Status,
        created: containerInfo.Created,
        image: containerInfo.Config.Image,
        name: containerInfo.Name,
        ipAddress: this.extractIPAddress(containerInfo.NetworkSettings),
      };
    } catch (error) {
      throw new Error(`Failed to restart container: ${getErrorMessage(error)}`);
    }
  }

  async removeContainer(containerId: string, force = false): Promise<void> {
    try {
      const container = this.docker.getContainer(containerId);

      try {
        const containerInfo = await container.inspect();
        if (containerInfo.State.Running) {
          await container.stop({ t: 10 });
        }
      } catch (stopError) {
        console.warn('Container might already be stopped:', getErrorMessage(stopError));
      }

      await container.remove({ force, v: true });
    } catch (error) {
      throw new Error(`Failed to remove container: ${getErrorMessage(error)}`);
    }
  }

  async getContainerStatus(containerId: string): Promise<Record<string, unknown> | null> {
    try {
      const container = this.docker.getContainer(containerId);

      const [containerInfo, stats] = await Promise.all([
        container.inspect(),
        this.getContainerStats(containerId).catch(() => null),
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
      if ((error as { statusCode?: number }).statusCode === 404) {
        return null;
      }

      throw new Error(`Failed to get container status: ${getErrorMessage(error)}`);
    }
  }

  async getContainerStats(containerId: string): Promise<DockerStatsResult> {
    try {
      const container = this.docker.getContainer(containerId);
      const stats = (await container.stats({ stream: false })) as ContainerStatsPayload;

      const cpuUsage = this.calculateCPUUsage(stats);
      const memoryUsage = {
        used: stats.memory_stats?.usage || 0,
        limit: stats.memory_stats?.limit || 0,
        percentage: stats.memory_stats?.limit && stats.memory_stats.limit > 0
          ? ((stats.memory_stats.usage || 0) / stats.memory_stats.limit) * 100
          : 0,
      };

      const networkIO = this.calculateNetworkIO(stats.networks);
      const blockIO = this.calculateBlockIO(stats.blkio_stats);

      return {
        timestamp: new Date().toISOString(),
        cpu: {
          usage: cpuUsage,
          systemUsage: stats.cpu_stats?.system_cpu_usage,
        },
        memory: memoryUsage,
        network: networkIO,
        blockIO,
        pids: stats.pids_stats?.current || 0,
      };
    } catch (error) {
      throw new Error(`Failed to get container stats: ${getErrorMessage(error)}`);
    }
  }

  async listContainers(filters: Record<string, unknown> = {}): Promise<Array<Record<string, unknown>>> {
    try {
      const listOptions = {
        all: true,
        filters: {
          label: ['sahary.managed=true'],
          ...filters,
        },
      };

      const containers = await this.docker.listContainers(listOptions);

      return containers.map((container: any) => ({
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
      throw new Error(`Failed to list containers: ${getErrorMessage(error)}`);
    }
  }

  async pullImage(imageName: string): Promise<void> {
    try {
      console.log(`Pulling Docker image: ${imageName}`);

      const stream = await this.docker.pull(imageName);

      await new Promise<void>((resolve, reject) => {
        this.docker.modem.followProgress(stream, (err: unknown) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      });

      console.log(`Successfully pulled image: ${imageName}`);
    } catch (error) {
      throw new Error(`Failed to pull image ${imageName}: ${getErrorMessage(error)}`);
    }
  }

  async getSystemInfo(): Promise<Record<string, unknown>> {
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
      throw new Error(`Failed to get Docker system info: ${getErrorMessage(error)}`);
    }
  }

  async createNetwork(networkName?: string): Promise<unknown> {
    const name = networkName || config.docker?.vmNetwork || 'sahary-vm-network';
    const subnet = config.docker?.vmSubnet || '172.25.0.0/16';

    try {
      const networks = await this.docker.listNetworks({
        filters: { name: [name] },
      });

      if (networks.length > 0) {
        return networks[0];
      }

      const network = await this.docker.createNetwork({
        Name: name,
        Driver: 'bridge',
        Internal: false,
        IPAM: {
          Config: [{ Subnet: subnet, Gateway: subnet.replace('/16', '').replace(/\.0$/, '.1') }],
        },
        Options: {
          'com.docker.network.bridge.enable_icc': 'true',
          'com.docker.network.bridge.enable_ip_masquerade': 'true',
          'com.docker.network.bridge.name': `br-${name}`,
          'com.docker.network.driver.mtu': '1500',
        },
        Labels: {
          'sahary.network': 'true',
          'sahary.managed': 'true',
          'sahary.purpose': 'vm-isolation',
        },
      });

      return network;
    } catch (error) {
      throw new Error(`Failed to create network: ${getErrorMessage(error)}`);
    }
  }

  async checkContainerHealth(containerId: string): Promise<Record<string, unknown>> {
    try {
      const container = this.docker.getContainer(containerId);
      const containerInfo = await container.inspect();

      const health = containerInfo.State.Health;

      return {
        containerId,
        healthy: health?.Status === 'healthy',
        status: health?.Status || 'no-healthcheck',
        failingStreak: health?.FailingStreak || 0,
        log: health?.Log?.slice(-5) || [],
      };
    } catch (error) {
      throw new Error(`Failed to check container health: ${getErrorMessage(error)}`);
    }
  }

  async getContainerLogs(
    containerId: string,
    options: {
      tail?: number;
      since?: number | string | Date;
      until?: number | string | Date;
      timestamps?: boolean;
    } = {},
  ): Promise<string> {
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
      throw new Error(`Failed to get container logs: ${getErrorMessage(error)}`);
    }
  }

  async execInContainer(containerId: string, command: string[]): Promise<{ exitCode: number; output: string; command: string }> {
    try {
      const container = this.docker.getContainer(containerId);

      const exec = await container.exec({
        Cmd: command,
        AttachStdout: true,
        AttachStderr: true,
        Tty: false,
      });

      const stream = await exec.start({ Detach: false, Tty: false });

      let output = '';
      stream.on('data', (chunk: Buffer) => {
        output += chunk.toString();
      });

      await new Promise<void>((resolve) => {
        stream.on('end', resolve);
      });

      const execInfo = await exec.inspect();

      return {
        exitCode: execInfo.ExitCode,
        output: output.trim(),
        command: command.join(' '),
      };
    } catch (error) {
      throw new Error(`Failed to execute command in container: ${getErrorMessage(error)}`);
    }
  }

  async createContainerBackup(containerId: string, backupName: string): Promise<Record<string, unknown>> {
    try {
      const container = this.docker.getContainer(containerId);

      const image = await container.commit({
        repo: `sahary-backup/${backupName}`,
        tag: new Date().toISOString().replace(/[:.]/g, '-'),
        comment: `Backup created at ${new Date().toISOString()}`,
        author: 'Sahary Cloud Backup System',
      });

      const imageInfo = await this.docker.getImage(image.Id).inspect();

      return {
        backupId: image.Id,
        name: backupName,
        size: imageInfo.Size,
        created: imageInfo.Created,
        tags: imageInfo.RepoTags,
      };
    } catch (error) {
      throw new Error(`Failed to create container backup: ${getErrorMessage(error)}`);
    }
  }

  async restoreFromBackup(backupId: string, vmConfig: DockerVmConfig): Promise<DockerContainerInfo> {
    try {
      const restoreConfig = {
        ...vmConfig,
        image: backupId,
      };

      return await this.createContainer(restoreConfig);
    } catch (error) {
      throw new Error(`Failed to restore from backup: ${getErrorMessage(error)}`);
    }
  }

  async cleanup(): Promise<Record<string, number>> {
    try {
      const results = {
        containers: 0,
        images: 0,
        volumes: 0,
        networks: 0,
        reclaimedSpace: 0,
      };

      const containerPrune = await this.docker.pruneContainers({
        filters: {
          label: ['sahary.managed=true'],
        },
      });

      results.containers = containerPrune.ContainersDeleted?.length || 0;
      results.reclaimedSpace += containerPrune.SpaceReclaimed || 0;

      const imagePrune = await this.docker.pruneImages({
        filters: {
          dangling: ['false'],
        },
      });

      results.images = imagePrune.ImagesDeleted?.length || 0;
      results.reclaimedSpace += imagePrune.SpaceReclaimed || 0;

      const volumePrune = await this.docker.pruneVolumes();
      results.volumes = volumePrune.VolumesDeleted?.length || 0;
      results.reclaimedSpace += volumePrune.SpaceReclaimed || 0;

      return results;
    } catch (error) {
      throw new Error(`Failed to cleanup Docker resources: ${getErrorMessage(error)}`);
    }
  }

  formatPortBindings(ports: DockerPortConfig[]): Record<string, Array<{ HostPort: string }>> {
    const bindings: Record<string, Array<{ HostPort: string }>> = {};

    ports.forEach((port) => {
      const containerPort = `${port.containerPort}/tcp`;
      bindings[containerPort] = [{ HostPort: port.hostPort.toString() }];
    });

    return bindings;
  }

  formatExposedPorts(ports: DockerPortConfig[]): Record<string, Record<string, never>> {
    const exposed: Record<string, Record<string, never>> = {};

    ports.forEach((port) => {
      exposed[`${port.containerPort}/tcp`] = {};
    });

    return exposed;
  }

  extractIPAddress(networkSettings: ContainerNetworkSettings): string | null {
    if (networkSettings.Networks) {
      const networks = Object.values(networkSettings.Networks);
      if (networks.length > 0) {
        return networks[0].IPAddress || null;
      }
    }

    return networkSettings.IPAddress || null;
  }

  extractPortMappings(ports: Record<string, Array<{ HostPort: string }> | null> | undefined): DockerPortMapping[] {
    const mappings: DockerPortMapping[] = [];

    if (ports) {
      Object.entries(ports).forEach(([containerPort, hostPorts]) => {
        if (hostPorts) {
          hostPorts.forEach((hostPort) => {
            mappings.push({
              containerPort: Number.parseInt(containerPort.split('/')[0], 10),
              hostPort: Number.parseInt(hostPort.HostPort, 10),
              protocol: containerPort.split('/')[1] || 'tcp',
            });
          });
        }
      });
    }

    return mappings;
  }

  calculateCPUUsage(stats: ContainerStatsPayload): number {
    const cpuStats = stats.cpu_stats;
    const preCpuStats = stats.precpu_stats;

    if (!cpuStats || !preCpuStats) {
      return 0;
    }

    const cpuDelta = (cpuStats.cpu_usage?.total_usage || 0) - (preCpuStats.cpu_usage?.total_usage || 0);
    const systemDelta = (cpuStats.system_cpu_usage || 0) - (preCpuStats.system_cpu_usage || 0);
    const cpuCount = cpuStats.online_cpus || 1;

    if (systemDelta > 0 && cpuDelta > 0) {
      return (cpuDelta / systemDelta) * cpuCount * 100;
    }

    return 0;
  }

  calculateNetworkIO(networks: Record<string, ContainerNetwork> | undefined): { rxBytes: number; txBytes: number; totalBytes: number } {
    let rxBytes = 0;
    let txBytes = 0;

    if (networks) {
      Object.values(networks).forEach((network) => {
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

  calculateBlockIO(blkioStats: ContainerStatsPayload['blkio_stats']): { readBytes: number; writeBytes: number; totalBytes: number } {
    let readBytes = 0;
    let writeBytes = 0;

    if (blkioStats?.io_service_bytes_recursive) {
      blkioStats.io_service_bytes_recursive.forEach((stat) => {
        if (stat.op === 'Read') {
          readBytes += stat.value || 0;
        }
        if (stat.op === 'Write') {
          writeBytes += stat.value || 0;
        }
      });
    }

    return {
      readBytes,
      writeBytes,
      totalBytes: readBytes + writeBytes,
    };
  }

  async checkConnection(): Promise<boolean> {
    try {
      await this.docker.ping();
      this._connected = true;
      return true;
    } catch (error) {
      this._connected = false;
      console.error('Docker connection failed:', getErrorMessage(error));
      return false;
    }
  }
}

const dockerService = new DockerService();

export default dockerService;
