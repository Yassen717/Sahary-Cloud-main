const securityMonitorService = require('../src/services/securityMonitorService');

describe('Security Monitoring Service', () => {
  beforeEach(() => {
    // Clear events before each test
    securityMonitorService.securityEvents = [];
    securityMonitorService.suspiciousActivities.clear();
  });

  describe('Log Security Events', () => {
    it('should log security event', async () => {
      const event = await securityMonitorService.logSecurityEvent({
        type: 'TEST_EVENT',
        severity: 'INFO',
        description: 'Test event',
        ip: '127.0.0.1',
      });

      expect(event).toHaveProperty('type', 'TEST_EVENT');
      expect(event).toHaveProperty('severity', 'INFO');
      expect(event).toHaveProperty('timestamp');
    });

    it('should log failed login', async () => {
      await securityMonitorService.logFailedLogin({
        ip: '127.0.0.1',
        email: 'test@example.com',
        reason: 'Invalid password',
      });

      const events = securityMonitorService.getSecurityEvents({ type: 'FAILED_LOGIN' });
      expect(events.length).toBe(1);
      expect(events[0].severity).toBe('MEDIUM');
    });

    it('should log successful login', async () => {
      await securityMonitorService.logSuccessfulLogin({
        ip: '127.0.0.1',
        userId: 'user123',
      });

      const events = securityMonitorService.getSecurityEvents({ type: 'SUCCESSFUL_LOGIN' });
      expect(events.length).toBe(1);
      expect(events[0].severity).toBe('INFO');
    });

    it('should log unauthorized access', async () => {
      await securityMonitorService.logUnauthorizedAccess({
        ip: '127.0.0.1',
        userId: 'user123',
        resource: '/admin',
        action: 'GET',
      });

      const events = securityMonitorService.getSecurityEvents({ type: 'UNAUTHORIZED_ACCESS' });
      expect(events.length).toBe(1);
      expect(events[0].severity).toBe('HIGH');
    });

    it('should log suspicious activity', async () => {
      await securityMonitorService.logSuspiciousActivity({
        ip: '127.0.0.1',
        description: 'Multiple failed attempts',
      });

      const events = securityMonitorService.getSecurityEvents({ type: 'SUSPICIOUS_ACTIVITY' });
      expect(events.length).toBe(1);
      expect(events[0].severity).toBe('HIGH');
    });
  });

  describe('Get Security Events', () => {
    beforeEach(async () => {
      await securityMonitorService.logSecurityEvent({
        type: 'TEST_EVENT_1',
        severity: 'INFO',
        description: 'Test 1',
      });
      await securityMonitorService.logSecurityEvent({
        type: 'TEST_EVENT_2',
        severity: 'HIGH',
        description: 'Test 2',
      });
      await securityMonitorService.logSecurityEvent({
        type: 'TEST_EVENT_1',
        severity: 'CRITICAL',
        description: 'Test 3',
      });
    });

    it('should get all events', () => {
      const events = securityMonitorService.getSecurityEvents();
      expect(events.length).toBe(3);
    });

    it('should filter by type', () => {
      const events = securityMonitorService.getSecurityEvents({ type: 'TEST_EVENT_1' });
      expect(events.length).toBe(2);
    });

    it('should filter by severity', () => {
      const events = securityMonitorService.getSecurityEvents({ severity: 'HIGH' });
      expect(events.length).toBe(1);
    });

    it('should limit results', () => {
      const events = securityMonitorService.getSecurityEvents({ limit: 2 });
      expect(events.length).toBe(2);
    });
  });

  describe('Security Statistics', () => {
    beforeEach(async () => {
      await securityMonitorService.logSecurityEvent({
        type: 'TYPE_A',
        severity: 'INFO',
        description: 'Test',
      });
      await securityMonitorService.logSecurityEvent({
        type: 'TYPE_A',
        severity: 'HIGH',
        description: 'Test',
      });
      await securityMonitorService.logSecurityEvent({
        type: 'TYPE_B',
        severity: 'CRITICAL',
        description: 'Test',
      });
    });

    it('should get security stats', () => {
      const stats = securityMonitorService.getSecurityStats();

      expect(stats.total).toBe(3);
      expect(stats.bySeverity.INFO).toBe(1);
      expect(stats.bySeverity.HIGH).toBe(1);
      expect(stats.bySeverity.CRITICAL).toBe(1);
      expect(stats.byType.TYPE_A).toBe(2);
      expect(stats.byType.TYPE_B).toBe(1);
    });
  });

  describe('Suspicious Activities', () => {
    it('should track suspicious activities', async () => {
      const ip = '192.168.1.1';

      for (let i = 0; i < 3; i++) {
        await securityMonitorService.logSecurityEvent({
          type: 'SUSPICIOUS',
          severity: 'HIGH',
          description: 'Suspicious activity',
          ip,
        });
      }

      const activities = securityMonitorService.getSuspiciousActivities();
      expect(activities.length).toBeGreaterThan(0);
      expect(activities[0].identifier).toBe(ip);
      expect(activities[0].eventCount).toBe(3);
    });
  });

  describe('Security Health', () => {
    it('should return healthy status with no critical events', () => {
      const health = securityMonitorService.getSecurityHealth();

      expect(health.status).toBe('healthy');
      expect(health.criticalEvents).toBe(0);
    });

    it('should return critical status with critical events', async () => {
      await securityMonitorService.logSecurityEvent({
        type: 'CRITICAL_EVENT',
        severity: 'CRITICAL',
        description: 'Critical event',
      });

      const health = securityMonitorService.getSecurityHealth();

      expect(health.status).toBe('critical');
      expect(health.criticalEvents).toBe(1);
    });

    it('should return warning status with many high severity events', async () => {
      for (let i = 0; i < 6; i++) {
        await securityMonitorService.logSecurityEvent({
          type: 'HIGH_EVENT',
          severity: 'HIGH',
          description: 'High severity event',
        });
      }

      const health = securityMonitorService.getSecurityHealth();

      expect(health.status).toBe('warning');
      expect(health.highSeverityEvents).toBeGreaterThanOrEqual(6);
    });
  });

  describe('Security Report', () => {
    beforeEach(async () => {
      await securityMonitorService.logSecurityEvent({
        type: 'EVENT_A',
        severity: 'INFO',
        description: 'Test',
        ip: '192.168.1.1',
      });
      await securityMonitorService.logSecurityEvent({
        type: 'EVENT_B',
        severity: 'HIGH',
        description: 'Test',
        ip: '192.168.1.1',
      });
      await securityMonitorService.logSecurityEvent({
        type: 'EVENT_A',
        severity: 'CRITICAL',
        description: 'Test',
        ip: '192.168.1.2',
      });
    });

    it('should generate security report', () => {
      const report = securityMonitorService.generateSecurityReport({ period: 'day' });

      expect(report).toHaveProperty('period', 'day');
      expect(report).toHaveProperty('totalEvents', 3);
      expect(report).toHaveProperty('bySeverity');
      expect(report).toHaveProperty('byType');
      expect(report).toHaveProperty('topIPs');
    });

    it('should include top IPs in report', () => {
      const report = securityMonitorService.generateSecurityReport();

      expect(report.topIPs['192.168.1.1']).toBe(2);
      expect(report.topIPs['192.168.1.2']).toBe(1);
    });
  });

  describe('Clear Old Events', () => {
    it('should clear old events', async () => {
      await securityMonitorService.logSecurityEvent({
        type: 'OLD_EVENT',
        severity: 'INFO',
        description: 'Old event',
      });

      // Manually set old timestamp
      securityMonitorService.securityEvents[0].timestamp = new Date(Date.now() - 100000000);

      securityMonitorService.clearOldEvents(1000);

      expect(securityMonitorService.securityEvents.length).toBe(0);
    });
  });
});
