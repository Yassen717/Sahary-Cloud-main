import logger from '../../src/utils/logger';

const mockSchedule = jest.fn();
const mockRunMeteringCycle = jest.fn();

jest.mock('node-cron', () => ({
  schedule: (...args: unknown[]) => mockSchedule(...args),
}));

jest.mock('../../src/services/hostingUsageService', () => ({
  runMeteringCycle: (...args: unknown[]) => mockRunMeteringCycle(...args),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const job = require('../../src/jobs/hostingMeterJob') as {
  start(): void;
  stop(): void;
  runNow(): Promise<void>;
};

const savedCron = process.env.HOSTING_METER_CRON;

afterEach(() => {
  job.stop();
  if (savedCron === undefined) delete process.env.HOSTING_METER_CRON;
  else process.env.HOSTING_METER_CRON = savedCron;
});

describe('hostingMeterJob', () => {
  test('start() schedules a task on the configured cron expression once', () => {
    process.env.HOSTING_METER_CRON = '17 */3 * * *';
    const task = { stop: jest.fn() };
    mockSchedule.mockReturnValue(task);

    job.start();
    job.start(); // idempotent — no second task

    expect(mockSchedule).toHaveBeenCalledTimes(1);
    expect(mockSchedule.mock.calls[0][0]).toBe('17 */3 * * *');
    expect(typeof mockSchedule.mock.calls[0][1]).toBe('function');
  });

  test('the cron callback runs a metering cycle', async () => {
    const task = { stop: jest.fn() };
    mockSchedule.mockReturnValue(task);
    mockRunMeteringCycle.mockResolvedValue({ accounts: 3, suspended: 1, alerts: 2 });
    job.start();

    const tick = mockSchedule.mock.calls[0][1] as () => void;
    tick();
    await new Promise((resolve) => {
      setImmediate(resolve);
    });

    expect(mockRunMeteringCycle).toHaveBeenCalledTimes(1);
  });

  test('never overlaps — a tick during an active run is skipped', async () => {
    let resolveRun: (v: { accounts: number; suspended: number; alerts: number }) => void = () => {};
    mockRunMeteringCycle.mockImplementation(
      () => new Promise<{ accounts: number; suspended: number; alerts: number }>((resolve) => {
        resolveRun = resolve;
      }),
    );

    const first = job.runNow();
    const second = job.runNow(); // active run -> skipped, resolves immediately
    await second;
    expect(mockRunMeteringCycle).toHaveBeenCalledTimes(1);

    resolveRun({ accounts: 0, suspended: 0, alerts: 0 });
    await first;

    mockRunMeteringCycle.mockResolvedValue({ accounts: 1, suspended: 0, alerts: 0 });
    await job.runNow();
    expect(mockRunMeteringCycle).toHaveBeenCalledTimes(2);
  });

  test('a failing cycle is logged, not thrown', async () => {
    const errorSpy = jest.spyOn(logger, 'error').mockImplementation(() => logger);
    mockRunMeteringCycle.mockRejectedValue(new Error('db down'));

    await expect(job.runNow()).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalledWith(
      'hostingMeterJob: metering cycle failed',
      expect.objectContaining({ error: 'db down' }),
    );
  });

  test('stop() stops the scheduled task and is safe to call twice', () => {
    const task = { stop: jest.fn() };
    mockSchedule.mockReturnValue(task);

    job.start();
    job.stop();
    job.stop();

    expect(task.stop).toHaveBeenCalledTimes(1);
  });
});
