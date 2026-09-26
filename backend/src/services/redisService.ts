const { createClient } = require('redis');

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }

  return 'Unknown error';
};

type FetchFunction = () => Promise<any>;

/**
 * Redis Service
 * Handles caching and session management
 */
class RedisService {
  client: any;

  isConnected: boolean;

  defaultTTL: number;

  constructor() {
    this.client = null;
    this.isConnected = false;
    this.defaultTTL = parseInt(process.env.REDIS_DEFAULT_TTL || '', 10) || 3600; // 1 hour
  }

  /**
   * Initialize Redis connection
   */
  async connect(): Promise<void> {
    if (this.isConnected) {
      console.log('Redis already connected');
      return;
    }

    try {
      this.client = createClient({
        url: process.env.REDIS_URL || 'redis://localhost:6379',
        password: process.env.REDIS_PASSWORD || undefined,
        socket: {
          reconnectStrategy: (retries: number): number | false => {
            if (retries > 3) {
              console.warn('⚠️  Redis reconnection stopped after 3 attempts');
              return false; // Stop reconnecting
            }
            return Math.min(retries * 100, 1000);
          },
        },
      });

      this.client.on('error', (err: Error) => {
        console.warn('⚠️  Redis Client Error:', err.message);
        this.isConnected = false;
      });

      this.client.on('connect', () => {
        console.log('🔴 Redis connecting...');
      });

      this.client.on('ready', () => {
        console.log('🔴 Redis connected and ready');
        this.isConnected = true;
      });

      this.client.on('reconnecting', () => {
        console.log('🔴 Redis reconnecting...');
      });

      this.client.on('end', () => {
        console.log('🔴 Redis connection closed');
        this.isConnected = false;
      });

      await this.client.connect();
    } catch (error) {
      console.warn('⚠️  Redis connection failed:', getErrorMessage(error));
      console.warn('⚠️  Server will start WITHOUT Redis caching');
      console.warn('⚠️  Session and caching features won\'t work until Redis is running');
      console.warn('⚠️  To start Redis: sudo systemctl start redis  OR  docker run -d -p 6379:6379 redis');
      this.client = null;
      this.isConnected = false;
      // Don't throw - allow server to start without Redis
    }
  }

  /**
   * Disconnect from Redis
   */
  async disconnect(): Promise<void> {
    if (this.client && this.isConnected) {
      await this.client.quit();
      this.isConnected = false;
      console.log('🔴 Redis disconnected');
    }
  }

  /**
   * Check if Redis is connected
   */
  isReady(): boolean {
    return this.isConnected && this.client !== null;
  }

  /**
   * Get Redis client
   */
  getClient(): any {
    if (!this.isReady()) {
      throw new Error('Redis client is not connected');
    }
    return this.client;
  }

  // ==================== Basic Operations ====================

  /**
   * Set a key-value pair
   */
  async set(key: string, value: any, ttl: number | null = null): Promise<string> {
    try {
      const serializedValue = JSON.stringify(value);
      const expiry = ttl || this.defaultTTL;

      await this.client.setEx(key, expiry, serializedValue);
      return 'OK';
    } catch (error) {
      console.error(`Redis SET error for key ${key}:`, error);
      throw error;
    }
  }

  /**
   * Get a value by key
   */
  async get(key: string): Promise<any> {
    try {
      const value = await this.client.get(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      console.error(`Redis GET error for key ${key}:`, error);
      return null;
    }
  }

  /**
   * Delete a key
   */
  async del(key: string): Promise<number> {
    try {
      return await this.client.del(key);
    } catch (error) {
      console.error(`Redis DEL error for key ${key}:`, error);
      throw error;
    }
  }

  /**
   * Check if key exists
   */
  async exists(key: string): Promise<boolean> {
    try {
      const result = await this.client.exists(key);
      return result === 1;
    } catch (error) {
      console.error(`Redis EXISTS error for key ${key}:`, error);
      return false;
    }
  }

  /**
   * Set expiration time for a key
   */
  async expire(key: string, seconds: number): Promise<boolean> {
    try {
      const result = await this.client.expire(key, seconds);
      // node-redis v4 resolves EXPIRE with a boolean; older clients return 1/0
      return result === true || result === 1;
    } catch (error) {
      console.error(`Redis EXPIRE error for key ${key}:`, error);
      return false;
    }
  }

  /**
   * Get time to live for a key
   */
  async ttl(key: string): Promise<number> {
    try {
      return await this.client.ttl(key);
    } catch (error) {
      console.error(`Redis TTL error for key ${key}:`, error);
      return -1;
    }
  }

  // ==================== Pattern Operations ====================

  /**
   * Get all keys matching a pattern
   */
  async keys(pattern: string): Promise<string[]> {
    try {
      return await this.client.keys(pattern);
    } catch (error) {
      console.error(`Redis KEYS error for pattern ${pattern}:`, error);
      return [];
    }
  }

  /**
   * Delete all keys matching a pattern
   */
  async delPattern(pattern: string): Promise<number> {
    try {
      const keys = await this.keys(pattern);
      if (keys.length === 0) return 0;
      return await this.client.del(keys);
    } catch (error) {
      console.error(`Redis DEL pattern error for ${pattern}:`, error);
      throw error;
    }
  }

  // ==================== Hash Operations ====================

  /**
   * Set hash field
   */
  async hSet(key: string, field: string, value: any): Promise<number> {
    try {
      const serializedValue = JSON.stringify(value);
      return await this.client.hSet(key, field, serializedValue);
    } catch (error) {
      console.error(`Redis HSET error for ${key}.${field}:`, error);
      throw error;
    }
  }

  /**
   * Get hash field
   */
  async hGet(key: string, field: string): Promise<any> {
    try {
      const value = await this.client.hGet(key, field);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      console.error(`Redis HGET error for ${key}.${field}:`, error);
      return null;
    }
  }

  /**
   * Get all hash fields
   */
  async hGetAll(key: string): Promise<Record<string, any>> {
    try {
      const hash = await this.client.hGetAll(key);
      const result: Record<string, any> = {};
      for (const [field, value] of Object.entries(hash)) {
        try {
          result[field] = JSON.parse(value as string);
        } catch {
          result[field] = value;
        }
      }
      return result;
    } catch (error) {
      console.error(`Redis HGETALL error for ${key}:`, error);
      return {};
    }
  }

  /**
   * Delete hash field
   */
  async hDel(key: string, field: string): Promise<number> {
    try {
      return await this.client.hDel(key, field);
    } catch (error) {
      console.error(`Redis HDEL error for ${key}.${field}:`, error);
      throw error;
    }
  }

  // ==================== List Operations ====================

  /**
   * Push value to list (left)
   */
  async lPush(key: string, value: any): Promise<number> {
    try {
      const serializedValue = JSON.stringify(value);
      return await this.client.lPush(key, serializedValue);
    } catch (error) {
      console.error(`Redis LPUSH error for ${key}:`, error);
      throw error;
    }
  }

  /**
   * Get list range
   */
  async lRange(key: string, start: number, stop: number): Promise<any[]> {
    try {
      const values = await this.client.lRange(key, start, stop);
      return values.map((v: string) => {
        try {
          return JSON.parse(v);
        } catch {
          return v;
        }
      });
    } catch (error) {
      console.error(`Redis LRANGE error for ${key}:`, error);
      return [];
    }
  }

  /**
   * Trim list to specified range
   */
  async lTrim(key: string, start: number, stop: number): Promise<string> {
    try {
      return await this.client.lTrim(key, start, stop);
    } catch (error) {
      console.error(`Redis LTRIM error for ${key}:`, error);
      throw error;
    }
  }

  // ==================== Set Operations ====================

  /**
   * Add member to set
   */
  async sAdd(key: string, member: any): Promise<number> {
    try {
      const serializedMember = JSON.stringify(member);
      return await this.client.sAdd(key, serializedMember);
    } catch (error) {
      console.error(`Redis SADD error for ${key}:`, error);
      throw error;
    }
  }

  /**
   * Get all set members
   */
  async sMembers(key: string): Promise<any[]> {
    try {
      const members = await this.client.sMembers(key);
      return members.map((m: string) => {
        try {
          return JSON.parse(m);
        } catch {
          return m;
        }
      });
    } catch (error) {
      console.error(`Redis SMEMBERS error for ${key}:`, error);
      return [];
    }
  }

  /**
   * Remove member from set
   */
  async sRem(key: string, member: any): Promise<number> {
    try {
      const serializedMember = JSON.stringify(member);
      return await this.client.sRem(key, serializedMember);
    } catch (error) {
      console.error(`Redis SREM error for ${key}:`, error);
      throw error;
    }
  }

  // ==================== Cache Helper Methods ====================

  /**
   * Cache with automatic key generation
   */
  async cache(prefix: string, identifier: string, fetchFunction: FetchFunction, ttl: number | null = null): Promise<any> {
    const key = `${prefix}:${identifier}`;

    try {
      // Try to get from cache
      const cached = await this.get(key);
      if (cached !== null) {
        return cached;
      }

      // Fetch fresh data
      const data = await fetchFunction();

      // Cache the result
      await this.set(key, data, ttl);

      return data;
    } catch (error) {
      console.error(`Cache error for ${key}:`, error);
      // If caching fails, still return the data
      return await fetchFunction();
    }
  }

  /**
   * Invalidate cache by pattern
   */
  async invalidate(pattern: string): Promise<number> {
    try {
      return await this.delPattern(pattern);
    } catch (error) {
      console.error(`Cache invalidation error for ${pattern}:`, error);
      return 0;
    }
  }

  // ==================== Session Management ====================

  /**
   * Store session data
   */
  async setSession(sessionId: string, data: any, ttl = 86400): Promise<string> {
    const key = `session:${sessionId}`;
    return await this.set(key, data, ttl);
  }

  /**
   * Get session data
   */
  async getSession(sessionId: string): Promise<any> {
    const key = `session:${sessionId}`;
    return await this.get(key);
  }

  /**
   * Delete session
   */
  async deleteSession(sessionId: string): Promise<number> {
    const key = `session:${sessionId}`;
    return await this.del(key);
  }

  /**
   * Extend session expiration
   */
  async extendSession(sessionId: string, ttl = 86400): Promise<boolean> {
    const key = `session:${sessionId}`;
    return await this.expire(key, ttl);
  }

  // ==================== Statistics ====================

  /**
   * Get Redis statistics
   */
  async getStats(): Promise<Record<string, any>> {
    try {
      const info = await this.client.info();
      const dbSize = await this.client.dbSize();

      return {
        connected: this.isConnected,
        dbSize,
        info: this.parseInfo(info),
      };
    } catch (error) {
      console.error('Error getting Redis stats:', error);
      return {
        connected: this.isConnected,
        error: getErrorMessage(error),
      };
    }
  }

  /**
   * Parse Redis INFO output
   */
  parseInfo(info: string): Record<string, string> {
    const lines = info.split('\r\n');
    const result: Record<string, string> = {};

    for (const line of lines) {
      if (line && !line.startsWith('#')) {
        const [key, value] = line.split(':');
        if (key && value) {
          result[key] = value;
        }
      }
    }

    return result;
  }

  /**
   * Flush all data (use with caution!)
   */
  async flushAll(): Promise<string> {
    try {
      return await this.client.flushAll();
    } catch (error) {
      console.error('Error flushing Redis:', error);
      throw error;
    }
  }
}

// Export singleton instance (module.exports shape preserved via export =)
const redisService = new RedisService();

export = redisService;
