const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const logger = require('../utils/logger');

/**
 * Error Tracking Service
 * Tracks and reports application errors
 */
class ErrorTrackingService {
  constructor() {
    this.errorCounts = new Map();
    this.errorThreshold = parseInt(process.env.ERROR_THRESHOLD) || 10;
    this.timeWindow = parseInt(process.env.ERROR_TIME_WINDOW) || 60000; // 1 minute
  }

  /**
   * Track an error
   * @param {Error} error - Error object
   * @param {Object} context - Error context
   * @returns {Promise<Object>} Tracked error
   */
  async trackError(error, context = {}) {
    try {
      const errorData = {
        name: error.name,
        message: error.message,
        stack: error.stack,
        statusCode: error.statusCode || 500,
        errorCode: error.errorCode || 'UNKNOWN_ERROR',
        context: JSON.stringify(context),
        timestamp: new Date(),
      };

      // Store in database (if ErrorLog model exists)
      // const errorLog = await prisma.errorLog.create({ data: errorData });

      // Track in memory for rate limiting
      this.incrementErrorCount(error.name);

      // Check if error rate is too high
      if (this.isErrorRateTooHigh(error.name)) {
        logger.warn(`High error rate detected for ${error.name}`);
        await this.notifyHighErrorRate(error.name);
      }

      logger.error('Error tracked', errorData);

      return errorData;
    } catch (err) {
      logger.error('Failed to track error:', err);
      return null;
    }
  }

  /**
   * Increment error count
   * @param {string} errorName - Error name
   */
  incrementErrorCount(errorName) {
    const now = Date.now();
    
    if (!this.errorCounts.has(errorName)) {
      this.errorCounts.set(errorName, []);
    }

    const counts = this.errorCounts.get(errorName);
    counts.push(now);

    // Remove old entries outside time window
    const filtered = counts.filter(timestamp => now - timestamp < this.timeWindow);
    this.errorCounts.set(errorName, filtered);
  }

  /**
   * Check if error rate is too high
   * @param {string} errorName - Error name
   * @returns {boolean} Is rate too high
   */
  isErrorRateTooHigh(errorName) {
    const counts = this.errorCounts.get(errorName) || [];
    return counts.length >= this.errorThreshold;
  }

  /**
   * Notify about high error rate
   * @param {string} errorName - Error name
   */
  async notifyHighErrorRate(errorName) {
    try {
      // Send notification to admins
      logger.warn(`High error rate notification: ${errorName}`);
      
      // You can integrate with email service or other notification systems here
      // await emailService.sendAlert(...)
    } catch (error) {
      logger.error('Failed to send high error rate notification:', error);
    }
  }

  /**
   * Get error statistics
   * @param {Object} options - Query options
   * @returns {Promise<Object>} Error statistics
   */
  async getErrorStats(options = {}) {
    const { startDate, endDate, errorName, limit = 100 } = options;

    try {
      // This would query from database if ErrorLog model exists
      // const errors = await prisma.errorLog.findMany({...});

      // For now, return in-memory stats
      const stats = {
        totalErrors: 0,
        errorsByType: {},
        recentErrors: [],
      };

      for (const [name, counts] of this.errorCounts.entries()) {
        stats.totalErrors += counts.length;
        stats.errorsByType[name] = counts.length;
      }

      return stats;
    } catch (error) {
      logger.error('Failed to get error stats:', error);
      return {
        totalErrors: 0,
        errorsByType: {},
        error: error.message,
      };
    }
  }

  /**
   * Get error trends
   * @param {string} period - Time period (hour, day, week)
   * @returns {Promise<Object>} Error trends
   */
  async getErrorTrends(period = 'day') {
    try {
      const trends = {
        period,
        data: [],
        summary: {
          total: 0,
          average: 0,
          peak: 0,
        },
      };

      // Calculate trends from in-memory data
      for (const [name, counts] of this.errorCounts.entries()) {
        trends.data.push({
          errorName: name,
          count: counts.length,
        });
        trends.summary.total += counts.length;
      }

      if (trends.data.length > 0) {
        trends.summary.average = trends.summary.total / trends.data.length;
        trends.summary.peak = Math.max(...trends.data.map(d => d.count));
      }

      return trends;
    } catch (error) {
      logger.error('Failed to get error trends:', error);
      return {
        period,
        data: [],
        error: error.message,
      };
    }
  }

  /**
   * Clear error counts
   */
  clearErrorCounts() {
    this.errorCounts.clear();
    logger.info('Error counts cleared');
  }

  /**
   * Get most common errors
   * @param {number} limit - Number of errors to return
   * @returns {Array} Most common errors
   */
  getMostCommonErrors(limit = 10) {
    const errors = Array.from(this.errorCounts.entries())
      .map(([name, counts]) => ({
        errorName: name,
        count: counts.length,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);

    return errors;
  }

  /**
   * Check system health based on error rates
   * @returns {Object} Health status
   */
  getHealthStatus() {
    const totalErrors = Array.from(this.errorCounts.values())
      .reduce((sum, counts) => sum + counts.length, 0);

    let status = 'healthy';
    const issues = [];

    if (totalErrors > this.errorThreshold * 5) {
      status = 'critical';
      issues.push(`Very high error rate: ${totalErrors} errors in last ${this.timeWindow / 1000}s`);
    } else if (totalErrors > this.errorThreshold * 2) {
      status = 'warning';
      issues.push(`High error rate: ${totalErrors} errors in last ${this.timeWindow / 1000}s`);
    }

    return {
      status,
      totalErrors,
      threshold: this.errorThreshold,
      timeWindow: this.timeWindow,
      issues,
      timestamp: new Date().toISOString(),
    };
  }
}

module.exports = new ErrorTrackingService();
