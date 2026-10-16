// WP06 — usage metering + quota enforcement. See CONTRACT.md policy P8.
//
// Bandwidth is metered by incrementally parsing the per-account nginx access
// log `<nginx.logDir>/<accountId>.access.log` whose lines are written by the
// `sahary_bytes` log format: `"<time_iso8601> <bytes_sent>"`. Progress is
// persisted on the account row (`bandwidthLogOffset`/`bandwidthLogInode`) so
// log rotation (file shrink or inode change) re-parses from byte 0 instead of
// double counting or losing traffic.
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import { prisma } from '../config/database';
import { getHostingConfig } from '../config/hosting';
import httpError from '../utils/httpError';
import logger from '../utils/logger';
import { getDirectorySizeBytes } from './hostingFsUtils';
import { toUsageSummary, usageLevel } from './hostingDto';
import { accountDocumentRoot } from './hostingNaming';
import { activateAccount, suspendAccount } from './hostingLifecycleService';
import { notifyQuotaAlert } from './hostingNotificationService';
import type { HostingUsageDTO, UsageLevel } from '../types/hosting';

const BYTES_PER_GB = 1024 ** 3;

// One metering run never reads more than this much of a single log; the
// remainder is picked up by the next run via the persisted offset.
const MAX_LOG_READ_BYTES = 256 * 1024 * 1024;

// Log lines are tiny (<100 bytes). Anything past this is treated as malformed
// so a garbage line can never grow the parse buffer unboundedly.
const MAX_LOG_LINE_BYTES = 4096;

const LF = 0x0a;

const METER_PAGE_SIZE = 50;
const SNAPSHOT_HISTORY_DAYS = 30;
const ALERT_THRESHOLDS = [80, 100] as const;
const TIMESTAMP_PREFIX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;
const DIGITS_ONLY = /^\d+$/;

const round4 = (n: number): number => Math.round(n * 10000) / 10000;

const utcMonthStart = (d: Date): Date => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
const utcMidnight = (d: Date): Date => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/** Returns the byte count of a `<iso8601> <bytes>` log line, 0 when malformed. */
const parseLogLine = (line: string): number => {
  const trimmed = line.trim();
  if (trimmed === '') {
    return 0;
  }
  const fields = trimmed.split(/\s+/);
  if (fields.length !== 2) {
    return 0;
  }
  if (!TIMESTAMP_PREFIX.test(fields[0]) || !DIGITS_ONLY.test(fields[1])) {
    return 0;
  }
  const bytes = Number(fields[1]);
  return Number.isSafeInteger(bytes) ? bytes : 0;
};

interface LogDelta {
  bytesDelta: number;
  offset: bigint;
  inode: string | null;
}

/**
 * Reads the newly appended portion of an access log, starting at the persisted
 * offset. The offset resets to 0 when the file shrank or its inode changed
 * (rotation). The returned offset never lands past an incomplete trailing
 * line, and a single call reads at most MAX_LOG_READ_BYTES.
 */
async function readLogDelta(logPath: string, prevOffset: bigint, prevInode: string | null): Promise<LogDelta> {
  let stat;
  try {
    stat = await fsp.stat(logPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { bytesDelta: 0, offset: BigInt(0), inode: null };
    }
    throw error;
  }

  if (!stat.isFile()) {
    return { bytesDelta: 0, offset: BigInt(0), inode: null };
  }

  const inode = String(stat.ino);
  const size = BigInt(stat.size);
  const start = prevInode === null || prevInode !== inode || size < prevOffset ? BigInt(0) : prevOffset;
  const available = size - start;
  if (available <= 0) {
    return { bytesDelta: 0, offset: start, inode };
  }

  const toRead = available > BigInt(MAX_LOG_READ_BYTES) ? MAX_LOG_READ_BYTES : Number(available);
  const end = Number(start) + toRead - 1; // createReadStream `end` is inclusive

  let bytesDelta = 0;
  let readSoFar = 0;
  let consumed = 0; // bytes through the last complete newline, relative to `start`
  let lineBufs: Buffer[] = [];
  let lineLen = 0;
  let lineTooLong = false;

  const stream = fs.createReadStream(logPath, { start: Number(start), end });
  try {
    for await (const chunk of stream) {
      const buf = chunk as Buffer;
      const chunkBase = readSoFar;
      let pos = 0;
      for (;;) {
        const nl = buf.indexOf(LF, pos);
        if (nl === -1) {
          break;
        }
        const segLen = nl - pos;
        if (!lineTooLong && lineLen + segLen <= MAX_LOG_LINE_BYTES) {
          lineBufs.push(buf.subarray(pos, nl));
          bytesDelta += parseLogLine(Buffer.concat(lineBufs).toString('latin1'));
        }
        consumed = chunkBase + nl + 1;
        lineBufs = [];
        lineLen = 0;
        lineTooLong = false;
        pos = nl + 1;
      }
      const rem = buf.length - pos;
      if (rem > 0) {
        if (!lineTooLong && lineLen + rem <= MAX_LOG_LINE_BYTES) {
          lineBufs.push(buf.subarray(pos, buf.length));
        } else {
          lineBufs = [];
          lineTooLong = true;
        }
        lineLen += rem;
      }
      readSoFar += buf.length;
    }
  } catch (error) {
    // The log can disappear between stat() and open() when nginx rotates it;
    // treat that like a missing file rather than failing the metering run.
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { bytesDelta: 0, offset: BigInt(0), inode: null };
    }
    throw error;
  }

  return { bytesDelta, offset: start + BigInt(consumed), inode };
}

interface MeterOutcome {
  diskUsedGB: number;
  bandwidthUsedGB: number;
  alertsSent: number;
  suspended: boolean;
  reactivated: boolean;
}

async function safeNotifyQuotaAlert(accountId: string, resource: 'disk' | 'bandwidth', percent: 80 | 100): Promise<boolean> {
  try {
    await notifyQuotaAlert(accountId, resource, percent);
    return true;
  } catch (error) {
    logger.error('quota alert notification failed', { accountId, resource, percent, error: errorMessage(error) });
    return false;
  }
}

/**
 * Fires each crossed-but-unalerted threshold in ascending order ("once per
 * level per resource": 80 then 100) and returns the new stored alert level.
 * Drops back to 0 whenever usage falls below the WARNING band so alerts
 * re-arm. A failed notification does not advance the stored level, so it is
 * retried on the next run.
 */
async function applyQuotaAlerts(
  accountId: string,
  resource: 'disk' | 'bandwidth',
  level: UsageLevel,
  storedLevel: number,
): Promise<{ newLevel: number; sent: number }> {
  if (level === 'OK') {
    return { newLevel: 0, sent: 0 };
  }
  const target = level === 'WARNING' ? 80 : 100;
  let newLevel = storedLevel;
  let sent = 0;
  for (const threshold of ALERT_THRESHOLDS) {
    if (threshold > target || newLevel >= threshold) {
      continue;
    }
    if (!(await safeNotifyQuotaAlert(accountId, resource, threshold))) {
      break;
    }
    newLevel = threshold;
    sent += 1;
  }
  return { newLevel, sent };
}

async function measureAccountInternal(accountId: string): Promise<MeterOutcome> {
  const account = await prisma.hostingAccount.findUnique({ where: { id: accountId } });
  if (!account) {
    throw httpError(404, 'Hosting account not found');
  }

  const config = getHostingConfig();
  const now = new Date();
  const monthStart = utcMonthStart(now);

  const documentRoot = account.documentRoot ?? accountDocumentRoot(config.wwwBase, account.id);
  const diskBytes = await getDirectorySizeBytes(documentRoot);
  const diskUsedGB = round4(diskBytes / BYTES_PER_GB);

  const logPath = path.join(config.nginx.logDir, `${account.id}.access.log`);
  const delta = await readLogDelta(logPath, account.bandwidthLogOffset, account.bandwidthLogInode);
  const deltaGB = delta.bytesDelta / BYTES_PER_GB;

  // P8: the bandwidth cycle is the UTC calendar month. A new cycle zeroes the
  // counter and re-arms quota alerts.
  const newCycle = account.bandwidthCycleStart === null || account.bandwidthCycleStart < monthStart;

  const updated = await prisma.hostingAccount.update({
    where: { id: account.id },
    data: {
      diskUsed: diskUsedGB,
      bandwidthUsed: newCycle ? deltaGB : { increment: deltaGB },
      bandwidthLogOffset: delta.offset,
      bandwidthLogInode: delta.inode,
      usageUpdatedAt: now,
      ...(newCycle
        ? { bandwidthCycleStart: monthStart, diskAlertLevel: 0, bandwidthAlertLevel: 0 }
        : {}),
    },
  });

  let reactivated = false;
  if (newCycle && updated.status === 'SUSPENDED' && updated.suspendReason === 'BANDWIDTH_EXCEEDED') {
    await activateAccount(account.id);
    reactivated = true;
  }

  const diskLevel = usageLevel(updated.diskUsed, updated.diskQuota);
  const bandwidthLevel = usageLevel(updated.bandwidthUsed, updated.bandwidthQuota);

  const diskAlerts = await applyQuotaAlerts(account.id, 'disk', diskLevel, updated.diskAlertLevel);
  const bandwidthAlerts = await applyQuotaAlerts(account.id, 'bandwidth', bandwidthLevel, updated.bandwidthAlertLevel);

  if (diskAlerts.newLevel !== updated.diskAlertLevel || bandwidthAlerts.newLevel !== updated.bandwidthAlertLevel) {
    await prisma.hostingAccount.update({
      where: { id: account.id },
      data: { diskAlertLevel: diskAlerts.newLevel, bandwidthAlertLevel: bandwidthAlerts.newLevel },
    });
  }

  // Bandwidth overage suspends the account; disk overage only alerts (the
  // file manager and FTP quota enforce writes, per P8/P9).
  let suspended = false;
  const effectiveStatus = reactivated ? 'ACTIVE' : updated.status;
  if (bandwidthLevel === 'EXCEEDED' && effectiveStatus === 'ACTIVE') {
    await suspendAccount(account.id, 'BANDWIDTH_EXCEEDED');
    suspended = true;
  }

  return {
    diskUsedGB: updated.diskUsed,
    bandwidthUsedGB: updated.bandwidthUsed,
    alertsSent: diskAlerts.sent + bandwidthAlerts.sent,
    suspended,
    reactivated,
  };
}

export async function measureAccount(accountId: string): Promise<{ diskUsedGB: number; bandwidthUsedGB: number }> {
  const { diskUsedGB, bandwidthUsedGB } = await measureAccountInternal(accountId);
  return { diskUsedGB, bandwidthUsedGB };
}

export async function getUsageForAccount(accountId: string): Promise<HostingUsageDTO> {
  const account = await prisma.hostingAccount.findUnique({ where: { id: accountId } });
  if (!account) {
    throw httpError(404, 'Hosting account not found');
  }

  const snapshots = await prisma.hostingUsageSnapshot.findMany({
    where: { accountId },
    orderBy: { date: 'desc' },
    take: SNAPSHOT_HISTORY_DAYS,
  });

  return {
    ...toUsageSummary(account),
    history: snapshots
      .map((s) => ({ date: s.date.toISOString(), diskUsedGB: s.diskUsedGB, bandwidthUsedGB: s.bandwidthUsedGB }))
      .reverse(),
  };
}

/**
 * One metering pass over every ACTIVE account plus accounts SUSPENDED for
 * BANDWIDTH_EXCEEDED (so a cycle rollover can reactivate them). Accounts are
 * paged 50 at a time and measured sequentially; a failing account is logged
 * and skipped without aborting the cycle. Once per UTC day each measured
 * account gets a HostingUsageSnapshot row (upsert keyed on [accountId, date]).
 */
export async function runMeteringCycle(): Promise<{ accounts: number; suspended: number; alerts: number }> {
  const today = utcMidnight(new Date());
  let accounts = 0;
  let suspended = 0;
  let alerts = 0;
  let cursor: string | undefined;

  for (;;) {
    const page: Array<{ id: string }> = await prisma.hostingAccount.findMany({
      where: {
        OR: [
          { status: 'ACTIVE' },
          { status: 'SUSPENDED', suspendReason: 'BANDWIDTH_EXCEEDED' },
        ],
      },
      orderBy: { id: 'asc' },
      take: METER_PAGE_SIZE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: { id: true },
    });

    if (page.length === 0) {
      break;
    }

    for (const row of page) {
      try {
        const outcome = await measureAccountInternal(row.id);
        await prisma.hostingUsageSnapshot.upsert({
          where: { accountId_date: { accountId: row.id, date: today } },
          create: {
            accountId: row.id,
            date: today,
            diskUsedGB: outcome.diskUsedGB,
            bandwidthUsedGB: outcome.bandwidthUsedGB,
          },
          update: { diskUsedGB: outcome.diskUsedGB, bandwidthUsedGB: outcome.bandwidthUsedGB },
        });
        accounts += 1;
        suspended += outcome.suspended ? 1 : 0;
        alerts += outcome.alertsSent;
      } catch (error) {
        logger.error('hosting metering failed for account', { accountId: row.id, error: errorMessage(error) });
      }
    }

    if (page.length < METER_PAGE_SIZE) {
      break;
    }
    cursor = page[page.length - 1].id;
  }

  return { accounts, suspended, alerts };
}

export default { getUsageForAccount, measureAccount, runMeteringCycle };
