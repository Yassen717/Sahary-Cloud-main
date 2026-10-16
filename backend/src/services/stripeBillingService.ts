// Implemented by WP01 — see CONTRACT.md section 8
import { httpError } from '../utils/httpError';
import logger from '../utils/logger';

export async function cancelSubscriptionNow(_stripeSubscriptionId: string): Promise<void> {
  logger.warn('cancelSubscriptionNow called on foundation stub — no-op');
}

export async function syncPlanToStripe(
  _planId: string,
): Promise<{ stripeProductId: string; stripePriceId: string }> {
  throw httpError(501, 'Not implemented');
}
