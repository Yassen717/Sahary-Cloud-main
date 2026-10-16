// Implemented by WP07 — see CONTRACT.md section 8
import type { SuspendReason } from '../types/hosting';

export async function notifyAccountProvisioned(_accountId: string): Promise<void> {}
export async function notifyAccountSuspended(_accountId: string, _reason: SuspendReason): Promise<void> {}
export async function notifyAccountReactivated(_accountId: string): Promise<void> {}
export async function notifyPaymentFailed(
  _accountId: string,
  _info: { nextRetryAt?: Date | null; hostedInvoiceUrl?: string | null },
): Promise<void> {}
export async function notifySubscriptionCanceled(_accountId: string, _endsAt: Date | null): Promise<void> {}
export async function notifyQuotaAlert(
  _accountId: string,
  _resource: 'disk' | 'bandwidth',
  _percent: 80 | 100,
): Promise<void> {}
export async function notifySslIssued(_domainId: string): Promise<void> {}
export async function notifySslExpiring(_domainId: string, _daysLeft: number): Promise<void> {}
export async function notifySslFailed(_domainId: string, _message: string): Promise<void> {}
