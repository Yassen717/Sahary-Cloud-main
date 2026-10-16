/**
 * WP01 — stripeBillingService (cancelSubscriptionNow, ensureStripeCustomer,
 * syncPlanToStripe), getStripe config gating, and the reconcile job.
 * Stripe is fully mocked; DB is the per-worktree test DB.
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

import {
  cancelSubscriptionNow,
  ensureStripeCustomer,
  syncPlanToStripe,
} from '../../src/services/stripeBillingService';
import {
  provisionPaidAccount,
  suspendAccount,
  activateAccount,
  applySubscriptionState,
} from '../../src/services/hostingLifecycleService';
import { notifySubscriptionCanceled } from '../../src/services/hostingNotificationService';

// hostingReconcileJob uses `export =` for the legacy require() job loader.
const { reconcileSubscriptions } = require('../../src/jobs/hostingReconcileJob');

const actualStripeClient = jest.requireActual('../../src/services/stripeClient');

const provisionMock = provisionPaidAccount as jest.Mock;
const suspendMock = suspendAccount as jest.Mock;
const activateMock = activateAccount as jest.Mock;
const applyStateMock = applySubscriptionState as jest.Mock;
const notifyCanceledMock = notifySubscriptionCanceled as jest.Mock;

let seq = 0;
const uid = (prefix: string): string => `${prefix}_${Date.now().toString(36)}_${(seq += 1)}`;
const nowSec = (): number => Math.floor(Date.now() / 1000);

const created = { users: [] as string[], plans: [] as string[], accounts: [] as string[] };

const createUser = async (overrides: Record<string, any> = {}) => {
  const user = await prisma.user.create({
    data: {
      email: `${uid('wp01bl')}@test.dev`,
      password: 'not-a-real-hash',
      firstName: 'WP01',
      lastName: 'Billing',
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
      name: uid('wp01bl-plan'),
      diskGB: 10,
      bandwidthGB: 100,
      maxDomains: 2,
      maxDatabases: 1,
      maxFtpAccounts: 1,
      monthlyPrice: 5.5,
      stripePriceId: `price_${uid('wp01bl')}`,
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
      domain: `${uid('wp01bl')}.test.dev`,
      userId,
      planId,
      diskQuota: 10,
      bandwidthQuota: 100,
      status: 'ACTIVE',
      stripeSubscriptionId: `sub_${uid('wp01bl')}`,
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

const usablePrice = (id: string, productId: string, unitAmount: number) => ({
  id,
  object: 'price',
  active: true,
  unit_amount: unitAmount,
  currency: 'usd',
  recurring: { interval: 'month', interval_count: 1 },
  product: productId,
});

const retrieveById = (map: Record<string, unknown>) => {
  mockStripe.subscriptions.retrieve.mockImplementation((id: string) => {
    const found = map[id];
    if (!found) {
      return Promise.reject(Object.assign(new Error('No such subscription'), { code: 'resource_missing' }));
    }
    return Promise.resolve(found);
  });
};

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

describe('getStripe', () => {
  afterEach(() => {
    actualStripeClient.resetStripeClient();
  });

  test('throws a 503 when STRIPE_SECRET_KEY is absent', () => {
    const saved = process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_SECRET_KEY;
    actualStripeClient.resetStripeClient();
    try {
      actualStripeClient.getStripe();
      throw new Error('should have thrown');
    } catch (error) {
      expect((error as { status?: number }).status).toBe(503);
      expect((error as Error).message).toBe('Billing is not configured');
    } finally {
      if (saved !== undefined) {
        process.env.STRIPE_SECRET_KEY = saved;
      }
      actualStripeClient.resetStripeClient();
    }
  });

  test('returns a lazily-created singleton when configured', () => {
    const saved = process.env.STRIPE_SECRET_KEY;
    process.env.STRIPE_SECRET_KEY = 'sk_test_wp01_singleton';
    actualStripeClient.resetStripeClient();
    const a = actualStripeClient.getStripe();
    const b = actualStripeClient.getStripe();
    expect(a).toBe(b);
    expect(a.subscriptions).toBeDefined();
    if (saved !== undefined) {
      process.env.STRIPE_SECRET_KEY = saved;
    }
  });
});

describe('cancelSubscriptionNow', () => {
  test('calls stripe.subscriptions.cancel', async () => {
    mockStripe.subscriptions.cancel.mockResolvedValue({ id: 'sub_x', status: 'canceled' });
    await expect(cancelSubscriptionNow('sub_x')).resolves.toBeUndefined();
    expect(mockStripe.subscriptions.cancel).toHaveBeenCalledWith('sub_x');
  });

  test.each([
    Object.assign(new Error('No such subscription'), { code: 'resource_missing' }),
    new Error('No such subscription: sub_x'),
    new Error('Subscription already canceled'),
  ])('treats already-gone subscriptions as success', async (err) => {
    mockStripe.subscriptions.cancel.mockRejectedValue(err);
    await expect(cancelSubscriptionNow('sub_x')).resolves.toBeUndefined();
  });

  test('other Stripe failures become a 502', async () => {
    mockStripe.subscriptions.cancel.mockRejectedValue(new Error('stripe api unreachable'));
    await expect(cancelSubscriptionNow('sub_x')).rejects.toMatchObject({
      status: 502,
      message: 'Could not cancel the subscription with the payment provider',
    });
  });
});

describe('ensureStripeCustomer', () => {
  test('returns the stored customer id without calling Stripe', async () => {
    const user = await createUser({ stripeCustomerId: 'cus_kept' });
    const id = await ensureStripeCustomer(user);
    expect(id).toBe('cus_kept');
    expect(mockStripe.customers.create).not.toHaveBeenCalled();
  });

  test('creates and persists a customer with email/name/metadata.userId', async () => {
    const user = await createUser();
    mockStripe.customers.create.mockResolvedValue({ id: 'cus_made_1' });
    const id = await ensureStripeCustomer(user);
    expect(id).toBe('cus_made_1');
    expect(mockStripe.customers.create).toHaveBeenCalledWith({
      email: user.email,
      name: `${user.firstName} ${user.lastName}`,
      metadata: { userId: user.id },
    });
    const fresh = await prisma.user.findUnique({ where: { id: user.id } });
    expect(fresh?.stripeCustomerId).toBe('cus_made_1');
  });
});

describe('syncPlanToStripe', () => {
  test('creates product + monthly USD price in cents and persists both ids', async () => {
    const plan = await createPlan({ stripeProductId: null, stripePriceId: null, monthlyPrice: 5.5 });
    mockStripe.products.create.mockResolvedValue({ id: 'prod_wp01_1' });
    mockStripe.prices.create.mockResolvedValue({ id: 'price_wp01_1' });

    const res = await syncPlanToStripe(plan.id);
    expect(res).toEqual({ stripeProductId: 'prod_wp01_1', stripePriceId: 'price_wp01_1' });
    expect(mockStripe.products.create).toHaveBeenCalledWith({
      name: `Sahary Hosting — ${plan.name}`,
      metadata: { planId: plan.id },
    });
    expect(mockStripe.prices.create).toHaveBeenCalledWith({
      product: 'prod_wp01_1',
      unit_amount: 550,
      currency: 'usd',
      recurring: { interval: 'month' },
      metadata: { planId: plan.id },
    });
    const fresh = await prisma.hostingPlan.findUnique({ where: { id: plan.id } });
    expect(fresh?.stripeProductId).toBe('prod_wp01_1');
    expect(fresh?.stripePriceId).toBe('price_wp01_1');
  });

  test('unchanged price is a no-op — no new price, no archive', async () => {
    const plan = await createPlan({
      stripeProductId: 'prod_keep',
      stripePriceId: 'price_keep',
      monthlyPrice: 5.5,
    });
    mockStripe.prices.retrieve.mockResolvedValue(usablePrice('price_keep', 'prod_keep', 550));

    const res = await syncPlanToStripe(plan.id);
    expect(res).toEqual({ stripeProductId: 'prod_keep', stripePriceId: 'price_keep' });
    expect(mockStripe.prices.create).not.toHaveBeenCalled();
    expect(mockStripe.prices.update).not.toHaveBeenCalled();
    expect(mockStripe.products.create).not.toHaveBeenCalled();
  });

  test('drifted price mints a new price, archives the old one and persists', async () => {
    const plan = await createPlan({
      stripeProductId: 'prod_1',
      stripePriceId: 'price_old',
      monthlyPrice: 12,
    });
    mockStripe.prices.retrieve.mockResolvedValue(usablePrice('price_old', 'prod_1', 550));
    mockStripe.prices.create.mockResolvedValue({ id: 'price_new' });
    mockStripe.prices.update.mockResolvedValue({ id: 'price_old', active: false });

    const res = await syncPlanToStripe(plan.id);
    expect(res.stripePriceId).toBe('price_new');
    expect(mockStripe.prices.create).toHaveBeenCalledWith(expect.objectContaining({ unit_amount: 1200 }));
    expect(mockStripe.prices.update).toHaveBeenCalledWith('price_old', { active: false });
    const fresh = await prisma.hostingPlan.findUnique({ where: { id: plan.id } });
    expect(fresh?.stripePriceId).toBe('price_new');
  });

  test('inactive/archived price mints a replacement', async () => {
    const plan = await createPlan({
      stripeProductId: 'prod_1',
      stripePriceId: 'price_dead',
      monthlyPrice: 5.5,
    });
    mockStripe.prices.retrieve.mockResolvedValue({ ...usablePrice('price_dead', 'prod_1', 550), active: false });
    mockStripe.prices.create.mockResolvedValue({ id: 'price_reborn' });

    const res = await syncPlanToStripe(plan.id);
    expect(res.stripePriceId).toBe('price_reborn');
  });

  test('missing price in Stripe (resource_missing) mints a replacement', async () => {
    const plan = await createPlan({
      stripeProductId: 'prod_1',
      stripePriceId: 'price_gone',
      monthlyPrice: 5.5,
    });
    mockStripe.prices.retrieve.mockRejectedValue(
      Object.assign(new Error('No such price'), { code: 'resource_missing' }),
    );
    mockStripe.prices.create.mockResolvedValue({ id: 'price_fresh' });

    const res = await syncPlanToStripe(plan.id);
    expect(res.stripePriceId).toBe('price_fresh');
  });

  test('unknown plan -> 404', async () => {
    await expect(syncPlanToStripe('missing_plan_id')).rejects.toMatchObject({ status: 404 });
  });
});

describe('reconcileSubscriptions', () => {
  beforeEach(() => {
    mockStripe.subscriptions.list.mockResolvedValue({ data: [] });
  });

  test('status drift: unpaid subscription suspends an ACTIVE account', async () => {
    const user = await createUser();
    const plan = await createPlan();
    const account = await createAccount(user.id, plan.id);
    const subId = account.stripeSubscriptionId as string;
    retrieveById({ [subId]: stripeSubscription(subId, 'unpaid') });

    const result = await reconcileSubscriptions({ spacingMs: 0 });
    expect(result.checked).toBeGreaterThanOrEqual(1);
    expect(suspendMock).toHaveBeenCalledWith(account.id, 'PAYMENT_FAILED');
  });

  test('past_due inside the grace window mirrors state; beyond grace suspends', async () => {
    const user = await createUser();
    const plan = await createPlan();
    const inGrace = await createAccount(user.id, plan.id);
    const inGraceSub = inGrace.stripeSubscriptionId as string;

    const user2 = await createUser();
    const pastGrace = await createAccount(user2.id, plan.id);
    const pastGraceSub = pastGrace.stripeSubscriptionId as string;

    retrieveById({
      [inGraceSub]: stripeSubscription(inGraceSub, 'past_due', {
        current_period_start: nowSec() - 2 * 86400,
      }),
      [pastGraceSub]: stripeSubscription(pastGraceSub, 'past_due', {
        current_period_start: nowSec() - 10 * 86400,
      }),
    });

    await reconcileSubscriptions({ spacingMs: 0 });

    expect(applyStateMock).toHaveBeenCalledWith(inGrace.id, expect.objectContaining({ subscriptionStatus: 'past_due' }));
    expect(suspendMock).not.toHaveBeenCalledWith(inGrace.id, 'PAYMENT_FAILED');
    expect(suspendMock).toHaveBeenCalledWith(pastGrace.id, 'PAYMENT_FAILED');
  });

  test('suspended PAYMENT_FAILED account reactivates when Stripe says active', async () => {
    const user = await createUser();
    const plan = await createPlan();
    const account = await createAccount(user.id, plan.id, {
      status: 'SUSPENDED',
      suspendReason: 'PAYMENT_FAILED',
      suspendedAt: new Date(),
      subscriptionStatus: 'past_due',
    });
    const subId = account.stripeSubscriptionId as string;
    retrieveById({ [subId]: stripeSubscription(subId, 'active') });

    await reconcileSubscriptions({ spacingMs: 0 });
    expect(activateMock).toHaveBeenCalledWith(account.id);
  });

  test('a subscription missing in Stripe is treated as canceled', async () => {
    const user = await createUser();
    const plan = await createPlan();
    const account = await createAccount(user.id, plan.id);
    retrieveById({}); // nothing resolves

    await reconcileSubscriptions({ spacingMs: 0 });
    expect(suspendMock).toHaveBeenCalledWith(account.id, 'SUBSCRIPTION_CANCELED');
    expect(notifyCanceledMock).toHaveBeenCalledWith(account.id, null);
  });

  test('missed webhook: orphan Stripe customer with an active sub gets provisioned', async () => {
    const plan = await createPlan();
    const orphan = await createUser({ stripeCustomerId: `cus_${uid('wp01bl_orphan')}` });
    const subId = `sub_${uid('wp01bl')}`;

    retrieveById({});
    mockStripe.subscriptions.list.mockImplementation(({ customer }: { customer: string }) => {
      if (customer === orphan.stripeCustomerId) {
        return Promise.resolve({
          data: [stripeSubscription(subId, 'active', {
            customer: orphan.stripeCustomerId,
            metadata: { userId: orphan.id, planId: plan.id },
            items: { data: [{ id: `si_${subId}`, price: { id: plan.stripePriceId } }] },
          })],
        });
      }
      return Promise.resolve({ data: [] });
    });
    provisionMock.mockResolvedValue({ account: { id: 'acct_reconciled' }, created: true });

    const result = await reconcileSubscriptions({ spacingMs: 0 });
    expect(result.provisioned).toBeGreaterThanOrEqual(1);
    expect(provisionMock).toHaveBeenCalledWith(expect.objectContaining({
      userId: orphan.id,
      planId: plan.id,
      stripeCustomerId: orphan.stripeCustomerId,
      stripeSubscriptionId: subId,
      subscriptionStatus: 'active',
    }));
  });

  test('a concurrent run is skipped instead of overlapping', async () => {
    retrieveById({});
    const [first, second] = await Promise.all([
      reconcileSubscriptions({ spacingMs: 0 }),
      reconcileSubscriptions({ spacingMs: 0 }),
    ]);
    const results = [first, second];
    expect(results.filter((r) => r.skipped === true)).toHaveLength(1);
    expect(results.filter((r) => r.skipped !== true)).toHaveLength(1);
  });
});
