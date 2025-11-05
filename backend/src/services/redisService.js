const { createClient } = require('redis');

/**
 * Redis Service
 * Handles caching and session management
 */
class RedisService {
  constructor() {
    this.client = null;
    this.isConnected = false;
    this.defaultTTL = parseInt(process.env.REDIS_DEFAULT_TTL) || 3600; // 1 hour
  }

  /**
   * Initialize Redis connection
   * @returns {Promise<void>}
   */
  async connect() {
    if (this.isConnected) {
      console.log('Redis already connected');
      return;
    }

    try {
      this.client = createClient({
        url: process.env.REDIS_URL || 'redis://localhost:6379',
        password: process.env.REDIS_PASSWORD || undefined,
        socket: {
          reconnectStrategy: (retries) => {
            if (retries > 10) {
              console.error('Redis reconnection failed after 10 attempts');
              return new Error('Redis reconnection failed');
            }
            return Math.min(retries * 100, 3000);
          }
        }
      });

      this.client.on('error', (err) => {
        console.error('Redis Client Error:', err);
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
      console.error('Failed to connect to Redis:', error);
      throw error;
    }
  }

  /**
   * Disconnect from Redis
   * @returns {Promise<void>}
   */
  async disconnect() {
    if (this.client && this.isConnected) {
      await this.client.quit();
      this.isConnected = false;
      console.log('🔴 Redis disconnected');
    }
  }

  /**
   * Check if Redis is connected
   * @returns {boolean}
   */
  isReady() {
    return this.isConnected && this.client !== null;
  }

  /**
   * Get Redis client
   * @returns {Object} Redis client
   */
  getClient() {
    if (!this.isReady()) {
      throw new Error('Redis client is not connected');
    }
    return this.client;
  }

  // ==================== Basic Operations ====================

  /**
   * Set a key-value pair
   * @param {string} key - Cache key
   * @param {any} value - Value to cache
   * @param {number} ttl - Time to live in seconds (optional)
   * @returns {Promise<string>}
   */
  async set(key, value, ttl = null) {
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
   * @param {string} key - Cache key
   * @returns {Promise<any>}
   */
  async get(key) {
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
   * @param {string} key - Cache key
   * @returns {Promise<number>}
   */
  async del(key) {
    try {
      return await this.client.del(key);
    } catch (error) {
      console.error(`Redis DEL error for key ${key}:`, error);
      throw error;
    }
  }

  /**
   * Check if key exists
   * @param {string} key - Cache key
   * @returns {Promise<boolean>}
   */
  async exists(key) {
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
   * @param {string} key - Cache key
   * @param {number} seconds - Expiration time in seconds
   * @returns {Promise<boolean>}
   */
  async expire(key, seconds) {
    try {
      const result = await this.client.expire(key, seconds);
      return result === 1;
    } catch (error) {
      console.error(`Redis EXPIRE error for key ${key}:`, error);
      return false;
    }
  }

  /**
   * Get time to live for a key
   * @param {string} key - Cache key
   * @returns {Promise<number>}
   */
  async ttl(key) {
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
   * @param {string} pattern - Key pattern (e.g., 'user:*')
   * @returns {Promise<Array>}
   */
  async keys(pattern) {
    try {
      return await this.client.keys(pattern);
    } catch (error) {
      console.error(`Redis KEYS error for pattern ${pattern}:`, error);
      return [];
    }
  }

  /**
   * Delete all keys matching a pattern
   * @param {string} pattern - Key pattern
   * @returns {Promise<number>}
   */
  async delPattern(pattern) {
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
   * @param {string} key - Hash key
   * @param {string} field - Field name
   * @param {any} value - Field value
   * @returns {Promise<number>}
   */
  async hSet(key, field, value) {
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
   * @param {string} key - Hash key
   * @param {string} field - Field name
   * @returns {Promise<any>}
   */
  async hGet(key, field) {
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
   * @param {string} key - Hash key
   * @returns {Promise<Object>}
   */
  async hGetAll(key) {
    try {
      const hash = await this.client.hGetAll(key);
      const result = {};
      for (const [field, value] of Object.entries(hash)) {
        try {
          result[field] = JSON.parse(value);
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
   * @param {string} key - Hash key
   * @param {string} field - Field name
   * @returns {Promise<number>}
   */
  async hDel(key, field) {
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
   * @param {string} key - List key
   * @param {any} value - Value to push
   * @returns {Promise<number>}
   */
  async lPush(key, value) {
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
   * @param {string} key - List key
   * @param {number} start - Start index
   * @param {number} stop - Stop index
   * @returns {Promise<Array>}
   */
  async lRange(key, start, stop) {
    try {
      const values = await this.client.lRange(key, start, stop);
      return values.map(v => {
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
   * @param {string} key - List key
   * @param {number} start - Start index
   * @param {number} stop - Stop index
   * @returns {Promise<string>}
   */
  async lTrim(key, start, stop) {
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
   * @param {string} key - Set key
   * @param {any} member - Member to add
   * @returns {Promise<number>}
   */
  async sAdd(key, member) {
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
   * @param {string} key - Set key
   * @returns {Promise<Array>}
   */
  async sMembers(key) {
    try {
      const members = await this.client.sMembers(key);
      return members.map(m => {
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
   * @param {string} key - Set key
   * @param {any} member - Member to remove
   * @returns {Promise<number>}
   */
  async sRem(key, member) {
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
   * @param {string} prefix - Key prefix
   * @param {string} identifier - Unique identifier
   * @param {Function} fetchFunction - Function to fetch data if not cached
   * @param {number} ttl - Time to live in seconds
   * @returns {Promise<any>}
   */
  async cache(prefix, identifier, fetchFunction, ttl = null) {
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
   * @param {string} pattern - Cache key pattern
   * @returns {Promise<number>}
   */
  async invalidate(pattern) {
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
   * @param {string} sessionId - Session ID
   * @param {Object} data - Session data
   * @param {number} ttl - Time to live in seconds
   * @returns {Promise<string>}
   */
  async setSession(sessionId, data, ttl = 86400) {
    const key = `session:${sessionId}`;
    return await this.set(key, data, ttl);
  }

  /**
   * Get session data
   * @param {string} sessionId - Session ID
   * @returns {Promise<Object>}
   */
  async getSession(sessionId) {
    const key = `session:${sessionId}`;
    return await this.get(key);
  }

  /**
   * Delete session
   * @param {string} sessionId - Session ID
   * @returns {Promise<number>}
   */
  async deleteSession(sessionId) {
    const key = `session:${sessionId}`;
    return await this.del(key);
  }

  /**
   * Extend session expiration
   * @param {string} sessionId - Session ID
   * @param {number} ttl - Time to live in seconds
   * @returns {Promise<boolean>}
   */
  async extendSession(sessionId, ttl = 86400) {
    const key = `session:${sessionId}`;
    return await this.expire(key, ttl);
  }

  // ==================== Statistics ====================

  /**
   * Get Redis statistics
   * @returns {Promise<Object>}
   */
  async getStats() {
    try {
      const info = await this.client.info();
      const dbSize = await this.client.dbSize();
      
      return {
        connected: this.isConnected,
        dbSize,
        info: this.parseInfo(info)
      };
    } catch (error) {
      console.error('Error getting Redis stats:', error);
      return {
        connected: this.isConnected,
        error: error.message
      };
    }
  }

  /**
   * Parse Redis INFO output
   * @param {string} info - INFO output
   * @returns {Object}
   */
  parseInfo(info) {
    const lines = info.split('\r\n');
    const result = {};
    
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
   * @returns {Promise<string>}
   */
  async flushAll() {
    try {
      return await this.client.flushAll();
    } catch (error) {
      console.error('Error flushing Redis:', error);
      throw error;
    }
  }
}

// Export singleton instance
module.exports = new RedisService();
