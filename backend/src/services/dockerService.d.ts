type ContainerInfo = {
  containerId: string;
  ipAddress?: string | null;
  [key: string]: unknown;
};

declare const dockerService: {
  connect(): Promise<boolean>;
  disconnect(): Promise<void>;
  isReady(): boolean;
  getHealthStatus(): Promise<Record<string, unknown>>;
  createContainer(vmConfig: Record<string, unknown>): Promise<ContainerInfo>;
  startContainer(containerId: string): Promise<ContainerInfo>;
  stopContainer(containerId: string, timeout?: number): Promise<void>;
  restartContainer(containerId: string, timeout?: number): Promise<ContainerInfo>;
  removeContainer(containerId: string, force?: boolean): Promise<void>;
  getContainerStatus(containerId: string): Promise<Record<string, unknown> | null>;
  getContainerStats(containerId: string): Promise<Record<string, unknown>>;
  getContainerLogs(containerId: string, options?: Record<string, unknown>): Promise<string>;
  execInContainer(containerId: string, command: string[]): Promise<{
    exitCode: number;
    output: string;
    command: string;
  }>;
  createContainerBackup(containerId: string, backupName: string): Promise<Record<string, unknown>>;
  restoreFromBackup(backupId: string, vmConfig: Record<string, unknown>): Promise<ContainerInfo>;
};

export = dockerService;