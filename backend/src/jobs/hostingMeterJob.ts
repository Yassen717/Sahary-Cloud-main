// WP06 — hourly usage metering cron. See CONTRACT.md policy P8.
import { schedule, type ScheduledTask } from 'node-cron';
import { getHostingConfig } from '../config/hosting';
import { runMeteringCycle } from '../services/hostingUsageService';
import logger from '../utils/logger';

const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));

let task: ScheduledTask | null = null;
let runActive = false;

// Never overlapping: a tick arriving while a cycle is still running is
// skipped — metering is hourly and self-heals on the next tick.
async function tick(): Promise<void> {
  if (runActive) {
    logger.warn('hostingMeterJob: skipping tick, previous metering cycle still running');
    return;
  }
  runActive = true;
  try {
    const result = await runMeteringCycle();
    logger.info('hostingMeterJob: metering cycle completed', result);
  } catch (error) {
    logger.error('hostingMeterJob: metering cycle failed', { error: errorMessage(error) });
  } finally {
    runActive = false;
  }
}

const job = {
  start(): void {
    if (task) {
      return;
    }
    task = schedule(getHostingConfig().cron.meter, () => {
      void tick();
    }, { name: 'hosting-meter' });
  },
  stop(): void {
    const current = task;
    task = null;
    if (current) {
      void current.stop();
    }
  },
  // Manual trigger — also the seam tests use to drive ticks without a clock.
  runNow(): Promise<void> {
    return tick();
  },
};

export = job;
