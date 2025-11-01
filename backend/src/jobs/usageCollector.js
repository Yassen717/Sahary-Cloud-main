const BillingService = require('../services/billingService');
const logger = require('../utils/logger');

/**
 * Usage Collector Job
 * Periodically collects usage data from running VMs
 */
class UsageCollector {
  constructor() {
    this.intervalId = null;
    this.isRunning = false;
    this.collectionInterval = parseInt(process.env.USAGE_COLLECTION_INTERVAL) || 5 * 60 * 1000; // 5 minutes default
  }

  /**
   * Start the usage collection job
   */
  start() {
    if (this.isRunning) {
      logger.warn('Usage collector is already running');
      return;
    }

    logger.info(`Starting usage collector with ${this.collectionInterval / 1000}s interval`);

    // Run immediately on start
    this.collect();

    // Then run periodically
    this.intervalId = setInterval(() => {
      this.collect();
    }, this.collectionInterval);

    this.isRunning = true;
  }

  /**
   * Stop the usage collection job
   */
  stop() {
    if (!this.isRunning) {
      logger.warn('Usage collector is not running');
      return;
    }

    logger.info('Stopping usage collector');

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    this.isRunning = false;
  }

  /**
   * Collect usage data from all running VMs
   */
  async collect() {
    try {
      logger.info('Starting usage collection cycle');

      const startTime = Date.now();
      const results = await BillingService.collectAllRunningVMsUsage();
      const duration = Date.now() - startTime;

      logger.info('Usage collection completed', {
        duration: `${duration}ms`,
        total: results.total,
        success: results.success,
        failed: results.failed,
      });

      if (results.failed > 0) {
        logger.warn('Some VMs failed during usage collection', {
          failed: results.failed,
          errors: results.errors,
        });
      }

      return results;
    } catch (error) {
      logger.error('Usage collection failed', {
        error: error.message,
        stack: error.stack,
      });
    }
  }

  /**
   * Get collector status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      collectionInterval: this.collectionInterval,
      intervalInMinutes: this.collectionInterval / (60 * 1000),
    };
  }

  /**
   * Update collection interval
   * @param {number} intervalMs - New interval in milliseconds
   */
  updateInterval(intervalMs) {
    if (intervalMs < 60000) {
      throw new Error('Collection interval must be at least 1 minute');
    }

    this.collectionInterval = intervalMs;

    if (this.isRunning) {
      this.stop();
      this.start();
    }

    logger.info(`Usage collection interval updated to ${intervalMs / 1000}s`);
  }
}

// Create singleton instance
const usageCollector = new UsageCollector();

module.exports = usageCollector;
