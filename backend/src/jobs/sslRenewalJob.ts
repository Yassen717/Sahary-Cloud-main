// Implemented by WP05 — see CONTRACT.md section 8
import logger from '../utils/logger';
import { getHostingConfig } from '../config/hosting';

const job = {
  start(): void {
    logger.debug('sslRenewalJob stub started', { schedule: getHostingConfig().cron.ssl });
  },
  stop(): void {
    logger.debug('sslRenewalJob stub stopped');
  },
};

export = job;
