const cron = require('node-cron');
const cacheMonitorService = require('../services/cacheMonitorService');

/**
 * Cache Cleanup Job
 * Periodically cleans up expired cache entries and optimizes cache
 */
class CacheCleanupJob {
  constructor() {
    this.task = null;
    this.isRunning = false;
    // Run every hour
    this.schedule = process.env.CACHE_CLEANUP_SCHEDULE || '0 * * * *';
  }

  /**
   * Start the cache cleanup job
   */
  start() {
    if (this.isRunning) {
      console.log('⚠️  Cache cleanup job is already running');
      return;
    }

    this.task = cron.schedule(this.schedule, async () => {
      try {
        console.log('🧹 Starting cache cleanup...');
        
        const result = await cacheMonitorService.optimizeCache();
        
        console.log(`✅ Cache cleanup completed: removed ${result.keysRemoved} expired keys`);
        
        // Log cache health
        const health = await cacheMonitorService.getHealthStatus();
        console.log(`📊 Cache health: ${health.status}`);
        
        if (health.issues.length > 0) {
          console.warn('⚠️  Cache issues detected:', health.issues);
        }
      } catch (error) {
        console.error('❌ Error in cache cleanup:', error.message);
      }
    });

    this.isRunning = true;
    console.log(`🧹 Cache cleanup job started (Schedule: ${this.schedule})`);
  }

  /**
   * Stop the cache cleanup job
   */
  stop() {
    if (this.task) {
      this.task.stop();
      this.isRunning = false;
      console.log('🛑 Cache cleanup job stopped');
    }
  }

  /**
   * Manually trigger cache cleanup
   */
  async cleanupNow() {
    try {
      console.log('🧹 Manual cache cleanup triggered...');
      const result = await cacheMonitorService.optimizeCache();
      console.log(`✅ Cache cleanup completed: removed ${result.keysRemoved} expired keys`);
      return result;
    } catch (error) {
      console.error('❌ Error in manual cleanup:', error.message);
      throw error;
    }
  }

  /**
   * Get job status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      schedule: this.schedule,
      nextRun: this.task ? this.task.nextDate() : null
    };
  }
}

module.exports = new CacheCleanupJob();
