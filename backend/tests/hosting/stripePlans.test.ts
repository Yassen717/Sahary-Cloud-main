/**
 * WP01 — hosting plan subscription endpoints (subscribe/change/cancel/resume/
 * portal/status) through the real express app. Stripe client + lifecycle +
 * notifications are mocked; DB is the per-worktree test DB.
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

import { changeAccountPlan, applySubscriptionState } from '../../src/services/hostingLifecycleService';

const request = require('supertest');
const JWTUtils = require('../../src/utils/jwt').default;
const app = require('../../src/index');

const changePlanMock = changeAccountPlan as jest.Mock;
const applyStateMock = applySubscriptionState as jest.Mock;

let seq = 0;
const uid = (prefix: string): string => `${prefix}_${Date.now().toString(36)}_${(seq += 1)}`;
const nowSec = (): number => Math.floor(Date.now() / 1000);

const created = { users: [] as string[], plans: [] as string[], accounts: [] as string[] };

const createUser = async (overrides: Record<string, any> = {}) => {
  const user = await prisma.user.create({
    data: {
      email: `${uid('wp01pl')}@test.dev`,
      password: 'not-a-real-hash',
      firstName: 'WP01',
      lastName: 'Plans',
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
      name: uid('wp01pl-plan'),
      diskGB: 10,
      bandwidthGB: 100,
      maxDomains: 5,
      maxDatabases: 5,
      maxFtpAccounts: 2,
      monthlyPrice: 5.5,
      stripePriceId: `price_${uid('wp01pl')}`,
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
      domain: `${uid('wp01pl')}.test.dev`,
      userId,
      planId,
      diskQuota: 10,
      bandwidthQuota: 100,
      status: 'ACTIVE',
      stripeSubscriptionId: `sub_${uid('wp01pl')}`,
      subscriptionStatus: 'active',
      currentPeriodEnd: new Date(Date.now() + 30 * 86400_000),
      ...overrides,
    },
  });
  created.accounts.push(account.id);
  return account;
};

const authFor = (user: { id: string; email: string; role: string }) => ({
  Authorization: `Bearer ${JWTUtils.generateAccessToken({ userId: user.id, email: user.email, role: user.role })}`,
});

const stripeSubObject = (id: string, priceId: string, opts: Record<string, any> = {}) => ({
  id,
  object: 'subscription',
  status: 'active',
  cancel_at_period_end: false,
  current_period_end: nowSec() + 30 * 86400,
  customer: 'cus_test',
  items: { object: 'list', data: [{ id: `si_${id}`, price: { id: priceId } }] },
  ...opts,
});

afterAll(async () => {
  if (created.accounts.length > 0) {
    await prisma.hostingAccount.deleteMany({ where: { id: { in: created.accounts } } });
  }
  if (created.plans.length > 0) {
    await prisma.hostingPlan.deleteMany({ where: { id: { in: created.plans } } });
  }
  if (created.users.length > 0) {
    await prisma.user.deleteMany({ where: { id: { in: created.users } } });
  }
  await prisma.$disconnect();
});

describe('POST /api/v1/hosting/plans/subscribe', () => {
  test('401 without a token', async () => {
    const res = await request(app).post('/api/v1/hosting/plans/subscribe').send({ planId: 'x' });
    expect(res.status).toBe(401);
  });

  test('403 for an unverified user', async () => {
    const user = await createUser({ isVerified: false });
    const plan = await createPlan();
    const res = await request(app)
      .post('/api/v1/hosting/plans/subscribe')
      .set(authFor(user))
      .send({ planId: plan.id });
    expect(res.status).toBe(403);
  });

  test('400 for unknown or inactive plans, and for an invalid domain', async () => {
    const user = await createUser();
    const res = await request(app)
      .post('/api/v1/hosting/plans/subscribe')
      .set(authFor(user))
      .send({ planId: 'nonexistent' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/plan not found|inactive/i);

    const inactive = await createPlan({ isActive: false });
    const res2 = await request(app)
      .post('/api/v1/hosting/plans/subscribe')
      .set(authFor(user))
      .send({ planId: inactive.id });
    expect(res2.status).toBe(400);

    const plan = await createPlan();
    const res3 = await request(app)
      .post('/api/v1/hosting/plans/subscribe')
      .set(authFor(user))
      .send({ planId: plan.id, domain: 'NOT_A_DOMAIN!' });
    expect(res3.status).toBe(400);
  });

  test('503 for a plan without a Stripe price', async () => {
    const user = await createUser();
    const plan = await createPlan({ stripePriceId: null });
    const res = await request(app)
      .post('/api/v1/hosting/plans/subscribe')
      .set(authFor(user))
      .send({ planId: plan.id });
    expect(res.status).toBe(503);
    expect(res.body.message).toMatch(/not available for purchase/i);
    expect(mockStripe.checkout.sessions.create).not.toHaveBeenCalled();
  });

  test('409 when the user already has a live hosting account', async () => {
    const user = await createUser();
    const plan = await createPlan();
    await createAccount(user.id, plan.id);
    const res = await request(app)
      .post('/api/v1/hosting/plans/subscribe')
      .set(authFor(user))
      .send({ planId: plan.id });
    expect(res.status).toBe(409);
    expect(mockStripe.checkout.sessions.create).not.toHaveBeenCalled();
  });

  test('409 when the Stripe customer already holds a live subscription', async () => {
    const user = await createUser({ stripeCustomerId: `cus_${uid('wp01pl')}` });
    const plan = await createPlan();
    mockStripe.subscriptions.list.mockResolvedValue({
      data: [{ id: 'sub_existing', status: 'trialing' }],
    });
    const res = await request(app)
      .post('/api/v1/hosting/plans/subscribe')
      .set(authFor(user))
      .send({ planId: plan.id });
    expect(res.status).toBe(409);
    expect(mockStripe.checkout.sessions.create).not.toHaveBeenCalled();
  });

  test('201 creates a Checkout session with the contracted payload and persists the customer', async () => {
    const user = await createUser();
    const plan = await createPlan();
    mockStripe.customers.create.mockResolvedValue({ id: 'cus_new_1' });
    mockStripe.subscriptions.list.mockResolvedValue({ data: [] });
    mockStripe.checkout.sessions.create.mockResolvedValue({
      id: 'cs_test_1',
      url: 'https://checkout.stripe.com/pay/cs_test_1',
    });

    const res = await request(app)
      .post('/api/v1/hosting/plans/subscribe')
      .set(authFor(user))
      .send({ planId: plan.id, domain: 'mysite.example.com' });

    expect(res.status).toBe(201);
    expect(res.body.data).toEqual({
      checkoutUrl: 'https://checkout.stripe.com/pay/cs_test_1',
      sessionId: 'cs_test_1',
    });

    expect(mockStripe.customers.create).toHaveBeenCalledWith(expect.objectContaining({
      email: user.email,
      metadata: { userId: user.id },
    }));
    const call = mockStripe.checkout.sessions.create.mock.calls[0][0];
    expect(call.mode).toBe('subscription');
    expect(call.customer).toBe('cus_new_1');
    expect(call.line_items).toEqual([{ price: plan.stripePriceId, quantity: 1 }]);
    expect(call.client_reference_id).toBe(user.id);
    expect(call.metadata).toEqual({ userId: user.id, planId: plan.id, domain: 'mysite.example.com' });
    expect(call.subscription_data).toEqual({
      metadata: { userId: user.id, planId: plan.id, domain: 'mysite.example.com' },
    });
    expect(call.allow_promotion_codes).toBe(true);
    expect(call.success_url).toContain('/dashboard/subscription?checkout=success');
    expect(call.success_url).toContain('{CHECKOUT_SESSION_ID}');
    expect(call.cancel_url).toContain('/pricing?checkout=cancelled');

    const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
    expect(dbUser?.stripeCustomerId).toBe('cus_new_1');
  });

  test('no domain -> metadata omits the key', async () => {
    const user = await createUser({ stripeCustomerId: `cus_${uid('wp01pl')}` });
    const plan = await createPlan();
    mockStripe.subscriptions.list.mockResolvedValue({ data: [] });
    mockStripe.checkout.sessions.create.mockResolvedValue({ id: 'cs_2', url: 'https://checkout.stripe.com/x' });

    const res = await request(app)
      .post('/api/v1/hosting/plans/subscribe')
      .set(authFor(user))
      .send({ planId: plan.id });
    expect(res.status).toBe(201);
    const call = mockStripe.checkout.sessions.create.mock.calls[0][0];
    expect(call.metadata).toEqual({ userId: user.id, planId: plan.id });
    expect('domain' in call.metadata).toBe(false);
  });
});

describe('POST /api/v1/hosting/plans/change', () => {
  test('404 without a hosting account', async () => {
    const user = await createUser();
    const plan = await createPlan();
    const res = await request(app)
      .post('/api/v1/hosting/plans/change')
      .set(authFor(user))
      .send({ planId: plan.id });
    expect(res.status).toBe(404);
  });

  test('409 without a linked subscription, 400 unknown plan, 409 same plan', async () => {
    const user = await createUser();
    const planA = await createPlan();
    await createAccount(user.id, planA.id, { stripeSubscriptionId: null });

    let res = await request(app)
      .post('/api/v1/hosting/plans/change')
      .set(authFor(user))
      .send({ planId: (await createPlan()).id });
    expect(res.status).toBe(409);

    const user2 = await createUser();
    const account = await createAccount(user2.id, planA.id);
    res = await request(app)
      .post('/api/v1/hosting/plans/change')
      .set(authFor(user2))
      .send({ planId: 'missing' });
    expect(res.status).toBe(400);

    res = await request(app)
      .post('/api/v1/hosting/plans/change')
      .set(authFor(user2))
      .send({ planId: planA.id });
    expect(res.status).toBe(409);
    void account;
  });

  test('503 when the target plan is not purchasable', async () => {
    const user = await createUser();
    const planA = await createPlan();
    const planB = await createPlan({ stripePriceId: null });
    await createAccount(user.id, planA.id);
    const res = await request(app)
      .post('/api/v1/hosting/plans/change')
      .set(authFor(user))
      .send({ planId: planB.id });
    expect(res.status).toBe(503);
  });

  test('409 downgrade violations lists every violated limit', async () => {
    const user = await createUser();
    const planA = await createPlan();
    const planB = await createPlan({ diskGB: 2, maxDomains: 1, maxDatabases: 1 });
    const account = await createAccount(user.id, planA.id, { diskUsed: 8 });
    await prisma.hostingDomain.create({ data: { accountId: account.id, domain: `${uid('wp01pl')}.a.dev` } });
    await prisma.hostingDomain.create({ data: { accountId: account.id, domain: `${uid('wp01pl')}.b.dev` } });
    await prisma.hostingDatabase.create({ data: { accountId: account.id, name: `db_${uid('wp01pl')}`, isPrimary: true } });
    await prisma.hostingDatabase.create({ data: { accountId: account.id, name: `db_${uid('wp01pl')}` } });

    const res = await request(app)
      .post('/api/v1/hosting/plans/change')
      .set(authFor(user))
      .send({ planId: planB.id });
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/disk/i);
    expect(res.body.message).toMatch(/domain/i);
    expect(res.body.message).toMatch(/database/i);
    expect(mockStripe.subscriptions.update).not.toHaveBeenCalled();
  });

  test('200 on success: updates Stripe, calls changeAccountPlan, returns subscription status', async () => {
    const user = await createUser();
    const planA = await createPlan();
    const planB = await createPlan({ diskGB: 50, maxDomains: 10, maxDatabases: 10 });
    const account = await createAccount(user.id, planA.id);
    const subId = account.stripeSubscriptionId as string;

    mockStripe.subscriptions.retrieve.mockResolvedValue(
      stripeSubObject(subId, planA.stripePriceId as string),
    );
    mockStripe.subscriptions.update.mockResolvedValue(
      stripeSubObject(subId, planB.stripePriceId as string),
    );
    changePlanMock.mockImplementation(async (accountId: string, newPlanId: string) => {
      await prisma.hostingAccount.update({ where: { id: accountId }, data: { planId: newPlanId } });
      return {};
    });

    const res = await request(app)
      .post('/api/v1/hosting/plans/change')
      .set(authFor(user))
      .send({ planId: planB.id });

    expect(res.status).toBe(200);
    expect(mockStripe.subscriptions.update).toHaveBeenCalledWith(subId, {
      items: [{ id: `si_${subId}`, price: planB.stripePriceId }],
      proration_behavior: 'create_prorations',
    });
    expect(changePlanMock).toHaveBeenCalledWith(account.id, planB.id);
    expect(applyStateMock).toHaveBeenCalledWith(account.id, expect.objectContaining({ subscriptionStatus: 'active' }));
    expect(res.body.data.hasSubscription).toBe(true);
    expect(res.body.data.plan.id).toBe(planB.id);
  });
});

describe('DELETE /api/v1/hosting/plans/cancel + POST /resume', () => {
  test('cancel sets cancel_at_period_end and mirrors state (account stays active)', async () => {
    const user = await createUser();
    const plan = await createPlan();
    const account = await createAccount(user.id, plan.id);
    const subId = account.stripeSubscriptionId as string;

    const periodEnd = nowSec() + 10 * 86400;
    mockStripe.subscriptions.update.mockResolvedValue(
      stripeSubObject(subId, plan.stripePriceId as string, {
        cancel_at_period_end: true,
        current_period_end: periodEnd,
      }),
    );
    applyStateMock.mockImplementation(async (accountId: string, state: Record<string, unknown>) => {
      await prisma.hostingAccount.update({
        where: { id: accountId },
        data: {
          subscriptionStatus: state.subscriptionStatus as string,
          currentPeriodEnd: state.currentPeriodEnd as Date,
          cancelAtPeriodEnd: state.cancelAtPeriodEnd as boolean,
        },
      });
    });

    const res = await request(app).delete('/api/v1/hosting/plans/cancel').set(authFor(user));
    expect(res.status).toBe(200);
    expect(mockStripe.subscriptions.update).toHaveBeenCalledWith(subId, { cancel_at_period_end: true });
    expect(applyStateMock).toHaveBeenCalledWith(account.id, {
      subscriptionStatus: 'active',
      currentPeriodEnd: new Date(periodEnd * 1000),
      cancelAtPeriodEnd: true,
    });
    expect(res.body.data.subscription.cancelAtPeriodEnd).toBe(true);
    expect(res.body.data.accountStatus).toBe('ACTIVE');
  });

  test('resume clears cancel_at_period_end', async () => {
    const user = await createUser();
    const plan = await createPlan();
    const account = await createAccount(user.id, plan.id, { cancelAtPeriodEnd: true });
    const subId = account.stripeSubscriptionId as string;

    mockStripe.subscriptions.update.mockResolvedValue(
      stripeSubObject(subId, plan.stripePriceId as string, { cancel_at_period_end: false }),
    );

    const res = await request(app).post('/api/v1/hosting/plans/resume').set(authFor(user));
    expect(res.status).toBe(200);
    expect(mockStripe.subscriptions.update).toHaveBeenCalledWith(subId, { cancel_at_period_end: false });
    expect(applyStateMock).toHaveBeenCalledWith(account.id, expect.objectContaining({ cancelAtPeriodEnd: false }));
  });

  test('cancel/resume return 409 when no subscription is linked', async () => {
    const user = await createUser();
    const plan = await createPlan();
    await createAccount(user.id, plan.id, { stripeSubscriptionId: null });

    const res1 = await request(app).delete('/api/v1/hosting/plans/cancel').set(authFor(user));
    expect(res1.status).toBe(409);
    const res2 = await request(app).post('/api/v1/hosting/plans/resume').set(authFor(user));
    expect(res2.status).toBe(409);
  });
});

describe('POST /api/v1/hosting/plans/portal + GET /subscription', () => {
  test('portal returns a billing portal URL for the linked customer', async () => {
    const user = await createUser({ stripeCustomerId: 'cus_portal_1' });
    const plan = await createPlan();
    await createAccount(user.id, plan.id);
    mockStripe.billingPortal.sessions.create.mockResolvedValue({
      url: 'https://billing.stripe.com/session/x',
    });

    const res = await request(app).post('/api/v1/hosting/plans/portal').set(authFor(user));
    expect(res.status).toBe(200);
    expect(res.body.data.portalUrl).toBe('https://billing.stripe.com/session/x');
    expect(mockStripe.billingPortal.sessions.create).toHaveBeenCalledWith(expect.objectContaining({
      customer: 'cus_portal_1',
      return_url: expect.stringContaining('/dashboard/subscription'),
    }));
  });

  test('portal -> 409 when the user has no Stripe customer', async () => {
    const user = await createUser();
    const plan = await createPlan();
    await createAccount(user.id, plan.id);
    const res = await request(app).post('/api/v1/hosting/plans/portal').set(authFor(user));
    expect(res.status).toBe(409);
    expect(mockStripe.billingPortal.sessions.create).not.toHaveBeenCalled();
  });

  test('GET /subscription without an account returns an empty status', async () => {
    const user = await createUser();
    const res = await request(app).get('/api/v1/hosting/plans/subscription').set(authFor(user));
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      hasSubscription: false,
      subscription: null,
      plan: null,
      accountStatus: null,
    });
  });

  test('GET /subscription returns subscription summary, plan and account status', async () => {
    const user = await createUser();
    const plan = await createPlan();
    const account = await createAccount(user.id, plan.id, { subscriptionStatus: 'past_due' });

    const res = await request(app).get('/api/v1/hosting/plans/subscription').set(authFor(user));
    expect(res.status).toBe(200);
    expect(res.body.data.hasSubscription).toBe(true);
    expect(res.body.data.subscription).toEqual({
      status: 'past_due',
      currentPeriodEnd: account.currentPeriodEnd?.toISOString(),
      cancelAtPeriodEnd: false,
    });
    expect(res.body.data.plan.id).toBe(plan.id);
    expect(res.body.data.accountStatus).toBe('ACTIVE');
  });
});
