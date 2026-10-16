// Hosting subscription endpoints (WP01 — CONTRACT.md section 7):
// subscribe via Stripe Checkout, plan change with proration, cancel/resume
// at period end, billing portal, and the account's subscription summary.
import type { Response } from 'express';
import { z } from 'zod';
import type { HostingAccount, HostingPlan } from '@prisma/client';
import { prisma } from '../config/database';
import {
  getStripe,
  subscriptionItemId,
  subscriptionPeriodEnd,
} from '../services/stripeClient';
import { ensureStripeCustomer } from '../services/stripeBillingService';
import { LIVE_SUBSCRIPTION_STATUSES } from '../services/stripeWebhookService';
import {
  applySubscriptionState,
  changeAccountPlan,
} from '../services/hostingLifecycleService';
import { toPlanDTO } from '../services/hostingDto';
import { handleHostingError, sendOk } from './hosting/helpers';
import { httpError } from '../utils/httpError';
import type { HostingRequest } from '../middlewares/hostingAccount';
import type {
  CheckoutSessionDTO,
  HostingAccountStatus,
  HostingSubscriptionSummary,
  PortalSessionDTO,
  SubscriptionStatusDTO,
} from '../types/hosting';
import logger from '../utils/logger';

// Same rule as controllers/hostingController.ts — keep in sync.
const DOMAIN_REGEX = /^(?:[a-z0-9](?:[a-z0-9\-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i;

const planIdField = z.string({ required_error: 'planId is required' }).min(1, 'planId is required');

const subscribeSchema = z.object({
  planId: planIdField,
  domain: z.string().max(253).regex(DOMAIN_REGEX, 'Invalid domain format').optional(),
});

const changePlanSchema = z.object({ planId: planIdField });

type AccountWithPlan = HostingAccount & { plan: HostingPlan };

const frontendUrl = (): string => process.env.FRONTEND_URL || 'http://localhost:3001';

const requireUserId = (req: HostingRequest): string => {
  const userId = req.user?.userId;
  if (!userId) {
    throw httpError(401, 'Authentication required');
  }
  return userId;
};

const requireHostingAccount = (req: HostingRequest): AccountWithPlan => {
  if (!req.hostingAccount) {
    throw httpError(404, 'No hosting account found');
  }
  return req.hostingAccount;
};

const toSubscriptionSummary = (account: HostingAccount): HostingSubscriptionSummary | null => {
  if (account.stripeSubscriptionId === null && account.subscriptionStatus === null) {
    return null;
  }
  return {
    status: account.subscriptionStatus,
    currentPeriodEnd: account.currentPeriodEnd ? account.currentPeriodEnd.toISOString() : null,
    cancelAtPeriodEnd: account.cancelAtPeriodEnd,
  };
};

const toSubscriptionStatusDTO = (account: AccountWithPlan): SubscriptionStatusDTO => ({
  hasSubscription: Boolean(account.stripeSubscriptionId),
  subscription: toSubscriptionSummary(account),
  plan: toPlanDTO(account.plan),
  accountStatus: account.status as HostingAccountStatus,
});

const reloadAccount = async (accountId: string): Promise<AccountWithPlan> =>
  prisma.hostingAccount.findUniqueOrThrow({ where: { id: accountId }, include: { plan: true } });

const errorMessage = (error: unknown): string =>
  (error instanceof Error ? error.message : String(error));

const stripeErrorCode = (error: unknown): string | null =>
  ((error as { code?: unknown })?.code as string) ?? null;

/**
 * Wrap a Stripe mutation so upstream failures surface as 502 and a vanished
 * subscription as 409 — never a bare 500.
 */
async function callStripe<T>(fn: () => Promise<T>, failureMessage: string): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if ((error as { status?: number; expose?: boolean })?.expose === true) {
      throw error;
    }
    if (stripeErrorCode(error) === 'resource_missing') {
      throw httpError(409, 'The Stripe subscription no longer exists');
    }
    logger.error('stripe api call failed', { error: errorMessage(error) });
    throw httpError(502, failureMessage);
  }
}

class HostingPlansController {
  static async subscribe(req: HostingRequest, res: Response): Promise<void> {
    try {
      const userId = requireUserId(req);
      const parsed = subscribeSchema.safeParse(req.body);
      if (!parsed.success) {
        throw httpError(400, parsed.error.errors[0]?.message ?? 'Invalid request');
      }
      const { planId } = parsed.data;
      const domain = parsed.data.domain?.toLowerCase();

      const plan = await prisma.hostingPlan.findUnique({ where: { id: planId } });
      if (!plan || !plan.isActive) {
        throw httpError(400, 'Hosting plan not found or inactive');
      }
      if (!plan.stripePriceId) {
        throw httpError(503, 'This plan is not available for purchase yet');
      }

      const existingAccount = await prisma.hostingAccount.findFirst({
        where: { userId, status: { not: 'TERMINATED' } },
        select: { id: true },
      });
      if (existingAccount) {
        throw httpError(409, 'You already have a hosting account');
      }

      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user) {
        throw httpError(404, 'User not found');
      }

      const stripe = getStripe();
      const customerId = await ensureStripeCustomer(user);

      // Double-charge guard: if the customer already owns a live
      // subscription in Stripe, never open a second paid checkout.
      const existingSubs = await stripe.subscriptions.list({
        customer: customerId,
        status: 'all',
        limit: 100,
      });
      if (existingSubs.data.some((s) => (LIVE_SUBSCRIPTION_STATUSES as readonly string[]).includes(s.status))) {
        throw httpError(409, 'An active subscription already exists for this account');
      }

      const metadata: Record<string, string> = { userId, planId };
      if (domain) {
        metadata.domain = domain;
      }

      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        customer: customerId,
        line_items: [{ price: plan.stripePriceId, quantity: 1 }],
        client_reference_id: userId,
        metadata,
        subscription_data: { metadata },
        allow_promotion_codes: true,
        success_url: `${frontendUrl()}/dashboard/subscription?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${frontendUrl()}/pricing?checkout=cancelled`,
      });

      const dto: CheckoutSessionDTO = { checkoutUrl: session.url ?? '', sessionId: session.id };
      sendOk(res, dto, { status: 201, message: 'Checkout session created' });
    } catch (error) {
      handleHostingError(res, error, 'Failed to create checkout session');
    }
  }

  static async changePlan(req: HostingRequest, res: Response): Promise<void> {
    try {
      const account = requireHostingAccount(req);
      const parsed = changePlanSchema.safeParse(req.body);
      if (!parsed.success) {
        throw httpError(400, parsed.error.errors[0]?.message ?? 'Invalid request');
      }
      const { planId } = parsed.data;

      if (!account.stripeSubscriptionId) {
        throw httpError(409, 'This account has no Stripe subscription to change');
      }

      const target = await prisma.hostingPlan.findUnique({ where: { id: planId } });
      if (!target || !target.isActive) {
        throw httpError(400, 'Hosting plan not found or inactive');
      }
      if (target.id === account.planId) {
        throw httpError(409, 'You are already subscribed to this plan');
      }
      if (!target.stripePriceId) {
        throw httpError(503, 'This plan is not available for purchase yet');
      }

      // Downgrade guard: refuse the switch when current usage cannot fit the
      // target plan — the message names every violated limit (P3).
      const [domainCount, databaseCount] = await Promise.all([
        prisma.hostingDomain.count({ where: { accountId: account.id } }),
        prisma.hostingDatabase.count({ where: { accountId: account.id } }),
      ]);
      const violations: string[] = [];
      if (account.diskUsed > target.diskGB) {
        violations.push(`disk usage ${account.diskUsed.toFixed(1)} GB exceeds the ${target.diskGB} GB plan limit`);
      }
      if (domainCount > target.maxDomains) {
        violations.push(`${domainCount} domains exceed the plan limit of ${target.maxDomains}`);
      }
      if (databaseCount > target.maxDatabases) {
        violations.push(`${databaseCount} databases exceed the plan limit of ${target.maxDatabases}`);
      }
      if (violations.length > 0) {
        throw httpError(409, `Cannot switch to the ${target.name} plan: ${violations.join('; ')}`);
      }

      const stripe = getStripe();
      const subscription = await callStripe(async () => {
        const current = await stripe.subscriptions.retrieve(account.stripeSubscriptionId as string);
        const itemId = subscriptionItemId(current);
        if (!itemId) {
          throw httpError(502, 'Subscription has no billable items to update');
        }
        return stripe.subscriptions.update(account.stripeSubscriptionId as string, {
          items: [{ id: itemId, price: target.stripePriceId as string }],
          proration_behavior: 'create_prorations',
        });
      }, 'Could not update the subscription with the payment provider');

      // Apply the new plan immediately — the subscription.updated webhook
      // will converge to the same state and is idempotent.
      await applySubscriptionState(account.id, {
        subscriptionStatus: typeof subscription.status === 'string' ? subscription.status : (account.subscriptionStatus ?? 'active'),
        currentPeriodEnd: subscriptionPeriodEnd(subscription) ?? account.currentPeriodEnd,
        cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end),
      });
      await changeAccountPlan(account.id, target.id);

      sendOk(res, toSubscriptionStatusDTO(await reloadAccount(account.id)), { message: 'Plan updated' });
    } catch (error) {
      handleHostingError(res, error, 'Failed to change hosting plan');
    }
  }

  static async cancelSubscription(req: HostingRequest, res: Response): Promise<void> {
    try {
      const account = requireHostingAccount(req);
      if (!account.stripeSubscriptionId) {
        throw httpError(409, 'This account has no Stripe subscription to cancel');
      }

      const subscription = await callStripe(
        () => getStripe().subscriptions.update(account.stripeSubscriptionId as string, {
          cancel_at_period_end: true,
        }),
        'Could not cancel the subscription with the payment provider',
      );

      await applySubscriptionState(account.id, {
        subscriptionStatus: typeof subscription.status === 'string' ? subscription.status : (account.subscriptionStatus ?? 'active'),
        currentPeriodEnd: subscriptionPeriodEnd(subscription) ?? account.currentPeriodEnd,
        cancelAtPeriodEnd: true,
      });

      sendOk(res, toSubscriptionStatusDTO(await reloadAccount(account.id)), {
        message: 'Subscription will cancel at the end of the current billing period',
      });
    } catch (error) {
      handleHostingError(res, error, 'Failed to cancel subscription');
    }
  }

  static async resumeSubscription(req: HostingRequest, res: Response): Promise<void> {
    try {
      const account = requireHostingAccount(req);
      if (!account.stripeSubscriptionId) {
        throw httpError(409, 'This account has no Stripe subscription to resume');
      }

      const subscription = await callStripe(
        () => getStripe().subscriptions.update(account.stripeSubscriptionId as string, {
          cancel_at_period_end: false,
        }),
        'Could not resume the subscription with the payment provider',
      );

      await applySubscriptionState(account.id, {
        subscriptionStatus: typeof subscription.status === 'string' ? subscription.status : (account.subscriptionStatus ?? 'active'),
        currentPeriodEnd: subscriptionPeriodEnd(subscription) ?? account.currentPeriodEnd,
        cancelAtPeriodEnd: false,
      });

      sendOk(res, toSubscriptionStatusDTO(await reloadAccount(account.id)), { message: 'Subscription resumed' });
    } catch (error) {
      handleHostingError(res, error, 'Failed to resume subscription');
    }
  }

  static async createPortalSession(req: HostingRequest, res: Response): Promise<void> {
    try {
      const account = requireHostingAccount(req);
      const user = await prisma.user.findUnique({
        where: { id: account.userId },
        select: { stripeCustomerId: true },
      });
      if (!user?.stripeCustomerId) {
        throw httpError(409, 'No billing profile exists for this account yet');
      }

      const session = await callStripe(
        () => getStripe().billingPortal.sessions.create({
          customer: user.stripeCustomerId as string,
          return_url: `${frontendUrl()}/dashboard/subscription`,
        }),
        'Could not create the billing portal session',
      );

      const dto: PortalSessionDTO = { portalUrl: session.url };
      sendOk(res, dto, { message: 'Billing portal session created' });
    } catch (error) {
      handleHostingError(res, error, 'Failed to create billing portal session');
    }
  }

  static async getSubscription(req: HostingRequest, res: Response): Promise<void> {
    try {
      const userId = requireUserId(req);
      const account = await prisma.hostingAccount.findFirst({
        where: { userId, status: { not: 'TERMINATED' } },
        include: { plan: true },
      });
      if (!account) {
        const dto: SubscriptionStatusDTO = {
          hasSubscription: false,
          subscription: null,
          plan: null,
          accountStatus: null,
        };
        sendOk(res, dto);
        return;
      }
      sendOk(res, toSubscriptionStatusDTO(account));
    } catch (error) {
      handleHostingError(res, error, 'Failed to load subscription');
    }
  }
}

export default HostingPlansController;
