const { prisma } = require('../src/config/database');
const BillingService = require('../src/services/billingService');
const VMService = require('../src/services/vmService');
const AuthService = require('../src/services/authService');

/**
 * Billing Service Tests
 * Tests usage tracking, cost calculation, and billing operations
 */

describe('Billing Service', () => {
  let testUser;
  let testVM;

  beforeAll(async () => {
    // Clean up existing test data
    await prisma.usageRecord.deleteMany({});
    await prisma.virtualMachine.deleteMany({});
    await prisma.user.deleteMany({
      where: { email: 'billing-test@example.com' },
    });

    // Create test user
    const userResult = await AuthService.register({
      email: 'billing-test@example.com',
      password: 'TestPassword123!',
      firstName: 'Billing',
      lastName: 'Test',
    });

    testUser = userResult.user;

    // Verify user
    await prisma.user.update({
      where: { id: testUser.id },
      data: { isVerified: true },
    });

    // Create test VM
    testVM = await VMService.createVM(testUser.id, {
      name: 'billing-test-vm',
      description: 'VM for billing tests',
      cpu: 2,
      ram: 2048,
      storage: 40,
      bandwidth: 1000,
      dockerImage: 'ubuntu:latest',
    });
  });

  afterAll(async () => {
    // Clean up test data
    await prisma.usageRecord.deleteMany({});
    await prisma.virtualMachine.deleteMany({});
    await prisma.user.deleteMany({
      where: { email: 'billing-test@example.com' },
    });
    await prisma.$disconnect();
  });

  describe('Usage Recording', () => {
    it('should record usage for a VM', async () => {
      const usageData = {
        cpuUsage: 45.5,
        ramUsage: 1024,
        storageUsage: 20,
        bandwidthUsage: 500,
        duration: 60, // 60 minutes
      };

      const record = await BillingService.recordUsage(testVM.id, usageData);

      expect(record).toBeDefined();
      expect(record.vmId).toBe(testVM.id);
      expect(record.cpuUsage).toBe(45.5);
      expect(record.ramUsage).toBe(1024);
      expect(record.storageUsage).toBe(20);
      expect(record.bandwidthUsage).toBe(500);
      expect(record.duration).toBe(60);
      expect(record.cost).toBeGreaterThan(0);
    });

    it('should calculate cost correctly', async () => {
      const usageData = {
        cpuUsage: 50,
        ramUsage: 1024,
        storageUsage: 20,
        bandwidthUsage: 1000,
        duration: 60,
      };

      const record = await BillingService.recordUsage(testVM.id, usageData);

      // Cost should be positive and reasonable
      expect(record.cost).toBeGreaterThan(0);
      expect(record.cost).toBeLessThan(testVM.hourlyRate * 2); // Should not exceed 2x hourly rate
    });

    it('should reject usage recording for non-existent VM', async () => {
      const usageData = {
        cpuUsage: 50,
        ramUsage: 1024,
        storageUsage: 20,
        bandwidthUsage: 500,
        duration: 60,
      };

      await expect(
        BillingService.recordUsage('non-existent-id', usageData)
      ).rejects.toThrow('VM not found');
    });
  });

  describe('Usage Statistics', () => {
    beforeAll(async () => {
      // Create multiple usage records for testing
      const usageRecords = [
        { cpuUsage: 30, ramUsage: 800, storageUsage: 15, bandwidthUsage: 300, duration: 30 },
        { cpuUsage: 50, ramUsage: 1200, storageUsage: 20, bandwidthUsage: 500, duration: 45 },
        { cpuUsage: 70, ramUsage: 1600, storageUsage: 25, bandwidthUsage: 700, duration: 60 },
      ];

      for (const usage of usageRecords) {
        await BillingService.recordUsage(testVM.id, usage);
      }
    });

    it('should calculate usage statistics correctly', async () => {
      const stats = await BillingService.calculateUsageStatistics(testVM.id);

      expect(stats).toBeDefined();
      expect(stats.totalRecords).toBeGreaterThan(0);
      expect(stats.totalCost).toBeGreaterThan(0);
      expect(stats.totalDuration).toBeGreaterThan(0);
      expect(stats.averages).toBeDefined();
      expect(stats.averages.cpu).toBeGreaterThan(0);
      expect(stats.peaks).toBeDefined();
      expect(stats.peaks.cpu).toBeGreaterThanOrEqual(stats.averages.cpu);
    });

    it('should get VM usage with pagination', async () => {
      const result = await BillingService.getVMUsage(testVM.id, {
        page: 1,
        limit: 2,
      });

      expect(result).toBeDefined();
      expect(result.data).toBeInstanceOf(Array);
      expect(result.data.length).toBeLessThanOrEqual(2);
      expect(result.pagination).toBeDefined();
      expect(result.pagination.page).toBe(1);
      expect(result.pagination.limit).toBe(2);
      expect(result.statistics).toBeDefined();
    });

    it('should filter usage by date range', async () => {
      const startDate = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours ago
      const endDate = new Date();

      const result = await BillingService.getVMUsage(testVM.id, {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      });

      expect(result).toBeDefined();
      expect(result.data).toBeInstanceOf(Array);
      result.data.forEach((record) => {
        const recordDate = new Date(record.timestamp);
        expect(recordDate.getTime()).toBeGreaterThanOrEqual(startDate.getTime());
        expect(recordDate.getTime()).toBeLessThanOrEqual(endDate.getTime());
      });
    });
  });

  describe('User Usage', () => {
    it('should get total usage for user', async () => {
      const usage = await BillingService.getUserUsage(testUser.id);

      expect(usage).toBeDefined();
      expect(usage.totalCost).toBeGreaterThan(0);
      expect(usage.totalDuration).toBeGreaterThan(0);
      expect(usage.vmCount).toBeGreaterThan(0);
      expect(usage.vms).toBeInstanceOf(Array);
      expect(usage.vms.length).toBe(usage.vmCount);
    });

    it('should return zero usage for user with no VMs', async () => {
      // Create user without VMs
      const newUser = await AuthService.register({
        email: 'no-vms@example.com',
        password: 'TestPassword123!',
        firstName: 'No',
        lastName: 'VMs',
      });

      const usage = await BillingService.getUserUsage(newUser.user.id);

      expect(usage.totalCost).toBe(0);
      expect(usage.totalDuration).toBe(0);
      expect(usage.vmCount).toBe(0);
      expect(usage.vms).toEqual([]);

      // Cleanup
      await prisma.user.delete({ where: { id: newUser.user.id } });
    });

    it('should get usage summary with breakdown', async () => {
      const summary = await BillingService.getUsageSummary(testUser.id, {
        groupBy: 'day',
      });

      expect(summary).toBeDefined();
      expect(summary.summary).toBeDefined();
      expect(summary.summary.totalCost).toBeGreaterThan(0);
      expect(summary.breakdown).toBeInstanceOf(Array);
      expect(summary.vms).toBeInstanceOf(Array);
    });
  });

  describe('Usage Tracking', () => {
    it('should start usage tracking for running VM', async () => {
      // Start the VM first
      await VMService.startVM(testVM.id, testUser.id);
      await new Promise((resolve) => setTimeout(resolve, 2500)); // Wait for VM to start

      const result = await BillingService.startUsageTracking(testVM.id);

      expect(result.success).toBe(true);
      expect(result.message).toContain('started');
    });

    it('should reject tracking for non-running VM', async () => {
      // Stop the VM
      await VMService.stopVM(testVM.id, testUser.id);
      await new Promise((resolve) => setTimeout(resolve, 2000)); // Wait for VM to stop

      await expect(BillingService.startUsageTracking(testVM.id)).rejects.toThrow(
        'VM must be running'
      );
    });

    it('should stop usage tracking', async () => {
      const result = await BillingService.stopUsageTracking(testVM.id);

      expect(result.success).toBe(true);
      expect(result.message).toContain('stopped');
    });
  });

  describe('Cost Calculation', () => {
    it('should calculate cost based on usage', async () => {
      const params = {
        vm: {
          cpu: 2,
          ram: 2048,
          storage: 40,
          bandwidth: 1000,
          hourlyRate: 0.05,
        },
        cpuUsage: 50, // 50% CPU usage
        ramUsage: 1024, // 50% RAM usage
        storageUsage: 20, // 50% storage usage
        bandwidthUsage: 500, // 500 MB
        duration: 60, // 60 minutes
      };

      const cost = BillingService.calculateUsageCost(params);

      expect(cost).toBeGreaterThan(0);
      expect(cost).toBeLessThan(params.vm.hourlyRate * 2);
    });

    it('should calculate higher cost for higher usage', async () => {
      const lowUsageParams = {
        vm: {
          cpu: 2,
          ram: 2048,
          storage: 40,
          bandwidth: 1000,
          hourlyRate: 0.05,
        },
        cpuUsage: 20,
        ramUsage: 512,
        storageUsage: 10,
        bandwidthUsage: 100,
        duration: 60,
      };

      const highUsageParams = {
        ...lowUsageParams,
        cpuUsage: 80,
        ramUsage: 1800,
        storageUsage: 35,
        bandwidthUsage: 2000,
      };

      const lowCost = BillingService.calculateUsageCost(lowUsageParams);
      const highCost = BillingService.calculateUsageCost(highUsageParams);

      expect(highCost).toBeGreaterThan(lowCost);
    });

    it('should include bandwidth cost', async () => {
      const noBandwidthParams = {
        vm: {
          cpu: 2,
          ram: 2048,
          storage: 40,
          bandwidth: 1000,
          hourlyRate: 0.05,
        },
        cpuUsage: 50,
        ramUsage: 1024,
        storageUsage: 20,
        bandwidthUsage: 0,
        duration: 60,
      };

      const withBandwidthParams = {
        ...noBandwidthParams,
        bandwidthUsage: 5000, // 5 GB
      };

      const noBandwidthCost = BillingService.calculateUsageCost(noBandwidthParams);
      const withBandwidthCost = BillingService.calculateUsageCost(withBandwidthParams);

      expect(withBandwidthCost).toBeGreaterThan(noBandwidthCost);
    });
  });

  describe('Usage Breakdown', () => {
    it('should group usage by day', async () => {
      const breakdown = await BillingService.getUsageBreakdown(testUser.id, {
        groupBy: 'day',
      });

      expect(breakdown).toBeInstanceOf(Array);
      if (breakdown.length > 0) {
        expect(breakdown[0]).toHaveProperty('period');
        expect(breakdown[0]).toHaveProperty('cost');
        expect(breakdown[0]).toHaveProperty('duration');
        expect(breakdown[0]).toHaveProperty('bandwidth');
        expect(breakdown[0]).toHaveProperty('records');
      }
    });

    it('should group usage by hour', async () => {
      const breakdown = await BillingService.getUsageBreakdown(testUser.id, {
        groupBy: 'hour',
      });

      expect(breakdown).toBeInstanceOf(Array);
    });

    it('should group usage by month', async () => {
      const breakdown = await BillingService.getUsageBreakdown(testUser.id, {
        groupBy: 'month',
      });

      expect(breakdown).toBeInstanceOf(Array);
    });
  });

  describe('Current Usage Collection', () => {
    it('should return zero usage for stopped VM', async () => {
      const usage = await BillingService.collectCurrentUsage(testVM.id);

      expect(usage).toBeDefined();
      expect(usage.cpuUsage).toBe(0);
      expect(usage.ramUsage).toBe(0);
      expect(usage.storageUsage).toBe(0);
      expect(usage.bandwidthUsage).toBe(0);
    });

    it('should handle non-existent VM gracefully', async () => {
      await expect(
        BillingService.collectCurrentUsage('non-existent-id')
      ).rejects.toThrow('VM not found');
    });
  });

  describe('Bulk Usage Collection', () => {
    it('should collect usage for all running VMs', async () => {
      // Start VM for testing
      await VMService.startVM(testVM.id, testUser.id);
      await new Promise((resolve) => setTimeout(resolve, 2500));

      const results = await BillingService.collectAllRunningVMsUsage();

      expect(results).toBeDefined();
      expect(results.total).toBeGreaterThanOrEqual(0);
      expect(results.success).toBeGreaterThanOrEqual(0);
      expect(results.failed).toBeGreaterThanOrEqual(0);
      expect(results.errors).toBeInstanceOf(Array);

      // Stop VM
      await VMService.stopVM(testVM.id, testUser.id);
      await new Promise((resolve) => setTimeout(resolve, 2000));
    });

    it('should handle errors gracefully during bulk collection', async () => {
      const results = await BillingService.collectAllRunningVMsUsage();

      expect(results).toBeDefined();
      expect(results.total).toBeGreaterThanOrEqual(0);
    });
  });
});
