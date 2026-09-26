// @ts-nocheck
const os = require('os');
const { prisma } = require('../config/database');
const redisService = require('./redisService');
const logger = require('../utils/logger').default;

/**
 * Monitoring Service
 * Provides system health checks and performance monitoring
 */
class MonitoringService {
  constructor() {
    this.startTime = Date.now();
    this.metrics = {
      requests: {
        total: 0,
        success: 0,
        errors: 0,
      },
      performance: {
        avgResponseTime: 0,
        maxResponseTime: 0,
        minResponseTime: Infinity,
      },
    };
  }

  /**
   * Get system health status
   * @returns {Promise<Object>} Health status
   */
  async getHealthStatus() {
    const checks = await Promise.allSettled([
      this.checkDatabase(),
      this.checkRedis(),
      this.checkMemory(),
      this.checkCPU(),
      this.checkLoad(),
    ]);

    const results = checks.map((check, index) => {
      const names = ['database', 'redis', 'memory', 'cpu', 'load'];
      return {
        name: names[index],
        status: check.status === 'fulfilled' && check.value.healthy ? 'healthy' : 'unhealthy',
        ...check.value,
      };
    });

    const overallHealthy = results.every((r) => r.status === 'healthy');

    return {
      status: overallHealthy ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      uptime: this.getUptime(),
      checks: results,
    };
  }

  /**
   * Check database health
   * @returns {Promise<Object>} Database health
   */
  async checkDatabase() {
    try {
      const start = Date.now();
      await prisma.$queryRaw`SELECT 1`;
      const responseTime = Date.now() - start;

      return {
        healthy: true,
        responseTime: `${responseTime}ms`,
        message: 'Database connection is healthy',
      };
    } catch (error) {
      logger.error('Database health check failed:', error);
      return {
        healthy: false,
        error: error.message,
        message: 'Database connection failed',
      };
    }
  }

  /**
   * Check Redis health
   * @returns {Promise<Object>} Redis health
   */
  async checkRedis() {
    try {
      if (!redisService.isReady()) {
        return {
          healthy: false,
          message: 'Redis is not connected',
        };
      }

      const start = Date.now();
      await redisService.set('health:check', 'ok', 10);
      const value = await redisService.get('health:check');
      const responseTime = Date.now() - start;

      return {
        healthy: value === 'ok',
        responseTime: `${responseTime}ms`,
        message: 'Redis connection is healthy',
      };
    } catch (error) {
      logger.error('Redis health check failed:', error);
      return {
        healthy: false,
        error: error.message,
        message: 'Redis connection failed',
      };
    }
  }

  /**
   * Check memory usage
   * @returns {Object} Memory health
   */
  checkMemory() {
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const usedMemory = totalMemory - freeMemory;
    const usagePercentage = (usedMemory / totalMemory) * 100;

    const healthy = usagePercentage < 90;

    return {
      healthy,
      total: this.formatBytes(totalMemory),
      used: this.formatBytes(usedMemory),
      free: this.formatBytes(freeMemory),
      usagePercentage: parseFloat(usagePercentage.toFixed(2)),
      message: healthy ? 'Memory usage is normal' : 'High memory usage detected',
    };
  }

  /**
   * Snapshot CPU tick counters (idle + total across all cores)
   * @returns {Object} { idle, total } tick sums
   */
  cpuTimesSnapshot() {
    let idle = 0;
    let total = 0;

    os.cpus().forEach((cpu) => {
      for (const type in cpu.times) {
        total += cpu.times[type];
      }
      idle += cpu.times.idle;
    });

    return { idle, total };
  }

  /**
   * Check CPU usage by sampling tick deltas over ~500ms. Averaging raw
   * os.cpus() times only yields the since-boot average, which hides
   * live load spikes.
   * @returns {Promise<Object>} CPU health
   */
  async checkCPU() {
    const cpus = os.cpus();
    const start = this.cpuTimesSnapshot();
    await new Promise((resolve) => setTimeout(resolve, 500));
    const end = this.cpuTimesSnapshot();

    const idleDiff = end.idle - start.idle;
    const totalDiff = end.total - start.total;
    const usagePercentage = totalDiff > 0 ? 100 - (100 * idleDiff / totalDiff) : 0;

    const healthy = usagePercentage < 80;

    return {
      healthy,
      cores: cpus.length,
      model: cpus[0].model,
      usagePercentage: parseFloat(usagePercentage.toFixed(2)),
      sampleWindowMs: 500,
      message: healthy ? 'CPU usage is normal' : 'High CPU usage detected',
    };
  }

  /**
   * Check system load average. Node has no portable disk-usage API without
   * extra dependencies, so this honestly reports OS load instead of a
   * mislabeled "disk" check. Note: os.loadavg() is [0,0,0] on Windows.
   * @returns {Object} Load health
   */
  checkLoad() {
    const loadAverage = os.loadavg();
    const healthy = loadAverage[0] < os.cpus().length * 0.7;

    return {
      healthy,
      loadAverage: loadAverage.map((l) => parseFloat(l.toFixed(2))),
      message: healthy ? 'System load is normal' : 'High system load detected',
    };
  }

  /**
   * Get system uptime
   * @returns {Object} Uptime information
   */
  getUptime() {
    const uptimeSeconds = Math.floor((Date.now() - this.startTime) / 1000);
    const systemUptime = os.uptime();

    return {
      application: this.formatUptime(uptimeSeconds),
      system: this.formatUptime(systemUptime),
    };
  }

  /**
   * Get system information
   * @returns {Object} System information
   */
  getSystemInfo() {
    return {
      platform: os.platform(),
      arch: os.arch(),
      hostname: os.hostname(),
      nodeVersion: process.version,
      cpus: os.cpus().length,
      totalMemory: this.formatBytes(os.totalmem()),
      freeMemory: this.formatBytes(os.freemem()),
      uptime: this.getUptime(),
    };
  }

  /**
   * Record request metrics
   * @param {number} responseTime - Response time in ms
   * @param {boolean} success - Request success status
   */
  recordRequest(responseTime, success) {
    this.metrics.requests.total++;

    if (success) {
      this.metrics.requests.success++;
    } else {
      this.metrics.requests.errors++;
    }

    // Update performance metrics
    const currentAvg = this.metrics.performance.avgResponseTime;
    const { total } = this.metrics.requests;
    this.metrics.performance.avgResponseTime = (currentAvg * (total - 1) + responseTime) / total;

    this.metrics.performance.maxResponseTime = Math.max(this.metrics.performance.maxResponseTime, responseTime);

    this.metrics.performance.minResponseTime = Math.min(this.metrics.performance.minResponseTime, responseTime);
  }

  /**
   * Get application metrics
   * @returns {Object} Application metrics
   */
  getMetrics() {
    const errorRate = this.metrics.requests.total > 0
      ? (this.metrics.requests.errors / this.metrics.requests.total) * 100
      : 0;

    return {
      requests: {
        ...this.metrics.requests,
        errorRate: parseFloat(errorRate.toFixed(2)),
      },
      performance: {
        avgResponseTime: parseFloat(this.metrics.performance.avgResponseTime.toFixed(2)),
        maxResponseTime: this.metrics.performance.maxResponseTime,
        minResponseTime: this.metrics.performance.minResponseTime === Infinity
          ? 0
          : this.metrics.performance.minResponseTime,
      },
      uptime: this.getUptime(),
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Reset metrics
   */
  resetMetrics() {
    this.metrics = {
      requests: {
        total: 0,
        success: 0,
        errors: 0,
      },
      performance: {
        avgResponseTime: 0,
        maxResponseTime: 0,
        minResponseTime: Infinity,
      },
    };
    logger.info('Metrics reset');
  }

  /**
   * Format bytes to human readable format
   * @param {number} bytes - Bytes
   * @returns {string} Formatted string
   */
  formatBytes(bytes) {
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    if (bytes === 0) return '0 Bytes';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${parseFloat((bytes / 1024 ** i).toFixed(2))} ${sizes[i]}`;
  }

  /**
   * Format uptime to human readable format
   * @param {number} seconds - Uptime in seconds
   * @returns {string} Formatted string
   */
  formatUptime(seconds) {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    const parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if (secs > 0 || parts.length === 0) parts.push(`${secs}s`);

    return parts.join(' ');
  }

  /**
   * Get detailed health report
   * @returns {Promise<Object>} Detailed health report
   */
  async getDetailedHealthReport() {
    const health = await this.getHealthStatus();
    const metrics = this.getMetrics();
    const systemInfo = this.getSystemInfo();

    return {
      ...health,
      metrics,
      system: systemInfo,
    };
  }
}

module.exports = new MonitoringService();
