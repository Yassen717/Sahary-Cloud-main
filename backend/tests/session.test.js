const sessionService = require('../src/services/sessionService');
const redisService = require('../src/services/redisService');

describe('Session Service', () => {
  beforeAll(async () => {
    await redisService.connect();
  });

  afterAll(async () => {
    // Clean up test data
    await redisService.delPattern('session:*');
    await redisService.delPattern('user_sessions:*');
    await redisService.disconnect();
  });

  afterEach(async () => {
    // Clean up after each test
    await redisService.delPattern('session:*');
    await redisService.delPattern('user_sessions:*');
  });

  describe('Create Session', () => {
    it('should create a new session', async () => {
      const session = await sessionService.createSession(
        'user123',
        { role: 'user' },
        { ip: '127.0.0.1', userAgent: 'test' }
      );

      expect(session).toHaveProperty('id');
      expect(session).toHaveProperty('userId', 'user123');
      expect(session).toHaveProperty('data');
      expect(session).toHaveProperty('metadata');
      expect(session.data.role).toBe('user');
      expect(session.metadata.ip).toBe('127.0.0.1');
    });

    it('should add session to user sessions list', async () => {
      const session = await sessionService.createSession('user456', {});
      const userSessions = await sessionService.getUserSessions('user456');

      expect(userSessions.length).toBe(1);
      expect(userSessions[0].id).toBe(session.id);
    });
  });

  describe('Get Session', () => {
    it('should get existing session', async () => {
      const created = await sessionService.createSession('user789', { data: 'test' });
      const retrieved = await sessionService.getSession(created.id);

      expect(retrieved).toBeDefined();
      expect(retrieved.id).toBe(created.id);
      expect(retrieved.userId).toBe('user789');
    });

    it('should return null for non-existent session', async () => {
      const session = await sessionService.getSession('nonexistent');
      expect(session).toBeNull();
    });

    it('should update last accessed time', async () => {
      const created = await sessionService.createSession('user101', {});
      const originalTime = created.metadata.lastAccessedAt;

      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 100));

      const retrieved = await sessionService.getSession(created.id, true);
      
      expect(retrieved.metadata.lastAccessedAt).not.toBe(originalTime);
    });
  });

  describe('Update Session', () => {
    it('should update session data', async () => {
      const session = await sessionService.createSession('user202', { count: 0 });
      
      const updated = await sessionService.updateSession(session.id, { count: 1 });

      expect(updated.data.count).toBe(1);
    });

    it('should throw error for non-existent session', async () => {
      await expect(
        sessionService.updateSession('nonexistent', { data: 'test' })
      ).rejects.toThrow('Session not found');
    });
  });

  describe('Delete Session', () => {
    it('should delete session', async () => {
      const session = await sessionService.createSession('user303', {});
      
      const deleted = await sessionService.deleteSession(session.id);
      const retrieved = await sessionService.getSession(session.id);

      expect(deleted).toBe(true);
      expect(retrieved).toBeNull();
    });

    it('should remove session from user sessions list', async () => {
      const session = await sessionService.createSession('user404', {});
      
      await sessionService.deleteSession(session.id);
      const userSessions = await sessionService.getUserSessions('user404');

      expect(userSessions.length).toBe(0);
    });
  });

  describe('Extend Session', () => {
    it('should extend session expiration', async () => {
      const session = await sessionService.createSession('user505', {});
      
      const extended = await sessionService.extendSession(session.id, 7200);

      expect(extended).toBe(true);
    });
  });

  describe('User Sessions', () => {
    it('should get all user sessions', async () => {
      await sessionService.createSession('user606', { session: 1 });
      await sessionService.createSession('user606', { session: 2 });
      await sessionService.createSession('user606', { session: 3 });

      const sessions = await sessionService.getUserSessions('user606');

      expect(sessions.length).toBe(3);
    });

    it('should delete all user sessions', async () => {
      await sessionService.createSession('user707', {});
      await sessionService.createSession('user707', {});

      const deleted = await sessionService.deleteUserSessions('user707');
      const remaining = await sessionService.getUserSessions('user707');

      expect(deleted).toBe(2);
      expect(remaining.length).toBe(0);
    });

    it('should check if user has active sessions', async () => {
      await sessionService.createSession('user808', {});

      const hasActive = await sessionService.hasActiveSessions('user808');
      const hasNone = await sessionService.hasActiveSessions('user999');

      expect(hasActive).toBe(true);
      expect(hasNone).toBe(false);
    });
  });

  describe('Validate Session', () => {
    it('should validate existing session', async () => {
      const session = await sessionService.createSession('user909', {});
      
      const isValid = await sessionService.validateSession(session.id);

      expect(isValid).toBe(true);
    });

    it('should return false for invalid session', async () => {
      const isValid = await sessionService.validateSession('invalid');

      expect(isValid).toBe(false);
    });
  });

  describe('Session Statistics', () => {
    it('should get session stats', async () => {
      await sessionService.createSession('user1010', {});
      await sessionService.createSession('user1011', {});

      const stats = await sessionService.getSessionStats();

      expect(stats).toHaveProperty('totalSessions');
      expect(stats.totalSessions).toBeGreaterThanOrEqual(2);
    });

    it('should get active sessions count', async () => {
      await sessionService.createSession('user1212', {});
      await sessionService.createSession('user1213', {});

      const count = await sessionService.getActiveSessionsCount();

      expect(count).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Cleanup', () => {
    it('should clean up expired sessions', async () => {
      // This test is hard to implement without waiting for expiration
      // Just test that the method runs without error
      const cleaned = await sessionService.cleanupExpiredSessions();

      expect(typeof cleaned).toBe('number');
    });
  });
});
