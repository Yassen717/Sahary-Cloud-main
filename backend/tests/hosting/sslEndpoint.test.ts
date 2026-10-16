import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { execFile } from 'child_process';
import request from 'supertest';
import { prisma } from '../../src/config/database';
import JWTUtils from '../../src/utils/jwt';

jest.mock('child_process', () => {
  const actual = jest.requireActual('child_process');
  return { ...actual, execFile: jest.fn() };
});

const execMock = execFile as unknown as jest.Mock;

type ExecCb = (e: Error | null, so: string, se: string) => void;

jest.mock('../../src/services/vhostService', () => ({
  syncAccountVhost: jest.fn(async () => ({ skipped: true })),
  removeAccountVhost: jest.fn(async () => ({ skipped: true })),
  testConfig: jest.fn(async () => undefined),
  testAndReload: jest.fn(async () => undefined),
  buildVhostConfig: jest.fn(() => ''),
  default: {
    syncAccountVhost: jest.fn(async () => ({ skipped: true })),
    removeAccountVhost: jest.fn(async () => ({ skipped: true })),
    testConfig: jest.fn(async () => undefined),
    testAndReload: jest.fn(async () => undefined),
    buildVhostConfig: jest.fn(() => ''),
  },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const app = require('../../src/index');

const SUITE_TMP = path.join(__dirname, 'tmp-ssl-endpoint');
const CERT_FIXTURE = path.join(__dirname, 'fixtures', 'test-cert.pem');
const KEY_FIXTURE = path.join(__dirname, 'fixtures', 'test-key.pem');

const ENV_KEYS = [
  'HOSTING_SSL_ENABLED',
  'HOSTING_LETSENCRYPT_EMAIL',
  'HOSTING_ACME_WEBROOT',
  'HOSTING_LETSENCRYPT_LIVE_DIR',
];

let savedEnv: Record<string, string | undefined> = {};
let tmpDir = '';
let liveDir = '';

const newId = (): string => crypto.randomUUID().replace(/-/g, '');
const createdUserIds: string[] = [];
const createdPlanIds: string[] = [];

const setSslEnv = (enabled: boolean): void => {
  process.env.HOSTING_SSL_ENABLED = enabled ? 'true' : 'false';
  process.env.HOSTING_LETSENCRYPT_EMAIL = enabled ? 'admin@example.test' : '';
  process.env.HOSTING_ACME_WEBROOT = path.join(tmpDir, 'acme');
  process.env.HOSTING_LETSENCRYPT_LIVE_DIR = liveDir;
};

const mockCertbotOk = (): void => {
  execMock.mockImplementation((_f: string, args: string[], _o: unknown, cb: ExecCb) => {
    if (args[0] === 'certonly') {
      const domain = args[args.indexOf('-d') + 1];
      const dir = path.join(liveDir, domain);
      fs.mkdirSync(dir, { recursive: true });
      fs.copyFileSync(CERT_FIXTURE, path.join(dir, 'fullchain.pem'));
      fs.copyFileSync(KEY_FIXTURE, path.join(dir, 'privkey.pem'));
    }
    cb(null, 'ok', '');
    return { kill: () => undefined };
  });
};

const seedUser = async (isVerified: boolean): Promise<{ id: string; token: string }> => {
  const user = await prisma.user.create({
    data: {
      email: `wp05e-${newId().slice(0, 12)}@example.test`,
      password: 'x',
      firstName: 'T',
      lastName: 'U',
      isVerified,
      isActive: true,
    },
  });
  createdUserIds.push(user.id);
  const token = JWTUtils.generateAccessToken({ userId: user.id, email: user.email, role: user.role });
  return { id: user.id, token };
};

const seedAccount = async (userId: string, status = 'ACTIVE'): Promise<{ id: string; domain: string }> => {
  const plan = await prisma.hostingPlan.create({
    data: { name: `wp05e-plan-${newId().slice(0, 12)}`, diskGB: 10, bandwidthGB: 100, monthlyPrice: 5 },
  });
  createdPlanIds.push(plan.id);
  const accountId = newId();
  const account = await prisma.hostingAccount.create({
    data: {
      id: accountId,
      domain: `ep-${accountId.slice(0, 10)}.sahary.cloud`,
      documentRoot: path.join(tmpDir, 'www', accountId, 'public_html'),
      diskQuota: 10,
      bandwidthQuota: 100,
      status,
      userId,
      planId: plan.id,
    },
  });
  return { id: account.id, domain: account.domain };
};

const seedDomain = async (accountId: string, isVerified: boolean): Promise<string> => {
  const record = await prisma.hostingDomain.create({
    data: {
      domain: `ed-${newId().slice(0, 10)}.example.test`,
      accountId,
      isVerified,
      verifyToken: 'tok',
    },
  });
  return record.id;
};

const sslPath = (id: string): string => `/api/v1/hosting/domains/${id}/ssl`;

// The response is 202 + async issuance; poll until the background claim lands
// a terminal status (NONE means the setImmediate hasn't run yet).
const waitForStatus = async (id: string, timeoutMs = 8000): Promise<string | null> => {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const row = await prisma.hostingDomain.findUnique({ where: { id } });
    if (row && (row.sslStatus === 'ACTIVE' || row.sslStatus === 'FAILED')) {
      return row.sslStatus;
    }
    if (Date.now() > deadline) {
      return row?.sslStatus ?? null;
    }
    await new Promise((resolve) => { setTimeout(resolve, 50); });
  }
};

describe('POST /api/v1/hosting/domains/:id/ssl', () => {
  beforeAll(() => {
    fs.mkdirSync(SUITE_TMP, { recursive: true });
  });

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(SUITE_TMP, 'case-'));
    liveDir = path.join(tmpDir, 'live');
    savedEnv = {};
    for (const key of ENV_KEYS) {
      savedEnv[key] = process.env[key];
    }
    setSslEnv(true);
    mockCertbotOk();
  });

  afterEach(async () => {
    for (const key of ENV_KEYS) {
      if (savedEnv[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = savedEnv[key];
      }
    }
    await fsp.rm(tmpDir, { recursive: true, force: true });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.hostingPlan.deleteMany({ where: { id: { in: createdPlanIds } } });
    await fsp.rm(SUITE_TMP, { recursive: true, force: true });
    await prisma.$disconnect();
  });

  test('401 without a token', async () => {
    const res = await request(app).post(sslPath('whatever'));
    expect(res.status).toBe(401);
  });

  test('403 when email is not verified', async () => {
    const { token } = await seedUser(false);
    const res = await request(app).post(sslPath('whatever')).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  test('404 when the caller has no hosting account', async () => {
    const { token } = await seedUser(true);
    const res = await request(app).post(sslPath('whatever')).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  test('403 when the account is suspended', async () => {
    const { id: userId, token } = await seedUser(true);
    await seedAccount(userId, 'SUSPENDED');
    const res = await request(app).post(sslPath('whatever')).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  test('404 for a missing domain; 403 for another account\'s domain', async () => {
    const { id: userId, token } = await seedUser(true);
    await seedAccount(userId);

    const res404 = await request(app).post(sslPath('nonexistent')).set('Authorization', `Bearer ${token}`);
    expect(res404.status).toBe(404);

    const { id: otherUser } = await seedUser(true);
    const otherAccount = await seedAccount(otherUser);
    const foreignDomain = await seedDomain(otherAccount.id, true);
    const res403 = await request(app).post(sslPath(foreignDomain)).set('Authorization', `Bearer ${token}`);
    expect(res403.status).toBe(403);
  });

  test('409 while the domain is unverified; 503 when SSL is disabled', async () => {
    const { id: userId, token } = await seedUser(true);
    const account = await seedAccount(userId);
    const unverified = await seedDomain(account.id, false);

    const res409 = await request(app).post(sslPath(unverified)).set('Authorization', `Bearer ${token}`);
    expect(res409.status).toBe(409);
    expect(res409.body.message).toBe('Verify the domain first');

    const verified = await seedDomain(account.id, true);
    setSslEnv(false);
    const res503 = await request(app).post(sslPath(verified)).set('Authorization', `Bearer ${token}`);
    expect(res503.status).toBe(503);
  });

  test('202 accepted, DTO reports PENDING, background issuance completes', async () => {
    const { id: userId, token } = await seedUser(true);
    const account = await seedAccount(userId);
    const domainId = await seedDomain(account.id, true);

    const res = await request(app).post(sslPath(domainId)).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(202);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBe(domainId);
    expect(res.body.data.ssl.status).toBe('PENDING');

    // The background issuance claims the row, runs the (mocked) certbot and
    // lands the domain on ACTIVE with the fixture's expiry.
    const final = await waitForStatus(domainId);
    expect(final).toBe('ACTIVE');
    const row = await prisma.hostingDomain.findUnique({ where: { id: domainId } });
    expect(row!.sslExpiresAt!.getUTCFullYear()).toBe(2046);
  });
});
