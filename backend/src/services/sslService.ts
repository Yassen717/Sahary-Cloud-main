// Implemented by WP05 — see CONTRACT.md section 8
import { httpError } from '../utils/httpError';
import type { SslStatus } from '../types/hosting';

export function isSslEnabled(): boolean {
  return false;
}

export function getWildcardStatus(): { available: boolean; expiresAt: Date | null } {
  return { available: false, expiresAt: null };
}

export async function issueCertificateForDomain(_domainId: string): Promise<{ status: SslStatus }> {
  throw httpError(501, 'Not implemented');
}

export async function issuePendingCertificates(): Promise<{ attempted: number; issued: number; failed: number }> {
  return { attempted: 0, issued: 0, failed: 0 };
}

export async function renewExpiringCertificates(): Promise<{ checked: number; renewed: number; failed: number }> {
  return { checked: 0, renewed: 0, failed: 0 };
}

export async function deleteCertificate(_domain: string): Promise<void> {}

export async function syncPrimarySslState(): Promise<{ updated: number }> {
  return { updated: 0 };
}

export async function healthCheck(): Promise<{ ok: boolean; message?: string }> {
  return { ok: true, message: 'disabled' };
}
