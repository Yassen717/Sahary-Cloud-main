import { schedule } from 'node-cron';
import type { ScheduledTask } from 'node-cron';
import logger from '../utils/logger';
import { getHostingConfig } from '../config/hosting';
import * as sslService from '../services/sslService';

const DAILY_RENEWAL_SCHEDULE = '15 3 * * *';

let issueTask: ScheduledTask | null = null;
let renewTask: ScheduledTask | null = null;
// One flag gates BOTH schedules — the two runs must never overlap each other
// or a previous run of themselves (noOverlap covers only same-task overlap).
let running = false;

const runExclusive = async (label: string, fn: () => Promise<unknown>): Promise<void> => {
  if (running) {
    logger.debug('sslRenewalJob: run skipped — a previous run is still in progress', { label });
    return;
  }
  running = true;
  try {
    await fn();
  } catch (error) {
    logger.error('sslRenewalJob: run failed', {
      label,
      message: error instanceof Error ? error.message : String(error),
    });
  } finally {
    running = false;
  }
};

const job = {
  start(): void {
    if (issueTask || renewTask) {
      return;
    }
    const issueSchedule = getHostingConfig().cron.ssl;

    issueTask = schedule(
      issueSchedule,
      () => runExclusive('issuePendingCertificates', () => sslService.issuePendingCertificates()),
      { noOverlap: true },
    );

    renewTask = schedule(
      DAILY_RENEWAL_SCHEDULE,
      () => runExclusive('renewExpiringCertificates', async () => {
        await sslService.renewExpiringCertificates();
        await sslService.syncPrimarySslState();
      }),
      { noOverlap: true },
    );

    logger.info('sslRenewalJob started', {
      issueSchedule,
      renewalSchedule: DAILY_RENEWAL_SCHEDULE,
    });
  },
  stop(): void {
    for (const task of [issueTask, renewTask]) {
      if (task) {
        void task.stop();
      }
    }
    issueTask = null;
    renewTask = null;
  },
};

export = job;
