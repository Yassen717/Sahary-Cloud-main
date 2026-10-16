// Implemented by WP02 — see CONTRACT.md section 8
import logger from '../utils/logger';
import { getHostingConfig } from '../config/hosting';

const job = {
  start(): void {
    logger.debug('hostingRetentionJob stub started', { schedule: getHostingConfig().cron.retention });
  },
  stop(): void {
    logger.debug('hostingRetentionJob stub stopped');
  },
};

export = job;
