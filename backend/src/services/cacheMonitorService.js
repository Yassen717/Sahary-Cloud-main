const redisService = require('./redisService');

/**
 * Cache Monitor Service
 * Monitors cache performance and provides analytics
 */
class CacheMonitorService {
  constructor() {
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      errors: 0
    };
    this.startTime = Date.now();
  }

  /**
   * Record cache hit
   * @param {string} key - Cache key
   */
  recordHit(key) {
    this.stats.hits++;
    console.log(`✅ Cache HIT: ${key} (Total: ${this.stats.hits})`);
  }

  /**
   * Record cache miss
   * @param {string} key - Cache key
   */
  recordMiss(key) {
    this.stats.misses++;
    console.log(`❌ Cache MISS: ${key} (Total: ${this.stats.misses})`);
  }

  /**
   * Record cache set
   * @param {string} key - Cache key
   */
  recordSet(key) {
    this.stats.sets++;
  }

  /**
   * Record cache delete
   * @param {string} key - Cache key
   */
  recordDelete(key) {
    this.stats.deletes++;
  }

  /**
   * Record cache error
   * @param {string} key - Cache key
   * @param {Error} error - Error object
   */
  recordError(key, error) {
    this.stats.errors++;
    console.error(`❌ Cache ERROR for ${key}:`, error.message);
  }

  /**
   * Get cache statistics
   * @returns {Object} Cache statistics
   */
  getStats() {
    const total = this.stats.hits + this.stats.misses;
    const hitRate = total > 0 ? (this.stats.hits / total) * 100 : 0;
    const uptime = Date.now() - this.startTime;

    return {
      hits: this.stats.hits,
      misses: this.stats.misses,
      sets: this.stats.sets,
      deletes: this.stats.deletes,
      errors: this.stats.errors,
      total,
      hitRate: parseFloat(hitRate.toFixed(2)),
      uptime: Math.floor(uptime / 1000), // seconds
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      errors: 0
    };
    this.startTime = Date.now();
    console.log('📊 Cache statistics reset');
  }

  /**
   * Get cache size by pattern
   * @param {string} pattern - Key pattern
   * @returns {Promise<Object>} Size information
   */
  async getCacheSize(pattern = '*') {
    try {
      const keys = await redisService.keys(pattern);
      let totalSize = 0;

      for (const key of keys) {
        const value = await redisService.get(key);
        if (value) {
          totalSize += JSON.stringify(value).length;
        }
      }

      return {
        keys: keys.length,
        sizeBytes: totalSize,
        sizeKB: parseFloat((totalSize / 1024).toFixed(2)),
        sizeMB: parseFloat((totalSize / (1024 * 1024)).toFixed(2))
      };
    } catch (error) {
      console.error('Error getting cache size:', error);
      return {
        keys: 0,
        sizeBytes: 0,
        error: error.message
      };
    }
  }

  /**
   * Get top cached keys
   * @param {number} limit - Number of keys to return
   * @returns {Promise<Array>} Top keys with TTL
   */
  async getTopKeys(limit = 10) {
    try {
      const keys = await redisService.keys('cache:*');
      const keyInfo = [];

      for (const key of keys.slice(0, limit)) {
        const ttl = await redisService.ttl(key);
        keyInfo.push({
          key,
          ttl,
          expiresIn: ttl > 0 ? `${ttl}s` : 'expired'
        });
      }

      return keyInfo.sort((a, b) => b.ttl - a.ttl);
    } catch (error) {
      console.error('Error getting top keys:', error);
      return [];
    }
  }

  /**
   * Analyze cache patterns
   * @returns {Promise<Object>} Pattern analysis
   */
  async analyzeCachePatterns() {
    try {
      const keys = await redisService.keys('cache:*');
      const patterns = {};

      for (const key of keys) {
        const parts = key.split(':');
        const pattern = parts.slice(0, 3).join(':'); // Get first 3 parts

        if (!patterns[pattern]) {
          patterns[pattern] = {
            count: 0,
            keys: []
          };
        }

        patterns[pattern].count++;
        if (patterns[pattern].keys.length < 5) {
          patterns[pattern].keys.push(key);
        }
      }

      return {
        totalKeys: keys.length,
        patterns: Object.entries(patterns)
          .map(([pattern, data]) => ({
            pattern,
            count: data.count,
            percentage: parseFloat(((data.count / keys.length) * 100).toFixed(2)),
            examples: data.keys
          }))
          .sort((a, b) => b.count - a.count)
      };
    } catch (error) {
      console.error('Error analyzing cache patterns:', error);
      return {
        totalKeys: 0,
        patterns: [],
        error: error.message
      };
    }
  }

  /**
   * Get cache health status
   * @returns {Promise<Object>} Health status
   */
  async getHealthStatus() {
    try {
      const stats = this.getStats();
      const redisStats = await redisService.getStats();
      const cacheSize = await this.getCacheSize('cache:*');

      let status = 'healthy';
      const issues = [];

      // Check hit rate
      if (stats.hitRate < 50 && stats.total > 100) {
        status = 'warning';
        issues.push('Low cache hit rate (< 50%)');
      }

      // Check error rate
      const errorRate = stats.total > 0 ? (stats.errors / stats.total) * 100 : 0;
      if (errorRate > 5) {
        status = 'unhealthy';
        issues.push(`High error rate (${errorRate.toFixed(2)}%)`);
      }

      // Check Redis connection
      if (!redisStats.connected) {
        status = 'unhealthy';
        issues.push('Redis not connected');
      }

      return {
        status,
        issues,
        stats,
        cacheSize,
        redis: {
          connected: redisStats.connected,
          dbSize: redisStats.dbSize
        },
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        status: 'error',
        issues: [error.message],
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Optimize cache (remove expired keys, etc.)
   * @returns {Promise<Object>} Optimization result
   */
  async optimizeCache() {
    try {
      const keys = await redisService.keys('cache:*');
      let removed = 0;

      for (const key of keys) {
        const ttl = await redisService.ttl(key);
        if (ttl === -2) {
          // Key doesn't exist or expired
          await redisService.del(key);
          removed++;
        }
      }

      console.log(`🧹 Cache optimized: removed ${removed} expired keys`);

      return {
        success: true,
        keysRemoved: removed,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error optimizing cache:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Warm up cache with frequently accessed data
   * @param {Array} warmupFunctions - Array of functions to warm up cache
   * @returns {Promise<Object>} Warmup result
   */
  async warmupCache(warmupFunctions = []) {
    try {
      let warmedUp = 0;

      for (const fn of warmupFunctions) {
        try {
          await fn();
          warmedUp++;
        } catch (error) {
          console.error('Error in warmup function:', error);
        }
      }

      console.log(`🔥 Cache warmed up: ${warmedUp} functions executed`);

      return {
        success: true,
        warmedUp,
        total: warmupFunctions.length,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error warming up cache:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = new CacheMonitorService();
