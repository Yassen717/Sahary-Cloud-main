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


describe('Invoice Generation', () => {
  let testInvoice;

  beforeAll(async () => {
    // Create some usage records for invoice generation
    const usageRecords = [
      { cpuUsage: 40, ramUsage: 1000, storageUsage: 18, bandwidthUsage: 400, duration: 60 },
      { cpuUsage: 55, ramUsage: 1300, storageUsage: 22, bandwidthUsage: 600, duration: 60 },
      { cpuUsage: 65, ramUsage: 1500, storageUsage: 25, bandwidthUsage: 800, duration: 60 },
    ];

    for (const usage of usageRecords) {
      await BillingService.recordUsage(testVM.id, usage);
    }
  });

  describe('Monthly Invoice Generation', () => {
    it('should generate monthly invoice for user', async () => {
      const now = new Date();
      const invoice = await BillingService.generateMonthlyInvoice(testUser.id, {
        month: now.getMonth(),
        year: now.getFullYear(),
      });

      expect(invoice).toBeDefined();
      expect(invoice.invoiceNumber).toMatch(/^INV-\d{6}-\d{4}$/);
      expect(invoice.userId).toBe(testUser.id);
      expect(invoice.status).toBe('PENDING');
      expect(invoice.subtotal).toBeGreaterThan(0);
      expect(invoice.taxAmount).toBeGreaterThan(0);
      expect(invoice.total).toBeGreaterThan(invoice.subtotal);
      expect(invoice.items).toBeInstanceOf(Array);
      expect(invoice.items.length).toBeGreaterThan(0);

      testInvoice = invoice;
    });

    it('should not generate duplicate invoice for same period', async () => {
      const now = new Date();
      await expect(
        BillingService.generateMonthlyInvoice(testUser.id, {
          month: now.getMonth(),
          year: now.getFullYear(),
        })
      ).rejects.toThrow('already exists');
    });

    it('should reject invoice generation for period with no usage', async () => {
      // Try to generate invoice for future month
      const futureDate = new Date();
      futureDate.setMonth(futureDate.getMonth() + 2);

      await expect(
        BillingService.generateMonthlyInvoice(testUser.id, {
          month: futureDate.getMonth(),
          year: futureDate.getFullYear(),
        })
      ).rejects.toThrow('No usage found');
    });

    it('should generate unique invoice numbers', async () => {
      const invoiceNumber1 = await BillingService.generateInvoiceNumber();
      const invoiceNumber2 = await BillingService.generateInvoiceNumber();

      expect(invoiceNumber1).toBeDefined();
      expect(invoiceNumber2).toBeDefined();
      expect(invoiceNumber1).toMatch(/^INV-\d{6}-\d{4}$/);
      expect(invoiceNumber2).toMatch(/^INV-\d{6}-\d{4}$/);
    });
  });

  describe('Invoice Retrieval', () => {
    it('should get invoice by ID', async () => {
      const invoice = await BillingService.getInvoiceById(testInvoice.id, testUser.id);

      expect(invoice).toBeDefined();
      expect(invoice.id).toBe(testInvoice.id);
      expect(invoice.user).toBeDefined();
      expect(invoice.items).toBeInstanceOf(Array);
    });

    it('should return null for non-existent invoice', async () => {
      const invoice = await BillingService.getInvoiceById('non-existent-id', testUser.id);

      expect(invoice).toBeNull();
    });

    it('should get user invoices with pagination', async () => {
      const result = await BillingService.getUserInvoices(testUser.id, {
        page: 1,
        limit: 10,
      });

      expect(result).toBeDefined();
      expect(result.data).toBeInstanceOf(Array);
      expect(result.data.length).toBeGreaterThan(0);
      expect(result.pagination).toBeDefined();
      expect(result.pagination.page).toBe(1);
    });

    it('should filter invoices by status', async () => {
      const result = await BillingService.getUserInvoices(testUser.id, {
        status: 'PENDING',
      });

      expect(result.data).toBeInstanceOf(Array);
      result.data.forEach((invoice) => {
        expect(invoice.status).toBe('PENDING');
      });
    });
  });

  describe('Discount Application', () => {
    it('should apply fixed discount to invoice', async () => {
      const originalTotal = testInvoice.total;

      const updatedInvoice = await BillingService.applyDiscount(testInvoice.id, {
        discountAmount: 5.0,
        reason: 'Test discount',
      });

      expect(updatedInvoice.discountAmount).toBe(5.0);
      expect(updatedInvoice.total).toBeLessThan(originalTotal);
      expect(updatedInvoice.discountReason).toBe('Test discount');
    });

    it('should apply percentage discount to invoice', async () => {
      // Create new invoice for this test
      const newUser = await AuthService.register({
        email: 'discount-test@example.com',
        password: 'TestPassword123!',
        firstName: 'Discount',
        lastName: 'Test',
      });

      await prisma.user.update({
        where: { id: newUser.user.id },
        data: { isVerified: true },
      });

      const newVM = await VMService.createVM(newUser.user.id, {
        name: 'discount-test-vm',
        cpu: 1,
        ram: 1024,
        storage: 20,
      });

      await BillingService.recordUsage(newVM.id, {
        cpuUsage: 50,
        ramUsage: 512,
        storageUsage: 10,
        bandwidthUsage: 200,
        duration: 60,
      });

      const now = new Date();
      const invoice = await BillingService.generateMonthlyInvoice(newUser.user.id, {
        month: now.getMonth(),
        year: now.getFullYear(),
      });

      const originalSubtotal = invoice.subtotal;

      const updatedInvoice = await BillingService.applyDiscount(invoice.id, {
        discountPercentage: 10,
        discountCode: 'TEST10',
        reason: '10% discount',
      });

      const expectedDiscount = originalSubtotal * 0.1;
      expect(updatedInvoice.discountAmount).toBeCloseTo(expectedDiscount, 2);
      expect(updatedInvoice.discountCode).toBe('TEST10');

      // Cleanup
      await prisma.invoice.delete({ where: { id: invoice.id } });
      await prisma.virtualMachine.delete({ where: { id: newVM.id } });
      await prisma.user.delete({ where: { id: newUser.user.id } });
    });

    it('should reject discount exceeding subtotal', async () => {
      await expect(
        BillingService.applyDiscount(testInvoice.id, {
          discountAmount: testInvoice.subtotal + 100,
        })
      ).rejects.toThrow('cannot exceed subtotal');
    });

    it('should reject discount on non-pending invoice', async () => {
      // Update invoice status
      await BillingService.updateInvoiceStatus(testInvoice.id, 'PAID');

      await expect(
        BillingService.applyDiscount(testInvoice.id, {
          discountAmount: 5.0,
        })
      ).rejects.toThrow('pending invoices');

      // Revert status
      await BillingService.updateInvoiceStatus(testInvoice.id, 'PENDING');
    });
  });

  describe('Invoice Status Management', () => {
    it('should update invoice status to PAID', async () => {
      const updatedInvoice = await BillingService.updateInvoiceStatus(
        testInvoice.id,
        'PAID'
      );

      expect(updatedInvoice.status).toBe('PAID');
      expect(updatedInvoice.paidAt).toBeDefined();
    });

    it('should update invoice status to CANCELLED', async () => {
      // Revert to PENDING first
      await BillingService.updateInvoiceStatus(testInvoice.id, 'PENDING');

      const updatedInvoice = await BillingService.updateInvoiceStatus(
        testInvoice.id,
        'CANCELLED'
      );

      expect(updatedInvoice.status).toBe('CANCELLED');
    });

    it('should reject invalid status', async () => {
      await expect(
        BillingService.updateInvoiceStatus(testInvoice.id, 'INVALID_STATUS')
      ).rejects.toThrow('Invalid status');
    });
  });

  describe('Batch Invoice Generation', () => {
    it('should generate invoices for all users', async () => {
      const now = new Date();
      const results = await BillingService.generateAllMonthlyInvoices({
        month: now.getMonth() - 1,
        year: now.getFullYear(),
      });

      expect(results).toBeDefined();
      expect(results.total).toBeGreaterThanOrEqual(0);
      expect(results.success).toBeGreaterThanOrEqual(0);
      expect(results.failed).toBeGreaterThanOrEqual(0);
      expect(results.skipped).toBeGreaterThanOrEqual(0);
      expect(results.invoices).toBeInstanceOf(Array);
      expect(results.errors).toBeInstanceOf(Array);
    });
  });

  describe('Overdue Invoice Management', () => {
    it('should mark overdue invoices', async () => {
      // Create invoice with past due date
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 10);

      await prisma.invoice.update({
        where: { id: testInvoice.id },
        data: {
          status: 'PENDING',
          dueDate: pastDate,
        },
      });

      const results = await BillingService.markOverdueInvoices();

      expect(results).toBeDefined();
      expect(results.updated).toBeGreaterThanOrEqual(1);
      expect(results.timestamp).toBeDefined();

      // Verify invoice is marked as overdue
      const invoice = await BillingService.getInvoiceById(testInvoice.id);
      expect(invoice.status).toBe('OVERDUE');
    });
  });

  describe('Invoice Statistics', () => {
    it('should get invoice statistics for user', async () => {
      const stats = await BillingService.getInvoiceStatistics(testUser.id);

      expect(stats).toBeDefined();
      expect(stats.counts).toBeDefined();
      expect(stats.counts.total).toBeGreaterThan(0);
      expect(stats.amounts).toBeDefined();
      expect(stats.amounts.totalRevenue).toBeGreaterThanOrEqual(0);
    });

    it('should get global invoice statistics', async () => {
      const stats = await BillingService.getInvoiceStatistics();

      expect(stats).toBeDefined();
      expect(stats.counts).toBeDefined();
      expect(stats.counts.total).toBeGreaterThanOrEqual(0);
      expect(stats.amounts).toBeDefined();
    });
  });
});
