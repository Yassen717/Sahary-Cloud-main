// Implemented by WP01 — see CONTRACT.md section 8
import logger from '../utils/logger';
import { getHostingConfig } from '../config/hosting';

const job = {
  start(): void {
    logger.debug('hostingReconcileJob stub started', { schedule: getHostingConfig().cron.reconcile });
  },
  stop(): void {
    logger.debug('hostingReconcileJob stub stopped');
  },
};

export = job;
