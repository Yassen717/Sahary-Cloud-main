// Subscription reconcile job (WP01 — CONTRACT.md P3). Safety net for missed
// webhook deliveries: converges account state with what Stripe reports,
// enforces the past-due grace window statelessly from Stripe timestamps, and
// provisions paid checkouts whose checkout.session.completed never arrived.
import { schedule } from 'node-cron';
import type { ScheduledTask } from 'node-cron';
import { prisma } from '../config/database';
import { getHostingConfig } from '../config/hosting';
import {
  getStripe,
  subscriptionPeriodEnd,
  subscriptionPriceId,
} from '../services/stripeClient';
import { applyStripeSubscriptionToAccount } from '../services/stripeWebhookService';
import { provisionPaidAccount, suspendAccount } from '../services/hostingLifecycleService';
import { notifySubscriptionCanceled } from '../services/hostingNotificationService';
import logger from '../utils/logger';

interface ReconcileResult {
  checked: number;
  suspended: number;
  activated: number;
  planChanges: number;
  provisioned: number;
  errors: number;
  skipped: boolean;
}

const errorMessage = (error: unknown): string =>
  (error instanceof Error ? error.message : String(error));

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => { setTimeout(resolve, ms); });

let running = false;

async function reconcileSubscriptions(opts?: { spacingMs?: number }): Promise<ReconcileResult> {
  if (running) {
    logger.warn('subscription reconcile skipped — previous run still in flight');
    return { checked: 0, suspended: 0, activated: 0, planChanges: 0, provisioned: 0, errors: 0, skipped: true };
  }
  running = true;

  const result: ReconcileResult = {
    checked: 0, suspended: 0, activated: 0, planChanges: 0, provisioned: 0, errors: 0, skipped: false,
  };
  const spacingMs = opts?.spacingMs ?? 100;

  try {
    const stripe = getStripe();

    // 1) Drift correction: every account still linked to a subscription gets
    // the same transitions the webhook applies, plus the past-due grace rule.
    const accounts = await prisma.hostingAccount.findMany({
      where: {
        stripeSubscriptionId: { not: null },
        status: { in: ['ACTIVE', 'SUSPENDED'] },
      },
      include: { plan: true },
    });

    for (const account of accounts) {
      try {
        result.checked += 1;
        let subscription: unknown;
        try {
          subscription = await stripe.subscriptions.retrieve(
            account.stripeSubscriptionId as string,
            { expand: ['items.data.price'] },
          );
        } catch (error) {
          if ((error as { code?: unknown })?.code === 'resource_missing') {
            // Subscription is gone from Stripe — same end state as
            // customer.subscription.deleted.
            await suspendAccount(account.id, 'SUBSCRIPTION_CANCELED');
            await notifySubscriptionCanceled(account.id, null);
            result.suspended += 1;
            await sleep(spacingMs);
            continue;
          }
          throw error;
        }

        const outcome = await applyStripeSubscriptionToAccount(account, subscription, {
          enforcePastDueGrace: true,
        });
        if (outcome.planChanged) result.planChanges += 1;
        if (outcome.activated) result.activated += 1;
        if (outcome.suspended) result.suspended += 1;
      } catch (error) {
        result.errors += 1;
        logger.error('subscription reconcile failed for account', {
          accountId: account.id,
          error: errorMessage(error),
        });
      }
      await sleep(spacingMs);
    }

    // 2) Missed-webhook sweep: Stripe customers with a live subscription but
    // no live hosting account paid without ever being provisioned.
    const orphanUsers = await prisma.user.findMany({
      where: {
        stripeCustomerId: { not: null },
        hostingAccounts: { none: { status: { not: 'TERMINATED' } } },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: { id: true, stripeCustomerId: true },
    });

    for (const user of orphanUsers) {
      try {
        const list = await stripe.subscriptions.list({
          customer: user.stripeCustomerId as string,
          status: 'all',
          limit: 20,
        });
        const live = list.data.find((s) => s.status === 'active' || s.status === 'trialing');
        if (live) {
          const metadata = (live.metadata ?? {}) as Record<string, unknown>;
          let planId = typeof metadata.planId === 'string' && metadata.planId.length > 0 ? metadata.planId : null;
          if (!planId) {
            const priceId = subscriptionPriceId(live);
            const plan = priceId
              ? await prisma.hostingPlan.findFirst({ where: { stripePriceId: priceId }, select: { id: true } })
              : null;
            planId = plan?.id ?? null;
          }
          if (!planId) {
            result.errors += 1;
            logger.error('cannot provision missed subscription — no plan mapping', {
              stripeSubscriptionId: live.id,
            });
          } else {
            await provisionPaidAccount({
              userId: user.id,
              planId,
              stripeCustomerId: user.stripeCustomerId as string,
              stripeSubscriptionId: live.id,
              subscriptionStatus: live.status,
              currentPeriodEnd: subscriptionPeriodEnd(live),
              requestedDomain: typeof metadata.domain === 'string' ? metadata.domain : undefined,
            });
            result.provisioned += 1;
          }
        }
      } catch (error) {
        result.errors += 1;
        logger.error('missed-webhook provisioning failed', {
          userId: user.id,
          error: errorMessage(error),
        });
      }
      await sleep(spacingMs);
    }

    logger.info('subscription reconcile finished', { ...result });
    return result;
  } finally {
    running = false;
  }
}

let task: ScheduledTask | null = null;

const job = {
  start(): void {
    if (task) {
      return;
    }
    task = schedule(getHostingConfig().cron.reconcile, () => {
      void reconcileSubscriptions();
    });
    logger.info('hostingReconcileJob started', { schedule: getHostingConfig().cron.reconcile });
  },
  stop(): void {
    task?.stop();
    task = null;
  },
  reconcileSubscriptions,
};

export = job;
