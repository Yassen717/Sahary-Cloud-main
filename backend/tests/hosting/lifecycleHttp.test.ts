import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import request from 'supertest';

// --- collaborator mocks (WP01/03/04/05/07 own the real implementations) ---
jest.mock('../../src/services/mysqlProvisionService', () => ({
  isMysqlEnabled: jest.fn(() => false),
  ensureAccountUser: jest.fn(async () => {}),
  ensureDatabase: jest.fn(async () => {}),
  dropDatabase: jest.fn(async () => {}),
  dropAccountUser: jest.fn(async () => {}),
  setAccountUserPassword: jest.fn(async () => {}),
  setAccountUserLocked: jest.fn(async () => {}),
  healthCheck: jest.fn(async () => ({ ok: true })),
}));
jest.mock('../../src/services/ftpService', () => ({
  isFtpEnabled: jest.fn(() => false),
  provisionFtpUser: jest.fn(async () => {}),
  deleteFtpUser: jest.fn(async () => {}),
  setFtpQuota: jest.fn(async () => {}),
  setFtpUserEnabled: jest.fn(async () => {}),
  resetFtpPassword: jest.fn(),
  healthCheck: jest.fn(async () => ({ ok: true })),
}));
jest.mock('../../src/services/sslService', () => ({
  isSslEnabled: jest.fn(() => false),
  getWildcardStatus: jest.fn(() => ({ available: false, expiresAt: null })),
  issueCertificateForDomain: jest.fn(),
  issuePendingCertificates: jest.fn(async () => ({ attempted: 0, issued: 0, failed: 0 })),
  renewExpiringCertificates: jest.fn(async () => ({ checked: 0, renewed: 0, failed: 0 })),
  deleteCertificate: jest.fn(async () => {}),
  syncPrimarySslState: jest.fn(async () => ({ updated: 0 })),
  healthCheck: jest.fn(async () => ({ ok: true })),
}));
jest.mock('../../src/services/stripeBillingService', () => ({
  cancelSubscriptionNow: jest.fn(async () => {}),
  syncPlanToStripe: jest.fn(),
}));
jest.mock('../../src/services/hostingNotificationService', () => ({
  notifyAccountProvisioned: jest.fn(async () => {}),
  notifyAccountSuspended: jest.fn(async () => {}),
  notifyAccountReactivated: jest.fn(async () => {}),
  notifyPaymentFailed: jest.fn(async () => {}),
  notifySubscriptionCanceled: jest.fn(async () => {}),
  notifyQuotaAlert: jest.fn(async () => {}),
  notifySslIssued: jest.fn(async () => {}),
  notifySslExpiring: jest.fn(async () => {}),
  notifySslFailed: jest.fn(async () => {}),
}));
jest.mock('../../src/services/vhostService', () => ({
  syncAccountVhost: jest.fn(async () => ({ skipped: true })),
  removeAccountVhost: jest.fn(async () => ({ skipped: true })),
}));

import { prisma } from '../../src/config/database';
import JWTUtils from '../../src/utils/jwt';
import * as mysql from '../../src/services/mysqlProvisionService';
import * as ftp from '../../src/services/ftpService';
import * as ssl from '../../src/services/sslService';
import app = require('../../src/index');

const asMock = (f: unknown): jest.Mock => f as jest.Mock;

// jest config resets mock implementations between tests — re-establish the
// benign defaults before each request.
const resetCollaborators = () => {
  asMock(mysql.isMysqlEnabled).mockReturnValue(false);
  asMock(ftp.isFtpEnabled).mockReturnValue(false);
  asMock(ftp.provisionFtpUser).mockResolvedValue(undefined);
  asMock(ftp.deleteFtpUser).mockResolvedValue(undefined);
  asMock(ftp.setFtpUserEnabled).mockResolvedValue(undefined);
  asMock(ftp.setFtpQuota).mockResolvedValue(undefined);
  asMock(ssl.getWildcardStatus).mockReturnValue({ available: false, expiresAt: null });
  asMock(ssl.deleteCertificate).mockResolvedValue(undefined);
  asMock(mysql.ensureAccountUser).mockResolvedValue(undefined);
  asMock(mysql.ensureDatabase).mockResolvedValue(undefined);
  asMock(mysql.setAccountUserLocked).mockResolvedValue(undefined);
  asMock(mysql.dropDatabase).mockResolvedValue(undefined);
  asMock(mysql.dropAccountUser).mockResolvedValue(undefined);
};

const RUN = `wp02h${Date.now().toString(36)}`;
let wwwBase = '';

const makeUser = async (tag: string) => {
  const user = await prisma.user.create({
    data: {
      email: `${tag}@example.com`,
      password: 'irrelevant-hash',
      firstName: 'WP02H',
      lastName: tag,
      isVerified: true,
    },
  });
  const token = JWTUtils.generateAccessToken({
    userId: user.id,
    email: user.email,
    role: 'USER',
  });
  return { user, token };
};

const makePlan = (tag: string, over: Record<string, unknown> = {}) =>
  prisma.hostingPlan.create({
    data: {
      name: `${RUN}-${tag}`,
      diskGB: 5,
      bandwidthGB: 50,
      maxDomains: 2,
      maxDatabases: 1,
      maxFtpAccounts: 1,
      monthlyPrice: 4.99,
      isActive: true,
      ...over,
    },
  });

beforeAll(async () => {
  wwwBase = await fs.mkdtemp(path.join(os.tmpdir(), 'wp02h-www-'));
  process.env.HOSTING_WWW_BASE = wwwBase;
  process.env.HOSTING_TRASH_DIR = path.join(wwwBase, '.trash');
});

beforeEach(() => {
  resetCollaborators();
  delete process.env.HOSTING_ALLOW_UNPAID_ACCOUNTS;
});

afterAll(async () => {
  const users = await prisma.user.findMany({
    where: { firstName: 'WP02H' },
    select: { id: true },
  });
  const ids = users.map((u) => u.id);
  if (ids.length > 0) {
    await prisma.auditLog.deleteMany({ where: { userId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
  }
  await prisma.hostingPlan.deleteMany({ where: { name: { startsWith: `${RUN}-` } } });
  await fs.rm(wwwBase, { recursive: true, force: true });
  delete process.env.HOSTING_WWW_BASE;
  delete process.env.HOSTING_TRASH_DIR;
  delete process.env.HOSTING_ALLOW_UNPAID_ACCOUNTS;
});

describe('GET /api/v1/hosting/plans', () => {
  test('is public and returns HostingPlanDTO[]', async () => {
    const plan = await makePlan('http1', { monthlyPrice: 2.5, stripePriceId: 'price_x' });
    const res = await request(app).get('/api/v1/hosting/plans');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const found = (res.body.data as Array<Record<string, unknown>>).find((p) => p.id === plan.id);
    expect(found).toMatchObject({
      name: `${RUN}-http1`,
      diskGB: 5,
      bandwidthGB: 50,
      currency: 'USD',
      isActive: true,
      purchasable: true,
      monthlyPrice: 2.5,
    });
    // inactive plans must not be listed
    await makePlan('http1hidden', { isActive: false });
    const res2 = await request(app).get('/api/v1/hosting/plans');
    expect(
      (res2.body.data as Array<{ name: string }>).some((p) => p.name === `${RUN}-http1hidden`),
    ).toBe(false);
  });
});

describe('GET /api/v1/hosting/accounts/me', () => {
  test('401 without auth, 404 without account, 200 with DTO', async () => {
    const unauth = await request(app).get('/api/v1/hosting/accounts/me');
    expect(unauth.status).toBe(401);

    const { user, token } = await makeUser(`${RUN}-me`);
    const missing = await request(app)
      .get('/api/v1/hosting/accounts/me')
      .set('Authorization', `Bearer ${token}`);
    expect(missing.status).toBe(404);
    expect(missing.body).toEqual({ success: false, message: 'No hosting account found' });

    const plan = await makePlan('me');
    await prisma.hostingAccount.create({
      data: {
        domain: `${RUN}-me.sahary.cloud`,
        documentRoot: `${wwwBase}/me/public_html`,
        diskQuota: plan.diskGB,
        bandwidthQuota: plan.bandwidthGB,
        status: 'ACTIVE',
        userId: user.id,
        planId: plan.id,
      },
    });

    const res = await request(app)
      .get('/api/v1/hosting/accounts/me')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toMatchObject({
      domain: `${RUN}-me.sahary.cloud`,
      status: 'ACTIVE',
      url: `http://${RUN}-me.sahary.cloud`,
      suspendReason: null,
    });
    expect(res.body.data.plan.id).toBe(plan.id);
    expect(res.body.data.usage.diskQuotaGB).toBe(5);
  });
});

describe('POST /api/v1/hosting/accounts', () => {
  test('402 when unpaid accounts are not allowed', async () => {
    const { token } = await makeUser(`${RUN}-g1`);
    const plan = await makePlan('g1');
    const res = await request(app)
      .post('/api/v1/hosting/accounts')
      .set('Authorization', `Bearer ${token}`)
      .send({ planId: plan.id });
    expect(res.status).toBe(402);
    expect(res.body).toEqual({
      success: false,
      message: 'An active subscription is required. Subscribe to a plan first.',
    });
  });

  test('400 for missing planId and invalid domain format', async () => {
    const { token } = await makeUser(`${RUN}-g2`);
    const noPlan = await request(app)
      .post('/api/v1/hosting/accounts')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(noPlan.status).toBe(400);

    const badDomain = await request(app)
      .post('/api/v1/hosting/accounts')
      .set('Authorization', `Bearer ${token}`)
      .send({ planId: 'x', domain: 'not a domain' });
    expect(badDomain.status).toBe(400);
    expect(badDomain.body.message).toBe('Invalid domain format');
  });

  test('201 via the dev escape hatch; GET /me then returns the account', async () => {
    process.env.HOSTING_ALLOW_UNPAID_ACCOUNTS = 'true';
    const { user, token } = await makeUser(`${RUN}-g3`);
    const plan = await makePlan('g3');

    const res = await request(app)
      .post('/api/v1/hosting/accounts')
      .set('Authorization', `Bearer ${token}`)
      .send({ planId: plan.id, domain: 'wanted.example.com' });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('ACTIVE');
    expect(res.body.data.domain).toMatch(/^[a-z0-9]+\.sahary\.cloud$/);
    expect(res.body.data.domains).toHaveLength(1);
    expect(res.body.data.domains[0].domain).toBe('wanted.example.com');

    const me = await request(app)
      .get('/api/v1/hosting/accounts/me')
      .set('Authorization', `Bearer ${token}`);
    expect(me.status).toBe(200);
    expect(me.body.data.id).toBe(res.body.data.id);

    // second call 409s — one live account per user
    const again = await request(app)
      .post('/api/v1/hosting/accounts')
      .set('Authorization', `Bearer ${token}`)
      .send({ planId: plan.id });
    expect(again.status).toBe(409);

    void user;
  });

  test('401 without a token', async () => {
    const res = await request(app).post('/api/v1/hosting/accounts').send({ planId: 'x' });
    expect(res.status).toBe(401);
  });
});
