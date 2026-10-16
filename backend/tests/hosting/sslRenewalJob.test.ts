import type { TaskContext } from 'node-cron';

const captured: Array<{ expr: string; fn: (ctx: TaskContext) => unknown; task: { stop: jest.Mock } }> = [];

// resetMocks:true wipes factory-provided implementations, so the schedule impl
// is re-attached in beforeEach rather than inside this factory.
jest.mock('node-cron', () => ({
  schedule: jest.fn(),
}));

jest.mock('../../src/services/sslService', () => ({
  issuePendingCertificates: jest.fn(async () => ({ attempted: 0, issued: 0, failed: 0 })),
  renewExpiringCertificates: jest.fn(async () => ({ checked: 0, renewed: 0, failed: 0 })),
  syncPrimarySslState: jest.fn(async () => ({ updated: 0 })),
}));

import job from '../../src/jobs/sslRenewalJob';
import * as sslService from '../../src/services/sslService';
import { schedule } from 'node-cron';

const ctx = {} as TaskContext;

describe('sslRenewalJob', () => {
  beforeEach(() => {
    captured.length = 0;
    jest.clearAllMocks();
    job.stop();
    (schedule as unknown as jest.Mock).mockImplementation(
      (expr: string, fn: (ctx: TaskContext) => unknown) => {
        const task = { stop: jest.fn() };
        captured.push({ expr, fn, task });
        return task;
      },
    );
  });

  afterEach(() => {
    job.stop();
  });

  test('start schedules issue run on HOSTING_SSL_CRON and daily renewal at 15 3 * * *', () => {
    process.env.HOSTING_SSL_CRON = '*/10 * * * *';
    job.start();
    expect(schedule).toHaveBeenCalledTimes(2);
    expect(captured[0].expr).toBe('*/10 * * * *');
    expect(captured[1].expr).toBe('15 3 * * *');
    // start is idempotent
    job.start();
    expect(schedule).toHaveBeenCalledTimes(2);
  });

  test('stop stops both scheduled tasks', () => {
    job.start();
    job.stop();
    expect(captured[0].task.stop).toHaveBeenCalled();
    expect(captured[1].task.stop).toHaveBeenCalled();
  });

  test('issue schedule runs issuePendingCertificates', async () => {
    job.start();
    await captured[0].fn(ctx);
    expect(sslService.issuePendingCertificates).toHaveBeenCalledTimes(1);
    expect(sslService.renewExpiringCertificates).not.toHaveBeenCalled();
  });

  test('daily schedule runs renewal then primary-ssl sync', async () => {
    job.start();
    await captured[1].fn(ctx);
    expect(sslService.renewExpiringCertificates).toHaveBeenCalledTimes(1);
    expect(sslService.syncPrimarySslState).toHaveBeenCalledTimes(1);
  });

  test('runs never overlap — second invocation while busy is skipped', async () => {
    const resolvers: Array<() => void> = [];
    (sslService.issuePendingCertificates as jest.Mock).mockImplementation(
      () => new Promise<void>((resolve) => {
        resolvers.push(() => resolve());
      }),
    );
    job.start();

    const first = captured[0].fn(ctx) as Promise<void>;
    // Both schedules share one gate — an overlapping call on EITHER task skips.
    const second = captured[0].fn(ctx) as Promise<void>;
    const third = captured[1].fn(ctx) as Promise<void>;
    await Promise.all([second, third]);

    expect(sslService.issuePendingCertificates).toHaveBeenCalledTimes(1);
    expect(sslService.renewExpiringCertificates).not.toHaveBeenCalled();

    resolvers.shift()!();
    await first;

    // After the run finishes the next scheduled execution proceeds normally.
    const after = captured[0].fn(ctx) as Promise<void>;
    resolvers.shift()!();
    await after;
    expect(sslService.issuePendingCertificates).toHaveBeenCalledTimes(2);
  });

  test('a failing run is logged and does not wedge the gate', async () => {
    (sslService.issuePendingCertificates as jest.Mock).mockRejectedValueOnce(new Error('db down'));
    job.start();
    await captured[0].fn(ctx); // swallowed + logged, not thrown
    await captured[0].fn(ctx);
    expect(sslService.issuePendingCertificates).toHaveBeenCalledTimes(2);
  });
});
