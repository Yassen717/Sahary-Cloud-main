const solarService = require('../src/services/solarService');
const { PrismaClient } = require('@prisma/client');

// Mock Prisma
jest.mock('@prisma/client', () => {
  const mockPrisma = {
    virtualMachine: {
      findMany: jest.fn(),
    },
    solarData: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
  };
  return {
    PrismaClient: jest.fn(() => mockPrisma),
  };
});

// Mock axios
jest.mock('axios');
const axios = require('axios');

const prisma = new PrismaClient();

describe('Solar Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('calculateEfficiency', () => {
    it('should calculate efficiency correctly', () => {
      const efficiency = solarService.calculateEfficiency(100, 80);
      expect(efficiency).toBe(80);
    });

    it('should return 0 when production is 0', () => {
      const efficiency = solarService.calculateEfficiency(0, 50);
      expect(efficiency).toBe(0);
    });

    it('should cap efficiency at 100%', () => {
      const efficiency = solarService.calculateEfficiency(50, 100);
      expect(efficiency).toBe(100);
    });
  });

  describe('calculateEnvironmentalImpact', () => {
    it('should calculate CO2 savings correctly', () => {
      const impact = solarService.calculateEnvironmentalImpact(100);
      
      expect(impact.co2Saved).toBe(50); // 100 * 0.5
      expect(impact.solarEnergyUsed).toBe(100);
      expect(impact.treesEquivalent).toBeGreaterThan(0);
    });

    it('should return zero impact for zero energy', () => {
      const impact = solarService.calculateEnvironmentalImpact(0);
      
      expect(impact.co2Saved).toBe(0);
      expect(impact.solarEnergyUsed).toBe(0);
      expect(impact.treesEquivalent).toBe(0);
    });
  });

  describe('getCurrentConsumption', () => {
    it('should calculate consumption from active VMs', async () => {
      const mockVMs = [
        {
          id: '1',
          cpu: 4,
          ram: 8192,
          status: 'RUNNING',
          usageRecords: []
        },
        {
          id: '2',
          cpu: 2,
          ram: 4096,
          status: 'RUNNING',
          usageRecords: []
        }
      ];

      prisma.virtualMachine.findMany.mockResolvedValue(mockVMs);

      const consumption = await solarService.getCurrentConsumption();

      expect(consumption.vmCount).toBe(2);
      expect(consumption.consumption).toBeGreaterThan(0);
      expect(consumption.timestamp).toBeInstanceOf(Date);
    });

    it('should return zero consumption when no VMs are running', async () => {
      prisma.virtualMachine.findMany.mockResolvedValue([]);

      const consumption = await solarService.getCurrentConsumption();

      expect(consumption.vmCount).toBe(0);
      expect(consumption.consumption).toBe(0);
    });

    it('should handle database errors', async () => {
      prisma.virtualMachine.findMany.mockRejectedValue(new Error('Database error'));

      await expect(solarService.getCurrentConsumption()).rejects.toThrow('Failed to calculate energy consumption');
    });
  });

  describe('recordSolarData', () => {
    it('should record solar data successfully', async () => {
      const mockData = {
        production: 100,
        consumption: 80,
        efficiency: 80,
        timestamp: new Date()
      };

      prisma.solarData.create.mockResolvedValue(mockData);

      const result = await solarService.recordSolarData({
        production: 100,
        consumption: 80
      });

      expect(result).toEqual(mockData);
      expect(prisma.solarData.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          production: 100,
          consumption: 80,
          efficiency: 80
        })
      });
    });

    it('should handle recording errors', async () => {
      prisma.solarData.create.mockRejectedValue(new Error('Database error'));

      await expect(solarService.recordSolarData({
        production: 100,
        consumption: 80
      })).rejects.toThrow('Failed to record solar data');
    });
  });

  describe('getSolarDataByPeriod', () => {
    it('should fetch solar data for a period', async () => {
      const mockData = [
        {
          id: '1',
          production: 100,
          consumption: 80,
          efficiency: 80,
          timestamp: new Date()
        }
      ];

      prisma.solarData.findMany.mockResolvedValue(mockData);

      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');

      const result = await solarService.getSolarDataByPeriod(startDate, endDate);

      expect(result).toEqual(mockData);
      expect(prisma.solarData.findMany).toHaveBeenCalledWith({
        where: {
          timestamp: {
            gte: startDate,
            lte: endDate
          }
        },
        orderBy: {
          timestamp: 'desc'
        }
      });
    });
  });

  describe('getSolarStatistics', () => {
    it('should calculate statistics for a day', async () => {
      const mockData = [
        {
          production: 100,
          consumption: 80,
          efficiency: 80
        },
        {
          production: 120,
          consumption: 90,
          efficiency: 75
        }
      ];

      prisma.solarData.findMany.mockResolvedValue(mockData);

      const stats = await solarService.getSolarStatistics('day');

      expect(stats.totalProduction).toBe(220);
      expect(stats.totalConsumption).toBe(170);
      expect(stats.averageEfficiency).toBe(77.5);
      expect(stats.dataPoints).toBe(2);
      expect(stats.period).toBe('day');
      expect(stats.environmentalImpact).toBeDefined();
    });

    it('should return zero statistics when no data available', async () => {
      prisma.solarData.findMany.mockResolvedValue([]);

      const stats = await solarService.getSolarStatistics('day');

      expect(stats.totalProduction).toBe(0);
      expect(stats.totalConsumption).toBe(0);
      expect(stats.averageEfficiency).toBe(0);
      expect(stats.dataPoints).toBe(0);
    });

    it('should handle different period types', async () => {
      prisma.solarData.findMany.mockResolvedValue([]);

      await solarService.getSolarStatistics('week');
      await solarService.getSolarStatistics('month');

      expect(prisma.solarData.findMany).toHaveBeenCalledTimes(2);
    });
  });

  describe('getSystemStatus', () => {
    it('should return operational status when system is healthy', async () => {
      const mockProduction = { production: 100, timestamp: new Date() };
      const mockConsumption = { consumption: 80, vmCount: 5, timestamp: new Date() };

      jest.spyOn(solarService, 'getCurrentProduction').mockResolvedValue(mockProduction);
      jest.spyOn(solarService, 'getCurrentConsumption').mockResolvedValue(mockConsumption);
      jest.spyOn(solarService, 'getBatteryLevel').mockResolvedValue(85);

      const status = await solarService.getSystemStatus();

      expect(status.status).toBe('operational');
      expect(status.production).toBe(100);
      expect(status.consumption).toBe(80);
      expect(status.efficiency).toBe(80);
      expect(status.batteryLevel).toBe(85);
      expect(status.activeVMs).toBe(5);
    });

    it('should return warning status when production is zero', async () => {
      jest.spyOn(solarService, 'getCurrentProduction').mockResolvedValue({ production: 0, timestamp: new Date() });
      jest.spyOn(solarService, 'getCurrentConsumption').mockResolvedValue({ consumption: 80, vmCount: 5, timestamp: new Date() });
      jest.spyOn(solarService, 'getBatteryLevel').mockResolvedValue(85);

      const status = await solarService.getSystemStatus();

      expect(status.status).toBe('warning');
    });

    it('should return error status on failure', async () => {
      jest.spyOn(solarService, 'getCurrentProduction').mockRejectedValue(new Error('API error'));

      const status = await solarService.getSystemStatus();

      expect(status.status).toBe('error');
      expect(status.message).toBeDefined();
    });
  });

  describe('getSimulatedProduction', () => {
    it('should return zero production at night', () => {
      // Mock time to 2 AM
      jest.spyOn(Date.prototype, 'getHours').mockReturnValue(2);

      const production = solarService.getSimulatedProduction();

      expect(production.production).toBe(0);
      expect(production.timestamp).toBeInstanceOf(Date);
    });

    it('should return high production during peak hours', () => {
      // Mock time to 12 PM (noon)
      jest.spyOn(Date.prototype, 'getHours').mockReturnValue(12);

      const production = solarService.getSimulatedProduction();

      expect(production.production).toBeGreaterThanOrEqual(15);
      expect(production.production).toBeLessThanOrEqual(20);
    });

    it('should return moderate production during morning/evening', () => {
      // Mock time to 8 AM
      jest.spyOn(Date.prototype, 'getHours').mockReturnValue(8);

      const production = solarService.getSimulatedProduction();

      expect(production.production).toBeGreaterThanOrEqual(5);
      expect(production.production).toBeLessThanOrEqual(15);
    });
  });

  describe('collectAndRecordData', () => {
    it('should collect and record data successfully', async () => {
      const mockProduction = { production: 100, timestamp: new Date() };
      const mockConsumption = { consumption: 80, vmCount: 5, timestamp: new Date() };
      const mockRecorded = {
        id: '1',
        production: 100,
        consumption: 80,
        efficiency: 80,
        timestamp: new Date()
      };

      jest.spyOn(solarService, 'getCurrentProduction').mockResolvedValue(mockProduction);
      jest.spyOn(solarService, 'getCurrentConsumption').mockResolvedValue(mockConsumption);
      jest.spyOn(solarService, 'recordSolarData').mockResolvedValue(mockRecorded);

      const result = await solarService.collectAndRecordData();

      expect(result).toEqual(mockRecorded);
      expect(solarService.getCurrentProduction).toHaveBeenCalled();
      expect(solarService.getCurrentConsumption).toHaveBeenCalled();
      expect(solarService.recordSolarData).toHaveBeenCalledWith({
        production: 100,
        consumption: 80
      });
    });
  });
});
