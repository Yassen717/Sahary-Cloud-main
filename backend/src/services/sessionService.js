const redisService = require('./redisService');
const { v4: uuidv4 } = require('uuid');

/**
 * Session Management Service
 * Handles user sessions with Redis
 */
class SessionService {
  constructor() {
    this.sessionPrefix = 'session';
    this.userSessionsPrefix = 'user_sessions';
    this.defaultTTL = parseInt(process.env.SESSION_MAX_AGE) || 86400; // 24 hours
  }

  /**
   * Create a new session
   * @param {string} userId - User ID
   * @param {Object} data - Session data
   * @param {Object} metadata - Additional metadata (IP, user agent, etc.)
   * @returns {Promise<Object>} Session object
   */
  async createSession(userId, data = {}, metadata = {}) {
    try {
      const sessionId = uuidv4();
      const session = {
        id: sessionId,
        userId,
        data,
        metadata: {
          ...metadata,
          createdAt: new Date().toISOString(),
          lastAccessedAt: new Date().toISOString()
        }
      };

      // Store session
      await redisService.setSession(sessionId, session, this.defaultTTL);

      // Add session to user's session list
      await this.addUserSession(userId, sessionId);

      console.log(`✅ Session created: ${sessionId} for user ${userId}`);
      return session;
    } catch (error) {
      console.error('Error creating session:', error);
      throw new Error('Failed to create session');
    }
  }

  /**
   * Get session by ID
   * @param {string} sessionId - Session ID
   * @param {boolean} updateAccess - Update last accessed time
   * @returns {Promise<Object>} Session object
   */
  async getSession(sessionId, updateAccess = true) {
    try {
      const session = await redisService.getSession(sessionId);

      if (!session) {
        return null;
      }

      // Update last accessed time
      if (updateAccess) {
        session.metadata.lastAccessedAt = new Date().toISOString();
        await redisService.setSession(sessionId, session, this.defaultTTL);
      }

      return session;
    } catch (error) {
      console.error('Error getting session:', error);
      return null;
    }
  }

  /**
   * Update session data
   * @param {string} sessionId - Session ID
   * @param {Object} data - Data to update
   * @returns {Promise<Object>} Updated session
   */
  async updateSession(sessionId, data) {
    try {
      const session = await this.getSession(sessionId, false);

      if (!session) {
        throw new Error('Session not found');
      }

      session.data = {
        ...session.data,
        ...data
      };
      session.metadata.lastAccessedAt = new Date().toISOString();

      await redisService.setSession(sessionId, session, this.defaultTTL);

      return session;
    } catch (error) {
      console.error('Error updating session:', error);
      throw error;
    }
  }

  /**
   * Delete session
   * @param {string} sessionId - Session ID
   * @returns {Promise<boolean>} Success status
   */
  async deleteSession(sessionId) {
    try {
      const session = await this.getSession(sessionId, false);

      if (session) {
        // Remove from user's session list
        await this.removeUserSession(session.userId, sessionId);
      }

      // Delete session
      await redisService.deleteSession(sessionId);

      console.log(`🗑️  Session deleted: ${sessionId}`);
      return true;
    } catch (error) {
      console.error('Error deleting session:', error);
      return false;
    }
  }

  /**
   * Extend session expiration
   * @param {string} sessionId - Session ID
   * @param {number} ttl - Time to live in seconds
   * @returns {Promise<boolean>} Success status
   */
  async extendSession(sessionId, ttl = null) {
    try {
      const expiry = ttl || this.defaultTTL;
      return await redisService.extendSession(sessionId, expiry);
    } catch (error) {
      console.error('Error extending session:', error);
      return false;
    }
  }

  /**
   * Add session to user's session list
   * @param {string} userId - User ID
   * @param {string} sessionId - Session ID
   * @returns {Promise<void>}
   */
  async addUserSession(userId, sessionId) {
    try {
      const key = `${this.userSessionsPrefix}:${userId}`;
      await redisService.sAdd(key, sessionId);
      await redisService.expire(key, this.defaultTTL);
    } catch (error) {
      console.error('Error adding user session:', error);
    }
  }

  /**
   * Remove session from user's session list
   * @param {string} userId - User ID
   * @param {string} sessionId - Session ID
   * @returns {Promise<void>}
   */
  async removeUserSession(userId, sessionId) {
    try {
      const key = `${this.userSessionsPrefix}:${userId}`;
      await redisService.sRem(key, sessionId);
    } catch (error) {
      console.error('Error removing user session:', error);
    }
  }

  /**
   * Get all sessions for a user
   * @param {string} userId - User ID
   * @returns {Promise<Array>} Array of sessions
   */
  async getUserSessions(userId) {
    try {
      const key = `${this.userSessionsPrefix}:${userId}`;
      const sessionIds = await redisService.sMembers(key);

      const sessions = [];
      for (const sessionId of sessionIds) {
        const session = await this.getSession(sessionId, false);
        if (session) {
          sessions.push(session);
        } else {
          // Clean up invalid session reference
          await this.removeUserSession(userId, sessionId);
        }
      }

      return sessions;
    } catch (error) {
      console.error('Error getting user sessions:', error);
      return [];
    }
  }

  /**
   * Delete all sessions for a user
   * @param {string} userId - User ID
   * @returns {Promise<number>} Number of sessions deleted
   */
  async deleteUserSessions(userId) {
    try {
      const sessions = await this.getUserSessions(userId);
      let count = 0;

      for (const session of sessions) {
        const deleted = await this.deleteSession(session.id);
        if (deleted) count++;
      }

      // Clean up user sessions set
      const key = `${this.userSessionsPrefix}:${userId}`;
      await redisService.del(key);

      console.log(`🗑️  Deleted ${count} sessions for user ${userId}`);
      return count;
    } catch (error) {
      console.error('Error deleting user sessions:', error);
      return 0;
    }
  }

  /**
   * Validate session
   * @param {string} sessionId - Session ID
   * @returns {Promise<boolean>} Validation result
   */
  async validateSession(sessionId) {
    try {
      const session = await this.getSession(sessionId, true);
      return session !== null;
    } catch (error) {
      console.error('Error validating session:', error);
      return false;
    }
  }

  /**
   * Get session statistics
   * @returns {Promise<Object>} Session statistics
   */
  async getSessionStats() {
    try {
      const pattern = `${this.sessionPrefix}:*`;
      const sessionKeys = await redisService.keys(pattern);

      return {
        totalSessions: sessionKeys.length,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error getting session stats:', error);
      return {
        totalSessions: 0,
        error: error.message
      };
    }
  }

  /**
   * Clean up expired sessions (maintenance task)
   * @returns {Promise<number>} Number of sessions cleaned
   */
  async cleanupExpiredSessions() {
    try {
      const pattern = `${this.sessionPrefix}:*`;
      const sessionKeys = await redisService.keys(pattern);
      let cleaned = 0;

      for (const key of sessionKeys) {
        const ttl = await redisService.ttl(key);
        if (ttl === -2) {
          // Key doesn't exist or expired
          await redisService.del(key);
          cleaned++;
        }
      }

      console.log(`🧹 Cleaned up ${cleaned} expired sessions`);
      return cleaned;
    } catch (error) {
      console.error('Error cleaning up sessions:', error);
      return 0;
    }
  }

  /**
   * Get active sessions count
   * @returns {Promise<number>} Number of active sessions
   */
  async getActiveSessionsCount() {
    try {
      const pattern = `${this.sessionPrefix}:*`;
      const sessionKeys = await redisService.keys(pattern);
      return sessionKeys.length;
    } catch (error) {
      console.error('Error getting active sessions count:', error);
      return 0;
    }
  }

  /**
   * Check if user has active sessions
   * @param {string} userId - User ID
   * @returns {Promise<boolean>} Has active sessions
   */
  async hasActiveSessions(userId) {
    try {
      const sessions = await this.getUserSessions(userId);
      return sessions.length > 0;
    } catch (error) {
      console.error('Error checking active sessions:', error);
      return false;
    }
  }
}

module.exports = new SessionService();
