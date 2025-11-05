const cacheMonitorService = require('../src/services/cacheMonitorService');
const redisService = require('../src/services/redisService');

describe('Cache Monitor Service', () => {
  beforeAll(async () => {
    await redisService.connect();
  });

  afterAll(async () => {
    await redisService.delPattern('cache:*');
    await redisService.disconnect();
  });

  beforeEach(() => {
    cacheMonitorService.resetStats();
  });

  afterEach(async () => {
    await redisService.delPattern('cache:*');
  });

  describe('Statistics', () => {
    it('should record cache hits', () => {
      cacheMonitorService.recordHit('test:key1');
      cacheMonitorService.recordHit('test:key2');

      const stats = cacheMonitorService.getStats();

      expect(stats.hits).toBe(2);
      expect(stats.misses).toBe(0);
    });

    it('should record cache misses', () => {
      cacheMonitorService.recordMiss('test:key1');
      cacheMonitorService.recordMiss('test:key2');

      const stats = cacheMonitorService.getStats();

      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(2);
    });

    it('should calculate hit rate', () => {
      cacheMonitorService.recordHit('test:key1');
      cacheMonitorService.recordHit('test:key2');
      cacheMonitorService.recordMiss('test:key3');

      const stats = cacheMonitorService.getStats();

      expect(stats.total).toBe(3);
      expect(stats.hitRate).toBe(66.67);
    });

    it('should record cache operations', () => {
      cacheMonitorService.recordSet('test:key1');
      cacheMonitorService.recordDelete('test:key2');
      cacheMonitorService.recordError('test:key3', new Error('Test error'));

      const stats = cacheMonitorService.getStats();

      expect(stats.sets).toBe(1);
      expect(stats.deletes).toBe(1);
      expect(stats.errors).toBe(1);
    });

    it('should reset statistics', () => {
      cacheMonitorService.recordHit('test:key1');
      cacheMonitorService.recordMiss('test:key2');

      cacheMonitorService.resetStats();
      const stats = cacheMonitorService.getStats();

      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
      expect(stats.total).toBe(0);
    });
  });

  describe('Cache Size', () => {
    it('should calculate cache size', async () => {
      await redisService.set('cache:test:1', { data: 'value1' }, 60);
      await redisService.set('cache:test:2', { data: 'value2' }, 60);

      const size = await cacheMonitorService.getCacheSize('cache:test:*');

      expect(size.keys).toBe(2);
      expect(size.sizeBytes).toBeGreaterThan(0);
      expect(size.sizeKB).toBeGreaterThan(0);
    });

    it('should return zero for empty cache', async () => {
      const size = await cacheMonitorService.getCacheSize('cache:nonexistent:*');

      expect(size.keys).toBe(0);
      expect(size.sizeBytes).toBe(0);
    });
  });

  describe('Top Keys', () => {
    it('should get top cached keys', async () => {
      await redisService.set('cache:test:1', 'value1', 100);
      await redisService.set('cache:test:2', 'value2', 200);
      await redisService.set('cache:test:3', 'value3', 300);

      const topKeys = await cacheMonitorService.getTopKeys(3);

      expect(topKeys.length).toBe(3);
      expect(topKeys[0].ttl).toBeGreaterThan(topKeys[1].ttl);
    });
  });

  describe('Pattern Analysis', () => {
    it('should analyze cache patterns', async () => {
      await redisService.set('cache:user:1:profile', 'data1', 60);
      await redisService.set('cache:user:2:profile', 'data2', 60);
      await redisService.set('cache:post:1:data', 'data3', 60);

      const analysis = await cacheMonitorService.analyzeCachePatterns();

      expect(analysis.totalKeys).toBe(3);
      expect(analysis.patterns.length).toBeGreaterThan(0);
    });
  });

  describe('Health Status', () => {
    it('should return healthy status with good metrics', async () => {
      // Simulate good cache performance
      for (let i = 0; i < 100; i++) {
        cacheMonitorService.recordHit(`key${i}`);
      }
      for (let i = 0; i < 20; i++) {
        cacheMonitorService.recordMiss(`key${i}`);
      }

      const health = await cacheMonitorService.getHealthStatus();

      expect(health.status).toBe('healthy');
      expect(health.stats.hitRate).toBeGreaterThan(50);
    });

    it('should return warning status with low hit rate', async () => {
      // Simulate poor cache performance
      for (let i = 0; i < 40; i++) {
        cacheMonitorService.recordHit(`key${i}`);
      }
      for (let i = 0; i < 60; i++) {
        cacheMonitorService.recordMiss(`key${i}`);
      }

      const health = await cacheMonitorService.getHealthStatus();

      expect(health.status).toBe('warning');
      expect(health.issues.length).toBeGreaterThan(0);
    });
  });

  describe('Cache Optimization', () => {
    it('should optimize cache by removing expired keys', async () => {
      // Create some test keys
      await redisService.set('cache:test:1', 'value1', 60);
      await redisService.set('cache:test:2', 'value2', 60);

      const result = await cacheMonitorService.optimizeCache();

      expect(result.success).toBe(true);
      expect(typeof result.keysRemoved).toBe('number');
    });
  });

  describe('Cache Warmup', () => {
    it('should warm up cache with provided functions', async () => {
      const warmupFunctions = [
        async () => {
          await redisService.set('cache:warmup:1', 'data1', 60);
        },
        async () => {
          await redisService.set('cache:warmup:2', 'data2', 60);
        }
      ];

      const result = await cacheMonitorService.warmupCache(warmupFunctions);

      expect(result.success).toBe(true);
      expect(result.warmedUp).toBe(2);

      const value1 = await redisService.get('cache:warmup:1');
      const value2 = await redisService.get('cache:warmup:2');

      expect(value1).toBe('data1');
      expect(value2).toBe('data2');
    });

    it('should handle warmup function errors gracefully', async () => {
      const warmupFunctions = [
        async () => {
          throw new Error('Warmup error');
        },
        async () => {
          await redisService.set('cache:warmup:success', 'data', 60);
        }
      ];

      const result = await cacheMonitorService.warmupCache(warmupFunctions);

      expect(result.success).toBe(true);
      expect(result.warmedUp).toBe(1); // Only successful one
    });
  });
});
