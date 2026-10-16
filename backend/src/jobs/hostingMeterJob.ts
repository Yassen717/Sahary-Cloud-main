// Implemented by WP06 — see CONTRACT.md section 8
import logger from '../utils/logger';
import { getHostingConfig } from '../config/hosting';

const job = {
  start(): void {
    logger.debug('hostingMeterJob stub started', { schedule: getHostingConfig().cron.meter });
  },
  stop(): void {
    logger.debug('hostingMeterJob stub stopped');
  },
};

export = job;
