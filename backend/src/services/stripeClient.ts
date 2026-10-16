// Lazy Stripe client plus small, API-version-tolerant accessors over Stripe
// objects. Shared by the hosting plans controller, the webhook service and
// the reconcile job (WP01 — CONTRACT.md P3).
import Stripe from 'stripe';
import { httpError } from '../utils/httpError';

let client: Stripe | null = null;

/**
 * The single shared Stripe client. Built on first use so a missing
 * STRIPE_SECRET_KEY fails billing paths only — never app boot.
 * apiVersion is intentionally not pinned: the SDK's bundled default tracks
 * the account's API version, and every reader below tolerates both the
 * top-level and the item-level period fields across API versions.
 */
export function getStripe(): Stripe {
  if (client) {
    return client;
  }
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw httpError(503, 'Billing is not configured');
  }
  client = new Stripe(secretKey);
  return client;
}

/** Test seam: drop the cached client so env changes take effect. */
export function resetStripeClient(): void {
  client = null;
}

type AnyRecord = Record<string, any>;

export const asStripeRecord = (value: unknown): AnyRecord =>
  (value !== null && typeof value === 'object' ? (value as AnyRecord) : {});

/** Expandable Stripe fields arrive either as an id string or a hydrated object. */
export const refId = (value: unknown): string | null => {
  if (typeof value === 'string' && value.length > 0) {
    return value;
  }
  const { id } = asStripeRecord(value);
  return typeof id === 'string' && id.length > 0 ? id : null;
};

/** Stripe timestamps are unix seconds. */
export const stripeSecondsToDate = (value: unknown): Date | null =>
  (typeof value === 'number' && Number.isFinite(value) ? new Date(value * 1000) : null);

const firstSubscriptionItem = (subscription: unknown): AnyRecord => {
  const items = asStripeRecord(asStripeRecord(subscription).items);
  const { data } = items;
  return Array.isArray(data) && data.length > 0 ? asStripeRecord(data[0]) : {};
};

/**
 * current_period_end moved from the subscription object onto subscription
 * items in newer Stripe API versions — read whichever is present.
 */
export const subscriptionPeriodEnd = (subscription: unknown): Date | null => {
  const sub = asStripeRecord(subscription);
  return stripeSecondsToDate(sub.current_period_end)
    ?? stripeSecondsToDate(firstSubscriptionItem(subscription).current_period_end);
};

export const subscriptionPeriodStart = (subscription: unknown): Date | null => {
  const sub = asStripeRecord(subscription);
  return stripeSecondsToDate(sub.current_period_start)
    ?? stripeSecondsToDate(firstSubscriptionItem(subscription).current_period_start);
};

export const subscriptionItemId = (subscription: unknown): string | null =>
  refId(firstSubscriptionItem(subscription).id);

export const subscriptionPriceId = (subscription: unknown): string | null =>
  refId(firstSubscriptionItem(subscription).price);

/**
 * The subscription an invoice belongs to. invoice.subscription moved to
 * invoice.parent.subscription_details.subscription in newer API versions.
 */
export const invoiceSubscriptionId = (invoice: unknown): string | null => {
  const inv = asStripeRecord(invoice);
  const parentDetails = asStripeRecord(asStripeRecord(inv.parent).subscription_details);
  return refId(inv.subscription) ?? refId(parentDetails.subscription);
};
