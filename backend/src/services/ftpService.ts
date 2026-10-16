// Implemented by WP04 — see CONTRACT.md section 8
import { httpError } from '../utils/httpError';

export function isFtpEnabled(): boolean {
  return false;
}

export async function provisionFtpUser(
  _input: { username: string; documentRoot: string; quotaMB: number },
): Promise<void> {}

export async function deleteFtpUser(_username: string): Promise<void> {}
export async function setFtpQuota(_username: string, _quotaMB: number): Promise<void> {}
export async function setFtpUserEnabled(_username: string, _enabled: boolean): Promise<void> {}

export async function resetFtpPassword(_username: string): Promise<string> {
  throw httpError(503, 'FTP is not enabled');
}

export async function healthCheck(): Promise<{ ok: boolean; message?: string }> {
  return { ok: true, message: 'disabled' };
}
