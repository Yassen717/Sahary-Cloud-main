import fs from 'fs';
import os from 'os';
import path from 'path';
import type { HostingAccount, HostingPlan, User } from '@prisma/client';
import { prisma } from '../../src/config/database';
import {
  getUsageForAccount,
  measureAccount,
  runMeteringCycle,
} from '../../src/services/hostingUsageService';
import { activateAccount, suspendAccount } from '../../src/services/hostingLifecycleService';
import { notifyQuotaAlert } from '../../src/services/hostingNotificationService';
import { accountDocumentRoot } from '../../src/services/hostingNaming';
import logger from '../../src/utils/logger';
import type { HostingAccountDTO } from '../../src/types/hosting';

jest.mock('../../src/services/hostingLifecycleService', () => ({
  suspendAccount: jest.fn(),
  activateAccount: jest.fn(),
}));

jest.mock('../../src/services/hostingNotificationService', () => ({
  notifyQuotaAlert: jest.fn(),
}));

const suspendMock = suspendAccount as jest.MockedFunction<typeof suspendAccount>;
const activateMock = activateAccount as jest.MockedFunction<typeof activateAccount>;
const notifyMock = notifyQuotaAlert as jest.MockedFunction<typeof notifyQuotaAlert>;

const GB = 1024 ** 3;
const LOG_TS = '2026-10-15T12:00:00+00:00';
const TEST_EMAIL = 'wp06-usage@test.local';
const TEST_PLAN = 'wp06-usage-plan';

let wwwBase: string;
let logDir: string;
let user: User;
let plan: HostingPlan;
let savedLogDir: string | undefined;
let savedWwwBase: string | undefined;

const uniq = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 9)}`;
const logLine = (bytes: number, ts = LOG_TS): string => `${ts} ${bytes}\n`;
const logPathFor = (accountId: string): string => path.join(logDir, `${accountId}.access.log`);
const writeLog = (accountId: string, content: string): void => {
  fs.writeFileSync(logPathFor(accountId), content, 'latin1');
};
const readAccount = (id: string) => prisma.hostingAccount.findUniqueOrThrow({ where: { id } });

const utcMonthStart = (d: Date): Date => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
const prevMonthStart = (): Date => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
};
const utcMidnightDaysAgo = (days: number): Date => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - days));
};

interface AccountOverrides {
  status?: string;
  suspendReason?: string | null;
  documentRoot?: string | null;
  diskQuota?: number;
  bandwidthQuota?: number;
  diskUsed?: number;
  bandwidthUsed?: number;
  bandwidthCycleStart?: Date | null;
  bandwidthLogOffset?: bigint;
  bandwidthLogInode?: string | null;
  diskAlertLevel?: number;
  bandwidthAlertLevel?: number;
  suspendedAt?: Date | null;
}

const createAccount = async (over: AccountOverrides = {}): Promise<HostingAccount> =>
  prisma.hostingAccount.create({
    data: {
      domain: `wp06-${uniq()}.sahary.test`,
      documentRoot: path.join(wwwBase, `acct-${uniq()}`),
      diskQuota: 10,
      bandwidthQuota: 100,
      status: 'ACTIVE',
      userId: user.id,
      planId: plan.id,
      ...over,
    },
  });

beforeAll(async () => {
  wwwBase = fs.mkdtempSync(path.join(os.tmpdir(), 'wp06-www-'));
  logDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wp06-log-'));
  savedLogDir = process.env.HOSTING_NGINX_LOG_DIR;
  savedWwwBase = process.env.HOSTING_WWW_BASE;
  process.env.HOSTING_NGINX_LOG_DIR = logDir;
  process.env.HOSTING_WWW_BASE = wwwBase;

  await (global as unknown as { cleanupTestUsers: (p: unknown, e: string[]) => Promise<void> })
    .cleanupTestUsers(prisma, [TEST_EMAIL]);
  await prisma.hostingPlan.deleteMany({ where: { name: TEST_PLAN } });

  user = await prisma.user.create({
    data: {
      email: TEST_EMAIL,
      password: 'irrelevant-hash',
      firstName: 'WP06',
      lastName: 'Usage',
      isVerified: true,
    },
  });
  plan = await prisma.hostingPlan.create({
    data: { name: TEST_PLAN, diskGB: 10, bandwidthGB: 100, monthlyPrice: 0 },
  });
});

afterAll(async () => {
  if (savedLogDir === undefined) delete process.env.HOSTING_NGINX_LOG_DIR;
  else process.env.HOSTING_NGINX_LOG_DIR = savedLogDir;
  if (savedWwwBase === undefined) delete process.env.HOSTING_WWW_BASE;
  else process.env.HOSTING_WWW_BASE = savedWwwBase;

  await (global as unknown as { cleanupTestUsers: (p: unknown, e: string[]) => Promise<void> })
    .cleanupTestUsers(prisma, [TEST_EMAIL]);
  await prisma.hostingPlan.deleteMany({ where: { name: TEST_PLAN } });
  fs.rmSync(wwwBase, { recursive: true, force: true });
  fs.rmSync(logDir, { recursive: true, force: true });
  await prisma.$disconnect();
});

beforeEach(() => {
  suspendMock.mockResolvedValue({} as HostingAccountDTO);
  activateMock.mockResolvedValue({} as HostingAccountDTO);
  notifyMock.mockResolvedValue(undefined);
});

describe('measureAccount — disk metering', () => {
  test('sums documentRoot bytes into GB rounded to 4 decimals', async () => {
    const acc = await createAccount();
    const root = acc.documentRoot as string;
    fs.mkdirSync(path.join(root, 'sub'), { recursive: true });
    fs.writeFileSync(path.join(root, 'a.bin'), Buffer.alloc(1024 * 1024));
    fs.writeFileSync(path.join(root, 'sub', 'b.bin'), Buffer.alloc(512 * 1024));

    const result = await measureAccount(acc.id);

    expect(result.diskUsedGB).toBe(0.0015); // 1.5 MiB = 0.00146484… GB -> 4dp
    const row = await readAccount(acc.id);
    expect(row.diskUsed).toBe(0.0015);
    expect(row.usageUpdatedAt).not.toBeNull();
  });

  test('missing documentRoot counts as 0', async () => {
    const acc = await createAccount();
    const result = await measureAccount(acc.id);
    expect(result.diskUsedGB).toBe(0);
    expect(result.bandwidthUsedGB).toBe(0);
  });

  test('falls back to <wwwBase>/<id>/public_html when documentRoot is null', async () => {
    const acc = await createAccount({ documentRoot: null });
    const root = accountDocumentRoot(wwwBase, acc.id);
    fs.mkdirSync(root, { recursive: true });
    const file = path.join(root, 'big.bin');
    fs.writeFileSync(file, '');
    fs.truncateSync(file, GB); // sparse 1 GiB file

    const result = await measureAccount(acc.id);
    expect(result.diskUsedGB).toBe(1);
  });

  test('throws 404 for an unknown account', async () => {
    await expect(measureAccount('ck_does_not_exist')).rejects.toMatchObject({ status: 404 });
  });
});

describe('measureAccount — bandwidth log parsing', () => {
  test('sums bytes from a fresh log, persists offset and inode', async () => {
    const acc = await createAccount();
    const content = logLine(1024) + logLine(2048) + logLine(512);
    writeLog(acc.id, content);

    const result = await measureAccount(acc.id);

    expect(result.bandwidthUsedGB).toBeCloseTo(3584 / GB, 8);
    const row = await readAccount(acc.id);
    expect(row.bandwidthLogOffset).toBe(BigInt(Buffer.byteLength(content)));
    expect(row.bandwidthLogInode).toBe(String(fs.statSync(logPathFor(acc.id)).ino));
  });

  test('a second run counts only newly appended bytes', async () => {
    const acc = await createAccount();
    writeLog(acc.id, logLine(1000));
    await measureAccount(acc.id);
    const offsetAfterFirst = (await readAccount(acc.id)).bandwidthLogOffset;

    fs.appendFileSync(logPathFor(acc.id), logLine(500), 'latin1');
    const result = await measureAccount(acc.id);

    expect(result.bandwidthUsedGB).toBeCloseTo(1500 / GB, 8);
    const row = await readAccount(acc.id);
    expect(row.bandwidthLogOffset).toBe(
      offsetAfterFirst + BigInt(Buffer.byteLength(logLine(500))),
    );
  });

  test('never advances the offset past an incomplete last line', async () => {
    const acc = await createAccount();
    const complete = logLine(100);
    const partial = '2026-10-15T12:00:01+00:00 999'; // no trailing newline yet
    writeLog(acc.id, complete + partial);

    let result = await measureAccount(acc.id);
    expect(result.bandwidthUsedGB).toBeCloseTo(100 / GB, 8);
    expect((await readAccount(acc.id)).bandwidthLogOffset).toBe(BigInt(complete.length));

    fs.appendFileSync(logPathFor(acc.id), `\n${logLine(50)}`, 'latin1');
    result = await measureAccount(acc.id);
    expect(result.bandwidthUsedGB).toBeCloseTo((100 + 999 + 50) / GB, 8);
  });

  test('ignores malformed lines', async () => {
    const acc = await createAccount();
    const content = [
      'not-a-timestamp 512',
      `${LOG_TS} abc`,
      `${LOG_TS} 512 unexpected-field`,
      LOG_TS,
      '',
      `${LOG_TS} 256`,
      `${LOG_TS} 128`,
    ].join('\n') + '\n';
    writeLog(acc.id, content);

    const result = await measureAccount(acc.id);
    expect(result.bandwidthUsedGB).toBeCloseTo(384 / GB, 8);
  });

  test('byte totals above 2^31 stay exact', async () => {
    const acc = await createAccount();
    writeLog(acc.id, logLine(4294967296) + logLine(2147483648));

    const result = await measureAccount(acc.id);
    expect(result.bandwidthUsedGB).toBe(6);
  });

  test('a missing log file contributes 0 bytes and resets offset/inode', async () => {
    const acc = await createAccount({ bandwidthLogOffset: BigInt(1234), bandwidthLogInode: 'stale' });
    const result = await measureAccount(acc.id);
    expect(result.bandwidthUsedGB).toBe(0);
    const row = await readAccount(acc.id);
    expect(row.bandwidthLogOffset).toBe(BigInt(0));
    expect(row.bandwidthLogInode).toBeNull();
  });

  test('a log truncated below the stored offset re-parses from 0', async () => {
    const acc = await createAccount();
    writeLog(acc.id, logLine(100) + logLine(200) + logLine(400));
    await measureAccount(acc.id);

    writeLog(acc.id, logLine(50)); // overwrite -> smaller than the stored offset
    const result = await measureAccount(acc.id);

    expect(result.bandwidthUsedGB).toBeCloseTo((700 + 50) / GB, 8);
    const row = await readAccount(acc.id);
    expect(row.bandwidthLogOffset).toBe(BigInt(Buffer.byteLength(logLine(50))));
  });

  test('a stored inode that no longer matches re-parses from 0', async () => {
    const acc = await createAccount();
    writeLog(acc.id, logLine(1024));
    await measureAccount(acc.id);
    await prisma.hostingAccount.update({
      where: { id: acc.id },
      data: { bandwidthLogInode: 'rotated-away' },
    });

    const result = await measureAccount(acc.id);
    expect(result.bandwidthUsedGB).toBeCloseTo(2048 / GB, 8); // same file parsed again
    expect((await readAccount(acc.id)).bandwidthLogInode).toBe(
      String(fs.statSync(logPathFor(acc.id)).ino),
    );
  });

  test('a run reads at most 256 MiB and resumes from the stored offset', async () => {
    const acc = await createAccount();
    const CAP = 256 * 1024 * 1024;
    const l1 = logLine(100); // 30 bytes
    const l2 = '2026-10-16T01:00:00+00:00 200\n'; // 30 bytes
    const midNewlinePos = CAP + 14;
    const eof = midNewlinePos + 1 + l2.length;
    const file = logPathFor(acc.id);
    const fd = fs.openSync(file, 'w');
    try {
      fs.writeSync(fd, Buffer.from(l1, 'latin1'), 0, l1.length, 0);
      fs.writeSync(fd, Buffer.from('\n', 'latin1'), 0, 1, midNewlinePos);
      fs.writeSync(fd, Buffer.from(l2, 'latin1'), 0, l2.length, midNewlinePos + 1);
    } finally {
      fs.closeSync(fd);
    }
    expect(fs.statSync(file).size).toBe(eof);

    // Run 1: only l1 is a complete line inside the first 256 MiB window.
    let result = await measureAccount(acc.id);
    expect(result.bandwidthUsedGB).toBeCloseTo(100 / GB, 8);
    expect((await readAccount(acc.id)).bandwidthLogOffset).toBe(BigInt(l1.length));

    // Run 2: the giant unterminated stretch is skipped; l2 is still incomplete
    // inside the window, so the offset lands just after the middle newline.
    result = await measureAccount(acc.id);
    expect(result.bandwidthUsedGB).toBeCloseTo(100 / GB, 8);
    expect((await readAccount(acc.id)).bandwidthLogOffset).toBe(BigInt(midNewlinePos + 1));

    // Run 3: l2 finally fits in the window and is counted.
    result = await measureAccount(acc.id);
    expect(result.bandwidthUsedGB).toBeCloseTo(300 / GB, 8);
    expect((await readAccount(acc.id)).bandwidthLogOffset).toBe(BigInt(eof));
  }, 30000);
});

describe('measureAccount — monthly cycle rollover (P8)', () => {
  test('a new UTC month zeroes bandwidth and resets both alert levels', async () => {
    const acc = await createAccount({
      bandwidthUsed: 55.5,
      bandwidthCycleStart: prevMonthStart(),
      diskAlertLevel: 80,
      bandwidthAlertLevel: 100,
    });
    writeLog(acc.id, logLine(1024));

    const result = await measureAccount(acc.id);

    expect(result.bandwidthUsedGB).toBeCloseTo(1024 / GB, 8);
    const row = await readAccount(acc.id);
    expect(row.bandwidthCycleStart).toEqual(utcMonthStart(new Date()));
    expect(row.diskAlertLevel).toBe(0);
    expect(row.bandwidthAlertLevel).toBe(0);
  });

  test('same-month measurements accumulate instead of resetting', async () => {
    const acc = await createAccount({
      bandwidthUsed: 1,
      bandwidthCycleStart: utcMonthStart(new Date()),
    });
    writeLog(acc.id, logLine(GB));

    const result = await measureAccount(acc.id);
    expect(result.bandwidthUsedGB).toBe(2);
  });

  test('reactivates only SUSPENDED + BANDWIDTH_EXCEEDED accounts on rollover', async () => {
    const reactivate = await createAccount({
      status: 'SUSPENDED',
      suspendReason: 'BANDWIDTH_EXCEEDED',
      suspendedAt: prevMonthStart(),
      bandwidthCycleStart: prevMonthStart(),
    });
    const keepSuspended = await createAccount({
      status: 'SUSPENDED',
      suspendReason: 'PAYMENT_FAILED',
      suspendedAt: prevMonthStart(),
      bandwidthCycleStart: prevMonthStart(),
    });
    const notYet = await createAccount({
      status: 'SUSPENDED',
      suspendReason: 'BANDWIDTH_EXCEEDED',
      suspendedAt: new Date(),
      bandwidthCycleStart: utcMonthStart(new Date()),
    });

    await measureAccount(reactivate.id);
    await measureAccount(keepSuspended.id);
    await measureAccount(notYet.id);

    expect(activateMock).toHaveBeenCalledTimes(1);
    expect(activateMock).toHaveBeenCalledWith(reactivate.id);
  });
});

describe('measureAccount — quota alerts and suspension (P8)', () => {
  test('WARNING fires the 80 alert exactly once across runs', async () => {
    const acc = await createAccount({
      bandwidthUsed: 85,
      bandwidthCycleStart: utcMonthStart(new Date()),
    });

    await measureAccount(acc.id);
    await measureAccount(acc.id);

    expect(notifyMock).toHaveBeenCalledTimes(1);
    expect(notifyMock).toHaveBeenCalledWith(acc.id, 'bandwidth', 80);
    expect((await readAccount(acc.id)).bandwidthAlertLevel).toBe(80);
  });

  test('EXCEEDED fires 80 then 100 in order, persists level, suspends ACTIVE', async () => {
    const acc = await createAccount({
      bandwidthUsed: 105,
      bandwidthCycleStart: utcMonthStart(new Date()),
    });

    await measureAccount(acc.id);

    expect(notifyMock.mock.calls).toEqual([
      [acc.id, 'bandwidth', 80],
      [acc.id, 'bandwidth', 100],
    ]);
    expect(suspendMock).toHaveBeenCalledTimes(1);
    expect(suspendMock).toHaveBeenCalledWith(acc.id, 'BANDWIDTH_EXCEEDED');
    expect((await readAccount(acc.id)).bandwidthAlertLevel).toBe(100);
  });

  test('an account suspended for another reason is not re-suspended', async () => {
    const acc = await createAccount({
      status: 'SUSPENDED',
      suspendReason: 'PAYMENT_FAILED',
      suspendedAt: new Date(),
      bandwidthUsed: 150,
      bandwidthCycleStart: utcMonthStart(new Date()),
    });

    await measureAccount(acc.id);
    expect(suspendMock).not.toHaveBeenCalled();
  });

  test('alerts re-arm after usage drops below 80%', async () => {
    const acc = await createAccount({
      bandwidthUsed: 85,
      bandwidthCycleStart: utcMonthStart(new Date()),
    });
    await measureAccount(acc.id);
    expect(notifyMock).toHaveBeenCalledTimes(1);

    await prisma.hostingAccount.update({ where: { id: acc.id }, data: { bandwidthUsed: 50 } });
    await measureAccount(acc.id);
    expect(notifyMock).toHaveBeenCalledTimes(1);
    expect((await readAccount(acc.id)).bandwidthAlertLevel).toBe(0);

    await prisma.hostingAccount.update({ where: { id: acc.id }, data: { bandwidthUsed: 90 } });
    await measureAccount(acc.id);
    expect(notifyMock).toHaveBeenCalledTimes(2);
    expect(notifyMock).toHaveBeenLastCalledWith(acc.id, 'bandwidth', 80);
  });

  test('disk at 100% alerts but never suspends', async () => {
    const acc = await createAccount({ bandwidthCycleStart: utcMonthStart(new Date()) });
    const root = acc.documentRoot as string;
    fs.mkdirSync(root, { recursive: true });
    const file = path.join(root, 'full.bin');
    fs.writeFileSync(file, '');
    fs.truncateSync(file, 11 * GB); // quota is 10 GB

    await measureAccount(acc.id);

    expect(notifyMock.mock.calls).toEqual([
      [acc.id, 'disk', 80],
      [acc.id, 'disk', 100],
    ]);
    expect(suspendMock).not.toHaveBeenCalled();
    expect((await readAccount(acc.id)).diskAlertLevel).toBe(100);
  });

  test('quota of 0 never alerts', async () => {
    const acc = await createAccount({
      diskQuota: 0,
      bandwidthQuota: 0,
      bandwidthUsed: 5,
      bandwidthCycleStart: utcMonthStart(new Date()),
    });
    await measureAccount(acc.id);
    expect(notifyMock).not.toHaveBeenCalled();
    expect(suspendMock).not.toHaveBeenCalled();
  });
});

describe('getUsageForAccount', () => {
  test('throws 404 for an unknown account', async () => {
    await expect(getUsageForAccount('ck_nope')).rejects.toMatchObject({ status: 404 });
  });

  test('returns current usage summary plus ascending 30-day history', async () => {
    const acc = await createAccount({
      diskUsed: 8.5,
      bandwidthUsed: 90,
      bandwidthCycleStart: utcMonthStart(new Date()),
    });
    for (let i = 44; i >= 0; i--) {
      await prisma.hostingUsageSnapshot.create({
        data: {
          accountId: acc.id,
          date: utcMidnightDaysAgo(i),
          diskUsedGB: i,
          bandwidthUsedGB: i * 2,
        },
      });
    }

    const dto = await getUsageForAccount(acc.id);

    expect(dto.diskUsedGB).toBe(8.5);
    expect(dto.diskLevel).toBe('WARNING');
    expect(dto.bandwidthLevel).toBe('WARNING');
    expect(dto.bandwidthCycleEnd).toBe(
      new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() + 1, 1)).toISOString(),
    );
    expect(dto.history).toHaveLength(30);
    // 45 snapshots exist (44..0 days ago); only the newest 30 are returned,
    // oldest first -> history[0] is the 29-days-ago row.
    expect(dto.history[0].diskUsedGB).toBe(29);
    expect(dto.history[29].diskUsedGB).toBe(0);
    const dates = dto.history.map((h) => h.date);
    const sorted = [...dates].sort();
    expect(dates).toEqual(sorted);
    expect(dto.history[29].bandwidthUsedGB).toBe(0);
  });
});

describe('runMeteringCycle', () => {
  test('measures ACTIVE and BANDWIDTH_EXCEEDED-suspended accounts only', async () => {
    const active = await createAccount();
    const suspendedBw = await createAccount({
      status: 'SUSPENDED',
      suspendReason: 'BANDWIDTH_EXCEEDED',
      suspendedAt: new Date(),
      bandwidthCycleStart: utcMonthStart(new Date()),
    });
    const suspendedPayment = await createAccount({
      status: 'SUSPENDED',
      suspendReason: 'PAYMENT_FAILED',
      suspendedAt: new Date(),
      bandwidthCycleStart: utcMonthStart(new Date()),
    });
    const provisioning = await createAccount({ status: 'PROVISIONING' });
    const terminated = await createAccount({ status: 'TERMINATED', terminatedAt: new Date() });

    const result = await runMeteringCycle();

    expect(result.accounts).toBeGreaterThanOrEqual(2);
    const snapshotOf = (id: string) =>
      prisma.hostingUsageSnapshot.findUnique({
        where: { accountId_date: { accountId: id, date: utcMidnightDaysAgo(0) } },
      });
    expect(await snapshotOf(active.id)).not.toBeNull();
    expect(await snapshotOf(suspendedBw.id)).not.toBeNull();
    expect(await snapshotOf(suspendedPayment.id)).toBeNull();
    expect(await snapshotOf(provisioning.id)).toBeNull();
    expect(await snapshotOf(terminated.id)).toBeNull();
  });

  test('upserts one snapshot per UTC day — a second run updates it', async () => {
    const acc = await createAccount();
    writeLog(acc.id, logLine(1024));

    await runMeteringCycle();
    fs.appendFileSync(logPathFor(acc.id), logLine(1024), 'latin1');
    await runMeteringCycle();

    const snaps = await prisma.hostingUsageSnapshot.findMany({ where: { accountId: acc.id } });
    expect(snaps).toHaveLength(1);
    expect(snaps[0].bandwidthUsedGB).toBeCloseTo(2048 / GB, 8);
  });

  test('reactivation and suspension counts come back in the result', async () => {
    const overQuota = await createAccount();
    writeLog(overQuota.id, logLine(150 * GB));

    const result = await runMeteringCycle();

    expect(suspendMock).toHaveBeenCalledWith(overQuota.id, 'BANDWIDTH_EXCEEDED');
    expect(result.suspended).toBeGreaterThanOrEqual(1);
    expect(result.alerts).toBeGreaterThanOrEqual(2);
  });

  test('pages accounts in 50s and isolates per-account failures', async () => {
    const prefix = `wp06-page-${uniq()}`;
    await prisma.hostingAccount.createMany({
      data: Array.from({ length: 51 }, (_, i) => ({
        domain: `${prefix}-${i}.sahary.test`,
        documentRoot: path.join(wwwBase, `${prefix}-${i}`),
        diskQuota: 10,
        bandwidthQuota: 100,
        status: 'ACTIVE',
        userId: user.id,
        planId: plan.id,
      })),
    });
    const mine = await prisma.hostingAccount.findMany({
      where: { domain: { startsWith: prefix } },
      select: { id: true },
    });
    const mineIds = mine.map((m) => m.id);

    // One account's reactivation fails and one account's suspension fails —
    // the cycle must log, skip, and keep going across both pages.
    const failReactivate = await createAccount({
      status: 'SUSPENDED',
      suspendReason: 'BANDWIDTH_EXCEEDED',
      suspendedAt: prevMonthStart(),
      bandwidthCycleStart: prevMonthStart(),
    });
    const failSuspend = await createAccount();
    writeLog(failSuspend.id, logLine(150 * GB));
    activateMock.mockImplementation(async (id: string) => {
      if (id === failReactivate.id) throw new Error('vhost reload failed');
      return {} as HostingAccountDTO;
    });
    suspendMock.mockImplementation(async (id: string) => {
      if (id === failSuspend.id) throw new Error('vhost reload failed');
      return {} as HostingAccountDTO;
    });
    const errorSpy = jest.spyOn(logger, 'error').mockImplementation(() => logger);

    const result = await runMeteringCycle();

    expect(mineIds).toHaveLength(51);
    expect(result.accounts).toBeGreaterThanOrEqual(51);
    const today = utcMidnightDaysAgo(0);
    const snapped = await prisma.hostingUsageSnapshot.count({
      where: { accountId: { in: mineIds }, date: today },
    });
    expect(snapped).toBe(51);
    for (const bad of [failReactivate.id, failSuspend.id]) {
      expect(await prisma.hostingUsageSnapshot.count({ where: { accountId: bad, date: today } })).toBe(0);
    }
    expect(errorSpy).toHaveBeenCalledWith(
      'hosting metering failed for account',
      expect.objectContaining({ accountId: failReactivate.id }),
    );
    expect(errorSpy).toHaveBeenCalledWith(
      'hosting metering failed for account',
      expect.objectContaining({ accountId: failSuspend.id }),
    );
  });
});
