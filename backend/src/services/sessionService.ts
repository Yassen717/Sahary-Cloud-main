const { v4: uuidv4 } = require('uuid');
const redisService = require('./redisService');

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }

  return 'Unknown error';
};

type SessionMetadata = Record<string, any> & {
  createdAt?: string;
  lastAccessedAt?: string;
};

type Session = {
  id: string;
  userId: string;
  data: Record<string, any>;
  metadata: SessionMetadata;
};

/**
 * Session Management Service
 * Handles user sessions with Redis
 */
class SessionService {
  sessionPrefix: string;

  userSessionsPrefix: string;

  defaultTTL: number;

  constructor() {
    this.sessionPrefix = 'session';
    this.userSessionsPrefix = 'user_sessions';
    this.defaultTTL = parseInt(process.env.SESSION_MAX_AGE || '', 10) || 86400; // 24 hours
  }

  /**
   * Create a new session
   */
  async createSession(userId: string, data: Record<string, any> = {}, metadata: SessionMetadata = {}): Promise<Session> {
    try {
      const sessionId = uuidv4();
      const session: Session = {
        id: sessionId,
        userId,
        data,
        metadata: {
          ...metadata,
          createdAt: new Date().toISOString(),
          lastAccessedAt: new Date().toISOString(),
        },
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
   */
  async getSession(sessionId: string, updateAccess = true): Promise<Session | null> {
    try {
      const session: Session | null = await redisService.getSession(sessionId);

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
   */
  async updateSession(sessionId: string, data: Record<string, any>): Promise<Session> {
    try {
      const session = await this.getSession(sessionId, false);

      if (!session) {
        throw new Error('Session not found');
      }

      session.data = {
        ...session.data,
        ...data,
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
   */
  async deleteSession(sessionId: string): Promise<boolean> {
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
   */
  async extendSession(sessionId: string, ttl: number | null = null): Promise<boolean> {
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
   */
  async addUserSession(userId: string, sessionId: string): Promise<void> {
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
   */
  async removeUserSession(userId: string, sessionId: string): Promise<void> {
    try {
      const key = `${this.userSessionsPrefix}:${userId}`;
      await redisService.sRem(key, sessionId);
    } catch (error) {
      console.error('Error removing user session:', error);
    }
  }

  /**
   * Get all sessions for a user
   */
  async getUserSessions(userId: string): Promise<Session[]> {
    try {
      const key = `${this.userSessionsPrefix}:${userId}`;
      const sessionIds = await redisService.sMembers(key);

      const sessions: Session[] = [];
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
   */
  async deleteUserSessions(userId: string): Promise<number> {
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
   */
  async validateSession(sessionId: string): Promise<boolean> {
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
   */
  async getSessionStats(): Promise<Record<string, any>> {
    try {
      const pattern = `${this.sessionPrefix}:*`;
      const sessionKeys = await redisService.keys(pattern);

      return {
        totalSessions: sessionKeys.length,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      console.error('Error getting session stats:', error);
      return {
        totalSessions: 0,
        error: getErrorMessage(error),
      };
    }
  }

  /**
   * Clean up expired sessions (maintenance task)
   */
  async cleanupExpiredSessions(): Promise<number> {
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
   */
  async getActiveSessionsCount(): Promise<number> {
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
   */
  async hasActiveSessions(userId: string): Promise<boolean> {
    try {
      const sessions = await this.getUserSessions(userId);
      return sessions.length > 0;
    } catch (error) {
      console.error('Error checking active sessions:', error);
      return false;
    }
  }
}

// Export singleton instance (module.exports shape preserved via export =)
const sessionService = new SessionService();

export = sessionService;
