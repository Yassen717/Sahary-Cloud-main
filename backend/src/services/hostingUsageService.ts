// Implemented by WP06 — see CONTRACT.md section 8
import { httpError } from '../utils/httpError';
import type { HostingUsageDTO } from '../types/hosting';

export async function getUsageForAccount(_accountId: string): Promise<HostingUsageDTO> {
  throw httpError(501, 'Not implemented');
}

export async function measureAccount(
  _accountId: string,
): Promise<{ diskUsedGB: number; bandwidthUsedGB: number }> {
  throw httpError(501, 'Not implemented');
}

export async function runMeteringCycle(): Promise<{ accounts: number; suspended: number; alerts: number }> {
  throw httpError(501, 'Not implemented');
}
