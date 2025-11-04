const solarAlertService = require('../src/services/solarAlertService');
const { PrismaClient } = require('@prisma/client');

// Mock Prisma
jest.mock('@prisma/client', () => {
  const mockPrisma = {
    solarAlert: {
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      findMany: jest.fn(),
    },
    emergencyLog: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
    systemStatus: {
      create: jest.fn(),
    },
    virtualMachine: {
      findMany: jest.fn(),
    },
    user: {
      findMany: jest.fn(),
    },
  };
  return {
    PrismaClient: jest.fn(() => mockPrisma),
  };
});

// Mock email service
jest.mock('../src/services/emailService', () => ({
  sendEmail: jest.fn().mockResolvedValue(true),
}));

const prisma = new PrismaClient();
const emailService = require('../src/services/emailService');

describe('Solar Alert Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    solarAlertService.currentState = 'NORMAL';
    solarAlertService.activeAlerts.clear();
  });

  describe('monitorEnergyLevels', () => {
    it('should create low production warning', async () => {
      const mockAlert = {
        id: '1',
        type: 'LOW_PRODUCTION',
        severity: 'WARNING',
        message: 'إنتاج الطاقة الشمسية منخفض: 15.0%',
        resolved: false,
        createdAt: new Date()
      };

      prisma.solarAlert.create.mockResolvedValue(mockAlert);
      prisma.user.findMany.mockResolvedValue([]);

      const result = await solarAlertService.monitorEnergyLevels({
        production: 15,
        consumption: 10,
        batteryLevel: 80,
        capacity: 100
      });

      expect(result.alerts.length).toBeGreaterThan(0);
      expect(result.alerts[0].type).toBe('LOW_PRODUCTION');
      expect(result.state).toBe('WARNING');
    });

    it('should create critical low production alert', async () => {
      const mockAlert = {
        id: '1',
        type: 'CRITICAL_LOW_PRODUCTION',
        severity: 'CRITICAL',
        message: 'إنتاج الطاقة الشمسية منخفض جداً: 5.0%',
        resolved: false,
        createdAt: new Date()
      };

      prisma.solarAlert.create.mockResolvedValue(mockAlert);
      prisma.user.findMany.mockResolvedValue([]);
      prisma.systemStatus.create.mockResolvedValue({});
      prisma.emergencyLog.create.mockResolvedValue({});
      prisma.virtualMachine.findMany.mockResolvedValue([]);

      const result = await solarAlertService.monitorEnergyLevels({
        production: 5,
        consumption: 10,
        batteryLevel: 80,
        capacity: 100
      });

      expect(result.alerts.length).toBeGreaterThan(0);
      expect(result.alerts[0].severity).toBe('CRITICAL');
      expect(result.state).toBe('CRITICAL');
    });

    it('should create low battery warning', async () => {
      const mockAlert = {
        id: '1',
        type: 'LOW_BATTERY',
        severity: 'WARNING',
        message: 'مستوى البطارية منخفض: 25%',
        resolved: false,
        createdAt: new Date()
      };

      prisma.solarAlert.create.mockResolvedValue(mockAlert);
      prisma.user.findMany.mockResolvedValue([]);

      const result = await solarAlertService.monitorEnergyLevels({
        production: 50,
        consumption: 40,
        batteryLevel: 25,
        capacity: 100
      });

      expect(result.alerts.length).toBeGreaterThan(0);
      expect(result.alerts[0].type).toBe('LOW_BATTERY');
    });

    it('should create high consumption warning', async () => {
      const mockAlert = {
        id: '1',
        type: 'HIGH_CONSUMPTION',
        severity: 'WARNING',
        message: 'استهلاك الطاقة مرتفع: 95.0%',
        resolved: false,
        createdAt: new Date()
      };

      prisma.solarAlert.create.mockResolvedValue(mockAlert);
      prisma.user.findMany.mockResolvedValue([]);

      const result = await solarAlertService.monitorEnergyLevels({
        production: 100,
        consumption: 95,
        batteryLevel: 80,
        capacity: 100
      });

      expect(result.alerts.length).toBeGreaterThan(0);
      expect(result.alerts[0].type).toBe('HIGH_CONSUMPTION');
    });

    it('should not create alerts when levels are normal', async () => {
      const result = await solarAlertService.monitorEnergyLevels({
        production: 80,
        consumption: 60,
        batteryLevel: 85,
        capacity: 100
      });

      expect(result.alerts.length).toBe(0);
      expect(result.state).toBe('NORMAL');
    });
  });

  describe('createAlert', () => {
    it('should create and store an alert', async () => {
      const mockAlert = {
        id: '1',
        type: 'LOW_PRODUCTION',
        severity: 'WARNING',
        message: 'Test alert',
        data: '{}',
        resolved: false,
        createdAt: new Date()
      };

      prisma.solarAlert.create.mockResolvedValue(mockAlert);

      const alert = await solarAlertService.createAlert({
        type: 'LOW_PRODUCTION',
        severity: 'WARNING',
        message: 'Test alert',
        data: {}
      });

      expect(alert).toEqual(mockAlert);
      expect(prisma.solarAlert.create).toHaveBeenCalled();
    });

    it('should send notifications for critical alerts', async () => {
      const mockAlert = {
        id: '1',
        type: 'CRITICAL_LOW_PRODUCTION',
        severity: 'CRITICAL',
        message: 'Critical alert',
        data: '{}',
        resolved: false,
        createdAt: new Date()
      };

      const mockAdmins = [
        { id: '1', email: 'admin1@test.com', role: 'ADMIN', isActive: true },
        { id: '2', email: 'admin2@test.com', role: 'SUPER_ADMIN', isActive: true }
      ];

      prisma.solarAlert.create.mockResolvedValue(mockAlert);
      prisma.user.findMany.mockResolvedValue(mockAdmins);

      await solarAlertService.createAlert({
        type: 'CRITICAL_LOW_PRODUCTION',
        severity: 'CRITICAL',
        message: 'Critical alert',
        data: {}
      });

      expect(emailService.sendEmail).toHaveBeenCalledTimes(2);
    });

    it('should not create duplicate active alerts', async () => {
      const mockAlert = {
        id: '1',
        type: 'LOW_PRODUCTION',
        severity: 'WARNING',
        message: 'Test alert',
        resolved: false,
        createdAt: new Date()
      };

      prisma.solarAlert.create.mockResolvedValue(mockAlert);

      // Create first alert
      const alert1 = await solarAlertService.createAlert({
        type: 'LOW_PRODUCTION',
        severity: 'WARNING',
        message: 'Test alert',
        data: {}
      });

      // Try to create duplicate
      const alert2 = await solarAlertService.createAlert({
        type: 'LOW_PRODUCTION',
        severity: 'WARNING',
        message: 'Test alert',
        data: {}
      });

      expect(alert1).toEqual(alert2);
      expect(prisma.solarAlert.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('resolveAlert', () => {
    it('should resolve an alert', async () => {
      const mockAlert = {
        id: '1',
        type: 'LOW_PRODUCTION',
        severity: 'WARNING',
        message: 'Test alert',
        resolved: true,
        resolvedAt: new Date()
      };

      prisma.solarAlert.update.mockResolvedValue(mockAlert);

      const result = await solarAlertService.resolveAlert('1');

      expect(result.resolved).toBe(true);
      expect(result.resolvedAt).toBeDefined();
      expect(prisma.solarAlert.update).toHaveBeenCalledWith({
        where: { id: '1' },
        data: {
          resolved: true,
          resolvedAt: expect.any(Date)
        }
      });
    });

    it('should handle resolve errors', async () => {
      prisma.solarAlert.update.mockRejectedValue(new Error('Database error'));

      await expect(solarAlertService.resolveAlert('1')).rejects.toThrow('Failed to resolve alert');
    });
  });

  describe('getActiveAlerts', () => {
    it('should fetch active alerts from database', async () => {
      const mockAlerts = [
        {
          id: '1',
          type: 'LOW_PRODUCTION',
          severity: 'WARNING',
          message: 'Alert 1',
          resolved: false,
          createdAt: new Date()
        },
        {
          id: '2',
          type: 'LOW_BATTERY',
          severity: 'WARNING',
          message: 'Alert 2',
          resolved: false,
          createdAt: new Date()
        }
      ];

      prisma.solarAlert.findMany.mockResolvedValue(mockAlerts);

      const alerts = await solarAlertService.getActiveAlerts();

      expect(alerts).toEqual(mockAlerts);
      expect(alerts.length).toBe(2);
    });

    it('should return in-memory alerts on database error', async () => {
      prisma.solarAlert.findMany.mockRejectedValue(new Error('Database error'));

      solarAlertService.activeAlerts.set('TEST', {
        id: '1',
        type: 'TEST',
        severity: 'WARNING',
        message: 'Test',
        resolved: false
      });

      const alerts = await solarAlertService.getActiveAlerts();

      expect(alerts.length).toBe(1);
      expect(alerts[0].type).toBe('TEST');
    });
  });

  describe('switchToBackupPower', () => {
    it('should switch to backup power', async () => {
      prisma.systemStatus.create.mockResolvedValue({});

      const result = await solarAlertService.switchToBackupPower();

      expect(result.success).toBe(true);
      expect(result.message).toContain('backup power');
      expect(prisma.systemStatus.create).toHaveBeenCalled();
    });
  });

  describe('prepareBackupPower', () => {
    it('should prepare backup power system', async () => {
      prisma.systemStatus.create.mockResolvedValue({});

      const result = await solarAlertService.prepareBackupPower();

      expect(result.success).toBe(true);
      expect(result.message).toContain('ready');
    });
  });

  describe('reduceNonEssentialLoad', () => {
    it('should identify non-essential VMs', async () => {
      const mockVMs = [
        { id: '1', status: 'RUNNING', priority: 'LOW', user: {} },
        { id: '2', status: 'RUNNING', priority: 'HIGH', user: {} },
        { id: '3', status: 'RUNNING', priority: 'LOW', user: {} }
      ];

      prisma.virtualMachine.findMany.mockResolvedValue(mockVMs);
      prisma.emergencyLog.create.mockResolvedValue({});

      const result = await solarAlertService.reduceNonEssentialLoad();

      expect(result.success).toBe(true);
      expect(result.vmCount).toBe(2); // 2 low priority VMs
    });
  });

  describe('resetToNormalState', () => {
    it('should reset system to normal state', async () => {
      solarAlertService.currentState = 'CRITICAL';
      solarAlertService.activeAlerts.set('TEST', { id: '1', type: 'TEST' });

      prisma.solarAlert.updateMany.mockResolvedValue({});
      prisma.systemStatus.create.mockResolvedValue({});

      const result = await solarAlertService.resetToNormalState();

      expect(result.success).toBe(true);
      expect(solarAlertService.currentState).toBe('NORMAL');
      expect(solarAlertService.activeAlerts.size).toBe(0);
    });
  });

  describe('getEmergencyLogs', () => {
    it('should fetch emergency logs', async () => {
      const mockLogs = [
        {
          id: '1',
          severity: 'CRITICAL',
          action: 'Emergency plan activated',
          timestamp: new Date()
        }
      ];

      prisma.emergencyLog.findMany.mockResolvedValue(mockLogs);

      const logs = await solarAlertService.getEmergencyLogs({ limit: 50 });

      expect(logs).toEqual(mockLogs);
      expect(prisma.emergencyLog.findMany).toHaveBeenCalled();
    });

    it('should filter by severity', async () => {
      prisma.emergencyLog.findMany.mockResolvedValue([]);

      await solarAlertService.getEmergencyLogs({ severity: 'CRITICAL' });

      expect(prisma.emergencyLog.findMany).toHaveBeenCalledWith({
        where: { severity: 'CRITICAL' },
        orderBy: { timestamp: 'desc' },
        take: 50
      });
    });
  });

  describe('getCurrentState', () => {
    it('should return current system state', () => {
      solarAlertService.currentState = 'WARNING';

      const state = solarAlertService.getCurrentState();

      expect(state).toBe('WARNING');
    });
  });
});
