/**
 * WP01 — Stripe webhook pipeline tests.
 * Real per-worktree test DB; Stripe client is mocked (jest.mock stripeClient),
 * lifecycle/notification collaborators are jest mocks. No real Stripe calls.
 */
import { prisma } from '../../src/config/database';

const mockStripe = {
  subscriptions: {
    retrieve: jest.fn(),
    update: jest.fn(),
    cancel: jest.fn(),
    list: jest.fn(),
  },
  checkout: { sessions: { create: jest.fn() } },
  billingPortal: { sessions: { create: jest.fn() } },
  customers: { create: jest.fn() },
  products: { create: jest.fn() },
  prices: { create: jest.fn(), retrieve: jest.fn(), update: jest.fn() },
};

jest.mock('../../src/services/stripeClient', () => ({
  ...jest.requireActual('../../src/services/stripeClient'),
  getStripe: () => mockStripe,
}));

jest.mock('../../src/services/hostingLifecycleService', () => ({
  provisionPaidAccount: jest.fn(),
  suspendAccount: jest.fn(),
  activateAccount: jest.fn(),
  changeAccountPlan: jest.fn(),
  applySubscriptionState: jest.fn(),
  retryProvisioning: jest.fn(),
  terminateAccountById: jest.fn(),
}));

jest.mock('../../src/services/hostingNotificationService', () => ({
  notifyAccountProvisioned: jest.fn(),
  notifyAccountSuspended: jest.fn(),
  notifyAccountReactivated: jest.fn(),
  notifyPaymentFailed: jest.fn(),
  notifySubscriptionCanceled: jest.fn(),
  notifyQuotaAlert: jest.fn(),
  notifySslIssued: jest.fn(),
  notifySslExpiring: jest.fn(),
  notifySslFailed: jest.fn(),
}));

import { handleHostingWebhookEvent, processStripeEvent } from '../../src/services/stripeWebhookService';
import {
  provisionPaidAccount,
  suspendAccount,
  activateAccount,
  changeAccountPlan,
  applySubscriptionState,
} from '../../src/services/hostingLifecycleService';
import {
  notifyPaymentFailed,
  notifySubscriptionCanceled,
} from '../../src/services/hostingNotificationService';

const request = require('supertest');
const RealStripe = require('stripe');
const app = require('../../src/index');

const provisionMock = provisionPaidAccount as jest.Mock;
const suspendMock = suspendAccount as jest.Mock;
const activateMock = activateAccount as jest.Mock;
const changePlanMock = changeAccountPlan as jest.Mock;
const applyStateMock = applySubscriptionState as jest.Mock;
const notifyPaymentFailedMock = notifyPaymentFailed as jest.Mock;
const notifyCanceledMock = notifySubscriptionCanceled as jest.Mock;

let seq = 0;
const uid = (prefix: string): string => `${prefix}_${Date.now().toString(36)}_${(seq += 1)}`;
const nowSec = (): number => Math.floor(Date.now() / 1000);
const sleep = (ms: number): Promise<void> => new Promise((resolve) => { setTimeout(resolve, ms); });

const created = { users: [] as string[], plans: [] as string[], accounts: [] as string[] };

const createUser = async (overrides: Record<string, any> = {}) => {
  const user = await prisma.user.create({
    data: {
      email: `${uid('wp01wh')}@test.dev`,
      password: 'not-a-real-hash',
      firstName: 'WP01',
      lastName: 'Webhook',
      isVerified: true,
      ...overrides,
    },
  });
  created.users.push(user.id);
  return user;
};

const createPlan = async (overrides: Record<string, any> = {}) => {
  const plan = await prisma.hostingPlan.create({
    data: {
      name: uid('wp01wh-plan'),
      diskGB: 10,
      bandwidthGB: 100,
      maxDomains: 2,
      maxDatabases: 1,
      maxFtpAccounts: 1,
      monthlyPrice: 5.5,
      stripePriceId: `price_${uid('wp01wh')}`,
      isActive: true,
      ...overrides,
    },
  });
  created.plans.push(plan.id);
  return plan;
};

const createAccount = async (userId: string, planId: string, overrides: Record<string, any> = {}) => {
  const account = await prisma.hostingAccount.create({
    data: {
      domain: `${uid('wp01wh')}.test.dev`,
      userId,
      planId,
      diskQuota: 10,
      bandwidthQuota: 100,
      status: 'ACTIVE',
      stripeSubscriptionId: `sub_${uid('wp01wh')}`,
      subscriptionStatus: 'active',
      currentPeriodEnd: new Date(Date.now() + 30 * 86400_000),
      ...overrides,
    },
  });
  created.accounts.push(account.id);
  return account;
};

const stripeSubscription = (id: string, status: string, opts: Record<string, any> = {}) => ({
  id,
  object: 'subscription',
  status,
  cancel_at_period_end: false,
  current_period_start: nowSec() - 3600,
  current_period_end: nowSec() + 30 * 86400,
  customer: 'cus_test',
  metadata: {},
  items: {
    object: 'list',
    data: [
      {
        id: `si_${id}`,
        price: { id: 'price_test' },
        current_period_start: nowSec() - 3600,
        current_period_end: nowSec() + 30 * 86400,
      },
    ],
  },
  ...opts,
});

const stripeInvoice = (id: string, subscriptionRef: unknown, opts: Record<string, any> = {}) => ({
  id,
  object: 'invoice',
  subscription: subscriptionRef,
  hosted_invoice_url: 'https://invoice.stripe.com/i/test',
  next_payment_attempt: nowSec() + 86400,
  ...opts,
});

const checkoutSession = (opts: Record<string, any> = {}) => ({
  id: `cs_${uid('wp01wh')}`,
  object: 'checkout.session',
  mode: 'subscription',
  payment_status: 'paid',
  subscription: `sub_${uid('wp01wh')}`,
  customer: `cus_${uid('wp01wh')}`,
  client_reference_id: null,
  metadata: {},
  ...opts,
});

const eventOf = (type: string, object: unknown, id?: string) => ({
  id: id ?? uid('evt_wp01wh'),
  type,
  data: { object },
});

const WEBHOOK_SECRET = 'whsec_wp01_test_secret';
const stripeForSig = RealStripe('sk_test_wp01');
const signPayload = (payload: string): string =>
  stripeForSig.webhooks.generateTestHeaderString({ payload, secret: WEBHOOK_SECRET });

afterAll(async () => {
  await prisma.stripeWebhookEvent.deleteMany({ where: { id: { startsWith: 'evt_wp01wh' } } });
  if (created.accounts.length > 0) {
    await prisma.hostingAccount.deleteMany({ where: { id: { in: created.accounts } } });
  }
  if (created.plans.length > 0) {
    await prisma.hostingPlan.deleteMany({ where: { id: { in: created.plans } } });
  }
  if (created.users.length > 0) {
    await prisma.auditLog.deleteMany({ where: { userId: { in: created.users } } });
    await prisma.user.deleteMany({ where: { id: { in: created.users } } });
  }
  await prisma.$disconnect();
});

describe('processStripeEvent — persistent idempotency', () => {
  const okDispatch = () => jest.fn(async () => ({ handled: true }));

  test('claims, processes and marks PROCESSED; identical redelivery is a duplicate no-op', async () => {
    const id = uid('evt_wp01wh');
    const dispatch = okDispatch();
    const event = eventOf('invoice.paid', { id: 'in_x' }, id);

    const first = await processStripeEvent(event, dispatch);
    expect(first.handled).toBe(true);
    expect(first.eventId).toBe(id);
    expect(first.eventType).toBe('invoice.paid');

    const second = await processStripeEvent(event, dispatch);
    expect(second.duplicate).toBe(true);
    expect(second.eventId).toBe(id);
    expect(dispatch).toHaveBeenCalledTimes(1);

    const row = await prisma.stripeWebhookEvent.findUnique({ where: { id } });
    expect(row?.status).toBe('PROCESSED');
    expect(row?.processedAt).not.toBeNull();
    expect(row?.attempts).toBe(1);
  });

  test('handler failure marks FAILED (truncated lastError) and the redelivery re-runs', async () => {
    const id = uid('evt_wp01wh');
    const dispatch = jest.fn()
      .mockRejectedValueOnce(new Error('x'.repeat(600)))
      .mockResolvedValueOnce({ handled: true });

    await expect(processStripeEvent(eventOf('x.y', {}, id), dispatch)).rejects.toThrow();
    let row = await prisma.stripeWebhookEvent.findUnique({ where: { id } });
    expect(row?.status).toBe('FAILED');
    expect(row?.lastError?.length).toBeLessThanOrEqual(500);

    const retry = await processStripeEvent(eventOf('x.y', {}, id), dispatch);
    expect(retry.handled).toBe(true);
    row = await prisma.stripeWebhookEvent.findUnique({ where: { id } });
    expect(row?.status).toBe('PROCESSED');
    expect(row?.attempts).toBe(2);
    expect(dispatch).toHaveBeenCalledTimes(2);
  });

  test('concurrent duplicate deliveries run the handler exactly once', async () => {
    const id = uid('evt_wp01wh');
    const dispatch = jest.fn(async () => {
      await sleep(50);
      return { handled: true };
    });
    const event = eventOf('x.y', {}, id);

    const [a, b] = await Promise.all([
      processStripeEvent(event, dispatch),
      processStripeEvent(event, dispatch),
    ]);
    expect(dispatch).toHaveBeenCalledTimes(1);
    const results = [a, b];
    expect(results.filter((r) => r.duplicate === true)).toHaveLength(1);
    expect(results.filter((r) => r.duplicate !== true)).toHaveLength(1);
  });

  test('a stale PROCESSING row (> 5 min) is re-claimed and completed', async () => {
    const id = uid('evt_wp01wh');
    await prisma.stripeWebhookEvent.create({
      data: {
        id,
        type: 'x.y',
        status: 'PROCESSING',
        attempts: 3,
        updatedAt: new Date(Date.now() - 10 * 60 * 1000),
      },
    });

    const dispatch = okDispatch();
    const res = await processStripeEvent(eventOf('x.y', {}, id), dispatch);
    expect(res.handled).toBe(true);
    expect(res.duplicate).toBeUndefined();
    expect(dispatch).toHaveBeenCalledTimes(1);

    const row = await prisma.stripeWebhookEvent.findUnique({ where: { id } });
    expect(row?.status).toBe('PROCESSED');
    expect(row?.attempts).toBe(4);
  });

  test('a fresh PROCESSING row is not re-claimed while another worker holds it', async () => {
    const id = uid('evt_wp01wh');
    await prisma.stripeWebhookEvent.create({
      data: { id, type: 'x.y', status: 'PROCESSING' },
    });
    const dispatch = okDispatch();
    const res = await processStripeEvent(eventOf('x.y', {}, id), dispatch);
    expect(res.duplicate).toBe(true);
    expect(dispatch).not.toHaveBeenCalled();
  });

  test('PROCESSED events are never reprocessed', async () => {
    const id = uid('evt_wp01wh');
    await prisma.stripeWebhookEvent.create({
      data: { id, type: 'x.y', status: 'PROCESSED', processedAt: new Date() },
    });
    const dispatch = okDispatch();
    const res = await processStripeEvent(eventOf('x.y', {}, id), dispatch);
    expect(res.duplicate).toBe(true);
    expect(dispatch).not.toHaveBeenCalled();
  });
});

describe('handleHostingWebhookEvent — checkout.session.completed', () => {
  test('provisions a paid subscription and persists the Stripe customer id', async () => {
    const user = await createUser();
    const plan = await createPlan();
    const subId = `sub_${uid('wp01wh')}`;
    const customerId = `cus_${uid('wp01wh')}`;
    mockStripe.subscriptions.retrieve.mockResolvedValue(stripeSubscription(subId, 'active', {
      customer: customerId,
      metadata: { planId: plan.id },
    }));
    provisionMock.mockResolvedValue({ account: { id: 'acct_wp01_1' }, created: true });

    const session = checkoutSession({
      subscription: subId,
      customer: customerId,
      client_reference_id: user.id,
      metadata: { userId: user.id, planId: plan.id, domain: 'custom.example.com' },
    });
    const result = await handleHostingWebhookEvent(eventOf('checkout.session.completed', session));

    expect(result.handled).toBe(true);
    expect(result.accountId).toBe('acct_wp01_1');
    expect(provisionMock).toHaveBeenCalledTimes(1);
    expect(provisionMock).toHaveBeenCalledWith({
      userId: user.id,
      planId: plan.id,
      stripeCustomerId: customerId,
      stripeSubscriptionId: subId,
      subscriptionStatus: 'active',
      currentPeriodEnd: expect.any(Date),
      requestedDomain: 'custom.example.com',
    });
    const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
    expect(dbUser?.stripeCustomerId).toBe(customerId);
  });

  test('falls back to client_reference_id and resolves the plan via the price id', async () => {
    const user = await createUser();
    const plan = await createPlan();
    const subId = `sub_${uid('wp01wh')}`;
    mockStripe.subscriptions.retrieve.mockResolvedValue(stripeSubscription(subId, 'active', {
      items: { data: [{ id: `si_${subId}`, price: { id: plan.stripePriceId } }] },
    }));
    provisionMock.mockResolvedValue({ account: { id: 'acct_wp01_2' }, created: true });

    const session = checkoutSession({
      subscription: subId,
      client_reference_id: user.id,
      metadata: {},
    });
    const result = await handleHostingWebhookEvent(eventOf('checkout.session.completed', session));

    expect(result.handled).toBe(true);
    expect(provisionMock).toHaveBeenCalledWith(expect.objectContaining({
      userId: user.id,
      planId: plan.id,
      stripeSubscriptionId: subId,
    }));
  });

  test('ignores non-subscription mode and unpaid sessions without retrying', async () => {
    const a = await handleHostingWebhookEvent(eventOf('checkout.session.completed', checkoutSession({ mode: 'payment' })));
    expect(a).toMatchObject({ handled: false, reason: 'not_a_subscription_checkout' });

    const b = await handleHostingWebhookEvent(eventOf('checkout.session.completed', checkoutSession({ payment_status: 'unpaid' })));
    expect(b).toMatchObject({ handled: false, reason: 'checkout_not_paid' });
    expect(mockStripe.subscriptions.retrieve).not.toHaveBeenCalled();
    expect(provisionMock).not.toHaveBeenCalled();
  });

  test('missing linkage -> handled:false, no provisioning', async () => {
    mockStripe.subscriptions.retrieve.mockResolvedValue(stripeSubscription(`sub_${uid('wp01wh')}`, 'active'));
    const session = checkoutSession({ metadata: {}, client_reference_id: null });
    const result = await handleHostingWebhookEvent(eventOf('checkout.session.completed', session));
    expect(result).toMatchObject({ handled: false, reason: 'missing_metadata' });
    expect(provisionMock).not.toHaveBeenCalled();
  });
});

describe('handleHostingWebhookEvent — subscription lifecycle', () => {
  test('customer.subscription.updated mirrors state and detects a plan change', async () => {
    const user = await createUser();
    const planA = await createPlan();
    const planB = await createPlan();
    const account = await createAccount(user.id, planA.id);
    const sub = stripeSubscription(account.stripeSubscriptionId as string, 'active', {
      cancel_at_period_end: true,
      items: { data: [{ id: `si_${account.stripeSubscriptionId}`, price: { id: planB.stripePriceId } }] },
    });

    const res = await handleHostingWebhookEvent(eventOf('customer.subscription.updated', sub));
    expect(res.handled).toBe(true);
    expect(applyStateMock).toHaveBeenCalledWith(account.id, {
      subscriptionStatus: 'active',
      currentPeriodEnd: expect.any(Date),
      cancelAtPeriodEnd: true,
    });
    expect(changePlanMock).toHaveBeenCalledWith(account.id, planB.id);
    expect(suspendMock).not.toHaveBeenCalled();
    expect(activateMock).not.toHaveBeenCalled();
  });

  test('customer.subscription.created for an unknown subscription is ignored', async () => {
    const res = await handleHostingWebhookEvent(
      eventOf('customer.subscription.created', stripeSubscription(`sub_${uid('wp01wh')}`, 'active')),
    );
    expect(res).toMatchObject({ handled: false, reason: 'unknown_subscription' });
    expect(applyStateMock).not.toHaveBeenCalled();
  });

  test.each(['unpaid', 'canceled', 'incomplete_expired'])(
    'subscription.updated %s suspends the account for PAYMENT_FAILED',
    async (status) => {
      const user = await createUser();
      const plan = await createPlan();
      const account = await createAccount(user.id, plan.id);
      const res = await handleHostingWebhookEvent(
        eventOf('customer.subscription.updated', stripeSubscription(account.stripeSubscriptionId as string, status)),
      );
      expect(res.handled).toBe(true);
      expect(suspendMock).toHaveBeenCalledWith(account.id, 'PAYMENT_FAILED');
    },
  );

  test('subscription.updated past_due updates state only (no suspension)', async () => {
    const user = await createUser();
    const plan = await createPlan();
    const account = await createAccount(user.id, plan.id);
    await handleHostingWebhookEvent(
      eventOf('customer.subscription.updated', stripeSubscription(account.stripeSubscriptionId as string, 'past_due')),
    );
    expect(applyStateMock).toHaveBeenCalledWith(account.id, expect.objectContaining({ subscriptionStatus: 'past_due' }));
    expect(suspendMock).not.toHaveBeenCalled();
  });

  test('subscription.updated active reactivates a PAYMENT_FAILED suspension', async () => {
    const user = await createUser();
    const plan = await createPlan();
    const account = await createAccount(user.id, plan.id, {
      status: 'SUSPENDED',
      suspendReason: 'PAYMENT_FAILED',
      suspendedAt: new Date(),
    });
    await handleHostingWebhookEvent(
      eventOf('customer.subscription.updated', stripeSubscription(account.stripeSubscriptionId as string, 'active')),
    );
    expect(activateMock).toHaveBeenCalledWith(account.id);
    expect(suspendMock).not.toHaveBeenCalled();
  });

  test('subscription.updated active never lifts a non-payment suspension', async () => {
    const user = await createUser();
    const plan = await createPlan();
    const account = await createAccount(user.id, plan.id, {
      status: 'SUSPENDED',
      suspendReason: 'ADMIN',
      suspendedAt: new Date(),
    });
    await handleHostingWebhookEvent(
      eventOf('customer.subscription.updated', stripeSubscription(account.stripeSubscriptionId as string, 'active')),
    );
    expect(activateMock).not.toHaveBeenCalled();
    expect(suspendMock).not.toHaveBeenCalled();
  });

  test('customer.subscription.deleted suspends SUBSCRIPTION_CANCELED and notifies', async () => {
    const user = await createUser();
    const plan = await createPlan();
    const account = await createAccount(user.id, plan.id);
    const periodEnd = nowSec() + 15 * 86400;
    const sub = stripeSubscription(account.stripeSubscriptionId as string, 'canceled', {
      current_period_end: periodEnd,
    });

    const res = await handleHostingWebhookEvent(eventOf('customer.subscription.deleted', sub));
    expect(res.handled).toBe(true);
    expect(suspendMock).toHaveBeenCalledWith(account.id, 'SUBSCRIPTION_CANCELED');
    expect(notifyCanceledMock).toHaveBeenCalledWith(account.id, new Date(periodEnd * 1000));
  });

  test('out-of-order: a late "canceled" update never overwrites SUBSCRIPTION_CANCELED', async () => {
    const user = await createUser();
    const plan = await createPlan();
    const account = await createAccount(user.id, plan.id, {
      status: 'SUSPENDED',
      suspendReason: 'SUBSCRIPTION_CANCELED',
      suspendedAt: new Date(),
    });
    await handleHostingWebhookEvent(
      eventOf('customer.subscription.updated', stripeSubscription(account.stripeSubscriptionId as string, 'canceled')),
    );
    expect(applyStateMock).toHaveBeenCalledWith(account.id, expect.objectContaining({ subscriptionStatus: 'canceled' }));
    expect(suspendMock).not.toHaveBeenCalled();
  });
});

describe('handleHostingWebhookEvent — invoices', () => {
  test('invoice.payment_failed marks past_due and notifies with retry info', async () => {
    const user = await createUser();
    const plan = await createPlan();
    const account = await createAccount(user.id, plan.id);
    const invoice = stripeInvoice('in_x', account.stripeSubscriptionId);

    const res = await handleHostingWebhookEvent(eventOf('invoice.payment_failed', invoice));
    expect(res.handled).toBe(true);
    expect(applyStateMock).toHaveBeenCalledWith(account.id, expect.objectContaining({ subscriptionStatus: 'past_due' }));
    expect(notifyPaymentFailedMock).toHaveBeenCalledWith(account.id, {
      nextRetryAt: expect.any(Date),
      hostedInvoiceUrl: 'https://invoice.stripe.com/i/test',
    });
  });

  test('invoice.payment_failed for a new-API parent reference resolves the subscription', async () => {
    const user = await createUser();
    const plan = await createPlan();
    const account = await createAccount(user.id, plan.id);
    const invoice = stripeInvoice('in_y', undefined, {
      subscription: undefined,
      parent: { subscription_details: { subscription: account.stripeSubscriptionId } },
    });

    const res = await handleHostingWebhookEvent(eventOf('invoice.payment_failed', invoice));
    expect(res.handled).toBe(true);
    expect(notifyPaymentFailedMock).toHaveBeenCalledWith(account.id, expect.any(Object));
  });

  test('invoice.payment_failed without a subscription reference is ignored', async () => {
    const res = await handleHostingWebhookEvent(
      eventOf('invoice.payment_failed', stripeInvoice('in_z', undefined, { subscription: undefined, parent: undefined })),
    );
    expect(res).toMatchObject({ handled: false, reason: 'not_a_subscription_invoice' });
    expect(applyStateMock).not.toHaveBeenCalled();
  });

  test('invoice.paid clears past_due and reactivates a PAYMENT_FAILED suspension', async () => {
    const user = await createUser();
    const plan = await createPlan();
    const account = await createAccount(user.id, plan.id, {
      status: 'SUSPENDED',
      suspendReason: 'PAYMENT_FAILED',
      suspendedAt: new Date(),
      subscriptionStatus: 'past_due',
    });
    mockStripe.subscriptions.retrieve.mockResolvedValue(
      stripeSubscription(account.stripeSubscriptionId as string, 'active'),
    );

    const res = await handleHostingWebhookEvent(
      eventOf('invoice.paid', stripeInvoice('in_paid', account.stripeSubscriptionId)),
    );
    expect(res.handled).toBe(true);
    expect(applyStateMock).toHaveBeenCalledWith(account.id, expect.objectContaining({ subscriptionStatus: 'active' }));
    expect(activateMock).toHaveBeenCalledWith(account.id);
  });

  test('invoice.paid for an unknown subscription is ignored', async () => {
    const res = await handleHostingWebhookEvent(
      eventOf('invoice.paid', stripeInvoice('in_q', `sub_${uid('wp01wh')}`)),
    );
    expect(res).toMatchObject({ handled: false, reason: 'unknown_subscription' });
    expect(activateMock).not.toHaveBeenCalled();
  });
});

describe('handleHostingWebhookEvent — misc', () => {
  test('unhandled event types return handled:false', async () => {
    const res = await handleHostingWebhookEvent(eventOf('customer.created', { id: 'cus_x' }));
    expect(res.handled).toBe(false);
  });
});

describe('POST /api/v1/payments/webhook — HTTP level', () => {
  beforeAll(() => {
    process.env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET;
  });

  const postWebhook = (payload: string, signature: string | null) => {
    const req = request(app)
      .post('/api/v1/payments/webhook')
      .set('Content-Type', 'application/json');
    if (signature) {
      req.set('stripe-signature', signature);
    }
    return req.send(payload);
  };

  test('rejects a bad signature with 400 and never touches the ledger', async () => {
    const payload = JSON.stringify({ id: uid('evt_wp01wh'), type: 'invoice.paid', data: { object: {} } });
    const before = await prisma.stripeWebhookEvent.count();
    const res = await postWebhook(payload, 't=1,v1=invalidsignature');
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(await prisma.stripeWebhookEvent.count()).toBe(before);
  });

  test('valid signature -> 200, provisions the account, marks PROCESSED', async () => {
    const user = await createUser();
    const plan = await createPlan();
    const subId = `sub_${uid('wp01wh')}`;
    const customerId = `cus_${uid('wp01wh')}`;
    const eventId = uid('evt_wp01wh');

    mockStripe.subscriptions.retrieve.mockResolvedValue(stripeSubscription(subId, 'active', {
      customer: customerId,
      metadata: {},
    }));
    provisionMock.mockResolvedValue({ account: { id: 'acct_wp01_http' }, created: true });

    const event = eventOf('checkout.session.completed', checkoutSession({
      subscription: subId,
      customer: customerId,
      client_reference_id: user.id,
      metadata: { userId: user.id, planId: plan.id },
    }), eventId);
    const payload = JSON.stringify(event);

    const res = await postWebhook(payload, signPayload(payload));
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.handled).toBe(true);
    expect(provisionMock).toHaveBeenCalledWith(expect.objectContaining({
      userId: user.id,
      planId: plan.id,
      stripeSubscriptionId: subId,
    }));

    const row = await prisma.stripeWebhookEvent.findUnique({ where: { id: eventId } });
    expect(row?.status).toBe('PROCESSED');

    // Redelivery of the same event is a 200 duplicate — the handler never runs twice.
    const again = await postWebhook(payload, signPayload(payload));
    expect(again.status).toBe(200);
    expect(provisionMock).toHaveBeenCalledTimes(1);
  });

  test('handler failure -> 500, then the retried delivery -> 200', async () => {
    const user = await createUser();
    const plan = await createPlan();
    const subId = `sub_${uid('wp01wh')}`;
    const eventId = uid('evt_wp01wh');

    mockStripe.subscriptions.retrieve.mockResolvedValue(stripeSubscription(subId, 'active'));
    provisionMock.mockRejectedValueOnce(new Error('transient provisioning failure'));
    provisionMock.mockResolvedValue({ account: { id: 'acct_wp01_retry' }, created: true });

    const event = eventOf('checkout.session.completed', checkoutSession({
      subscription: subId,
      metadata: { userId: user.id, planId: plan.id },
    }), eventId);
    const payload = JSON.stringify(event);

    const first = await postWebhook(payload, signPayload(payload));
    expect(first.status).toBe(500);
    let row = await prisma.stripeWebhookEvent.findUnique({ where: { id: eventId } });
    expect(row?.status).toBe('FAILED');

    const second = await postWebhook(payload, signPayload(payload));
    expect(second.status).toBe(200);
    row = await prisma.stripeWebhookEvent.findUnique({ where: { id: eventId } });
    expect(row?.status).toBe('PROCESSED');
    expect(row?.attempts).toBe(2);
    expect(provisionMock).toHaveBeenCalledTimes(2);
  });
});
