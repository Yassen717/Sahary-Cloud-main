// Implemented by WP02 — see CONTRACT.md section 8
import { httpError } from '../utils/httpError';
import type {
  HostingAccountDTO,
  ProvisionPaidAccountInput,
  SuspendReason,
} from '../types/hosting';

export async function provisionPaidAccount(
  _input: ProvisionPaidAccountInput,
): Promise<{ account: HostingAccountDTO; created: boolean }> {
  throw httpError(501, 'Not implemented');
}

export async function suspendAccount(
  _accountId: string,
  _reason: SuspendReason,
  _opts?: { actorUserId?: string; note?: string },
): Promise<HostingAccountDTO> {
  throw httpError(501, 'Not implemented');
}

export async function activateAccount(
  _accountId: string,
  _opts?: { actorUserId?: string },
): Promise<HostingAccountDTO> {
  throw httpError(501, 'Not implemented');
}

export async function changeAccountPlan(
  _accountId: string,
  _newPlanId: string,
): Promise<HostingAccountDTO> {
  throw httpError(501, 'Not implemented');
}

export async function applySubscriptionState(
  _accountId: string,
  _state: { subscriptionStatus: string; currentPeriodEnd: Date | null; cancelAtPeriodEnd: boolean },
): Promise<void> {
  throw httpError(501, 'Not implemented');
}

export async function retryProvisioning(
  _accountId: string,
  _opts?: { actorUserId?: string },
): Promise<HostingAccountDTO> {
  throw httpError(501, 'Not implemented');
}

export async function terminateAccountById(
  _accountId: string,
  _opts: { actorUserId?: string; reason: 'USER' | 'ADMIN' | 'RETENTION_EXPIRED' | 'SUBSCRIPTION_ENDED' },
): Promise<HostingAccountDTO> {
  throw httpError(501, 'Not implemented');
}
