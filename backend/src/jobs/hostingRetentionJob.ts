import fs from 'fs/promises';
import path from 'path';
import { schedule, validate, type ScheduledTask } from 'node-cron';
import { prisma } from '../config/database';
import { getHostingConfig } from '../config/hosting';
import logger from '../utils/logger';
import * as mysqlProvisionService from '../services/mysqlProvisionService';
import { terminateAccountById } from '../services/hostingLifecycleService';

const DAY_MS = 24 * 60 * 60 * 1000;

const errMessage = (error: unknown): string =>
  (error instanceof Error ? error.message : String(error));

interface RetentionResult {
  purged: number;
  terminated: number;
  errors: number;
  skipped: boolean;
}

const jobState = { task: null as ScheduledTask | null, running: false };

/**
 * Remove the trash directories a terminated account left behind:
 * `${trashDir}/<accountId>-<unixTs>`. Missing trash dir is fine.
 */
const removeAccountTrash = async (trashDir: string, accountId: string): Promise<void> => {
  let entries: string[];
  try {
    entries = await fs.readdir(trashDir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return;
    }
    throw error;
  }

  for (const entry of entries) {
    if (!entry.startsWith(`${accountId}-`)) {
      continue;
    }
    await fs.rm(path.join(trashDir, entry), { recursive: true, force: true });
  }
};

/**
 * Final purge of a TERMINATED account: drop its databases and MySQL user
 * (the DB stays locked from termination day until now), delete the retained
 * trash directory, then record purgedAt so it never runs twice.
 */
const purgeAccount = async (accountId: string, trashDir: string): Promise<void> => {
  const databases = await prisma.hostingDatabase.findMany({ where: { accountId } });
  const account = await prisma.hostingAccount.findUnique({ where: { id: accountId } });
  if (!account) {
    return;
  }

  if (mysqlProvisionService.isMysqlEnabled()) {
    for (const db of databases) {
      await mysqlProvisionService.dropDatabase(db.name);
    }
    if (account.dbUser) {
      await mysqlProvisionService.dropAccountUser(account.dbUser);
    }
  } else if (databases.length > 0 || account.dbUser) {
    logger.warn('MySQL disabled — purging trash only; DB resources may linger', {
      accountId,
      databases: databases.length,
    });
  }

  await removeAccountTrash(trashDir, accountId);
  await prisma.hostingAccount.update({ where: { id: accountId }, data: { purgedAt: new Date() } });
};

/**
 * One retention sweep (contract P5):
 *  a) purge TERMINATED accounts past retentionDays (drop databases + MySQL
 *     user, delete trash dirs, set purgedAt);
 *  b) terminate accounts suspended for SUBSCRIPTION_CANCELED|PAYMENT_FAILED
 *     longer than suspendedRetentionDays.
 * Per-account errors are isolated so one bad row never blocks the sweep.
 */
const runRetention = async (): Promise<RetentionResult> => {
  if (jobState.running) {
    logger.warn('Retention run skipped — previous run still in flight');
    return { purged: 0, terminated: 0, errors: 0, skipped: true };
  }
  jobState.running = true;

  const result: RetentionResult = { purged: 0, terminated: 0, errors: 0, skipped: false };

  try {
    const cfg = getHostingConfig();

    const purgeCutoff = new Date(Date.now() - cfg.retentionDays * DAY_MS);
    const toPurge = await prisma.hostingAccount.findMany({
      where: {
        status: 'TERMINATED',
        purgedAt: null,
        terminatedAt: { not: null, lt: purgeCutoff },
      },
      select: { id: true },
    });

    for (const row of toPurge) {
      try {
        await purgeAccount(row.id, cfg.trashDir);
        result.purged += 1;
      } catch (error) {
        result.errors += 1;
        logger.error('Retention purge failed for account', {
          accountId: row.id,
          message: errMessage(error),
        });
      }
    }

    const suspendCutoff = new Date(Date.now() - cfg.suspendedRetentionDays * DAY_MS);
    const toTerminate = await prisma.hostingAccount.findMany({
      where: {
        status: 'SUSPENDED',
        suspendReason: { in: ['SUBSCRIPTION_CANCELED', 'PAYMENT_FAILED'] },
        suspendedAt: { not: null, lt: suspendCutoff },
      },
      select: { id: true },
    });

    for (const row of toTerminate) {
      try {
        await terminateAccountById(row.id, { reason: 'RETENTION_EXPIRED' });
        result.terminated += 1;
      } catch (error) {
        result.errors += 1;
        logger.error('Retention termination failed for account', {
          accountId: row.id,
          message: errMessage(error),
        });
      }
    }

    logger.info('Hosting retention run complete', {
      purged: result.purged,
      terminated: result.terminated,
      errors: result.errors,
    });
    return result;
  } finally {
    jobState.running = false;
  }
};

const job = {
  start(): void {
    if (jobState.task) {
      return;
    }
    const scheduleExpr = getHostingConfig().cron.retention;
    if (!validate(scheduleExpr)) {
      logger.error('hostingRetentionJob not started — invalid cron expression', { scheduleExpr });
      return;
    }
    jobState.task = schedule(scheduleExpr, () => {
      void runRetention();
    });
    logger.debug('hostingRetentionJob started', { schedule: scheduleExpr });
  },

  stop(): void {
    if (jobState.task) {
      jobState.task.stop();
      jobState.task = null;
      logger.debug('hostingRetentionJob stopped');
    }
  },

  runRetention,
};

export = job;
