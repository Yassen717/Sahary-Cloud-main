import request from 'supertest';
import type { Express } from 'express';
import { prisma } from '../../src/config/database';
import { mysqlDbFor } from '../../src/services/hostingNaming';

const mockIsMysqlEnabled = jest.fn();
const mockEnsureDatabase = jest.fn();
const mockDropDatabase = jest.fn();
const mockSetAccountUserPassword = jest.fn();

jest.mock('../../src/services/mysqlProvisionService', () => ({
  isMysqlEnabled: (...args: unknown[]) => mockIsMysqlEnabled(...args),
  ensureAccountUser: jest.fn(async () => undefined),
  ensureDatabase: (...args: unknown[]) => mockEnsureDatabase(...args),
  dropDatabase: (...args: unknown[]) => mockDropDatabase(...args),
  dropAccountUser: jest.fn(async () => undefined),
  setAccountUserPassword: (...args: unknown[]) => mockSetAccountUserPassword(...args),
  setAccountUserLocked: jest.fn(async () => undefined),
  healthCheck: jest.fn(async () => ({ ok: true })),
}));

const bcrypt = require('bcryptjs');
const app = require('../../src/index') as Express;
const JWTUtils = require('../../src/utils/jwt').default;

const RUN = `wp03${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

const EMAILS = [
  `db-verified-${RUN}@test.local`,
  `db-unverified-${RUN}@test.local`,
  `db-second-${RUN}@test.local`,
  `db-suspended-${RUN}@test.local`,
];
const PLAN_NAME = `wp03-databases-${RUN}`;

const auth = (userId: string, email: string): string =>
  `Bearer ${JWTUtils.generateAccessToken({ userId, email, role: 'USER' })}`;

describe('Hosting databases API', () => {
  let planId = '';
  let userToken = '';
  let unverifiedToken = '';
  let secondToken = '';
  let suspendedToken = '';
  let accountId = '';
  let accountDbUser = '';
  let secondAccountId = '';
  let secondDbId = '';
  const base = '/api/v1/hosting/databases';

  beforeAll(async () => {
    const cleanup = (global as unknown as {
      cleanupTestUsers: (p: typeof prisma, emails: string[]) => Promise<void>;
    }).cleanupTestUsers;
    await cleanup(prisma, EMAILS);
    await prisma.hostingPlan.deleteMany({ where: { name: PLAN_NAME } });

    const plan = await prisma.hostingPlan.create({
      data: {
        name: PLAN_NAME,
        diskGB: 10,
        bandwidthGB: 100,
        maxDomains: 1,
        maxDatabases: 3,
        maxFtpAccounts: 1,
        monthlyPrice: 0,
      },
    });
    planId = plan.id;

    const mkUser = async (email: string, isVerified: boolean) =>
      prisma.user.create({
        data: {
          email,
          password: 'not-a-real-hash',
          firstName: 'WP03',
          lastName: 'Test',
          isVerified,
        },
      });

    const user = await mkUser(EMAILS[0], true);
    userToken = auth(user.id, user.email);

    const unverified = await mkUser(EMAILS[1], false);
    unverifiedToken = auth(unverified.id, unverified.email);

    const second = await mkUser(EMAILS[2], true);
    secondToken = auth(second.id, second.email);

    const suspended = await mkUser(EMAILS[3], true);
    suspendedToken = auth(suspended.id, suspended.email);

    accountDbUser = `sc${RUN.slice(0, 8)}`;
    const account = await prisma.hostingAccount.create({
      data: {
        domain: `${RUN}.test.sahary.cloud`,
        diskQuota: 10,
        bandwidthQuota: 100,
        status: 'ACTIVE',
        userId: user.id,
        planId: plan.id,
        dbUser: accountDbUser,
        dbName: `${accountDbUser}_main`,
      },
    });
    accountId = account.id;
    await prisma.hostingDatabase.create({
      data: { accountId, name: `${accountDbUser}_main`, isPrimary: true },
    });

    const secondAccount = await prisma.hostingAccount.create({
      data: {
        domain: `second-${RUN}.test.sahary.cloud`,
        diskQuota: 10,
        bandwidthQuota: 100,
        status: 'ACTIVE',
        userId: second.id,
        planId: plan.id,
        dbUser: `sb${RUN.slice(0, 8)}`,
        dbName: `sb${RUN.slice(0, 8)}_main`,
      },
    });
    secondAccountId = secondAccount.id;
    const secondDb = await prisma.hostingDatabase.create({
      data: { accountId: secondAccountId, name: `sb${RUN.slice(0, 8)}_main`, isPrimary: true },
    });
    secondDbId = secondDb.id;

    await prisma.hostingAccount.create({
      data: {
        domain: `susp-${RUN}.test.sahary.cloud`,
        diskQuota: 10,
        bandwidthQuota: 100,
        status: 'SUSPENDED',
        suspendReason: 'PAYMENT_FAILED',
        userId: suspended.id,
        planId: plan.id,
      },
    });
  });

  afterAll(async () => {
    const cleanup = (global as unknown as {
      cleanupTestUsers: (p: typeof prisma, emails: string[]) => Promise<void>;
    }).cleanupTestUsers;
    await cleanup(prisma, EMAILS);
    await prisma.hostingPlan.deleteMany({ where: { id: planId } });
    await prisma.$disconnect();
  });

  beforeEach(() => {
    mockIsMysqlEnabled.mockReturnValue(true);
    mockEnsureDatabase.mockResolvedValue(undefined);
    mockDropDatabase.mockResolvedValue(undefined);
    mockSetAccountUserPassword.mockResolvedValue(undefined);
  });

  describe('GET /', () => {
    test('401 without auth', async () => {
      const r = await request(app).get(base);
      expect(r.status).toBe(401);
      expect(r.body.success).toBe(false);
    });

    test('200 with the HostingDatabasesDTO shape', async () => {
      const r = await request(app).get(base).set('Authorization', userToken);
      expect(r.status).toBe(200);
      expect(r.body.success).toBe(true);
      const { data } = r.body;
      expect(data.enabled).toBe(true);
      expect(data.host).toBe('localhost');
      expect(data.port).toBe(3306);
      expect(data.username).toBe(accountDbUser);
      expect(data.passwordSet).toBe(false);
      expect(data.limit).toBe(3);
      expect(data.databases).toHaveLength(1);
      expect(data.databases[0]).toMatchObject({
        name: `${accountDbUser}_main`,
        isPrimary: true,
      });
      expect(data.databases[0].createdAt).toBeDefined();
    });

    test('enabled reflects the service flag and rows are scoped to the caller', async () => {
      mockIsMysqlEnabled.mockReturnValue(false);
      const r = await request(app).get(base).set('Authorization', secondToken);
      expect(r.status).toBe(200);
      expect(r.body.data.enabled).toBe(false);
      expect(r.body.data.databases).toHaveLength(1);
      expect(r.body.data.databases[0].id).toBe(secondDbId);
    });

    test('suspended accounts can still list (ANY_LIVE_STATUS)', async () => {
      const r = await request(app).get(base).set('Authorization', suspendedToken);
      expect(r.status).toBe(200);
      expect(r.body.data.databases).toHaveLength(0);
    });
  });

  describe('POST /', () => {
    test('403 when email is unverified', async () => {
      const r = await request(app)
        .post(base)
        .set('Authorization', unverifiedToken)
        .send({ name: 'shopdb' });
      expect(r.status).toBe(403);
      expect(mockEnsureDatabase).not.toHaveBeenCalled();
    });

    test('201 creates the row and provisions MySQL-side', async () => {
      const r = await request(app)
        .post(base)
        .set('Authorization', userToken)
        .send({ name: 'shopdb' });
      expect(r.status).toBe(201);
      expect(r.body.success).toBe(true);

      const expectedName = mysqlDbFor(accountId, 'shopdb');
      expect(r.body.data).toMatchObject({ name: expectedName, isPrimary: false });
      expect(mockEnsureDatabase).toHaveBeenCalledWith(expectedName, accountDbUser);

      const stored = await prisma.hostingDatabase.findUnique({ where: { id: r.body.data.id } });
      expect(stored?.accountId).toBe(accountId);
    });

    test('generates a random 6-char label when name is omitted', async () => {
      const r = await request(app)
        .post(base)
        .set('Authorization', userToken)
        .send({});
      expect(r.status).toBe(201);
      expect(r.body.data.name).toMatch(/^sc[a-z0-9]+_[a-z0-9]{6}$/);
    });

    test('400 on an invalid label', async () => {
      const r = await request(app)
        .post(base)
        .set('Authorization', userToken)
        .send({ name: 'Bad-Name!' });
      expect(r.status).toBe(400);
      expect(mockEnsureDatabase).not.toHaveBeenCalled();
      expect(await prisma.hostingDatabase.count({ where: { accountId } })).toBe(3);
    });

    test('503 when MySQL is disabled — no row is left behind', async () => {
      mockIsMysqlEnabled.mockReturnValue(false);
      const r = await request(app)
        .post(base)
        .set('Authorization', userToken)
        .send({ name: 'offdb' });
      expect(r.status).toBe(503);
      expect(mockEnsureDatabase).not.toHaveBeenCalled();
    });

    test('409 when the plan database limit is reached', async () => {
      // User already has primary + shopdb + random = 3 rows = maxDatabases.
      const r = await request(app)
        .post(base)
        .set('Authorization', userToken)
        .send({ name: 'toomany' });
      expect(r.status).toBe(409);
      expect(mockEnsureDatabase).not.toHaveBeenCalled();
    });

    test('502 and row rollback when the MySQL side fails', async () => {
      const before = await prisma.hostingDatabase.count({ where: { accountId: secondAccountId } });
      mockEnsureDatabase.mockRejectedValueOnce(
        Object.assign(new Error('Database server error'), { status: 502, expose: true }),
      );
      const r = await request(app)
        .post(base)
        .set('Authorization', secondToken)
        .send({ name: 'willfail' });
      expect(r.status).toBe(502);
      expect(await prisma.hostingDatabase.count({ where: { accountId: secondAccountId } })).toBe(before);
    });
  });

  describe('DELETE /:id', () => {
    test('409 for the primary database', async () => {
      const primary = await prisma.hostingDatabase.findFirst({
        where: { accountId, isPrimary: true },
      });
      const r = await request(app)
        .delete(`${base}/${primary?.id}`)
        .set('Authorization', userToken);
      expect(r.status).toBe(409);
      expect(r.body.message).toBe('The primary database cannot be deleted');
      expect(mockDropDatabase).not.toHaveBeenCalled();
    });

    test('404 when deleting another user\'s database id', async () => {
      const r = await request(app)
        .delete(`${base}/${secondDbId}`)
        .set('Authorization', userToken);
      expect(r.status).toBe(404);
      expect(mockDropDatabase).not.toHaveBeenCalled();
    });

    test('404 for a nonexistent id', async () => {
      const r = await request(app)
        .delete(`${base}/does-not-exist`)
        .set('Authorization', userToken);
      expect(r.status).toBe(404);
    });

    test('200 deletes a non-primary database', async () => {
      const row = await prisma.hostingDatabase.findFirst({
        where: { accountId, isPrimary: false, name: mysqlDbFor(accountId, 'shopdb') },
      });
      expect(row).not.toBeNull();
      const r = await request(app)
        .delete(`${base}/${row?.id}`)
        .set('Authorization', userToken);
      expect(r.status).toBe(200);
      expect(r.body.data).toEqual({ deleted: true });
      expect(mockDropDatabase).toHaveBeenCalledWith(mysqlDbFor(accountId, 'shopdb'));
      expect(await prisma.hostingDatabase.findUnique({ where: { id: row?.id } })).toBeNull();
    });

    test('502 keeps the row when the MySQL drop fails', async () => {
      const row = await prisma.hostingDatabase.create({
        data: { accountId: secondAccountId, name: 'dropfails' },
      });
      mockDropDatabase.mockRejectedValueOnce(
        Object.assign(new Error('Database server error'), { status: 502, expose: true }),
      );
      const r = await request(app)
        .delete(`${base}/${row.id}`)
        .set('Authorization', secondToken);
      expect(r.status).toBe(502);
      expect(await prisma.hostingDatabase.findUnique({ where: { id: row.id } })).not.toBeNull();
    });
  });

  describe('POST /reset-password', () => {
    test('403 when email is unverified', async () => {
      const r = await request(app)
        .post(`${base}/reset-password`)
        .set('Authorization', unverifiedToken);
      expect(r.status).toBe(403);
    });

    test('503 when MySQL is disabled', async () => {
      mockIsMysqlEnabled.mockReturnValue(false);
      const r = await request(app)
        .post(`${base}/reset-password`)
        .set('Authorization', userToken);
      expect(r.status).toBe(503);
      expect(mockSetAccountUserPassword).not.toHaveBeenCalled();
    });

    test('200 returns the reveal DTO and stores a bcrypt hash', async () => {
      const r = await request(app)
        .post(`${base}/reset-password`)
        .set('Authorization', userToken);
      expect(r.status).toBe(200);
      const { data } = r.body;
      expect(data.host).toBe('localhost');
      expect(data.port).toBe(3306);
      expect(data.username).toBe(accountDbUser);
      expect(data.password).toMatch(/^[a-zA-Z0-9]{20}$/);

      expect(mockSetAccountUserPassword).toHaveBeenCalledWith(accountDbUser, data.password);

      const account = await prisma.hostingAccount.findUnique({ where: { id: accountId } });
      expect(account?.dbPassword).toBeTruthy();
      expect(account?.dbPassword).not.toBe(data.password);
      expect(await bcrypt.compare(data.password, account?.dbPassword ?? '')).toBe(true);

      const list = await request(app).get(base).set('Authorization', userToken);
      expect(list.body.data.passwordSet).toBe(true);
    });
  });
});
