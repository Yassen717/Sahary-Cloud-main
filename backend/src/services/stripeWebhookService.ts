// Stripe webhook pipeline for hosting subscriptions (CONTRACT.md P3):
// persistent idempotency through the stripe_webhook_events ledger plus
// order-tolerant handlers that drive the hosting account lifecycle (WP02
// stubs) and user notifications (WP07 stubs).
import { Prisma } from '@prisma/client';
import type { HostingAccount, HostingPlan } from '@prisma/client';
import { prisma } from '../config/database';
import { getHostingConfig } from '../config/hosting';
import {
  asStripeRecord,
  getStripe,
  invoiceSubscriptionId,
  refId,
  stripeSecondsToDate,
  subscriptionPeriodEnd,
  subscriptionPeriodStart,
  subscriptionPriceId,
} from './stripeClient';
import {
  activateAccount,
  applySubscriptionState,
  changeAccountPlan,
  provisionPaidAccount,
  suspendAccount,
} from './hostingLifecycleService';
import {
  notifyPaymentFailed,
  notifySubscriptionCanceled,
} from './hostingNotificationService';
import logger from '../utils/logger';

type AnyRecord = Record<string, any>;

export interface StripeWebhookEventLike {
  id?: string;
  type?: string;
  data?: { object?: unknown };
}

export type StripeEventDispatcher = (event: StripeWebhookEventLike) => Promise<AnyRecord>;

// PROCESSING rows older than this are considered crashed and re-claimable.
const STALE_PROCESSING_MS = 5 * 60 * 1000;
const LAST_ERROR_MAX = 500;

// Stripe subscription statuses that mean "the customer still owes/owes us
// nothing fatal" — anything live enough to block a second checkout.
export const LIVE_SUBSCRIPTION_STATUSES = ['active', 'trialing', 'past_due'] as const;

const errorMessage = (error: unknown): string =>
  (error instanceof Error ? error.message : String(error));

const isP2002 = (error: unknown): boolean =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';

/**
 * Claim a Stripe event for this process. First delivery wins by insert;
 * deliveries that find a FAILED row or a PROCESSING row abandoned for
 * longer than STALE_PROCESSING_MS re-claim it. PROCESSED rows and fresh
 * PROCESSING rows (another worker holds them) reject the claim.
 */
async function claimStripeEvent(eventId: string, eventType: string): Promise<boolean> {
  try {
    await prisma.stripeWebhookEvent.create({
      data: { id: eventId, type: eventType },
    });
    return true;
  } catch (error) {
    if (!isP2002(error)) {
      throw error;
    }
  }

  const staleBefore = new Date(Date.now() - STALE_PROCESSING_MS);
  const reclaimed = await prisma.stripeWebhookEvent.updateMany({
    where: {
      id: eventId,
      OR: [
        { status: 'FAILED' },
        { status: 'PROCESSING', updatedAt: { lt: staleBefore } },
      ],
    },
    data: { status: 'PROCESSING', attempts: { increment: 1 }, lastError: null },
  });
  return reclaimed.count === 1;
}

/**
 * Claim -> dispatch -> mark pipeline for a Stripe event (P3). The row is
 * marked PROCESSED only after the handler succeeds; handler failures are
 * recorded as FAILED and rethrown so the HTTP endpoint answers 500 and
 * Stripe retries the delivery.
 */
export async function processStripeEvent(
  event: StripeWebhookEventLike,
  dispatch: StripeEventDispatcher = handleHostingWebhookEvent,
): Promise<AnyRecord> {
  const eventType = typeof event?.type === 'string' && event.type.length > 0 ? event.type : 'unknown';
  const eventId = typeof event?.id === 'string' && event.id.length > 0 ? event.id : null;

  if (!eventId) {
    // Stripe always sends an id; id-less payloads only come from hand-rolled
    // calls/tests. Nothing to dedupe against — run the handler directly,
    // exactly like the legacy in-memory path did.
    const result = await dispatch(event);
    return { ...result, eventType };
  }

  const claimed = await claimStripeEvent(eventId, eventType);
  if (!claimed) {
    return { handled: true, duplicate: true, eventId, eventType };
  }

  try {
    const result = await dispatch(event);
    await prisma.stripeWebhookEvent.update({
      where: { id: eventId },
      data: { status: 'PROCESSED', processedAt: new Date(), lastError: null },
    });
    return { ...result, eventId, eventType };
  } catch (error) {
    const message = errorMessage(error).slice(0, LAST_ERROR_MAX);
    await prisma.stripeWebhookEvent.update({
      where: { id: eventId },
      data: { status: 'FAILED', lastError: message },
    }).catch((markError: unknown) => {
      logger.error('failed to record stripe webhook failure', { eventId, error: errorMessage(markError) });
    });
    throw error;
  }
}

/**
 * Dispatcher for the hosting lifecycle events. Stripe does not guarantee
 * event ordering, so every handler is order-tolerant and only
 * checkout.session.completed may create an account.
 */
export async function handleHostingWebhookEvent(event: StripeWebhookEventLike): Promise<AnyRecord> {
  const object = asStripeRecord(event?.data?.object);
  switch (event?.type) {
    case 'checkout.session.completed':
      return handleCheckoutSessionCompleted(object);
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
      return handleSubscriptionSync(object);
    case 'customer.subscription.deleted':
      return handleSubscriptionDeleted(object);
    case 'invoice.payment_failed':
      return handleInvoicePaymentFailed(object);
    case 'invoice.paid':
      return handleInvoicePaid(object);
    default:
      return { handled: false };
  }
}

async function findAccountBySubscriptionId(
  subscriptionId: string | null,
): Promise<(HostingAccount & { plan: HostingPlan }) | null> {
  if (!subscriptionId) {
    return null;
  }
  return prisma.hostingAccount.findFirst({
    where: { stripeSubscriptionId: subscriptionId },
    include: { plan: true },
  });
}

async function handleCheckoutSessionCompleted(session: AnyRecord): Promise<AnyRecord> {
  if (session.mode !== 'subscription') {
    return { handled: false, reason: 'not_a_subscription_checkout' };
  }
  if (session.payment_status !== 'paid' && session.payment_status !== 'no_payment_required') {
    return { handled: false, reason: 'checkout_not_paid', paymentStatus: session.payment_status ?? null };
  }

  const subscriptionId = refId(session.subscription);
  if (!subscriptionId) {
    logger.error('checkout.session.completed without a subscription reference', { sessionId: session.id });
    return { handled: false, reason: 'missing_subscription' };
  }

  const subscription = await getStripe().subscriptions.retrieve(subscriptionId, {
    expand: ['items.data.price'],
  });
  const sub = asStripeRecord(subscription);
  const metadata = { ...asStripeRecord(sub.metadata), ...asStripeRecord(session.metadata) };

  const clientReference = typeof session.client_reference_id === 'string' ? session.client_reference_id : null;
  const userId = typeof metadata.userId === 'string' && metadata.userId.length > 0 ? metadata.userId : clientReference;
  let planId = typeof metadata.planId === 'string' && metadata.planId.length > 0 ? metadata.planId : null;
  const domain = typeof metadata.domain === 'string' && metadata.domain.length > 0 ? metadata.domain : undefined;

  if (!planId) {
    // Fallback: resolve the plan from the price actually subscribed.
    const priceId = subscriptionPriceId(sub);
    const plan = priceId
      ? await prisma.hostingPlan.findFirst({ where: { stripePriceId: priceId }, select: { id: true } })
      : null;
    planId = plan?.id ?? null;
  }

  const customerId = refId(session.customer) ?? refId(sub.customer);
  const user = userId
    ? await prisma.user.findUnique({ where: { id: userId }, select: { id: true, stripeCustomerId: true } })
    : null;
  if (!userId || !planId || !customerId || !user) {
    // Missing linkage is a permanent payload problem, not a transient one —
    // log loudly and accept the delivery so Stripe stops retrying it.
    logger.error('checkout.session.completed missing user/plan/customer linkage; not provisioning', {
      sessionId: session.id,
      hasUser: Boolean(userId && user),
      hasPlan: Boolean(planId),
      hasCustomer: Boolean(customerId),
    });
    return { handled: false, reason: 'missing_metadata' };
  }

  // Persist the customer link without overwriting an existing one.
  if (!user.stripeCustomerId) {
    await prisma.user.updateMany({
      where: { id: userId, stripeCustomerId: null },
      data: { stripeCustomerId: customerId },
    });
  }

  // Throws on failure on purpose: the event is marked FAILED and Stripe
  // retries the delivery; provisionPaidAccount is idempotent per
  // stripeSubscriptionId.
  const provisioned = await provisionPaidAccount({
    userId,
    planId,
    stripeCustomerId: customerId,
    stripeSubscriptionId: subscriptionId,
    subscriptionStatus: typeof sub.status === 'string' ? sub.status : 'active',
    currentPeriodEnd: subscriptionPeriodEnd(sub),
    requestedDomain: domain,
  });

  return {
    handled: true,
    accountId: provisioned?.account?.id ?? null,
    created: provisioned?.created ?? false,
  };
}

async function handleSubscriptionSync(subscription: AnyRecord): Promise<AnyRecord> {
  const subscriptionId = refId(subscription.id);
  const account = await findAccountBySubscriptionId(subscriptionId);
  if (!account) {
    // Out-of-order delivery (created/updated can arrive before
    // checkout.session.completed provisions the account) or a subscription
    // not owned by hosting — either way nothing to do.
    logger.debug('subscription event for unknown subscription; ignoring', {
      stripeSubscriptionId: subscriptionId,
      eventType: 'customer.subscription',
    });
    return { handled: false, reason: 'unknown_subscription' };
  }

  const outcome = await applyStripeSubscriptionToAccount(account, subscription);
  return { handled: true, accountId: account.id, ...outcome };
}

async function handleSubscriptionDeleted(subscription: AnyRecord): Promise<AnyRecord> {
  const subscriptionId = refId(subscription.id);
  const account = await findAccountBySubscriptionId(subscriptionId);
  if (!account) {
    logger.debug('subscription.deleted for unknown subscription; ignoring', {
      stripeSubscriptionId: subscriptionId,
    });
    return { handled: false, reason: 'unknown_subscription' };
  }

  const endsAt = subscriptionPeriodEnd(subscription);
  await applySubscriptionState(account.id, {
    subscriptionStatus: 'canceled',
    currentPeriodEnd: endsAt,
    cancelAtPeriodEnd: true,
  });
  await suspendAccount(account.id, 'SUBSCRIPTION_CANCELED');
  await notifySubscriptionCanceled(account.id, endsAt);
  return { handled: true, accountId: account.id, suspended: true };
}

async function handleInvoicePaymentFailed(invoice: AnyRecord): Promise<AnyRecord> {
  const subscriptionId = invoiceSubscriptionId(invoice);
  if (!subscriptionId) {
    return { handled: false, reason: 'not_a_subscription_invoice' };
  }
  const account = await findAccountBySubscriptionId(subscriptionId);
  if (!account) {
    logger.debug('invoice.payment_failed for unknown subscription; ignoring', {
      stripeSubscriptionId: subscriptionId,
    });
    return { handled: false, reason: 'unknown_subscription' };
  }

  await applySubscriptionState(account.id, {
    subscriptionStatus: 'past_due',
    currentPeriodEnd: account.currentPeriodEnd,
    cancelAtPeriodEnd: account.cancelAtPeriodEnd,
  });
  await notifyPaymentFailed(account.id, {
    nextRetryAt: stripeSecondsToDate(invoice.next_payment_attempt),
    hostedInvoiceUrl: typeof invoice.hosted_invoice_url === 'string' ? invoice.hosted_invoice_url : null,
  });
  return { handled: true, accountId: account.id, subscriptionStatus: 'past_due' };
}

async function handleInvoicePaid(invoice: AnyRecord): Promise<AnyRecord> {
  const subscriptionId = invoiceSubscriptionId(invoice);
  if (!subscriptionId) {
    return { handled: false, reason: 'not_a_subscription_invoice' };
  }
  const account = await findAccountBySubscriptionId(subscriptionId);
  if (!account) {
    logger.debug('invoice.paid for unknown subscription; ignoring', {
      stripeSubscriptionId: subscriptionId,
    });
    return { handled: false, reason: 'unknown_subscription' };
  }

  // Refresh the subscription for its authoritative status/period; if Stripe
  // won't give it up, fall back to clearing past_due with what we know.
  let subscription: AnyRecord | null = null;
  try {
    subscription = asStripeRecord(await getStripe().subscriptions.retrieve(subscriptionId, {
      expand: ['items.data.price'],
    }));
  } catch (error) {
    logger.warn('could not refresh subscription after invoice.paid; clearing past_due locally', {
      stripeSubscriptionId: subscriptionId,
      error: errorMessage(error),
    });
  }

  if (subscription) {
    const outcome = await applyStripeSubscriptionToAccount(account, subscription);
    return { handled: true, accountId: account.id, ...outcome };
  }

  await applySubscriptionState(account.id, {
    subscriptionStatus: 'active',
    currentPeriodEnd: account.currentPeriodEnd,
    cancelAtPeriodEnd: account.cancelAtPeriodEnd,
  });
  let activated = false;
  if (account.status === 'SUSPENDED' && account.suspendReason === 'PAYMENT_FAILED') {
    await activateAccount(account.id);
    activated = true;
  }
  return { handled: true, accountId: account.id, activated };
}

export interface SubscriptionApplyOutcome {
  planChanged: boolean;
  suspended: boolean;
  activated: boolean;
}

type SubscriptionAccount = Pick<
  HostingAccount,
  'id' | 'status' | 'suspendReason' | 'currentPeriodEnd' | 'cancelAtPeriodEnd'
> & { plan: Pick<HostingPlan, 'id' | 'stripePriceId'> | null };

/**
 * The single transition table shared by webhook handlers and the reconcile
 * job (P3): mirror the subscription state onto the account, detect a price
 * swap, then apply status transitions — active/trialing reactivates an
 * account suspended for PAYMENT_FAILED; unpaid/canceled/incomplete_expired
 * suspends it; past_due is state-only here (the reconcile job additionally
 * enforces the grace window when enforcePastDueGrace is set).
 * Never overwrites a non-payment suspension with a payment reason.
 */
export async function applyStripeSubscriptionToAccount(
  account: SubscriptionAccount,
  subscription: unknown,
  opts?: { enforcePastDueGrace?: boolean },
): Promise<SubscriptionApplyOutcome> {
  const sub = asStripeRecord(subscription);
  const status = typeof sub.status === 'string' ? sub.status : '';
  const outcome: SubscriptionApplyOutcome = { planChanged: false, suspended: false, activated: false };

  await applySubscriptionState(account.id, {
    subscriptionStatus: status,
    currentPeriodEnd: subscriptionPeriodEnd(sub),
    cancelAtPeriodEnd: Boolean(sub.cancel_at_period_end),
  });

  const priceId = subscriptionPriceId(sub);
  if (priceId && account.plan && priceId !== account.plan.stripePriceId) {
    const targetPlan = await prisma.hostingPlan.findFirst({ where: { stripePriceId: priceId } });
    if (targetPlan && targetPlan.id !== account.plan.id) {
      await changeAccountPlan(account.id, targetPlan.id);
      outcome.planChanged = true;
    }
  }

  const suspendedForOtherReason = account.status === 'SUSPENDED' && account.suspendReason !== 'PAYMENT_FAILED';
  if ((status === 'active' || status === 'trialing')
    && account.status === 'SUSPENDED' && account.suspendReason === 'PAYMENT_FAILED') {
    await activateAccount(account.id);
    outcome.activated = true;
  } else if (status === 'unpaid' || status === 'canceled' || status === 'incomplete_expired') {
    if (!suspendedForOtherReason) {
      await suspendAccount(account.id, 'PAYMENT_FAILED');
      outcome.suspended = true;
    }
  } else if (status === 'past_due' && opts?.enforcePastDueGrace) {
    const periodStart = subscriptionPeriodStart(sub);
    const graceMs = getHostingConfig().pastDueGraceDays * 24 * 60 * 60 * 1000;
    if (periodStart !== null && Date.now() - periodStart.getTime() > graceMs && !suspendedForOtherReason) {
      await suspendAccount(account.id, 'PAYMENT_FAILED');
      outcome.suspended = true;
    }
  }

  return outcome;
}
