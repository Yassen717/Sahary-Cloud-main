const redisService = require('./redisService');

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }

  return 'Unknown error';
};

type CacheStats = {
  hits: number;
  misses: number;
  sets: number;
  deletes: number;
  errors: number;
};

type WarmupFunction = () => Promise<unknown>;

type PatternBucket = {
  count: number;
  keys: string[];
};

/**
 * Cache Monitor Service
 * Monitors cache performance and provides analytics
 */
class CacheMonitorService {
  stats: CacheStats;

  startTime: number;

  constructor() {
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      errors: 0,
    };
    this.startTime = Date.now();
  }

  /**
   * Record cache hit
   */
  recordHit(key: string): void {
    this.stats.hits++;
    console.log(`✅ Cache HIT: ${key} (Total: ${this.stats.hits})`);
  }

  /**
   * Record cache miss
   */
  recordMiss(key: string): void {
    this.stats.misses++;
    console.log(`❌ Cache MISS: ${key} (Total: ${this.stats.misses})`);
  }

  /**
   * Record cache set
   */
  recordSet(_key: string): void {
    this.stats.sets++;
  }

  /**
   * Record cache delete
   */
  recordDelete(_key: string): void {
    this.stats.deletes++;
  }

  /**
   * Record cache error
   */
  recordError(key: string, error: Error): void {
    this.stats.errors++;
    console.error(`❌ Cache ERROR for ${key}:`, error.message);
  }

  /**
   * Get cache statistics
   */
  getStats(): Record<string, any> {
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
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      errors: 0,
    };
    this.startTime = Date.now();
    console.log('📊 Cache statistics reset');
  }

  /**
   * Get cache size by pattern
   */
  async getCacheSize(pattern = '*'): Promise<Record<string, any>> {
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
        sizeMB: parseFloat((totalSize / (1024 * 1024)).toFixed(2)),
      };
    } catch (error) {
      console.error('Error getting cache size:', error);
      return {
        keys: 0,
        sizeBytes: 0,
        error: getErrorMessage(error),
      };
    }
  }

  /**
   * Get top cached keys
   */
  async getTopKeys(limit = 10): Promise<Array<Record<string, any>>> {
    try {
      const keys = await redisService.keys('cache:*');
      const keyInfo: Array<{ key: string; ttl: number; expiresIn: string }> = [];

      for (const key of keys.slice(0, limit)) {
        const ttl = await redisService.ttl(key);
        keyInfo.push({
          key,
          ttl,
          expiresIn: ttl > 0 ? `${ttl}s` : 'expired',
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
   */
  async analyzeCachePatterns(): Promise<Record<string, any>> {
    try {
      const keys = await redisService.keys('cache:*');
      const patterns: Record<string, PatternBucket> = {};

      for (const key of keys) {
        const parts = key.split(':');
        const pattern = parts.slice(0, 3).join(':'); // Get first 3 parts

        if (!patterns[pattern]) {
          patterns[pattern] = {
            count: 0,
            keys: [],
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
            examples: data.keys,
          }))
          .sort((a, b) => b.count - a.count),
      };
    } catch (error) {
      console.error('Error analyzing cache patterns:', error);
      return {
        totalKeys: 0,
        patterns: [],
        error: getErrorMessage(error),
      };
    }
  }

  /**
   * Get cache health status
   */
  async getHealthStatus(): Promise<Record<string, any>> {
    try {
      const stats = this.getStats();
      const redisStats = await redisService.getStats();
      const cacheSize = await this.getCacheSize('cache:*');

      let status = 'healthy';
      const issues: string[] = [];

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
          dbSize: redisStats.dbSize,
        },
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        status: 'error',
        issues: [getErrorMessage(error)],
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Optimize cache (remove expired keys, etc.)
   */
  async optimizeCache(): Promise<Record<string, any>> {
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
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      console.error('Error optimizing cache:', error);
      return {
        success: false,
        error: getErrorMessage(error),
      };
    }
  }

  /**
   * Warm up cache with frequently accessed data
   */
  async warmupCache(warmupFunctions: WarmupFunction[] = []): Promise<Record<string, any>> {
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
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      console.error('Error warming up cache:', error);
      return {
        success: false,
        error: getErrorMessage(error),
      };
    }
  }
}

// Export singleton instance (module.exports shape preserved via export =)
const cacheMonitorService = new CacheMonitorService();

export = cacheMonitorService;
