// Stripe billing helpers (WP01 — CONTRACT.md section 8): subscription
// cancellation for the termination flow, plan→Stripe product/price sync,
// and Stripe customer provisioning shared by checkout entry points.
import type { User } from '@prisma/client';
import { prisma } from '../config/database';
import { getStripe } from './stripeClient';
import { httpError } from '../utils/httpError';
import logger from '../utils/logger';

const errorMessage = (error: unknown): string =>
  (error instanceof Error ? error.message : String(error));

const stripeErrorCode = (error: unknown): string | null =>
  ((error as { code?: unknown })?.code as string) ?? null;

const refIdEquals = (value: unknown, id: string): boolean => {
  if (typeof value === 'string') {
    return value === id;
  }
  return (value as { id?: unknown })?.id === id;
};

/**
 * Immediately cancel a subscription. Used by the termination flow (P5),
 * which must NOT continue when Stripe fails — callers rely on the 502.
 * Already-canceled subscriptions are a success: the end state is reached.
 */
export async function cancelSubscriptionNow(stripeSubscriptionId: string): Promise<void> {
  const stripe = getStripe();
  try {
    await stripe.subscriptions.cancel(stripeSubscriptionId);
  } catch (error) {
    const message = errorMessage(error);
    if (stripeErrorCode(error) === 'resource_missing' || /no such subscription|already canceled/i.test(message)) {
      logger.info('stripe subscription already canceled or missing', { stripeSubscriptionId });
      return;
    }
    logger.error('stripe subscription cancel failed', { stripeSubscriptionId, error: message });
    throw httpError(502, 'Could not cancel the subscription with the payment provider');
  }
}

/**
 * Return the user's Stripe customer id, creating the customer on first use.
 * The conditional update guarantees concurrent calls cannot persist two
 * different customers — the loser of the race re-reads and reuses the
 * winner's id (its own just-created customer object is simply unused).
 */
export async function ensureStripeCustomer(
  user: Pick<User, 'id' | 'email' | 'firstName' | 'lastName' | 'stripeCustomerId'>,
): Promise<string> {
  if (user.stripeCustomerId) {
    return user.stripeCustomerId;
  }

  const stripe = getStripe();
  const name = `${user.firstName} ${user.lastName}`.trim();
  const customer = await stripe.customers.create({
    email: user.email,
    ...(name.length > 0 ? { name } : {}),
    metadata: { userId: user.id },
  });

  const claimed = await prisma.user.updateMany({
    where: { id: user.id, stripeCustomerId: null },
    data: { stripeCustomerId: customer.id },
  });
  if (claimed.count === 1) {
    return customer.id;
  }

  const winner = await prisma.user.findUnique({
    where: { id: user.id },
    select: { stripeCustomerId: true },
  });
  return winner?.stripeCustomerId ?? customer.id;
}

/**
 * Sync a hosting plan to a Stripe product + monthly USD price (in cents).
 * Stripe prices are immutable, so any drift in amount/currency/interval —
 * or a missing/inactive/archived price — mints a new price and archives the
 * old one; an unchanged plan is a no-op that returns the stored ids.
 */
export async function syncPlanToStripe(
  planId: string,
): Promise<{ stripeProductId: string; stripePriceId: string }> {
  const plan = await prisma.hostingPlan.findUnique({ where: { id: planId } });
  if (!plan) {
    throw httpError(404, 'Hosting plan not found');
  }

  const stripe = getStripe();
  let { stripeProductId } = plan;

  if (!stripeProductId) {
    const product = await stripe.products.create({
      name: `Sahary Hosting — ${plan.name}`,
      metadata: { planId: plan.id },
    });
    stripeProductId = product.id;
  }

  const amountCents = Math.round(Number(plan.monthlyPrice) * 100);
  let { stripePriceId } = plan;
  let currentPriceUsable = false;

  if (stripePriceId) {
    try {
      const price = await stripe.prices.retrieve(stripePriceId);
      currentPriceUsable = price.active === true
        && price.unit_amount === amountCents
        && price.currency === 'usd'
        && price.recurring?.interval === 'month'
        && (price.recurring?.interval_count ?? 1) === 1
        && refIdEquals(price.product, stripeProductId);
    } catch (error) {
      if (stripeErrorCode(error) !== 'resource_missing') {
        throw error;
      }
      currentPriceUsable = false;
    }
  }

  if (!currentPriceUsable) {
    const price = await stripe.prices.create({
      product: stripeProductId,
      unit_amount: amountCents,
      currency: 'usd',
      recurring: { interval: 'month' },
      metadata: { planId: plan.id },
    });
    if (stripePriceId) {
      try {
        await stripe.prices.update(stripePriceId, { active: false });
      } catch (error) {
        logger.warn('failed to archive superseded stripe price', {
          stripePriceId, error: errorMessage(error),
        });
      }
    }
    stripePriceId = price.id;
  }

  if (!stripePriceId) {
    // Unreachable — a missing price was just created above.
    throw httpError(500, 'Failed to provision a Stripe price for this plan');
  }

  if (stripeProductId !== plan.stripeProductId || stripePriceId !== plan.stripePriceId) {
    await prisma.hostingPlan.update({
      where: { id: plan.id },
      data: { stripeProductId, stripePriceId },
    });
  }

  return { stripeProductId, stripePriceId };
}
