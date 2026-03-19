export type VmStatus = 'RUNNING' | 'STOPPED' | 'STARTING' | 'STOPPING' | 'RESTARTING' | 'ERROR' | 'SUSPENDED' | 'DELETED';

export interface VmUserSummary {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
}

export interface VmUsageRecordSummary {
  id: string;
  cpuUsage: number;
  ramUsage: number;
  storageUsage: number;
  bandwidthUsage?: number;
  duration?: number;
  cost?: string | number;
  timestamp: Date;
}

export interface VmBackupSummary {
  id: string;
  name: string;
  status: string;
  size?: string | number | null;
  backupType?: string | null;
  createdAt: Date;
  completedAt?: Date | null;
}

export interface VmRecord {
  id: string;
  name: string;
  description?: string | null;
  status: VmStatus;
  cpu: number;
  ram: number;
  storage: number;
  bandwidth?: number | null;
  ipAddress?: string | null;
  port?: number | null;
  dockerImage?: string | null;
  dockerContainerId?: string | null;
  hourlyRate: string | number;
  createdAt?: Date;
  updatedAt?: Date;
  startedAt?: Date | null;
  stoppedAt?: Date | null;
  userId: string;
  user?: VmUserSummary;
  usageRecords?: VmUsageRecordSummary[];
  backups?: VmBackupSummary[];
}

export interface VmResourceInput {
  cpu: number;
  ram: number;
  storage: number;
  bandwidth?: number;
}

export interface CreateVmInput {
  name: string;
  description?: string | null;
  cpu: number;
  ram: number;
  storage: number;
  bandwidth?: number;
  dockerImage?: string | null;
}

export interface UpdateVmInput {
  name?: string;
  description?: string | null;
  cpu?: number;
  ram?: number;
  storage?: number;
  bandwidth?: number;
}

export interface VmListOptions {
  page?: number | string;
  limit?: number | string;
  status?: VmStatus;
  search?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  userId?: string;
}

export interface VmStatisticsOptions {
  startDate?: string;
  endDate?: string;
  granularity?: 'hour' | 'day' | 'week' | 'month';
}

export interface VmResourceUsage {
  cpu: number;
  ram: number;
  storage: number;
  bandwidth: number;
}

export interface VmResourceLimits {
  cpu: number;
  ram: number;
  storage: number;
  bandwidth: number;
}

export interface VmStatisticsResult {
  totalRecords: number;
  totalCost: number;
  averageCPU: number;
  averageRAM: number;
  totalBandwidth: number;
  peakCPU: number;
  peakRAM: number;
  records: Array<Record<string, unknown>>;
}

export interface VmResourceStatsResult {
  vmId: string;
  vmName: string;
  vmStatus?: VmStatus;
  dockerContainerId?: string;
  stats: unknown | null;
  message?: string;
}
