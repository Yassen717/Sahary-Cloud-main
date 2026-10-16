import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { execFile } from 'child_process';
import { prisma } from '../../src/config/database';

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

jest.mock('../../src/services/hostingNotificationService', () => {
  const actual = jest.requireActual('../../src/services/hostingNotificationService');
  return {
    ...actual,
    notifySslIssued: jest.fn(async () => undefined),
    notifySslFailed: jest.fn(async () => undefined),
    notifySslExpiring: jest.fn(async () => undefined),
  };
});

import {
  _resetWildcardCache,
  deleteCertificate,
  getWildcardStatus,
  healthCheck,
  isSslEnabled,
  issueCertificateForDomain,
  issuePendingCertificates,
  renewExpiringCertificates,
  syncPrimarySslState,
} from '../../src/services/sslService';
import * as vhostService from '../../src/services/vhostService';
import * as notificationService from '../../src/services/hostingNotificationService';

const SUITE_TMP = path.join(__dirname, 'tmp-ssl');
const CERT_FIXTURE = path.join(__dirname, 'fixtures', 'test-cert.pem');
const KEY_FIXTURE = path.join(__dirname, 'fixtures', 'test-key.pem');
const EXPIRING_CERT_FIXTURE = path.join(__dirname, 'fixtures', 'test-expiring-cert.pem');
const EXPIRING_KEY_FIXTURE = path.join(__dirname, 'fixtures', 'test-expiring-key.pem');

const ENV_KEYS = [
  'HOSTING_SSL_ENABLED',
  'HOSTING_LETSENCRYPT_EMAIL',
  'HOSTING_LETSENCRYPT_STAGING',
  'HOSTING_ACME_WEBROOT',
  'HOSTING_LETSENCRYPT_LIVE_DIR',
  'HOSTING_CERTBOT_BIN',
  'HOSTING_WILDCARD_CERT_PATH',
  'HOSTING_WILDCARD_KEY_PATH',
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
  process.env.HOSTING_LETSENCRYPT_STAGING = 'false';
  process.env.HOSTING_ACME_WEBROOT = path.join(tmpDir, 'acme');
  process.env.HOSTING_LETSENCRYPT_LIVE_DIR = liveDir;
  process.env.HOSTING_CERTBOT_BIN = 'certbot';
  process.env.HOSTING_WILDCARD_CERT_PATH = '';
  process.env.HOSTING_WILDCARD_KEY_PATH = '';
};

// certbot mock that pretends to succeed — for certonly/renew it plants the
// fixture cert under <liveDir>/<domain>/ so the service can parse the expiry.
const mockCertbotOk = (): void => {
  execMock.mockImplementation((_file: string, args: string[], _opts: unknown, cb: ExecCb) => {
    if (args[0] === 'certonly' || args[0] === 'renew') {
      const domainIdx = args[0] === 'certonly' ? args.indexOf('-d') + 1 : args.indexOf('--cert-name') + 1;
      const domain = args[domainIdx];
      const dir = path.join(liveDir, domain);
      fs.mkdirSync(dir, { recursive: true });
      fs.copyFileSync(CERT_FIXTURE, path.join(dir, 'fullchain.pem'));
      fs.copyFileSync(KEY_FIXTURE, path.join(dir, 'privkey.pem'));
    }
    cb(null, 'certbot ok', '');
    return { kill: () => undefined };
  });
};

const mockCertbotFail = (stderr = 'Detail: Invalid response from https://acme.test/directory for admin@corp.example in /etc/letsencrypt/live/x'): void => {
  execMock.mockImplementation((_f: string, _a: string[], _o: unknown, cb: ExecCb) => {
    cb(Object.assign(new Error('certbot exited with code 1'), { code: 1 }), '', stderr);
    return { kill: () => undefined };
  });
};

const status = (err: unknown): number | undefined => (err as { status?: number }).status;

const seedPlan = async (): Promise<string> => {
  const plan = await prisma.hostingPlan.create({
    data: { name: `wp05s-plan-${newId().slice(0, 12)}`, diskGB: 10, bandwidthGB: 100, monthlyPrice: 5 },
  });
  createdPlanIds.push(plan.id);
  return plan.id;
};

const seedUser = async (): Promise<string> => {
  const user = await prisma.user.create({
    data: {
      email: `wp05s-${newId().slice(0, 12)}@example.test`,
      password: 'x',
      firstName: 'T',
      lastName: 'U',
      isVerified: true,
    },
  });
  createdUserIds.push(user.id);
  return user.id;
};

const seedAccount = async (opts: { status?: string; sslEnabled?: boolean; sslExpiresAt?: Date | null } = {}): Promise<{ id: string; domain: string; documentRoot: string }> => {
  const [planId, userId] = await Promise.all([seedPlan(), seedUser()]);
  const accountId = newId();
  const documentRoot = path.join(tmpDir, 'www', accountId, 'public_html');
  const account = await prisma.hostingAccount.create({
    data: {
      id: accountId,
      domain: `sac-${accountId.slice(0, 10)}.sahary.cloud`,
      documentRoot,
      diskQuota: 10,
      bandwidthQuota: 100,
      status: opts.status ?? 'ACTIVE',
      sslEnabled: opts.sslEnabled ?? false,
      sslExpiresAt: opts.sslExpiresAt ?? null,
      userId,
      planId,
    },
  });
  return { id: account.id, domain: account.domain, documentRoot };
};

const seedDomain = async (accountId: string, opts: {
  domain?: string;
  isVerified?: boolean;
  sslStatus?: string;
  sslExpiresAt?: Date | null;
  sslLastAttemptAt?: Date | null;
  sslLastError?: string | null;
  sslExpiryNoticeLevel?: number;
} = {}): Promise<{ id: string; domain: string }> => {
  const record = await prisma.hostingDomain.create({
    data: {
      domain: opts.domain ?? `sd-${newId().slice(0, 10)}.example.test`,
      accountId,
      isVerified: opts.isVerified ?? true,
      verifyToken: 'tok',
      sslStatus: opts.sslStatus ?? 'NONE',
      sslEnabled: opts.sslStatus === 'ACTIVE',
      sslExpiresAt: opts.sslExpiresAt ?? null,
      sslLastAttemptAt: opts.sslLastAttemptAt ?? null,
      sslLastError: opts.sslLastError ?? null,
      sslExpiryNoticeLevel: opts.sslExpiryNoticeLevel ?? 0,
    },
  });
  return { id: record.id, domain: record.domain };
};

const getDomain = (id: string) => prisma.hostingDomain.findUnique({ where: { id } });

describe('sslService', () => {
  beforeAll(() => {
    fs.mkdirSync(SUITE_TMP, { recursive: true });
  });

  beforeEach(async () => {
    // Suites share one database and may run in parallel workers — remove only
    // this suite's rows (prefix-scoped) so global scans stay deterministic.
    await prisma.hostingDomain.deleteMany({ where: { domain: { startsWith: 'sd-' } } });
    await prisma.hostingAccount.deleteMany({ where: { domain: { startsWith: 'sac-' } } });
    tmpDir = fs.mkdtempSync(path.join(SUITE_TMP, 'case-'));
    liveDir = path.join(tmpDir, 'live');
    savedEnv = {};
    for (const key of ENV_KEYS) {
      savedEnv[key] = process.env[key];
    }
    setSslEnv(true);
    _resetWildcardCache();
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
    _resetWildcardCache();
    await fsp.rm(tmpDir, { recursive: true, force: true });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.hostingPlan.deleteMany({ where: { id: { in: createdPlanIds } } });
    await fsp.rm(SUITE_TMP, { recursive: true, force: true });
    await prisma.$disconnect();
  });

  // ── config / wildcard ────────────────────────────────────────────────────

  test('isSslEnabled requires flag AND configured email', () => {
    expect(isSslEnabled()).toBe(true);
    process.env.HOSTING_SSL_ENABLED = 'false';
    expect(isSslEnabled()).toBe(false);
    process.env.HOSTING_SSL_ENABLED = 'true';
    process.env.HOSTING_LETSENCRYPT_EMAIL = '';
    expect(isSslEnabled()).toBe(false);
  });

  test('getWildcardStatus: readable unexpired cert+key -> available with expiry', () => {
    process.env.HOSTING_WILDCARD_CERT_PATH = CERT_FIXTURE;
    process.env.HOSTING_WILDCARD_KEY_PATH = KEY_FIXTURE;
    const status1 = getWildcardStatus();
    expect(status1.available).toBe(true);
    expect(status1.expiresAt).toBeInstanceOf(Date);
    expect(status1.expiresAt!.getUTCFullYear()).toBe(2046);
  });

  test('getWildcardStatus: missing files -> unavailable; result is cached', () => {
    expect(getWildcardStatus()).toEqual({ available: false, expiresAt: null });

    const readSpy = jest.spyOn(fs, 'readFileSync');
    process.env.HOSTING_WILDCARD_CERT_PATH = CERT_FIXTURE;
    process.env.HOSTING_WILDCARD_KEY_PATH = KEY_FIXTURE;
    const first = getWildcardStatus();
    expect(first.available).toBe(true);
    const reads = readSpy.mock.calls.filter((c) => String(c[0]) === CERT_FIXTURE).length;
    expect(reads).toBe(1);
    // Second call inside the 5-minute cache window: no re-read.
    expect(getWildcardStatus().available).toBe(true);
    expect(readSpy.mock.calls.filter((c) => String(c[0]) === CERT_FIXTURE).length).toBe(1);
  });

  // ── issueCertificateForDomain ────────────────────────────────────────────

  test('eligibility errors: 503 disabled, 404 missing, 409 unverified, 409 non-active account', async () => {
    const account = await seedAccount();
    const domain = await seedDomain(account.id, { isVerified: false });

    setSslEnv(false);
    await expect(issueCertificateForDomain(domain.id)).rejects.toMatchObject({ status: 503 });
    setSslEnv(true);

    await expect(issueCertificateForDomain('missing-id')).rejects.toMatchObject({ status: 404 });
    await expect(issueCertificateForDomain(domain.id)).rejects.toMatchObject({ status: 409, message: 'Verify the domain first' });

    const suspended = await seedAccount({ status: 'SUSPENDED' });
    const dom2 = await seedDomain(suspended.id);
    await expect(issueCertificateForDomain(dom2.id)).rejects.toMatchObject({ status: 409 });
  });

  test('success: certbot certonly argv, ACTIVE transition, vhost re-sync, notify', async () => {
    const account = await seedAccount();
    const domain = await seedDomain(account.id);

    const result = await issueCertificateForDomain(domain.id);
    expect(result).toEqual({ status: 'ACTIVE' });

    const row = await getDomain(domain.id);
    expect(row!.sslStatus).toBe('ACTIVE');
    expect(row!.sslEnabled).toBe(true);
    expect(row!.sslIssuedAt).not.toBeNull();
    expect(row!.sslExpiresAt!.getUTCFullYear()).toBe(2046); // fixture expiry
    expect(row!.sslLastError).toBeNull();
    expect(row!.sslLastAttemptAt).not.toBeNull();

    const call = execMock.mock.calls.find((c: unknown[]) => (c[1] as string[])[0] === 'certonly');
    expect(call).toBeDefined();
    const argv = call![1] as string[];
    expect(argv).toContain('--webroot');
    expect(argv).toContain('--non-interactive');
    expect(argv).toContain('--agree-tos');
    expect(argv).toContain(domain.domain);
    expect(argv).toContain('admin@example.test');
    // timeout is enforced
    expect((call![2] as { timeout: number }).timeout).toBe(120_000);

    expect(vhostService.syncAccountVhost).toHaveBeenCalledWith({
      primaryDomain: account.domain,
      documentRoot: account.documentRoot,
    });
    expect(notificationService.notifySslIssued).toHaveBeenCalledWith(domain.id);
  });

  test('failure: FAILED transition, sanitized error, notify once', async () => {
    const account = await seedAccount();
    const domain = await seedDomain(account.id);
    mockCertbotFail();

    const result = await issueCertificateForDomain(domain.id);
    expect(result).toEqual({ status: 'FAILED' });

    const row = await getDomain(domain.id);
    expect(row!.sslStatus).toBe('FAILED');
    expect(row!.sslLastError).toBeTruthy();
    expect(row!.sslLastError!.length).toBeLessThanOrEqual(300);
    expect(row!.sslLastError).not.toContain('admin@corp.example');
    expect(row!.sslLastError).not.toContain('/etc/letsencrypt');
    expect(row!.sslEnabled).toBe(false);
    expect(notificationService.notifySslFailed).toHaveBeenCalledTimes(1);

    // Second failure is a repeat of FAILED -> no extra notification.
    (notificationService.notifySslFailed as jest.Mock).mockClear();
    await expect(issueCertificateForDomain(domain.id)).resolves.toEqual({ status: 'FAILED' });
    expect(notificationService.notifySslFailed).not.toHaveBeenCalled();
  });

  test('atomic claim: concurrent issuance claims only once', async () => {
    const account = await seedAccount();
    const domain = await seedDomain(account.id);
    // Hold certbot briefly so both callers race on the updateMany claim.
    execMock.mockImplementation((_f: string, args: string[], _o: unknown, cb: ExecCb) => {
      const domainIdx = args[0] === 'certonly' ? args.indexOf('-d') + 1 : args.indexOf('--cert-name') + 1;
      const domain = args[domainIdx];
      setTimeout(() => {
        const dir = path.join(liveDir, domain);
        fs.mkdirSync(dir, { recursive: true });
        fs.copyFileSync(CERT_FIXTURE, path.join(dir, 'fullchain.pem'));
        fs.copyFileSync(KEY_FIXTURE, path.join(dir, 'privkey.pem'));
        cb(null, 'ok', '');
      }, 25);
      return { kill: () => undefined };
    });

    const results = await Promise.allSettled([
      issueCertificateForDomain(domain.id),
      issueCertificateForDomain(domain.id),
    ]);
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((fulfilled[0] as PromiseFulfilledResult<{ status: string }>).value).toEqual({ status: 'ACTIVE' });
    expect(status((rejected[0] as PromiseRejectedResult).reason)).toBe(409);
  });

  test('fresh PENDING is not claimable; stale PENDING is', async () => {
    const account = await seedAccount();
    const pending = await seedDomain(account.id, { sslStatus: 'PENDING', sslLastAttemptAt: new Date() });
    await expect(issueCertificateForDomain(pending.id)).rejects.toMatchObject({ status: 409, message: 'Certificate issuance is already in progress for this domain' });

    const stale = await seedDomain(account.id, {
      sslStatus: 'PENDING',
      sslLastAttemptAt: new Date(Date.now() - 20 * 60 * 1000),
    });
    await expect(issueCertificateForDomain(stale.id)).resolves.toEqual({ status: 'ACTIVE' });
  });

  test('fresh ACTIVE domain is not re-issued; expiring ACTIVE uses renew', async () => {
    const account = await seedAccount();
    const active = await seedDomain(account.id, {
      sslStatus: 'ACTIVE',
      sslExpiresAt: new Date(Date.now() + 60 * 24 * 3600 * 1000),
    });
    await expect(issueCertificateForDomain(active.id)).rejects.toMatchObject({ status: 409, message: 'Domain already has an active certificate' });

    const expiring = await seedDomain(account.id, {
      sslStatus: 'ACTIVE',
      sslExpiresAt: new Date(Date.now() + 10 * 24 * 3600 * 1000),
    });
    execMock.mockClear();
    await expect(issueCertificateForDomain(expiring.id)).resolves.toEqual({ status: 'ACTIVE' });
    const argv = execMock.mock.calls.map((c: unknown[]) => (c[1] as string[]));
    expect(argv.some((a) => a[0] === 'renew' && a.includes(expiring.domain))).toBe(true);
    expect(argv.some((a) => a[0] === 'certonly')).toBe(false);
  });

  // ── issuePendingCertificates ─────────────────────────────────────────────

  test('issuePendingCertificates picks eligible domains only', async () => {
    const account = await seedAccount();
    const staleTs = new Date(Date.now() - 20 * 60 * 1000);
    const oldTs = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const freshTs = new Date(Date.now() - 5 * 60 * 1000);

    const eligible = await Promise.all([
      seedDomain(account.id, { sslStatus: 'NONE' }),
      seedDomain(account.id, { sslStatus: 'FAILED', sslLastAttemptAt: oldTs }),
      seedDomain(account.id, { sslStatus: 'PENDING', sslLastAttemptAt: staleTs }),
    ]);
    await seedDomain(account.id, { sslStatus: 'ACTIVE', sslExpiresAt: new Date() }); // active — never pending-eligible

    const suspended = await seedAccount({ status: 'SUSPENDED' });
    const suspendedDom = await seedDomain(suspended.id, { sslStatus: 'NONE' }); // wrong account state
    const freshFailed = await seedDomain(account.id, { sslStatus: 'FAILED', sslLastAttemptAt: freshTs });
    const freshPending = await seedDomain(account.id, { sslStatus: 'PENDING', sslLastAttemptAt: new Date() });
    const unverified = await seedDomain(account.id, { sslStatus: 'NONE', isVerified: false });

    const result = await issuePendingCertificates();
    // Other suites running in parallel may contribute eligible rows too —
    // assert the relationship and that every domain seeded here transitioned.
    expect(result.issued).toBe(result.attempted);
    expect(result.failed).toBe(0);
    expect(result.attempted).toBeGreaterThanOrEqual(3);
    for (const d of eligible) {
      expect((await getDomain(d.id))!.sslStatus).toBe('ACTIVE');
    }
    // Ineligible rows are untouched.
    expect((await getDomain(suspendedDom.id))!.sslStatus).toBe('NONE');
    expect((await getDomain(freshFailed.id))!.sslStatus).toBe('FAILED');
    expect((await getDomain(freshPending.id))!.sslStatus).toBe('PENDING');
    expect((await getDomain(unverified.id))!.sslStatus).toBe('NONE');
  });

  test('issuePendingCertificates is capped at 10 per run', async () => {
    const account = await seedAccount();
    for (let i = 0; i < 12; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await seedDomain(account.id, { sslStatus: 'NONE' });
    }
    const result = await issuePendingCertificates();
    expect(result.attempted).toBe(10);
  });

  test('issuePendingCertificates counts failures', async () => {
    const account = await seedAccount();
    const domain = await seedDomain(account.id, { sslStatus: 'NONE' });
    mockCertbotFail();
    const result = await issuePendingCertificates();
    // Parallel suites can add eligible rows — under a failing certbot all of
    // them fail, so the only guaranteed relation is attempted === failed.
    expect(result.issued).toBe(0);
    expect(result.attempted).toBeGreaterThanOrEqual(1);
    expect(result.failed).toBe(result.attempted);
    expect((await getDomain(domain.id))!.sslStatus).toBe('FAILED');
  });

  test('issuePendingCertificates no-ops when SSL disabled', async () => {
    setSslEnv(false);
    expect(await issuePendingCertificates()).toEqual({ attempted: 0, issued: 0, failed: 0 });
  });

  // ── renewExpiringCertificates ────────────────────────────────────────────

  test('renews ACTIVE certs expiring within 30 days', async () => {
    const account = await seedAccount();
    const due = await seedDomain(account.id, {
      sslStatus: 'ACTIVE',
      // +1h buffer: daysLeft is floor()'ed so an exact 10d seed reads as 9.
      sslExpiresAt: new Date(Date.now() + 10 * 24 * 3600 * 1000 + 3600 * 1000),
      sslExpiryNoticeLevel: 14,
    });
    // not due
    await seedDomain(account.id, {
      sslStatus: 'ACTIVE',
      sslExpiresAt: new Date(Date.now() + 60 * 24 * 3600 * 1000),
    });
    const liveSub = path.join(liveDir, due.domain);
    fs.mkdirSync(liveSub, { recursive: true });
    fs.copyFileSync(CERT_FIXTURE, path.join(liveSub, 'fullchain.pem'));

    const result = await renewExpiringCertificates();
    expect(result).toEqual({ checked: 1, renewed: 1, failed: 0 });

    const row = await getDomain(due.id);
    expect(row!.sslExpiresAt!.getUTCFullYear()).toBe(2046);
    expect(row!.sslExpiryNoticeLevel).toBe(0);
    expect(row!.sslLastError).toBeNull();
    expect(vhostService.syncAccountVhost).toHaveBeenCalledWith({
      primaryDomain: account.domain,
      documentRoot: account.documentRoot,
    });
  });

  test('failed renewal keeps ACTIVE, records error, notifies at 14 then 7 without repeats', async () => {
    const account = await seedAccount();
    const domain = await seedDomain(account.id, {
      sslStatus: 'ACTIVE',
      sslExpiresAt: new Date(Date.now() + 10 * 24 * 3600 * 1000 + 3600 * 1000),
    });
    mockCertbotFail('certbot renew error in /etc/letsencrypt/renewal');

    let result = await renewExpiringCertificates();
    expect(result.failed).toBeGreaterThanOrEqual(1);
    expect(result.renewed).toBe(0);
    let row = await getDomain(domain.id);
    expect(row!.sslStatus).toBe('ACTIVE');
    expect(row!.sslLastError).toBeTruthy();
    expect(row!.sslLastError).not.toContain('/etc/letsencrypt');
    expect(row!.sslExpiryNoticeLevel).toBe(14);
    expect(notificationService.notifySslExpiring).toHaveBeenCalledWith(domain.id, 10);

    // Repeat run at same level -> no duplicate notification for this domain.
    (notificationService.notifySslExpiring as jest.Mock).mockClear();
    result = await renewExpiringCertificates();
    expect(result.failed).toBeGreaterThanOrEqual(1);
    const callsForDomain = (notificationService.notifySslExpiring as jest.Mock).mock.calls
      .filter((c: unknown[]) => c[0] === domain.id);
    expect(callsForDomain).toHaveLength(0);

    // Drop below 7 days -> one more notification at level 7.
    await prisma.hostingDomain.update({
      where: { id: domain.id },
      data: { sslExpiresAt: new Date(Date.now() + 5 * 24 * 3600 * 1000 + 3600 * 1000) },
    });
    result = await renewExpiringCertificates();
    expect(result.failed).toBeGreaterThanOrEqual(1);
    expect(notificationService.notifySslExpiring).toHaveBeenCalledWith(domain.id, 5);
    row = await getDomain(domain.id);
    expect(row!.sslExpiryNoticeLevel).toBe(7);
  });

  // ── deleteCertificate / syncPrimarySslState ──────────────────────────────

  test('deleteCertificate never throws and clears domain SSL state', async () => {
    const account = await seedAccount();
    const domain = await seedDomain(account.id, {
      sslStatus: 'ACTIVE',
      sslExpiresAt: new Date(Date.now() + 60 * 24 * 3600 * 1000),
      sslLastError: 'x',
    });
    mockCertbotFail();
    await expect(deleteCertificate(domain.domain)).resolves.toBeUndefined();
    const row = await getDomain(domain.id);
    expect(row!.sslStatus).toBe('NONE');
    expect(row!.sslEnabled).toBe(false);
    expect(row!.sslExpiresAt).toBeNull();
    expect(row!.sslLastError).toBeNull();
  });

  test('syncPrimarySslState flips ACTIVE accounts to wildcard state and resyncs only changed', async () => {
    process.env.HOSTING_WILDCARD_CERT_PATH = CERT_FIXTURE;
    process.env.HOSTING_WILDCARD_KEY_PATH = KEY_FIXTURE;
    _resetWildcardCache();
    const wildcard = getWildcardStatus();
    expect(wildcard.available).toBe(true);

    const flipped = await seedAccount({ sslEnabled: false, sslExpiresAt: null });
    const already = await seedAccount({ sslEnabled: true, sslExpiresAt: wildcard.expiresAt });
    const suspended = await seedAccount({ status: 'SUSPENDED', sslEnabled: false });

    (vhostService.syncAccountVhost as jest.Mock).mockClear();
    const result = await syncPrimarySslState();
    // ACTIVE accounts from suites running in parallel are stale too — only the
    // per-row outcomes are deterministic.
    expect(result.updated).toBeGreaterThanOrEqual(1);

    const row = await prisma.hostingAccount.findUnique({ where: { id: flipped.id } });
    expect(row!.sslEnabled).toBe(true);
    expect(row!.sslExpiresAt!.getTime()).toBe(wildcard.expiresAt!.getTime());
    expect(vhostService.syncAccountVhost).toHaveBeenCalledWith({
      primaryDomain: flipped.domain,
      documentRoot: flipped.documentRoot,
    });
    // Consistent and non-ACTIVE accounts are not resynced.
    const syncedDomains = (vhostService.syncAccountVhost as jest.Mock).mock.calls
      .map((c: unknown[]) => (c[0] as { primaryDomain: string }).primaryDomain);
    expect(syncedDomains).not.toContain(already.domain);
    expect(syncedDomains).not.toContain(suspended.domain);
  });

  test('syncPrimarySslState clears ssl flags when the wildcard disappears', async () => {
    const account = await seedAccount({ sslEnabled: true, sslExpiresAt: new Date(Date.now() + 90 * 24 * 3600 * 1000) });
    const result = await syncPrimarySslState(); // wildcard paths unset -> unavailable
    expect(result.updated).toBeGreaterThanOrEqual(1);
    const row = await prisma.hostingAccount.findUnique({ where: { id: account.id } });
    expect(row!.sslEnabled).toBe(false);
    expect(row!.sslExpiresAt).toBeNull();
  });

  // ── healthCheck ──────────────────────────────────────────────────────────

  test('healthCheck: disabled -> ok; certbot down -> not ok; expiring wildcard -> not ok', async () => {
    setSslEnv(false);
    expect(await healthCheck()).toEqual({ ok: true, message: 'disabled' });
    setSslEnv(true);

    mockCertbotFail('not found');
    expect((await healthCheck()).ok).toBe(false);

    mockCertbotOk();
    process.env.HOSTING_WILDCARD_CERT_PATH = CERT_FIXTURE;
    process.env.HOSTING_WILDCARD_KEY_PATH = KEY_FIXTURE;
    expect((await healthCheck()).ok).toBe(true);

    process.env.HOSTING_WILDCARD_CERT_PATH = EXPIRING_CERT_FIXTURE;
    process.env.HOSTING_WILDCARD_KEY_PATH = EXPIRING_KEY_FIXTURE;
    const res = await healthCheck();
    expect(res.ok).toBe(false);
    expect(res.message).toContain('14 days');

    process.env.HOSTING_WILDCARD_CERT_PATH = path.join(tmpDir, 'missing.pem');
    expect((await healthCheck()).ok).toBe(false);
  });
});
