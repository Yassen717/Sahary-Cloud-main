const redisService = require('../src/services/redisService');

describe('Redis Service', () => {
  beforeAll(async () => {
    await redisService.connect();
  });

  afterAll(async () => {
    // Clean up test data
    await redisService.delPattern('test:*');
    await redisService.disconnect();
  });

  afterEach(async () => {
    // Clean up after each test
    await redisService.delPattern('test:*');
  });

  describe('Connection', () => {
    it('should be connected', () => {
      expect(redisService.isReady()).toBe(true);
    });

    it('should return client', () => {
      const client = redisService.getClient();
      expect(client).toBeDefined();
    });
  });

  describe('Basic Operations', () => {
    it('should set and get a value', async () => {
      await redisService.set('test:key1', { data: 'value1' }, 60);
      const value = await redisService.get('test:key1');
      
      expect(value).toEqual({ data: 'value1' });
    });

    it('should return null for non-existent key', async () => {
      const value = await redisService.get('test:nonexistent');
      expect(value).toBeNull();
    });

    it('should delete a key', async () => {
      await redisService.set('test:key2', 'value2', 60);
      const deleted = await redisService.del('test:key2');
      const value = await redisService.get('test:key2');
      
      expect(deleted).toBe(1);
      expect(value).toBeNull();
    });

    it('should check if key exists', async () => {
      await redisService.set('test:key3', 'value3', 60);
      
      const exists = await redisService.exists('test:key3');
      const notExists = await redisService.exists('test:nonexistent');
      
      expect(exists).toBe(true);
      expect(notExists).toBe(false);
    });

    it('should set expiration time', async () => {
      await redisService.set('test:key4', 'value4', 60);
      const result = await redisService.expire('test:key4', 120);
      const ttl = await redisService.ttl('test:key4');
      
      expect(result).toBe(true);
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(120);
    });

    it('should get TTL for a key', async () => {
      await redisService.set('test:key5', 'value5', 100);
      const ttl = await redisService.ttl('test:key5');
      
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(100);
    });
  });

  describe('Pattern Operations', () => {
    it('should get keys by pattern', async () => {
      await redisService.set('test:pattern:1', 'value1', 60);
      await redisService.set('test:pattern:2', 'value2', 60);
      await redisService.set('test:other:1', 'value3', 60);
      
      const keys = await redisService.keys('test:pattern:*');
      
      expect(keys.length).toBe(2);
      expect(keys).toContain('test:pattern:1');
      expect(keys).toContain('test:pattern:2');
    });

    it('should delete keys by pattern', async () => {
      await redisService.set('test:delete:1', 'value1', 60);
      await redisService.set('test:delete:2', 'value2', 60);
      await redisService.set('test:keep:1', 'value3', 60);
      
      const deleted = await redisService.delPattern('test:delete:*');
      const remaining = await redisService.keys('test:*');
      
      expect(deleted).toBe(2);
      expect(remaining).toContain('test:keep:1');
      expect(remaining).not.toContain('test:delete:1');
    });
  });

  describe('Hash Operations', () => {
    it('should set and get hash field', async () => {
      await redisService.hSet('test:hash1', 'field1', { data: 'value1' });
      const value = await redisService.hGet('test:hash1', 'field1');
      
      expect(value).toEqual({ data: 'value1' });
    });

    it('should get all hash fields', async () => {
      await redisService.hSet('test:hash2', 'field1', 'value1');
      await redisService.hSet('test:hash2', 'field2', 'value2');
      
      const hash = await redisService.hGetAll('test:hash2');
      
      expect(hash).toEqual({
        field1: 'value1',
        field2: 'value2'
      });
    });

    it('should delete hash field', async () => {
      await redisService.hSet('test:hash3', 'field1', 'value1');
      await redisService.hDel('test:hash3', 'field1');
      const value = await redisService.hGet('test:hash3', 'field1');
      
      expect(value).toBeNull();
    });
  });

  describe('List Operations', () => {
    it('should push and get list values', async () => {
      await redisService.lPush('test:list1', 'value1');
      await redisService.lPush('test:list1', 'value2');
      
      const values = await redisService.lRange('test:list1', 0, -1);
      
      expect(values).toEqual(['value2', 'value1']);
    });

    it('should trim list', async () => {
      await redisService.lPush('test:list2', 'value1');
      await redisService.lPush('test:list2', 'value2');
      await redisService.lPush('test:list2', 'value3');
      
      await redisService.lTrim('test:list2', 0, 1);
      const values = await redisService.lRange('test:list2', 0, -1);
      
      expect(values.length).toBe(2);
    });
  });

  describe('Set Operations', () => {
    it('should add and get set members', async () => {
      await redisService.sAdd('test:set1', 'member1');
      await redisService.sAdd('test:set1', 'member2');
      
      const members = await redisService.sMembers('test:set1');
      
      expect(members).toContain('member1');
      expect(members).toContain('member2');
      expect(members.length).toBe(2);
    });

    it('should remove set member', async () => {
      await redisService.sAdd('test:set2', 'member1');
      await redisService.sAdd('test:set2', 'member2');
      
      await redisService.sRem('test:set2', 'member1');
      const members = await redisService.sMembers('test:set2');
      
      expect(members).not.toContain('member1');
      expect(members).toContain('member2');
    });
  });

  describe('Cache Helper Methods', () => {
    it('should cache data with fetch function', async () => {
      let fetchCount = 0;
      const fetchFunction = async () => {
        fetchCount++;
        return { data: 'fetched data' };
      };

      // First call should fetch
      const result1 = await redisService.cache('test', 'cache1', fetchFunction, 60);
      expect(result1).toEqual({ data: 'fetched data' });
      expect(fetchCount).toBe(1);

      // Second call should use cache
      const result2 = await redisService.cache('test', 'cache1', fetchFunction, 60);
      expect(result2).toEqual({ data: 'fetched data' });
      expect(fetchCount).toBe(1); // Should not fetch again
    });

    it('should invalidate cache by pattern', async () => {
      await redisService.set('test:cache:1', 'value1', 60);
      await redisService.set('test:cache:2', 'value2', 60);
      
      const invalidated = await redisService.invalidate('test:cache:*');
      
      expect(invalidated).toBe(2);
      
      const value1 = await redisService.get('test:cache:1');
      const value2 = await redisService.get('test:cache:2');
      
      expect(value1).toBeNull();
      expect(value2).toBeNull();
    });
  });

  describe('Session Management', () => {
    it('should set and get session', async () => {
      const sessionData = { userId: '123', data: 'test' };
      await redisService.setSession('session1', sessionData, 3600);
      
      const retrieved = await redisService.getSession('session1');
      
      expect(retrieved).toEqual(sessionData);
    });

    it('should delete session', async () => {
      await redisService.setSession('session2', { data: 'test' }, 3600);
      await redisService.deleteSession('session2');
      
      const retrieved = await redisService.getSession('session2');
      
      expect(retrieved).toBeNull();
    });

    it('should extend session', async () => {
      await redisService.setSession('session3', { data: 'test' }, 60);
      const extended = await redisService.extendSession('session3', 120);
      
      expect(extended).toBe(true);
      
      const ttl = await redisService.ttl('session:session3');
      expect(ttl).toBeGreaterThan(60);
    });
  });

  describe('Statistics', () => {
    it('should get Redis stats', async () => {
      const stats = await redisService.getStats();
      
      expect(stats).toHaveProperty('connected');
      expect(stats).toHaveProperty('dbSize');
      expect(stats.connected).toBe(true);
    });
  });
});
