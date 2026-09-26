// @ts-nocheck
const cron = require('node-cron');
const BillingService = require('../services/billingService').default;
const { prisma } = require('../config/database');
const logger = require('../utils/logger').default;

/**
 * Invoice Generator Job
 * Automatically generates monthly invoices for all users
 */
class InvoiceGenerator {
  constructor() {
    this.isRunning = false;
    this.isGenerating = false;
    this.lastRun = null;
    this.monthlyTask = null;
    this.overdueTask = null;
    // Generate invoices on the 1st of each month at 00:00
    this.monthlySchedule = process.env.INVOICE_GENERATION_SCHEDULE || '0 0 1 * *';
    // Check for overdue invoices daily at 00:00
    this.overdueSchedule = process.env.OVERDUE_CHECK_SCHEDULE || '0 0 * * *';
  }

  /**
   * Generate monthly invoices for all users
   * Should be run on the 1st of each month
   */
  async generateMonthlyInvoices() {
    if (this.isGenerating) {
      logger.warn('Invoice generation is already running');
      return;
    }

    this.isGenerating = true;
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
          success: results.success,
          month: month + 1,
          year,
        });
      }

      return results;
    } catch (error) {
      logger.error('Monthly invoice generation failed', {
        error: error.message,
        stack: error.stack,
      });
      // Do not rethrow: this runs inside a cron callback and must never
      // reject, otherwise the schedule dies and an unhandled rejection occurs
    } finally {
      this.isGenerating = false;
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

      if (results.success > 0) {
        logger.warn('Marked invoices as overdue', {
          count: results.success,
          total: results.total,
        });
      } else {
        logger.info('No overdue invoices found');
      }

      if (results.failed > 0) {
        logger.error('Some invoices failed to be marked as overdue', {
          failed: results.failed,
          errors: results.errors,
        });
      }

      return results;
    } catch (error) {
      logger.error('Failed to check overdue invoices', {
        error: error.message,
        stack: error.stack,
      });
      // Do not rethrow: callers invoke this unawaited (startup, cron),
      // so a rethrow would produce an unhandled rejection
    }
  }

  /**
   * Get generator status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      isGenerating: this.isGenerating,
      lastRun: this.lastRun,
      monthlySchedule: this.monthlySchedule,
      overdueSchedule: this.overdueSchedule,
    };
  }

  /**
   * Schedule monthly invoice generation
   * Runs on the 1st of each month at 00:00
   */
  scheduleMonthlyGeneration() {
    this.monthlyTask = cron.schedule(this.monthlySchedule, async () => {
      try {
        await this.generateMonthlyInvoices();
      } catch (error) {
        logger.error('Monthly invoice generation job failed', {
          error: error.message,
          stack: error.stack,
        });
      }
    });

    logger.info('Monthly invoice generation scheduled', {
      schedule: this.monthlySchedule,
    });
  }

  /**
   * Schedule daily overdue check
   * Runs every day at 00:00
   */
  scheduleDailyOverdueCheck() {
    this.overdueTask = cron.schedule(this.overdueSchedule, async () => {
      try {
        await this.checkOverdueInvoices();
      } catch (error) {
        logger.error('Overdue invoice check job failed', {
          error: error.message,
          stack: error.stack,
        });
      }
    });

    logger.info('Daily overdue invoice check scheduled', {
      schedule: this.overdueSchedule,
    });
  }

  /**
   * Recover a missed monthly generation
   * If the process was down on the 1st, no invoices exist for the previous
   * month's billing period, so run generation once at startup
   */
  async recoverMissedGeneration() {
    try {
      // Generation targets the previous month's billing period
      const now = new Date();
      const previousMonth = now.getMonth() - 1;
      const year = previousMonth < 0 ? now.getFullYear() - 1 : now.getFullYear();
      const month = previousMonth < 0 ? 11 : previousMonth;
      const periodStart = new Date(year, month, 1);

      const existingInvoice = await prisma.invoice.findFirst({
        where: { billingPeriodStart: periodStart },
      });

      if (existingInvoice) {
        return;
      }

      logger.warn('No invoices found for the previous billing period, running missed monthly generation', {
        billingPeriodStart: periodStart.toISOString(),
      });

      await this.generateMonthlyInvoices();
    } catch (error) {
      logger.error('Failed to check for missed invoice generation', {
        error: error.message,
        stack: error.stack,
      });
    }
  }

  /**
   * Start all scheduled jobs
   */
  start() {
    if (this.isRunning) {
      logger.warn('Invoice generator jobs are already running');
      return;
    }

    logger.info('Starting invoice generator jobs');

    // Schedule monthly generation
    this.scheduleMonthlyGeneration();

    // Schedule daily overdue check
    this.scheduleDailyOverdueCheck();

    this.isRunning = true;

    // Run overdue check immediately on startup
    this.checkOverdueInvoices().catch((error) => {
      logger.error('Startup overdue invoice check failed', {
        error: error.message,
        stack: error.stack,
      });
    });

    // Recover generation missed while the process was down (e.g. on the 1st)
    this.recoverMissedGeneration().catch((error) => {
      logger.error('Missed invoice generation recovery failed', {
        error: error.message,
        stack: error.stack,
      });
    });
  }

  /**
   * Stop all scheduled jobs
   */
  stop() {
    if (!this.isRunning) {
      logger.warn('Invoice generator jobs are not running');
      return;
    }

    logger.info('Stopping invoice generator jobs');

    if (this.monthlyTask) {
      this.monthlyTask.stop();
      this.monthlyTask = null;
    }

    if (this.overdueTask) {
      this.overdueTask.stop();
      this.overdueTask = null;
    }

    this.isRunning = false;
  }
}

// Create singleton instance
const invoiceGenerator = new InvoiceGenerator();

module.exports = invoiceGenerator;
