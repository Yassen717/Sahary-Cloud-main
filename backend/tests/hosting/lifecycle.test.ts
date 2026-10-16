import fs from 'fs/promises';
import os from 'os';
import path from 'path';

// --- collaborator mocks (foundation stubs today; WP01/03/04/05/07 own them) ---
jest.mock('../../src/services/mysqlProvisionService', () => ({
  isMysqlEnabled: jest.fn(),
  ensureAccountUser: jest.fn(),
  ensureDatabase: jest.fn(),
  dropDatabase: jest.fn(),
  dropAccountUser: jest.fn(),
  setAccountUserPassword: jest.fn(),
  setAccountUserLocked: jest.fn(),
  healthCheck: jest.fn(),
}));
jest.mock('../../src/services/ftpService', () => ({
  isFtpEnabled: jest.fn(),
  provisionFtpUser: jest.fn(),
  deleteFtpUser: jest.fn(),
  setFtpQuota: jest.fn(),
  setFtpUserEnabled: jest.fn(),
  resetFtpPassword: jest.fn(),
  healthCheck: jest.fn(),
}));
jest.mock('../../src/services/sslService', () => ({
  isSslEnabled: jest.fn(),
  getWildcardStatus: jest.fn(),
  issueCertificateForDomain: jest.fn(),
  issuePendingCertificates: jest.fn(),
  renewExpiringCertificates: jest.fn(),
  deleteCertificate: jest.fn(),
  syncPrimarySslState: jest.fn(),
  healthCheck: jest.fn(),
}));
jest.mock('../../src/services/stripeBillingService', () => ({
  cancelSubscriptionNow: jest.fn(),
  syncPlanToStripe: jest.fn(),
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
jest.mock('../../src/services/vhostService', () => ({
  syncAccountVhost: jest.fn(),
  removeAccountVhost: jest.fn(),
}));
jest.mock('dns', () => {
  const real = jest.requireActual('dns');
  return { ...real, promises: { ...real.promises, resolveTxt: jest.fn() } };
});

import { promises as dns } from 'dns';
import { prisma } from '../../src/config/database';
import { accountDocumentRoot, mysqlPrimaryDbFor, mysqlUserFor } from '../../src/services/hostingNaming';
import * as lifecycle from '../../src/services/hostingLifecycleService';
import * as hostingService from '../../src/services/hostingService';
import * as mysql from '../../src/services/mysqlProvisionService';
import * as ftp from '../../src/services/ftpService';
import * as ssl from '../../src/services/sslService';
import * as stripe from '../../src/services/stripeBillingService';
import * as notify from '../../src/services/hostingNotificationService';
import retentionJob = require('../../src/jobs/hostingRetentionJob');

const vhost = jest.requireMock('../../src/services/vhostService') as {
  syncAccountVhost: jest.Mock;
  removeAccountVhost: jest.Mock;
};

const asMock = (f: unknown): jest.Mock => f as jest.Mock;
const resolveTxt = asMock(dns.resolveTxt);

const RUN = `wp02${Date.now().toString(36)}`;
let seq = 0;
let wwwBase = '';
let trashDir = '';

const nextSeq = (): string => {
  seq += 1;
  return `${RUN}${seq}`;
};

const makeUser = (tag: string) =>
  prisma.user.create({
    data: {
      email: `${tag}@example.com`,
      password: 'irrelevant-hash',
      firstName: 'WP02',
      lastName: tag,
      isVerified: true,
    },
  });

const makePlan = (tag: string, over: Record<string, unknown> = {}) =>
  prisma.hostingPlan.create({
    data: {
      name: `${RUN}-${tag}`,
      diskGB: 5,
      bandwidthGB: 50,
      maxDomains: 2,
      maxDatabases: 1,
      maxFtpAccounts: 1,
      monthlyPrice: 9.99,
      isActive: true,
      ...over,
    },
  });

const makeAccount = (
  userId: string,
  planId: string,
  over: Record<string, unknown> = {},
) => {
  const tag = nextSeq();
  const documentRoot = `${wwwBase}/${tag}/public_html`;
  return prisma.hostingAccount.create({
    data: {
      id: tag,
      domain: `${tag}.sahary.cloud`,
      documentRoot,
      diskQuota: 5,
      bandwidthQuota: 50,
      status: 'ACTIVE',
      ftpUser: `ftp_${tag}`,
      dbUser: `sc_${tag}`,
      dbName: `sc_${tag}_main`,
      userId,
      planId,
      ...over,
    },
    include: { plan: true, domains: true },
  });
};

const paidInput = (userId: string, planId: string, tag: string) => ({
  userId,
  planId,
  stripeCustomerId: `cus_${tag}`,
  stripeSubscriptionId: `sub_${tag}`,
  subscriptionStatus: 'active',
  currentPeriodEnd: new Date('2026-11-01T00:00:00Z'),
});

const docrootOf = (accountId: string) => accountDocumentRoot(wwwBase, accountId);

const resetCollaborators = () => {
  asMock(mysql.isMysqlEnabled).mockReturnValue(false);
  asMock(mysql.ensureAccountUser).mockResolvedValue(undefined);
  asMock(mysql.ensureDatabase).mockResolvedValue(undefined);
  asMock(mysql.dropDatabase).mockResolvedValue(undefined);
  asMock(mysql.dropAccountUser).mockResolvedValue(undefined);
  asMock(mysql.setAccountUserLocked).mockResolvedValue(undefined);

  asMock(ftp.isFtpEnabled).mockReturnValue(false);
  asMock(ftp.provisionFtpUser).mockResolvedValue(undefined);
  asMock(ftp.deleteFtpUser).mockResolvedValue(undefined);
  asMock(ftp.setFtpQuota).mockResolvedValue(undefined);
  asMock(ftp.setFtpUserEnabled).mockResolvedValue(undefined);

  asMock(ssl.isSslEnabled).mockReturnValue(false);
  asMock(ssl.getWildcardStatus).mockReturnValue({ available: false, expiresAt: null });
  asMock(ssl.deleteCertificate).mockResolvedValue(undefined);

  asMock(stripe.cancelSubscriptionNow).mockResolvedValue(undefined);

  const notifyFns = [
    'notifyAccountProvisioned',
    'notifyAccountSuspended',
    'notifyAccountReactivated',
    'notifyPaymentFailed',
    'notifySubscriptionCanceled',
    'notifyQuotaAlert',
    'notifySslIssued',
    'notifySslExpiring',
    'notifySslFailed',
  ] as const;
  for (const key of notifyFns) {
    asMock(notify[key]).mockResolvedValue(undefined);
  }

  vhost.syncAccountVhost.mockResolvedValue({ skipped: true });
  vhost.removeAccountVhost.mockResolvedValue({ skipped: true });
};

beforeAll(async () => {
  wwwBase = await fs.mkdtemp(path.join(os.tmpdir(), 'wp02-www-'));
  trashDir = path.join(wwwBase, '.trash');
  process.env.HOSTING_WWW_BASE = wwwBase;
  process.env.HOSTING_TRASH_DIR = trashDir;
});

beforeEach(() => {
  resetCollaborators();
  delete process.env.HOSTING_NGINX_ENABLED;
  delete process.env.HOSTING_ALLOW_UNPAID_ACCOUNTS;
  delete process.env.HOSTING_RETENTION_DAYS;
  delete process.env.HOSTING_SUSPENDED_RETENTION_DAYS;
});

afterAll(async () => {
  const users = await prisma.user.findMany({
    where: { email: { endsWith: '@example.com' }, firstName: 'WP02' },
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
});

// ---------------------------------------------------------------------------
describe('provisionPaidAccount', () => {
  test('happy path: rows, docroot, step order, ACTIVE, notification', async () => {
    asMock(mysql.isMysqlEnabled).mockReturnValue(true);
    asMock(ftp.isFtpEnabled).mockReturnValue(true);
    const wildcardExpiry = new Date('2027-03-01T00:00:00Z');
    asMock(ssl.getWildcardStatus).mockReturnValue({ available: true, expiresAt: wildcardExpiry });

    const user = await makeUser(`${RUN}-p1`);
    const plan = await makePlan('basic');
    const res = await lifecycle.provisionPaidAccount({
      ...paidInput(user.id, plan.id, 'p1'),
      requestedDomain: 'mysite.example.com',
    });

    expect(res.created).toBe(true);
    expect(res.account.status).toBe('ACTIVE');
    expect(res.account.domain).toMatch(/^[a-z0-9]+\.sahary\.cloud$/);
    expect(res.account.url).toBe(`https://${res.account.domain}`);
    expect(res.account.subscription).toEqual({
      status: 'active',
      currentPeriodEnd: '2026-11-01T00:00:00.000Z',
      cancelAtPeriodEnd: false,
    });
    expect(res.account.plan.id).toBe(plan.id);
    expect(res.account.ftpUser).toBeTruthy();

    const row = await prisma.hostingAccount.findUniqueOrThrow({
      where: { id: res.account.id },
      include: { databases: true, domains: true },
    });
    expect(row.dbUser).toBe(mysqlUserFor(row.id));
    expect(row.dbName).toBe(mysqlPrimaryDbFor(row.id));
    expect(row.stripeSubscriptionId).toBe('sub_p1');
    expect(row.bandwidthCycleStart?.toISOString()).toBe(
      new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)).toISOString(),
    );
    expect(row.sslEnabled).toBe(true);
    expect(row.sslExpiresAt?.toISOString()).toBe(wildcardExpiry.toISOString());
    expect(row.databases).toHaveLength(1);
    expect(row.databases[0]).toMatchObject({ name: row.dbName, isPrimary: true });
    expect(row.domains).toHaveLength(1);
    expect(row.domains[0]).toMatchObject({ domain: 'mysite.example.com', isVerified: false });
    expect(row.domains[0].verifyToken).toBeTruthy();
    // credentials stay hidden until an explicit reveal
    expect(row.ftpPassword).toBeNull();
    expect(row.dbPassword).toBeNull();

    const indexHtml = await fs.readFile(path.join(docrootOf(row.id), 'index.html'), 'utf8');
    expect(indexHtml).toContain('Your site is ready');

    // collaborator calls + order
    expect(mysql.ensureAccountUser).toHaveBeenCalledWith(row.dbUser, expect.any(String));
    expect(mysql.ensureDatabase).toHaveBeenCalledWith(row.dbName, row.dbUser);
    expect(ftp.provisionFtpUser).toHaveBeenCalledWith({
      username: row.ftpUser,
      documentRoot: docrootOf(row.id),
      quotaMB: plan.diskGB * 1024,
    });
    expect(vhost.syncAccountVhost).toHaveBeenCalledWith({
      primaryDomain: row.domain,
      customDomains: [],
      documentRoot: docrootOf(row.id),
    });
    expect(notify.notifyAccountProvisioned).toHaveBeenCalledWith(row.id);

    const order = (m: jest.Mock) => m.mock.invocationCallOrder[0];
    expect(order(asMock(mysql.ensureAccountUser))).toBeLessThan(order(asMock(mysql.ensureDatabase)));
    expect(order(asMock(mysql.ensureDatabase))).toBeLessThan(order(asMock(ftp.provisionFtpUser)));
    expect(order(asMock(ftp.provisionFtpUser))).toBeLessThan(order(asMock(ssl.getWildcardStatus)));
    expect(order(asMock(ssl.getWildcardStatus))).toBeLessThan(order(vhost.syncAccountVhost));
    expect(order(vhost.syncAccountVhost)).toBeLessThan(order(asMock(notify.notifyAccountProvisioned)));

    const userRow = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(userRow.stripeCustomerId).toBe('cus_p1');
  });

  test('idempotent by stripeSubscriptionId: second call returns same account', async () => {
    const user = await makeUser(`${RUN}-p2`);
    const plan = await makePlan('basic2');
    const input = paidInput(user.id, plan.id, 'p2');

    const first = await lifecycle.provisionPaidAccount(input);
    const second = await lifecycle.provisionPaidAccount(input);

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.account.id).toBe(first.account.id);
    const count = await prisma.hostingAccount.count({ where: { userId: user.id } });
    expect(count).toBe(1);
  });

  test('resumes an unfinished account for the same subscription id', async () => {
    const user = await makeUser(`${RUN}-p3`);
    const plan = await makePlan('basic3');
    const failed = await makeAccount(user.id, plan.id, {
      status: 'PROVISION_FAILED',
      provisioningError: 'boom',
      stripeSubscriptionId: 'sub_p3',
      subscriptionStatus: 'active',
    });

    const res = await lifecycle.provisionPaidAccount(paidInput(user.id, plan.id, 'p3'));
    expect(res.created).toBe(false);
    expect(res.account.id).toBe(failed.id);
    expect(res.account.status).toBe('ACTIVE');

    const row = await prisma.hostingAccount.findUniqueOrThrow({ where: { id: failed.id } });
    expect(row.provisioningError).toBeNull();
    expect(await fs.stat(path.join(docrootOf(failed.id), 'index.html'))).toBeTruthy();
  });

  test('409 when the user owns a different non-TERMINATED account', async () => {
    const user = await makeUser(`${RUN}-p4`);
    const plan = await makePlan('basic4');
    await makeAccount(user.id, plan.id);

    await expect(lifecycle.provisionPaidAccount(paidInput(user.id, plan.id, 'p4')))
      .rejects.toMatchObject({ status: 409 });
  });

  test('400 for missing or inactive plan', async () => {
    const user = await makeUser(`${RUN}-p5`);
    const plan = await makePlan('dead', { isActive: false });
    await expect(lifecycle.provisionPaidAccount(paidInput(user.id, plan.id, 'p5')))
      .rejects.toMatchObject({ status: 400 });
    await expect(lifecycle.provisionPaidAccount(paidInput(user.id, 'no-such-plan', 'p5b')))
      .rejects.toMatchObject({ status: 400 });
  });

  test('mysql step failure => PROVISION_FAILED with sanitized error, then retry succeeds cleanly', async () => {
    asMock(mysql.isMysqlEnabled).mockReturnValue(true);
    asMock(mysql.ensureDatabase).mockRejectedValue(
      new Error(`grant failed at ${wwwBase}/x password=hunter2`),
    );

    const user = await makeUser(`${RUN}-p6`);
    const plan = await makePlan('basic6');
    await expect(lifecycle.provisionPaidAccount(paidInput(user.id, plan.id, 'p6')))
      .rejects.toThrow('grant failed');

    const row = await prisma.hostingAccount.findFirstOrThrow({ where: { userId: user.id } });
    expect(row.status).toBe('PROVISION_FAILED');
    expect(row.provisioningError).toBeTruthy();
    expect(row.provisioningError!.length).toBeLessThanOrEqual(200);
    expect(row.provisioningError).not.toContain(wwwBase);
    expect(row.provisioningError).not.toContain('hunter2');

    asMock(mysql.ensureDatabase).mockResolvedValue(undefined);
    const dto = await lifecycle.retryProvisioning(row.id);
    expect(dto.status).toBe('ACTIVE');

    const dbs = await prisma.hostingDatabase.findMany({ where: { accountId: row.id } });
    expect(dbs).toHaveLength(1);
    expect(await prisma.hostingAccount.count({ where: { userId: user.id } })).toBe(1);
    // existing index.html is never overwritten on resume
    const indexHtml = await fs.readFile(path.join(docrootOf(row.id), 'index.html'), 'utf8');
    expect(indexHtml).toContain('Your site is ready');
  });

  test('ftp step failure => PROVISION_FAILED, retriable', async () => {
    asMock(ftp.isFtpEnabled).mockReturnValue(true);
    asMock(ftp.provisionFtpUser).mockRejectedValue(new Error('pure-pw exploded'));

    const user = await makeUser(`${RUN}-p7`);
    const plan = await makePlan('basic7');
    await expect(lifecycle.provisionPaidAccount(paidInput(user.id, plan.id, 'p7')))
      .rejects.toThrow('pure-pw exploded');

    const row = await prisma.hostingAccount.findFirstOrThrow({ where: { userId: user.id } });
    expect(row.status).toBe('PROVISION_FAILED');

    asMock(ftp.provisionFtpUser).mockResolvedValue(undefined);
    const dto = await lifecycle.retryProvisioning(row.id);
    expect(dto.status).toBe('ACTIVE');
  });

  test('vhost failure => PROVISION_FAILED, retriable', async () => {
    vhost.syncAccountVhost.mockRejectedValue(new Error('nginx -t failed'));

    const user = await makeUser(`${RUN}-p8`);
    const plan = await makePlan('basic8');
    await expect(lifecycle.provisionPaidAccount(paidInput(user.id, plan.id, 'p8')))
      .rejects.toThrow('nginx -t failed');

    const row = await prisma.hostingAccount.findFirstOrThrow({ where: { userId: user.id } });
    expect(row.status).toBe('PROVISION_FAILED');

    vhost.syncAccountVhost.mockResolvedValue({ skipped: false });
    const dto = await lifecycle.retryProvisioning(row.id);
    expect(dto.status).toBe('ACTIVE');
  });

  test('docroot failure is fatal when nginx enabled, best-effort otherwise', async () => {
    const blocker = path.join(wwwBase, 'blocker-file');
    await fs.writeFile(blocker, 'x');
    const prevBase = process.env.HOSTING_WWW_BASE;
    process.env.HOSTING_WWW_BASE = blocker; // a file, not a dir => mkdir fails

    const user = await makeUser(`${RUN}-p9`);
    const plan = await makePlan('basic9');
    try {
      process.env.HOSTING_NGINX_ENABLED = 'true';
      await expect(lifecycle.provisionPaidAccount(paidInput(user.id, plan.id, 'p9')))
        .rejects.toThrow();
      const row = await prisma.hostingAccount.findFirstOrThrow({ where: { userId: user.id } });
      expect(row.status).toBe('PROVISION_FAILED');

      process.env.HOSTING_NGINX_ENABLED = 'false';
      const user2 = await makeUser(`${RUN}-p9b`);
      const res = await lifecycle.provisionPaidAccount(paidInput(user2.id, plan.id, 'p9b'));
      expect(res.account.status).toBe('ACTIVE');
    } finally {
      process.env.HOSTING_WWW_BASE = prevBase;
      delete process.env.HOSTING_NGINX_ENABLED;
      await fs.rm(blocker, { force: true });
    }
  });

  test('unclaimable requestedDomain is parked-skipped, provisioning still succeeds', async () => {
    const user = await makeUser(`${RUN}-p10`);
    const plan = await makePlan('basic10');
    const res = await lifecycle.provisionPaidAccount({
      ...paidInput(user.id, plan.id, 'p10'),
      requestedDomain: 'api.sahary.cloud', // reserved platform subdomain
    });
    expect(res.account.status).toBe('ACTIVE');
    expect(res.account.domains).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
describe('provisionUnpaidAccount (dev/test gate)', () => {
  test('402 without the escape hatch; 201-equivalent DTO with it', async () => {
    const user = await makeUser(`${RUN}-u1`);
    const plan = await makePlan('dev1');
    await expect(lifecycle.provisionUnpaidAccount({ userId: user.id, planId: plan.id }))
      .rejects.toMatchObject({ status: 402, message: 'An active subscription is required. Subscribe to a plan first.' });

    process.env.HOSTING_ALLOW_UNPAID_ACCOUNTS = 'true';
    const dto = await lifecycle.provisionUnpaidAccount({ userId: user.id, planId: plan.id });
    expect(dto.status).toBe('ACTIVE');
    expect(dto.subscription).toBeNull();
  });

  test('resumes the caller\'s PROVISION_FAILED account instead of 409', async () => {
    process.env.HOSTING_ALLOW_UNPAID_ACCOUNTS = 'true';
    const user = await makeUser(`${RUN}-u2`);
    const plan = await makePlan('dev2');
    const failed = await makeAccount(user.id, plan.id, { status: 'PROVISION_FAILED' });

    const dto = await lifecycle.provisionUnpaidAccount({ userId: user.id, planId: plan.id });
    expect(dto.id).toBe(failed.id);
    expect(dto.status).toBe('ACTIVE');
  });

  test('409 when the caller already has an ACTIVE account', async () => {
    process.env.HOSTING_ALLOW_UNPAID_ACCOUNTS = 'true';
    const user = await makeUser(`${RUN}-u3`);
    const plan = await makePlan('dev3');
    await makeAccount(user.id, plan.id);
    await expect(lifecycle.provisionUnpaidAccount({ userId: user.id, planId: plan.id }))
      .rejects.toMatchObject({ status: 409 });
  });
});

// ---------------------------------------------------------------------------
describe('suspendAccount / activateAccount', () => {
  test('suspend applies all effects in order and is idempotent', async () => {
    asMock(mysql.isMysqlEnabled).mockReturnValue(true);
    asMock(ftp.isFtpEnabled).mockReturnValue(true);
    const user = await makeUser(`${RUN}-s1`);
    const plan = await makePlan('s1');
    const account = await makeAccount(user.id, plan.id);

    const dto = await lifecycle.suspendAccount(account.id, 'PAYMENT_FAILED');
    expect(dto.status).toBe('SUSPENDED');
    expect(dto.suspendReason).toBe('PAYMENT_FAILED');

    const row = await prisma.hostingAccount.findUniqueOrThrow({ where: { id: account.id } });
    expect(row.suspendedAt).toBeTruthy();
    expect(vhost.syncAccountVhost).toHaveBeenCalledWith({
      primaryDomain: account.domain,
      customDomains: [],
      documentRoot: account.documentRoot,
    });
    expect(ftp.setFtpUserEnabled).toHaveBeenCalledWith(account.ftpUser, false);
    expect(mysql.setAccountUserLocked).toHaveBeenCalledWith(account.dbUser, true);
    expect(notify.notifyAccountSuspended).toHaveBeenCalledWith(account.id, 'PAYMENT_FAILED');

    const again = await lifecycle.suspendAccount(account.id, 'PAYMENT_FAILED');
    expect(again.status).toBe('SUSPENDED');
    expect(vhost.syncAccountVhost).toHaveBeenCalledTimes(1); // no repeated effects
  });

  test('vhost failure on suspend => 502 but DB state stands', async () => {
    const user = await makeUser(`${RUN}-s2`);
    const plan = await makePlan('s2');
    const account = await makeAccount(user.id, plan.id);
    vhost.syncAccountVhost.mockRejectedValue(new Error('nginx down'));

    await expect(lifecycle.suspendAccount(account.id, 'ADMIN'))
      .rejects.toMatchObject({ status: 502 });
    const row = await prisma.hostingAccount.findUniqueOrThrow({ where: { id: account.id } });
    expect(row.status).toBe('SUSPENDED');
    expect(row.suspendReason).toBe('ADMIN');
  });

  test('activate reverses suspension and is idempotent / state-guarded', async () => {
    asMock(mysql.isMysqlEnabled).mockReturnValue(true);
    asMock(ftp.isFtpEnabled).mockReturnValue(true);
    const user = await makeUser(`${RUN}-s3`);
    const plan = await makePlan('s3');
    const account = await makeAccount(user.id, plan.id, {
      status: 'SUSPENDED',
      suspendedAt: new Date(),
      suspendReason: 'BANDWIDTH_EXCEEDED',
    });

    const dto = await lifecycle.activateAccount(account.id);
    expect(dto.status).toBe('ACTIVE');
    expect(dto.suspendReason).toBeNull();

    const row = await prisma.hostingAccount.findUniqueOrThrow({ where: { id: account.id } });
    expect(row.suspendedAt).toBeNull();
    expect(ftp.setFtpUserEnabled).toHaveBeenCalledWith(account.ftpUser, true);
    expect(mysql.setAccountUserLocked).toHaveBeenCalledWith(account.dbUser, false);
    expect(notify.notifyAccountReactivated).toHaveBeenCalledWith(account.id);

    const again = await lifecycle.activateAccount(account.id);
    expect(again.status).toBe('ACTIVE');
    expect(vhost.syncAccountVhost).toHaveBeenCalledTimes(1);
  });

  test('state guards: suspend non-ACTIVE / activate non-SUSPENDED => 409', async () => {
    const user = await makeUser(`${RUN}-s4`);
    const plan = await makePlan('s4');
    const provisioning = await makeAccount(user.id, plan.id, { status: 'PROVISIONING' });

    await expect(lifecycle.suspendAccount(provisioning.id, 'ADMIN'))
      .rejects.toMatchObject({ status: 409 });
    await expect(lifecycle.activateAccount(provisioning.id))
      .rejects.toMatchObject({ status: 409 });
    await expect(lifecycle.suspendAccount('missing-id', 'ADMIN'))
      .rejects.toMatchObject({ status: 404 });
  });
});

// ---------------------------------------------------------------------------
describe('changeAccountPlan / applySubscriptionState', () => {
  test('applies new quotas and updates the FTP quota', async () => {
    asMock(ftp.isFtpEnabled).mockReturnValue(true);
    const user = await makeUser(`${RUN}-c1`);
    const small = await makePlan('small', { diskGB: 5, bandwidthGB: 50 });
    const big = await makePlan('big', { diskGB: 20, bandwidthGB: 200 });
    const account = await makeAccount(user.id, small.id);

    const dto = await lifecycle.changeAccountPlan(account.id, big.id);
    expect(dto.plan.id).toBe(big.id);
    expect(dto.usage.diskQuotaGB).toBe(20);
    expect(dto.usage.bandwidthQuotaGB).toBe(200);
    expect(ftp.setFtpQuota).toHaveBeenCalledWith(account.ftpUser, 20 * 1024);

    const same = await lifecycle.changeAccountPlan(account.id, big.id);
    expect(same.plan.id).toBe(big.id);
    expect(ftp.setFtpQuota).toHaveBeenCalledTimes(1);
  });

  test('reactivates a BANDWIDTH_EXCEEDED suspension when the new quota covers usage', async () => {
    const user = await makeUser(`${RUN}-c2`);
    const small = await makePlan('small2', { bandwidthGB: 10 });
    const big = await makePlan('big2', { bandwidthGB: 100 });
    const account = await makeAccount(user.id, small.id, {
      status: 'SUSPENDED',
      suspendReason: 'BANDWIDTH_EXCEEDED',
      suspendedAt: new Date(),
      bandwidthUsed: 12,
    });

    const dto = await lifecycle.changeAccountPlan(account.id, big.id);
    expect(dto.status).toBe('ACTIVE');
    expect(notify.notifyAccountReactivated).toHaveBeenCalledWith(account.id);
  });

  test('keeps suspension when usage still exceeds the new quota', async () => {
    const user = await makeUser(`${RUN}-c3`);
    const small = await makePlan('small3', { bandwidthGB: 10 });
    const bigger = await makePlan('big3', { bandwidthGB: 15 });
    const account = await makeAccount(user.id, small.id, {
      status: 'SUSPENDED',
      suspendReason: 'BANDWIDTH_EXCEEDED',
      suspendedAt: new Date(),
      bandwidthUsed: 20,
    });

    const dto = await lifecycle.changeAccountPlan(account.id, bigger.id);
    expect(dto.status).toBe('SUSPENDED');
  });

  test('400 for inactive/missing plan, 409 for terminated account', async () => {
    const user = await makeUser(`${RUN}-c4`);
    const plan = await makePlan('c4');
    const inactive = await makePlan('c4i', { isActive: false });
    const account = await makeAccount(user.id, plan.id);
    await expect(lifecycle.changeAccountPlan(account.id, inactive.id))
      .rejects.toMatchObject({ status: 400 });
    await expect(lifecycle.changeAccountPlan(account.id, 'nope'))
      .rejects.toMatchObject({ status: 400 });

    const user2 = await makeUser(`${RUN}-c5`);
    const dead = await makeAccount(user2.id, plan.id, { status: 'TERMINATED' });
    await expect(lifecycle.changeAccountPlan(dead.id, plan.id))
      .rejects.toMatchObject({ status: 409 });
  });

  test('applySubscriptionState stores the projection and is idempotent', async () => {
    const user = await makeUser(`${RUN}-c6`);
    const plan = await makePlan('c6');
    const account = await makeAccount(user.id, plan.id);
    const end = new Date('2026-12-01T00:00:00Z');

    await lifecycle.applySubscriptionState(account.id, {
      subscriptionStatus: 'past_due',
      currentPeriodEnd: end,
      cancelAtPeriodEnd: true,
    });
    await lifecycle.applySubscriptionState(account.id, {
      subscriptionStatus: 'past_due',
      currentPeriodEnd: end,
      cancelAtPeriodEnd: true,
    });

    const row = await prisma.hostingAccount.findUniqueOrThrow({ where: { id: account.id } });
    expect(row.subscriptionStatus).toBe('past_due');
    expect(row.currentPeriodEnd?.toISOString()).toBe(end.toISOString());
    expect(row.cancelAtPeriodEnd).toBe(true);

    await expect(lifecycle.applySubscriptionState('missing', {
      subscriptionStatus: 'active', currentPeriodEnd: null, cancelAtPeriodEnd: false,
    })).rejects.toMatchObject({ status: 404 });
  });
});

// ---------------------------------------------------------------------------
describe('terminateAccountById', () => {
  test('USER reason enforces ownership', async () => {
    const user = await makeUser(`${RUN}-t1`);
    const other = await makeUser(`${RUN}-t1b`);
    const plan = await makePlan('t1');
    const account = await makeAccount(user.id, plan.id);

    await expect(lifecycle.terminateAccountById(account.id, {
      actorUserId: other.id, reason: 'USER',
    })).rejects.toMatchObject({ status: 403 });
  });

  test('stripe cancel failure aborts the whole termination untouched', async () => {
    const user = await makeUser(`${RUN}-t2`);
    const plan = await makePlan('t2');
    const account = await makeAccount(user.id, plan.id, { stripeSubscriptionId: 'sub_t2' });
    await fs.mkdir(docrootOf(account.id), { recursive: true });
    asMock(stripe.cancelSubscriptionNow).mockRejectedValue(
      Object.assign(new Error('stripe unreachable'), { status: 502 }),
    );

    await expect(lifecycle.terminateAccountById(account.id, {
      actorUserId: user.id, reason: 'USER',
    })).rejects.toMatchObject({ status: 502 });

    const row = await prisma.hostingAccount.findUniqueOrThrow({ where: { id: account.id } });
    expect(row.status).toBe('ACTIVE');
    expect(row.domain).toBe(account.domain);
    expect(await fs.stat(path.dirname(docrootOf(account.id)))).toBeTruthy();
    expect(vhost.removeAccountVhost).not.toHaveBeenCalled();
  });

  test('success: cancel first, release unique fields, teardown, docroot moved to trash', async () => {
    asMock(mysql.isMysqlEnabled).mockReturnValue(true);
    asMock(ftp.isFtpEnabled).mockReturnValue(true);
    const user = await makeUser(`${RUN}-t3`);
    const plan = await makePlan('t3');
    const account = await makeAccount(user.id, plan.id, { stripeSubscriptionId: 'sub_t3' });
    await prisma.hostingDomain.create({
      data: { domain: `${account.domain}.custom.example.com`, accountId: account.id, isVerified: true },
    });
    const docroot = docrootOf(account.id);
    await fs.mkdir(path.join(docroot, 'subdir'), { recursive: true });
    await fs.writeFile(path.join(docroot, 'index.html'), 'content');

    const dto = await lifecycle.terminateAccountById(account.id, {
      actorUserId: user.id, reason: 'USER',
    });
    expect(dto.status).toBe('TERMINATED');

    expect(stripe.cancelSubscriptionNow).toHaveBeenCalledWith('sub_t3');

    const row = await prisma.hostingAccount.findUniqueOrThrow({ where: { id: account.id } });
    expect(row.status).toBe('TERMINATED');
    expect(row.terminatedAt).toBeTruthy();
    expect(row.domain).toBe(`${account.domain}_terminated_${account.id}`);
    expect(row.ftpUser).toBe(`${account.ftpUser}_terminated_${account.id}`);

    // vhost removed for the ORIGINAL primary domain; certs deleted per domain
    expect(vhost.removeAccountVhost).toHaveBeenCalledWith(account.domain);
    expect(ssl.deleteCertificate).toHaveBeenCalledWith(account.domain);
    expect(ssl.deleteCertificate).toHaveBeenCalledWith(`${account.domain}.custom.example.com`);
    expect(ftp.deleteFtpUser).toHaveBeenCalledWith(account.ftpUser);
    expect(mysql.setAccountUserLocked).toHaveBeenCalledWith(account.dbUser, true);

    // domain rows released so names can be re-registered
    expect(await prisma.hostingDomain.count({ where: { accountId: account.id } })).toBe(0);

    // docroot moved (not deleted) into the trash dir
    const trashEntries = await fs.readdir(trashDir);
    const moved = trashEntries.find((e) => e.startsWith(`${account.id}-`));
    expect(moved).toBeTruthy();
    expect(await fs.stat(path.join(trashDir, moved!, 'public_html', 'index.html'))).toBeTruthy();
    await expect(fs.stat(path.dirname(docroot))).rejects.toMatchObject({ code: 'ENOENT' });

    // released names can be reused immediately
    const user2 = await makeUser(`${RUN}-t3b`);
    await prisma.hostingAccount.create({
      data: {
        domain: account.domain,
        documentRoot: `${wwwBase}/x/public_html`,
        diskQuota: 1, bandwidthQuota: 1, status: 'ACTIVE', userId: user2.id, planId: plan.id,
      },
    });

    // idempotent second call
    const again = await lifecycle.terminateAccountById(account.id, { reason: 'ADMIN' });
    expect(again.status).toBe('TERMINATED');
    expect(stripe.cancelSubscriptionNow).toHaveBeenCalledTimes(1);
  });

  test('missing docroot on disk still terminates cleanly', async () => {
    const user = await makeUser(`${RUN}-t4`);
    const plan = await makePlan('t4');
    const account = await makeAccount(user.id, plan.id);
    const dto = await lifecycle.terminateAccountById(account.id, { reason: 'ADMIN' });
    expect(dto.status).toBe('TERMINATED');
  });
});

// ---------------------------------------------------------------------------
describe('hostingRetentionJob.runRetention', () => {
  const DAYS = 24 * 60 * 60 * 1000;

  test('purges old terminated accounts (dbs, mysql user, trash) and sets purgedAt', async () => {
    asMock(mysql.isMysqlEnabled).mockReturnValue(true);
    process.env.HOSTING_RETENTION_DAYS = '7';
    process.env.HOSTING_SUSPENDED_RETENTION_DAYS = '30';

    const user = await makeUser(`${RUN}-r1`);
    const plan = await makePlan('r1');
    const old = await makeAccount(user.id, plan.id, {
      status: 'TERMINATED',
      terminatedAt: new Date(Date.now() - 10 * DAYS),
    });
    await prisma.hostingDatabase.create({
      data: { name: `db_${old.id.slice(0, 20)}`, isPrimary: true, accountId: old.id },
    });
    const trashSub = `${old.id}-111`;
    await fs.mkdir(path.join(trashDir, trashSub, 'public_html'), { recursive: true });

    const fresh = await makeAccount(user.id, plan.id, {
      status: 'TERMINATED',
      terminatedAt: new Date(),
    });
    const already = await makeAccount(user.id, plan.id, {
      status: 'TERMINATED',
      terminatedAt: new Date(Date.now() - 10 * DAYS),
      purgedAt: new Date(Date.now() - DAYS),
    });

    const res = await retentionJob.runRetention();

    expect(res.purged).toBe(1);
    expect(res.errors).toBe(0);
    expect(mysql.dropDatabase).toHaveBeenCalledTimes(1);
    expect(mysql.dropAccountUser).toHaveBeenCalledWith(old.dbUser);
    const after = await prisma.hostingAccount.findUniqueOrThrow({ where: { id: old.id } });
    expect(after.purgedAt).toBeTruthy();
    await expect(fs.stat(path.join(trashDir, trashSub))).rejects.toMatchObject({ code: 'ENOENT' });
    expect((await prisma.hostingAccount.findUniqueOrThrow({ where: { id: fresh.id } })).purgedAt).toBeNull();
    expect((await prisma.hostingAccount.findUniqueOrThrow({ where: { id: already.id } })).purgedAt).toBeTruthy();
  });

  test('terminates long-suspended payment/cancel accounts only', async () => {
    process.env.HOSTING_SUSPENDED_RETENTION_DAYS = '30';
    const user = await makeUser(`${RUN}-r2`);
    const plan = await makePlan('r2');

    const expired = await makeAccount(user.id, plan.id, {
      status: 'SUSPENDED',
      suspendReason: 'SUBSCRIPTION_CANCELED',
      suspendedAt: new Date(Date.now() - 40 * DAYS),
    });
    const withinGrace = await makeAccount(user.id, plan.id, {
      status: 'SUSPENDED',
      suspendReason: 'PAYMENT_FAILED',
      suspendedAt: new Date(Date.now() - 10 * DAYS),
    });
    const otherReason = await makeAccount(user.id, plan.id, {
      status: 'SUSPENDED',
      suspendReason: 'ADMIN',
      suspendedAt: new Date(Date.now() - 40 * DAYS),
    });

    const res = await retentionJob.runRetention();
    expect(res.terminated).toBe(1);
    expect((await prisma.hostingAccount.findUniqueOrThrow({ where: { id: expired.id } })).status).toBe('TERMINATED');
    expect((await prisma.hostingAccount.findUniqueOrThrow({ where: { id: withinGrace.id } })).status).toBe('SUSPENDED');
    expect((await prisma.hostingAccount.findUniqueOrThrow({ where: { id: otherReason.id } })).status).toBe('SUSPENDED');
  });

  test('per-account errors are isolated and counted', async () => {
    process.env.HOSTING_SUSPENDED_RETENTION_DAYS = '30';
    const user = await makeUser(`${RUN}-r3`);
    const plan = await makePlan('r3');

    const bad = await makeAccount(user.id, plan.id, {
      status: 'SUSPENDED',
      suspendReason: 'SUBSCRIPTION_CANCELED',
      suspendedAt: new Date(Date.now() - 40 * DAYS),
      stripeSubscriptionId: 'sub_bad',
    });
    const good = await makeAccount(user.id, plan.id, {
      status: 'SUSPENDED',
      suspendReason: 'PAYMENT_FAILED',
      suspendedAt: new Date(Date.now() - 40 * DAYS),
    });
    asMock(stripe.cancelSubscriptionNow).mockRejectedValue(new Error('stripe down'));

    const res = await retentionJob.runRetention();
    expect(res.errors).toBe(1);
    expect(res.terminated).toBe(1);
    expect((await prisma.hostingAccount.findUniqueOrThrow({ where: { id: bad.id } })).status).toBe('SUSPENDED');
    expect((await prisma.hostingAccount.findUniqueOrThrow({ where: { id: good.id } })).status).toBe('TERMINATED');
  });
});

// ---------------------------------------------------------------------------
describe('domain management (hostingService)', () => {
  test('list/add/remove domains with DTO shape and cert cleanup', async () => {
    const user = await makeUser(`${RUN}-d1`);
    const plan = await makePlan('d1');
    await makeAccount(user.id, plan.id);

    expect(await hostingService.getDomains(user.id)).toEqual([]);

    const created = await hostingService.addDomain(user.id, 'Example.COM');
    expect(created.domain).toBe('example.com');
    expect(created.isVerified).toBe(false);
    expect(created.verification).toEqual({
      recordType: 'TXT', host: 'example.com', value: `sahary-verify=${created.verifyToken}`,
    });
    expect(created.ssl.status).toBe('NONE');
    expect(vhost.syncAccountVhost).toHaveBeenCalledTimes(1);

    const listed = await hostingService.getDomains(user.id);
    expect(listed).toHaveLength(1);

    const removed = await hostingService.removeDomain(user.id, created.id);
    expect(removed).toEqual({ removed: true });
    expect(ssl.deleteCertificate).toHaveBeenCalledWith('example.com');
    expect(await hostingService.getDomains(user.id)).toEqual([]);
  });

  test('plan domain limit returns the legacy 409 message', async () => {
    const user = await makeUser(`${RUN}-d2`);
    const plan = await makePlan('d2', { maxDomains: 1 });
    await makeAccount(user.id, plan.id);
    await hostingService.addDomain(user.id, 'one.example.com');
    await expect(hostingService.addDomain(user.id, 'two.example.com'))
      .rejects.toMatchObject({ status: 409, message: 'Domain limit reached for your plan (max 1)' });
  });

  test('cross-table domain conflicts and claimability rules', async () => {
    const user = await makeUser(`${RUN}-d3`);
    const user2 = await makeUser(`${RUN}-d3b`);
    const plan = await makePlan('d3');
    const account = await makeAccount(user.id, plan.id);
    await makeAccount(user2.id, plan.id);

    await expect(hostingService.addDomain(user.id, 'bad domain'))
      .rejects.toMatchObject({ status: 400, message: 'Invalid domain format' });
    await expect(hostingService.addDomain(user.id, 'sahary.cloud'))
      .rejects.toMatchObject({ status: 400, message: 'The platform base domain cannot be claimed' });
    await expect(hostingService.addDomain(user.id, 'ftp.sahary.cloud'))
      .rejects.toMatchObject({ status: 400, message: "The 'ftp.sahary.cloud' subdomain is reserved" });
    await expect(hostingService.addDomain(user.id, 'x.sahary.cloud'))
      .rejects.toMatchObject({ status: 400, message: 'Platform-managed domains cannot be claimed' });
    await expect(hostingService.addDomain(user.id, account.domain))
      .rejects.toMatchObject({ status: 400, message: 'Platform-managed domains cannot be claimed' });
    // taken by another account's primary domain — but it's a sahary.cloud name,
    // so use a real external collision instead:
    await hostingService.addDomain(user.id, 'shared.example.com');
    await expect(hostingService.addDomain(user2.id, 'shared.example.com'))
      .rejects.toMatchObject({ status: 409, message: 'Domain is already registered on this platform' });
  });

  test('verifyDomain: TXT match verifies + syncs vhost; mismatch and DNS failure => 400', async () => {
    const user = await makeUser(`${RUN}-d4`);
    const plan = await makePlan('d4');
    await makeAccount(user.id, plan.id);
    const created = await hostingService.addDomain(user.id, 'verifyme.example.com');

    resolveTxt.mockResolvedValue([['other=1'], [`sahary-verify=${created.verifyToken}`]]);
    const verified = await hostingService.verifyDomain(user.id, created.id);
    expect(verified.isVerified).toBe(true);
    expect(verified.verification).toBeNull();
    expect(vhost.syncAccountVhost).toHaveBeenCalledWith(
      expect.objectContaining({ customDomains: ['verifyme.example.com'] }),
    );

    // already verified => no new DNS lookup
    const dnsCalls = resolveTxt.mock.calls.length;
    const again = await hostingService.verifyDomain(user.id, created.id);
    expect(again.isVerified).toBe(true);
    expect(resolveTxt.mock.calls.length).toBe(dnsCalls);

    const second = await hostingService.addDomain(user.id, 'verifyme2.example.com');
    resolveTxt.mockResolvedValue([['nope=1']]);
    await expect(hostingService.verifyDomain(user.id, second.id))
      .rejects.toMatchObject({ status: 400, message: 'TXT record not found — add the verification record and try again' });

    resolveTxt.mockRejectedValue(new Error('ENOTFOUND'));
    await expect(hostingService.verifyDomain(user.id, second.id))
      .rejects.toMatchObject({ status: 400, message: 'DNS lookup failed — make sure the TXT record has propagated' });
  });

  test('ownership/404 guards and active-account requirement', async () => {
    const user = await makeUser(`${RUN}-d5`);
    const other = await makeUser(`${RUN}-d5b`);
    const plan = await makePlan('d5');
    await makeAccount(user.id, plan.id);
    await makeAccount(other.id, plan.id);

    const created = await hostingService.addDomain(user.id, 'owned.example.com');
    await expect(hostingService.removeDomain(other.id, created.id))
      .rejects.toMatchObject({ status: 403 });
    await expect(hostingService.removeDomain(user.id, 'missing'))
      .rejects.toMatchObject({ status: 404 });

    const inactive = await makeUser(`${RUN}-d5c`);
    await expect(hostingService.getDomains(inactive.id))
      .rejects.toMatchObject({ status: 404, message: 'No active hosting account found' });
  });
});
