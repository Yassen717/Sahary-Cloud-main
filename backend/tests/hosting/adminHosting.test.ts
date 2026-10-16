import request from 'supertest';
import { prisma } from '../../src/config/database';
import { httpError } from '../../src/utils/httpError';
import AuthService from '../../src/services/authService';
import JWTUtils from '../../src/utils/jwt';

jest.mock('../../src/services/hostingLifecycleService', () => ({
  provisionPaidAccount: jest.fn(),
  suspendAccount: jest.fn(async () => ({})),
  activateAccount: jest.fn(async () => ({})),
  changeAccountPlan: jest.fn(),
  applySubscriptionState: jest.fn(),
  retryProvisioning: jest.fn(async () => ({})),
  terminateAccountById: jest.fn(async () => ({})),
}));

jest.mock('../../src/services/stripeBillingService', () => ({
  cancelSubscriptionNow: jest.fn(async () => undefined),
  syncPlanToStripe: jest.fn(async (planId: string) => ({
    stripeProductId: `prod_synced_${planId}`,
    stripePriceId: `price_synced_${planId}`,
  })),
}));

const lifecycle = require('../../src/services/hostingLifecycleService') as {
  suspendAccount: jest.Mock;
  activateAccount: jest.Mock;
  retryProvisioning: jest.Mock;
  terminateAccountById: jest.Mock;
};
const stripeBilling = require('../../src/services/stripeBillingService') as {
  syncPlanToStripe: jest.Mock;
};

// eslint-disable-next-line @typescript-eslint/no-var-requires
const app = require('../../src/index');

const BASE = '/api/v1/admin/hosting';
const EMAILS = [
  'wp07-admin@test.com',
  'wp07-super@test.com',
  'wp07-owner1@test.com',
  'wp07-owner2@test.com',
  'wp07-normal@test.com',
];
let admin: { id: string; email: string };
let superAdmin: { id: string; email: string };
let adminToken = '';
let superToken = '';
let userToken = '';

const accountIds: Record<string, string> = {};
const planIds: Record<string, string> = {};
let pricedPlanId = '';
let freePlanId = '';

const register = async (email: string, role: string) => {
  const result = await AuthService.register({
    email,
    password: 'TestPassword123!',
    firstName: 'WP07',
    lastName: 'Test',
  });
  const user = await prisma.user.update({
    where: { id: result.user.id },
    data: { role, isVerified: true },
  });
  const token = JWTUtils.generateAccessToken({
    userId: user.id,
    email: user.email,
    role: user.role,
  });
  return { user, token };
};

const seedFixtures = async () => {
  const basic = await prisma.hostingPlan.create({
    data: {
      name: 'wp07-basic',
      description: 'Basic plan',
      diskGB: 5,
      bandwidthGB: 20,
      maxDomains: 1,
      maxDatabases: 1,
      maxFtpAccounts: 1,
      monthlyPrice: 4.99,
      isActive: true,
    },
  });
  const pro = await prisma.hostingPlan.create({
    data: {
      name: 'wp07-pro',
      diskGB: 20,
      bandwidthGB: 100,
      maxDomains: 5,
      maxDatabases: 5,
      maxFtpAccounts: 2,
      monthlyPrice: 12.5,
      isActive: false,
      stripeProductId: 'prod_wp07_pro',
      stripePriceId: 'price_wp07_pro',
    },
  });
  const priced = await prisma.hostingPlan.create({
    data: {
      name: 'wp07-priced',
      diskGB: 10,
      bandwidthGB: 50,
      monthlyPrice: 5.0,
      stripeProductId: 'prod_old',
      stripePriceId: 'price_old',
    },
  });
  const free = await prisma.hostingPlan.create({
    data: { name: 'wp07-free', diskGB: 1, bandwidthGB: 5, monthlyPrice: 0 },
  });
  planIds['wp07-basic'] = basic.id;
  planIds['wp07-pro'] = pro.id;
  pricedPlanId = priced.id;
  freePlanId = free.id;

  const owner1 = await prisma.user.findUniqueOrThrow({
    where: { email: 'wp07-owner1@test.com' },
  });
  const owner2 = await prisma.user.update({
    where: { email: 'wp07-owner2@test.com' },
    data: { firstName: 'Zelda' },
  });

  const accounts = await Promise.all([
    prisma.hostingAccount.create({
      data: {
        userId: owner1.id,
        planId: basic.id,
        domain: 'wp07-alpha.sahary.cloud',
        diskQuota: 5,
        bandwidthQuota: 20,
        diskUsed: 1.5,
        bandwidthUsed: 2,
        status: 'ACTIVE',
        subscriptionStatus: 'active',
        stripeSubscriptionId: 'sub_wp07_alpha',
        currentPeriodEnd: new Date('2026-11-01T00:00:00Z'),
        ftpUser: 'wp07_ftp_alpha',
      },
    }),
    prisma.hostingAccount.create({
      data: {
        userId: owner1.id,
        planId: pro.id,
        domain: 'wp07-beta.sahary.cloud',
        diskQuota: 20,
        bandwidthQuota: 100,
        status: 'SUSPENDED',
        suspendedAt: new Date('2026-10-01T00:00:00Z'),
        suspendReason: 'ADMIN',
        subscriptionStatus: 'past_due',
        stripeSubscriptionId: 'sub_wp07_beta',
      },
    }),
    prisma.hostingAccount.create({
      data: {
        userId: owner1.id,
        planId: basic.id,
        domain: 'wp07-gamma.sahary.cloud',
        diskQuota: 5,
        bandwidthQuota: 20,
        status: 'PROVISION_FAILED',
        provisioningError: 'nginx config failed',
      },
    }),
    prisma.hostingAccount.create({
      data: {
        userId: owner1.id,
        planId: pro.id,
        domain: 'wp07-delta.sahary.cloud',
        diskQuota: 20,
        bandwidthQuota: 100,
        status: 'TERMINATED',
        terminatedAt: new Date('2026-09-01T00:00:00Z'),
      },
    }),
    prisma.hostingAccount.create({
      data: {
        userId: owner2.id,
        planId: pro.id,
        domain: 'wp07-epsilon.sahary.cloud',
        diskQuota: 20,
        bandwidthQuota: 100,
        status: 'ACTIVE',
        subscriptionStatus: 'trialing',
        stripeSubscriptionId: 'sub_wp07_epsilon',
      },
    }),
  ]);
  accountIds.alpha = accounts[0].id;
  accountIds.beta = accounts[1].id;
  accountIds.gamma = accounts[2].id;
  accountIds.delta = accounts[3].id;
  accountIds.epsilon = accounts[4].id;

  await prisma.hostingDatabase.create({
    data: { accountId: accountIds.alpha, name: 'wp07_main_db', isPrimary: true },
  });
  await prisma.hostingDomain.create({
    data: {
      accountId: accountIds.alpha,
      domain: 'blog.wp07-example.com',
      isVerified: true,
      sslStatus: 'ACTIVE',
      sslExpiresAt: new Date(Date.now() + 10 * 24 * 3600 * 1000),
    },
  });
  await prisma.hostingDomain.create({
    data: {
      accountId: accountIds.alpha,
      domain: 'shop.wp07-example.com',
      isVerified: true,
      sslStatus: 'FAILED',
      sslLastError: 'dns not ready',
    },
  });
};

beforeAll(async () => {
  await (global as any).cleanupTestUsers(prisma, EMAILS);
  await prisma.hostingPlan.deleteMany({ where: { name: { startsWith: 'wp07-' } } });

  const a = await register('wp07-admin@test.com', 'ADMIN');
  admin = a.user;
  adminToken = a.token;
  const s = await register('wp07-super@test.com', 'SUPER_ADMIN');
  superAdmin = s.user;
  superToken = s.token;
  await register('wp07-owner1@test.com', 'USER');
  await register('wp07-owner2@test.com', 'USER');
  const n = await register('wp07-normal@test.com', 'USER');
  userToken = n.token;

  await seedFixtures();
});

afterAll(async () => {
  await (global as any).cleanupTestUsers(prisma, EMAILS);
  await prisma.hostingPlan.deleteMany({ where: { name: { startsWith: 'wp07-' } } });
  await prisma.$disconnect();
});

const asAdmin = () => request.agent(app).set('Authorization', `Bearer ${adminToken}`);
const asSuper = () => request.agent(app).set('Authorization', `Bearer ${superToken}`);
const asUser = () => request.agent(app).set('Authorization', `Bearer ${userToken}`);

describe('admin hosting API', () => {
  describe('authorization', () => {
    test('401 without a token', async () => {
      const r = await request(app).get(`${BASE}/accounts`);
      expect(r.status).toBe(401);
      expect(r.body.success).toBe(false);
    });

    test('403 for a normal user', async () => {
      const r = await asUser().get(`${BASE}/accounts`);
      expect(r.status).toBe(403);
      expect(r.body.success).toBe(false);
    });

    test('admin can list, but cannot terminate', async () => {
      const list = await asAdmin().get(`${BASE}/accounts`);
      expect(list.status).toBe(200);

      const del = await asAdmin().delete(`${BASE}/accounts/${accountIds.alpha}`);
      expect(del.status).toBe(403);
      expect(lifecycle.terminateAccountById).not.toHaveBeenCalled();
    });
  });

  describe('GET /accounts', () => {
    test('returns paginated admin DTOs newest-first', async () => {
      const r = await asAdmin().get(`${BASE}/accounts?search=wp07-`);
      expect(r.status).toBe(200);
      const { items, page, limit, total } = r.body.data;
      expect(page).toBe(1);
      expect(limit).toBe(20);
      expect(total).toBe(5);
      expect(items).toHaveLength(5);

      const alpha = items.find((i: { domain: string }) => i.domain === 'wp07-alpha.sahary.cloud');
      expect(alpha).toMatchObject({
        status: 'ACTIVE',
        suspendReason: null,
        provisioningError: null,
        domainCount: 2,
        databaseCount: 1,
      });
      expect(alpha.owner.email).toBe('wp07-owner1@test.com');
      expect(alpha.plan.name).toBe('wp07-basic');
      expect(alpha.usage.diskUsedGB).toBe(1.5);
      expect(alpha.usage.diskQuotaGB).toBe(5);
      expect(alpha.subscription.status).toBe('active');

      const createdAts = items.map((i: { createdAt: string }) => i.createdAt);
      expect(createdAts).toEqual([...createdAts].sort().reverse());
    });

    test('status filter + invalid status 400', async () => {
      const r = await asAdmin().get(`${BASE}/accounts?status=SUSPENDED&search=wp07-`);
      expect(r.status).toBe(200);
      expect(r.body.data.items.every((i: { status: string }) => i.status === 'SUSPENDED')).toBe(true);
      expect(r.body.data.items.some((i: { id: string }) => i.id === accountIds.beta)).toBe(true);

      const bad = await asAdmin().get(`${BASE}/accounts?status=NOPE`);
      expect(bad.status).toBe(400);
    });

    test('search matches owner email and name case-insensitively', async () => {
      const byEmail = await asAdmin().get(`${BASE}/accounts?search=OWNER1@TEST`);
      expect(byEmail.body.data.items.every(
        (i: { owner: { email: string } }) => i.owner.email === 'wp07-owner1@test.com',
      )).toBe(true);

      const byName = await asAdmin().get(`${BASE}/accounts?search=zelda`);
      expect(byName.body.data.total).toBe(1);
      expect(byName.body.data.items[0].domain).toBe('wp07-epsilon.sahary.cloud');
    });

    test('pagination slices correctly', async () => {
      const p1 = await asAdmin().get(`${BASE}/accounts?search=wp07-&limit=2&page=1`);
      const p2 = await asAdmin().get(`${BASE}/accounts?search=wp07-&limit=2&page=2`);
      expect(p1.body.data.items).toHaveLength(2);
      expect(p2.body.data.items).toHaveLength(2);
      expect(p2.body.data.page).toBe(2);
      const ids1 = p1.body.data.items.map((i: { id: string }) => i.id);
      const ids2 = p2.body.data.items.map((i: { id: string }) => i.id);
      expect(ids1.filter((id: string) => ids2.includes(id))).toHaveLength(0);

      const over = await asAdmin().get(`${BASE}/accounts?limit=101`);
      expect(over.status).toBe(400);
    });
  });

  describe('GET /accounts/:id', () => {
    test('detail DTO includes domains, databases and ftpUser', async () => {
      const r = await asAdmin().get(`${BASE}/accounts/${accountIds.alpha}`);
      expect(r.status).toBe(200);
      const d = r.body.data;
      expect(d.id).toBe(accountIds.alpha);
      expect(d.ftpUser).toBe('wp07_ftp_alpha');
      expect(d.domains).toHaveLength(2);
      expect(d.domains.map((x: { domain: string }) => x.domain)).toEqual([
        'blog.wp07-example.com',
        'shop.wp07-example.com',
      ]);
      expect(d.domains[0].ssl.status).toBe('ACTIVE');
      expect(d.databases).toHaveLength(1);
      expect(d.databases[0]).toMatchObject({ name: 'wp07_main_db', isPrimary: true });
    });

    test('unknown id -> 404', async () => {
      const r = await asAdmin().get(`${BASE}/accounts/no-such-id`);
      expect(r.status).toBe(404);
    });
  });

  describe('account actions', () => {
    test('suspend calls lifecycle with ADMIN reason + note and audits', async () => {
      const r = await asAdmin()
        .post(`${BASE}/accounts/${accountIds.alpha}/suspend`)
        .send({ note: 'abuse check' });
      expect(r.status).toBe(200);
      expect(r.body.data.id).toBe(accountIds.alpha);
      expect(lifecycle.suspendAccount).toHaveBeenCalledWith(
        accountIds.alpha,
        'ADMIN',
        { actorUserId: admin.id, note: 'abuse check' },
      );

      const audit = await prisma.auditLog.findFirst({
        where: { action: 'HOSTING_ACCOUNT_SUSPEND', resourceId: accountIds.alpha },
      });
      expect(audit).not.toBeNull();
      expect(audit?.userId).toBe(admin.id);
      expect(audit?.resource).toBe('hosting_account');
      expect(audit?.newValues).toContain('abuse check');
    });

    test('suspend on non-ACTIVE -> 409 without calling lifecycle', async () => {
      lifecycle.suspendAccount.mockClear();
      const r = await asAdmin().post(`${BASE}/accounts/${accountIds.beta}/suspend`).send({});
      expect(r.status).toBe(409);
      expect(r.body.message).toContain('SUSPENDED');
      expect(lifecycle.suspendAccount).not.toHaveBeenCalled();
    });

    test('suspend unknown id -> 404', async () => {
      const r = await asAdmin().post(`${BASE}/accounts/nope/suspend`).send({});
      expect(r.status).toBe(404);
    });

    test('activate calls lifecycle only for SUSPENDED', async () => {
      const ok = await asAdmin().post(`${BASE}/accounts/${accountIds.beta}/activate`);
      expect(ok.status).toBe(200);
      expect(lifecycle.activateAccount).toHaveBeenCalledWith(accountIds.beta, {
        actorUserId: admin.id,
      });

      lifecycle.activateAccount.mockClear();
      const conflict = await asAdmin().post(`${BASE}/accounts/${accountIds.alpha}/activate`);
      expect(conflict.status).toBe(409);
      expect(lifecycle.activateAccount).not.toHaveBeenCalled();
    });

    test('retry-provisioning only for PROVISION_FAILED', async () => {
      const ok = await asAdmin().post(`${BASE}/accounts/${accountIds.gamma}/retry-provisioning`);
      expect(ok.status).toBe(200);
      expect(lifecycle.retryProvisioning).toHaveBeenCalledWith(accountIds.gamma, {
        actorUserId: admin.id,
      });

      const conflict = await asAdmin().post(`${BASE}/accounts/${accountIds.alpha}/retry-provisioning`);
      expect(conflict.status).toBe(409);
    });

    test('super admin terminates; terminate audits and re-terminating -> 409', async () => {
      const r = await asSuper().delete(`${BASE}/accounts/${accountIds.epsilon}`);
      expect(r.status).toBe(200);
      expect(lifecycle.terminateAccountById).toHaveBeenCalledWith(accountIds.epsilon, {
        actorUserId: superAdmin.id,
        reason: 'ADMIN',
      });
      const audit = await prisma.auditLog.findFirst({
        where: { action: 'HOSTING_ACCOUNT_TERMINATE', resourceId: accountIds.epsilon },
      });
      expect(audit?.userId).toBe(superAdmin.id);

      lifecycle.terminateAccountById.mockClear();
      const again = await asSuper().delete(`${BASE}/accounts/${accountIds.delta}`);
      expect(again.status).toBe(409);
      expect(lifecycle.terminateAccountById).not.toHaveBeenCalled();
    });
  });

  describe('GET /stats', () => {
    test('aggregates match live DB values', async () => {
      const [byStatus, usage, paying, sslA, sslE, sslF, planCounts] = await Promise.all([
        prisma.hostingAccount.groupBy({ by: ['status'], _count: { _all: true } }),
        prisma.hostingAccount.aggregate({
          where: { status: { not: 'TERMINATED' } },
          _sum: { diskUsed: true, diskQuota: true, bandwidthUsed: true, bandwidthQuota: true },
        }),
        prisma.hostingAccount.findMany({
          where: { status: 'ACTIVE', subscriptionStatus: { in: ['active', 'trialing', 'past_due'] } },
          select: { plan: { select: { monthlyPrice: true } } },
        }),
        prisma.hostingDomain.count({ where: { sslStatus: 'ACTIVE' } }),
        prisma.hostingDomain.count({
          where: { sslStatus: 'ACTIVE', sslExpiresAt: { gt: new Date(), lte: new Date(Date.now() + 14 * 86400000) } },
        }),
        prisma.hostingDomain.count({ where: { sslStatus: 'FAILED' } }),
        prisma.hostingAccount.groupBy({
          by: ['planId'],
          where: { status: { not: 'TERMINATED' } },
          _count: { _all: true },
        }),
      ]);

      const r = await asAdmin().get(`${BASE}/stats`);
      expect(r.status).toBe(200);
      const s = r.body.data;

      const count = (status: string) =>
        byStatus.find((x) => x.status === status)?._count._all ?? 0;
      expect(s.accounts.total).toBe(byStatus.reduce((sum, x) => sum + x._count._all, 0));
      expect(s.accounts.active).toBe(count('ACTIVE'));
      expect(s.accounts.suspended).toBe(count('SUSPENDED'));
      expect(s.accounts.provisioning).toBe(count('PROVISIONING'));
      expect(s.accounts.failed).toBe(count('PROVISION_FAILED'));
      expect(s.accounts.terminated).toBe(count('TERMINATED'));

      const expectedMrr = Math.round(
        paying.reduce((sum, x) => sum + Number(x.plan.monthlyPrice), 0) * 100,
      ) / 100;
      expect(s.mrr).toBe(expectedMrr);

      expect(s.usage.diskUsedGB).toBe(usage._sum.diskUsed ?? 0);
      expect(s.usage.diskQuotaGB).toBe(usage._sum.diskQuota ?? 0);
      expect(s.usage.bandwidthUsedGB).toBe(usage._sum.bandwidthUsed ?? 0);
      expect(s.usage.bandwidthQuotaGB).toBe(usage._sum.bandwidthQuota ?? 0);

      expect(s.ssl).toEqual({ active: sslA, expiringWithin14Days: sslE, failed: sslF });

      const basicPlan = s.plans.find((p: { planId: string }) => p.planId === planIds['wp07-basic']);
      const proPlan = s.plans.find((p: { planId: string }) => p.planId === planIds['wp07-pro']);
      expect(basicPlan).toMatchObject({
        name: 'wp07-basic',
        accounts: planCounts.find((x) => x.planId === planIds['wp07-basic'])?._count._all ?? 0,
      });
      expect(proPlan).toMatchObject({
        name: 'wp07-pro',
        accounts: planCounts.find((x) => x.planId === planIds['wp07-pro'])?._count._all ?? 0,
      });
      // Deterministic seeds: basic has ACTIVE+PROVISION_FAILED, pro has SUSPENDED+ACTIVE (TERMINATED excluded).
      expect(basicPlan.accounts).toBe(2);
      expect(proPlan.accounts).toBe(2);
    });
  });

  describe('GET /plans', () => {
    test('includes inactive plans with non-TERMINATED account counts', async () => {
      const r = await asAdmin().get(`${BASE}/plans`);
      expect(r.status).toBe(200);
      const plans = r.body.data as Array<Record<string, unknown>>;
      const basic = plans.find((p) => p.name === 'wp07-basic');
      const pro = plans.find((p) => p.name === 'wp07-pro');
      expect(basic).toMatchObject({ isActive: true, accountCount: 2, monthlyPrice: 4.99 });
      // pro is inactive but still listed; accounts = SUSPENDED + ACTIVE (TERMINATED excluded) = 2
      expect(pro).toMatchObject({
        isActive: false,
        accountCount: 2,
        stripeProductId: 'prod_wp07_pro',
        stripePriceId: 'price_wp07_pro',
      });
    });
  });

  describe('PUT /plans/:id', () => {
    test('price change on Stripe-linked plan syncs first, then persists', async () => {
      const seenAtSync: number[] = [];
      stripeBilling.syncPlanToStripe.mockImplementationOnce(async (planId: string) => {
        const plan = await prisma.hostingPlan.findUniqueOrThrow({ where: { id: planId } });
        seenAtSync.push(Number(plan.monthlyPrice));
        return { stripeProductId: 'prod_new', stripePriceId: 'price_new' };
      });

      const r = await asAdmin()
        .put(`${BASE}/plans/${pricedPlanId}`)
        .send({ monthlyPrice: 9.99, diskGB: 15 });
      expect(r.status).toBe(200);
      expect(stripeBilling.syncPlanToStripe).toHaveBeenCalledWith(pricedPlanId);
      // Sync observed the OLD price -> it ran before the update persisted.
      expect(seenAtSync).toEqual([5]);

      const after = await prisma.hostingPlan.findUniqueOrThrow({ where: { id: pricedPlanId } });
      expect(Number(after.monthlyPrice)).toBe(9.99);
      expect(after.diskGB).toBe(15);
      expect(after.stripePriceId).toBe('price_new');
      expect(after.stripeProductId).toBe('prod_new');
      expect(r.body.data).toMatchObject({ stripePriceId: 'price_new', accountCount: 0 });

      const audit = await prisma.auditLog.findFirst({
        where: { action: 'HOSTING_PLAN_UPDATE', resourceId: pricedPlanId },
      });
      expect(audit).not.toBeNull();
      expect(audit?.userId).toBe(admin.id);
      expect(audit?.newValues).toContain('9.99');
    });

    test('sync failure -> 502 and nothing persisted', async () => {
      stripeBilling.syncPlanToStripe.mockRejectedValueOnce(
        httpError(502, 'Stripe sync failed'),
      );

      const r = await asAdmin()
        .put(`${BASE}/plans/${pricedPlanId}`)
        .send({ monthlyPrice: 12.34 });
      expect(r.status).toBe(502);

      const after = await prisma.hostingPlan.findUniqueOrThrow({ where: { id: pricedPlanId } });
      expect(Number(after.monthlyPrice)).toBe(9.99);
      expect(after.stripePriceId).toBe('price_new');
    });

    test('plan without stripePriceId skips sync and persists', async () => {
      const callsBefore = stripeBilling.syncPlanToStripe.mock.calls.length;
      const r = await asAdmin()
        .put(`${BASE}/plans/${freePlanId}`)
        .send({ diskGB: 3, isActive: false });
      expect(r.status).toBe(200);
      expect(stripeBilling.syncPlanToStripe.mock.calls.length).toBe(callsBefore);

      const after = await prisma.hostingPlan.findUniqueOrThrow({ where: { id: freePlanId } });
      expect(after.diskGB).toBe(3);
      expect(after.isActive).toBe(false);
    });

    test('unchanged monthlyPrice does not sync', async () => {
      const callsBefore = stripeBilling.syncPlanToStripe.mock.calls.length;
      const r = await asAdmin()
        .put(`${BASE}/plans/${pricedPlanId}`)
        .send({ monthlyPrice: 9.99 });
      expect(r.status).toBe(200);
      expect(stripeBilling.syncPlanToStripe.mock.calls.length).toBe(callsBefore);
    });

    test('validation: unknown key, name, negative, decimals, non-int -> 400', async () => {
      const cases = [
        { unknownField: 1 },
        { name: 'rename' },
        { diskGB: -1 },
        { monthlyPrice: 9.999 },
        { monthlyPrice: -5 },
        { maxDomains: 1.5 },
      ];
      for (const body of cases) {
        const r = await asAdmin().put(`${BASE}/plans/${freePlanId}`).send(body);
        expect(r.status).toBe(400);
        expect(r.body.success).toBe(false);
      }
    });

    test('unknown plan -> 404; normal user -> 403', async () => {
      const r = await asAdmin().put(`${BASE}/plans/no-such`).send({ diskGB: 1 });
      expect(r.status).toBe(404);

      const forbidden = await asUser().put(`${BASE}/plans/${freePlanId}`).send({ diskGB: 1 });
      expect(forbidden.status).toBe(403);
    });
  });
});
