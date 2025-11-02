const BillingService = require('../services/billingService');
const logger = require('../utils/logger');

/**
 * Invoice Generator Job
 * Automatically generates monthly invoices for all users
 */
class InvoiceGenerator {
  constructor() {
    this.isRunning = false;
    this.lastRun = null;
  }

  /**
   * Generate monthly invoices for all users
   * Should be run on the 1st of each month
   */
  async generateMonthlyInvoices() {
    if (this.isRunning) {
      logger.warn('Invoice generation is already running');
      return;
    }

    this.isRunning = true;
    logger.info('Starting monthly invoice generation');

    try {
      const startTime = Date.now();

      // Generate invoices for previous month
      const now = new Date();
      const previousMonth = now.getMonth() - 1;
      const year = previousMonth < 0 ? now.getFullYear() - 1 : now.getFullYear();
      const month = previousMonth < 0 ? 11 : previousMonth;

      const results = await BillingService.generateAllMonthlyInvoices({
        month,
        year,
      });

      const duration = Date.now() - startTime;
      this.lastRun = new Date();

      logger.info('Monthly invoice generation completed', {
        duration: `${duration}ms`,
        total: results.total,
        success: results.success,
        failed: results.failed,
        skipped: results.skipped,
        month: month + 1,
        year,
      });

      if (results.failed > 0) {
        logger.error('Some invoices failed to generate', {
          failed: results.failed,
          errors: results.errors,
        });
      }

      if (results.success > 0) {
        logger.info('Generated invoices', {
          invoices: results.invoices.map((inv) => ({
            user: inv.userEmail,
            invoice: inv.invoiceNumber,
            total: `$${inv.total}`,
          })),
        });
      }

      return results;
    } catch (error) {
      logger.error('Monthly invoice generation failed', {
        error: error.message,
        stack: error.stack,
      });
      throw error;
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Check and mark overdue invoices
   * Should be run daily
   */
  async checkOverdueInvoices() {
    try {
      logger.info('Checking for overdue invoices');

      const results = await BillingService.markOverdueInvoices();

      if (results.updated > 0) {
        logger.warn('Marked invoices as overdue', {
          count: results.updated,
          timestamp: results.timestamp,
        });
      } else {
        logger.info('No overdue invoices found');
      }

      return results;
    } catch (error) {
      logger.error('Failed to check overdue invoices', {
        error: error.message,
        stack: error.stack,
      });
      throw error;
    }
  }

  /**
   * Get generator status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      lastRun: this.lastRun,
    };
  }

  /**
   * Schedule monthly invoice generation
   * Uses cron-like scheduling
   */
  scheduleMonthlyGeneration() {
    // Run on the 1st of each month at 00:00
    const now = new Date();
    const nextRun = new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0);
    const delay = nextRun.getTime() - now.getTime();

    logger.info('Scheduling next monthly invoice generation', {
      nextRun: nextRun.toISOString(),
      delayMs: delay,
    });

    setTimeout(async () => {
      await this.generateMonthlyInvoices();
      // Schedule next run
      this.scheduleMonthlyGeneration();
    }, delay);
  }

  /**
   * Schedule daily overdue check
   */
  scheduleDailyOverdueCheck() {
    // Run daily at 00:00
    const now = new Date();
    const nextRun = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0);
    const delay = nextRun.getTime() - now.getTime();

    logger.info('Scheduling next overdue check', {
      nextRun: nextRun.toISOString(),
      delayMs: delay,
    });

    setTimeout(async () => {
      await this.checkOverdueInvoices();
      // Schedule next run
      this.scheduleDailyOverdueCheck();
    }, delay);
  }

  /**
   * Start all scheduled jobs
   */
  start() {
    logger.info('Starting invoice generator jobs');

    // Schedule monthly generation
    this.scheduleMonthlyGeneration();

    // Schedule daily overdue check
    this.scheduleDailyOverdueCheck();

    // Run overdue check immediately on startup
    this.checkOverdueInvoices();
  }
}

// Create singleton instance
const invoiceGenerator = new InvoiceGenerator();

module.exports = invoiceGenerator;
