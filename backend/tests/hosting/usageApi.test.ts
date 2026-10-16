import express from 'express';
import os from 'os';
import path from 'path';
import fs from 'fs';
import request from 'supertest';
import type { HostingAccount, HostingPlan, User } from '@prisma/client';
import { prisma } from '../../src/config/database';
import JWTUtils from '../../src/utils/jwt';
import usageRouter from '../../src/routes/hostingUsage';
import * as usageService from '../../src/services/hostingUsageService';
import { usageRefreshTimestamps } from '../../src/controllers/hostingUsageController';

jest.mock('../../src/services/hostingLifecycleService', () => ({
  suspendAccount: jest.fn(async () => ({})),
  activateAccount: jest.fn(async () => ({})),
}));

jest.mock('../../src/services/hostingNotificationService', () => ({
  notifyQuotaAlert: jest.fn(async () => undefined),
}));

const EMAIL_A = 'wp06-usage-api-a@test.local';
const EMAIL_B = 'wp06-usage-api-b@test.local';
const PLAN_NAME = 'wp06-usage-api-plan';

const app = express();
app.use(express.json());
app.use('/api/v1/hosting/usage', usageRouter);

let userA: User;
let userB: User;
let plan: HostingPlan;
let account: HostingAccount;
let tokenA: string;
let tokenB: string;
let wwwBase: string;
let savedLogDir: string | undefined;
let logDir: string;

const uniq = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 9)}`;
const utcMonthStart = (d: Date): Date => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
const utcMidnightDaysAgo = (days: number): Date => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - days));
};

const getUsage = (token: string | null, query = '') => {
  let req = request(app).get(`/api/v1/hosting/usage${query}`);
  if (token) {
    req = req.set('Authorization', `Bearer ${token}`);
  }
  return req;
};

beforeAll(async () => {
  wwwBase = fs.mkdtempSync(path.join(os.tmpdir(), 'wp06-api-www-'));
  logDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wp06-api-log-'));
  savedLogDir = process.env.HOSTING_NGINX_LOG_DIR;
  process.env.HOSTING_NGINX_LOG_DIR = logDir;

  await (global as unknown as { cleanupTestUsers: (p: unknown, e: string[]) => Promise<void> })
    .cleanupTestUsers(prisma, [EMAIL_A, EMAIL_B]);
  await prisma.hostingPlan.deleteMany({ where: { name: PLAN_NAME } });

  userA = await prisma.user.create({
    data: { email: EMAIL_A, password: 'x', firstName: 'A', lastName: 'U', isVerified: true },
  });
  userB = await prisma.user.create({
    data: { email: EMAIL_B, password: 'x', firstName: 'B', lastName: 'U', isVerified: true },
  });
  plan = await prisma.hostingPlan.create({
    data: { name: PLAN_NAME, diskGB: 10, bandwidthGB: 100, monthlyPrice: 0 },
  });
  account = await prisma.hostingAccount.create({
    data: {
      domain: `wp06-${uniq()}.sahary.test`,
      documentRoot: path.join(wwwBase, 'acct-a'),
      diskQuota: 10,
      bandwidthQuota: 100,
      diskUsed: 8.5,
      bandwidthUsed: 90,
      bandwidthCycleStart: utcMonthStart(new Date()),
      usageUpdatedAt: new Date(),
      userId: userA.id,
      planId: plan.id,
    },
  });

  tokenA = JWTUtils.generateAccessToken({ userId: userA.id, email: userA.email, role: 'USER' });
  tokenB = JWTUtils.generateAccessToken({ userId: userB.id, email: userB.email, role: 'USER' });
});

afterAll(async () => {
  if (savedLogDir === undefined) delete process.env.HOSTING_NGINX_LOG_DIR;
  else process.env.HOSTING_NGINX_LOG_DIR = savedLogDir;
  await (global as unknown as { cleanupTestUsers: (p: unknown, e: string[]) => Promise<void> })
    .cleanupTestUsers(prisma, [EMAIL_A, EMAIL_B]);
  await prisma.hostingPlan.deleteMany({ where: { name: PLAN_NAME } });
  fs.rmSync(wwwBase, { recursive: true, force: true });
  fs.rmSync(logDir, { recursive: true, force: true });
  await prisma.$disconnect();
});

beforeEach(() => {
  usageRefreshTimestamps.clear();
});

describe('GET /api/v1/hosting/usage', () => {
  test('401 without a token and 401 for a garbage token', async () => {
    expect((await getUsage(null)).status).toBe(401);
    expect((await getUsage('not-a-real-token')).status).toBe(401);
  });

  test('404 when the user has no account', async () => {
    const res = await getUsage(tokenB);
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  test('404 when the account is TERMINATED', async () => {
    await prisma.hostingAccount.update({
      where: { id: account.id },
      data: { status: 'TERMINATED', terminatedAt: new Date() },
    });
    const res = await getUsage(tokenA);
    expect(res.status).toBe(404);
    await prisma.hostingAccount.update({
      where: { id: account.id },
      data: { status: 'ACTIVE', terminatedAt: null },
    });
  });

  test('200 with the HostingUsageDTO shape for the account owner', async () => {
    const res = await getUsage(tokenA);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const dto = res.body.data;
    expect(dto.diskUsedGB).toBe(8.5);
    expect(dto.diskQuotaGB).toBe(10);
    expect(dto.diskLevel).toBe('WARNING');
    expect(dto.bandwidthUsedGB).toBe(90);
    expect(dto.bandwidthQuotaGB).toBe(100);
    expect(dto.bandwidthLevel).toBe('WARNING');
    expect(dto.bandwidthCycleStart).toBe(utcMonthStart(new Date()).toISOString());
    expect(dto.bandwidthCycleEnd).toBe(
      new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() + 1, 1)).toISOString(),
    );
    expect(dto.updatedAt).not.toBeNull();
    expect(Array.isArray(dto.history)).toBe(true);
  });

  test('a SUSPENDED account can still read its usage', async () => {
    await prisma.hostingAccount.update({
      where: { id: account.id },
      data: { status: 'SUSPENDED', suspendReason: 'BANDWIDTH_EXCEEDED', suspendedAt: new Date() },
    });
    const res = await getUsage(tokenA);
    expect(res.status).toBe(200);
    await prisma.hostingAccount.update({
      where: { id: account.id },
      data: { status: 'ACTIVE', suspendReason: null, suspendedAt: null },
    });
  });

  test('history returns last-30 daily snapshots ascending', async () => {
    for (let i = 34; i >= 0; i--) {
      await prisma.hostingUsageSnapshot.create({
        data: {
          accountId: account.id,
          date: utcMidnightDaysAgo(i),
          diskUsedGB: i,
          bandwidthUsedGB: i,
        },
      });
    }
    const res = await getUsage(tokenA);
    expect(res.status).toBe(200);
    const { history } = res.body.data;
    expect(history).toHaveLength(30);
    expect(history[0].diskUsedGB).toBe(29);
    const dates = history.map((h: { date: string }) => h.date);
    expect(dates).toEqual([...dates].sort());
  });

  test('a second user sees only their own account usage', async () => {
    const other = await prisma.hostingAccount.create({
      data: {
        domain: `wp06-${uniq()}.sahary.test`,
        documentRoot: path.join(wwwBase, 'acct-b'),
        diskQuota: 10,
        bandwidthQuota: 100,
        diskUsed: 1.25,
        bandwidthUsed: 2,
        userId: userB.id,
        planId: plan.id,
      },
    });
    const res = await getUsage(tokenB);
    expect(res.status).toBe(200);
    expect(res.body.data.diskUsedGB).toBe(1.25);
    expect(res.body.data.bandwidthUsedGB).toBe(2);
    await prisma.hostingAccount.delete({ where: { id: other.id } });
  });

  describe('?refresh=1', () => {
    test('triggers measureAccount once, then throttles for 60 s', async () => {
      const measureSpy = jest
        .spyOn(usageService, 'measureAccount')
        .mockResolvedValue({ diskUsedGB: 1, bandwidthUsedGB: 2 });

      const first = await getUsage(tokenA, '?refresh=1');
      expect(first.status).toBe(200);
      expect(measureSpy).toHaveBeenCalledTimes(1);
      expect(measureSpy).toHaveBeenCalledWith(account.id);

      const second = await getUsage(tokenA, '?refresh=1');
      expect(second.status).toBe(200);
      expect(measureSpy).toHaveBeenCalledTimes(1);

      // Pretend the last refresh was 61 s ago -> the next one re-measures.
      usageRefreshTimestamps.set(account.id, Date.now() - 61_000);
      const third = await getUsage(tokenA, '?refresh=1');
      expect(third.status).toBe(200);
      expect(measureSpy).toHaveBeenCalledTimes(2);
    });

    test('non-"1" refresh values do not measure', async () => {
      const measureSpy = jest
        .spyOn(usageService, 'measureAccount')
        .mockResolvedValue({ diskUsedGB: 1, bandwidthUsedGB: 2 });
      for (const q of ['?refresh=0', '?refresh=yes', '?refresh=']) {
        const res = await getUsage(tokenA, q);
        expect(res.status).toBe(200);
      }
      expect(measureSpy).not.toHaveBeenCalled();
    });
  });
});
