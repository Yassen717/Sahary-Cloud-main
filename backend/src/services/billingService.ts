import { prisma } from '../config/database';
import ValidationHelpers from '../utils/validation.helpers';
import type {
  BillingGroupBy,
  BillingVmSummary,
  DiscountInput,
  InvoiceBatchOptions,
  InvoiceCreationOptions,
  InvoiceQueryOptions,
  InvoiceStatus,
  InvoiceStatusUpdateMetadata,
  PaymentIntentOptions,
  PaymentQueryOptions,
  PaymentStatus,
  RefundInput,
  UsageAggregationResult,
  UsageQueryOptions,
  UsageRecordInput,
  UsageSummaryResult,
  NumericLike,
} from '../types/billing';

type UsageRecord = {
  id?: string;
  userId?: string;
  vmId: string | null;
  cpuUsage: number;
  ramUsage: number;
  storageUsage: number;
  bandwidthUsage: number;
  duration: number;
  cost: NumericLike;
  timestamp: Date;
};

type VmForBilling = BillingVmSummary & {
  name?: string;
  description?: string | null;
  status?: string;
};

type InvoiceRecord = {
  id: string;
  invoiceNumber: string;
  userId: string;
  amount: NumericLike;
  subtotal: NumericLike;
  tax: NumericLike;
  discount: NumericLike;
  status: string;
  billingPeriodStart: Date;
  billingPeriodEnd: Date;
  dueDate: Date;
  currency: string;
  createdAt: Date;
  updatedAt?: Date;
  paidAt?: Date | null;
  paymentMethod?: string | null;
  paymentId?: string | null;
  items?: unknown[];
  payments?: unknown[];
  user?: { id: string; email: string; firstName: string; lastName: string };
};

type PaymentRecord = {
  id: string;
  invoiceId: string;
  amount: NumericLike;
  currency: string;
  method: string;
  status: string;
  gatewayId?: string | null;
  gatewayResponse?: string | null;
  processedAt?: Date | null;
  invoice?: { userId: string };
};

const roundTo = (value: NumericLike | null | undefined, digits = 2): number => Number(Number(value ?? 0).toFixed(digits));

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

/**
 * Billing Service
 * Handles usage tracking, cost calculation, invoice generation, and payment operations
 */
class BillingService {
  static async recordUsage(vmId: string, usageData: UsageRecordInput): Promise<UsageRecord> {
    try {
      const { cpuUsage, ramUsage, storageUsage, bandwidthUsage, duration } = usageData;

      const vm = await prisma.virtualMachine.findUnique({
        where: { id: vmId },
        select: {
          id: true,
          cpu: true,
          ram: true,
          storage: true,
          bandwidth: true,
          hourlyRate: true,
          userId: true,
        },
      }) as VmForBilling | null;

      if (!vm) {
        throw new Error('VM not found');
      }

      const cost = this.calculateUsageCost({
        vm,
        cpuUsage,
        ramUsage,
        storageUsage,
        bandwidthUsage,
        duration,
      });

      const usageRecord = await prisma.usageRecord.create({
        data: {
          userId: vm.userId,
          vmId,
          cpuUsage: parseFloat(String(cpuUsage)),
          ramUsage: parseFloat(String(ramUsage)),
          storageUsage: parseFloat(String(storageUsage)),
          bandwidthUsage: parseFloat(String(bandwidthUsage)),
          duration: parseInt(String(duration), 10),
          cost: parseFloat(cost.toFixed(4)),
          timestamp: new Date(),
        },
      }) as UsageRecord;

      return usageRecord;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to record usage: ${message}`);
    }
  }

  static calculateUsageCost(params: {
    vm: BillingVmSummary;
    cpuUsage: number | string;
    ramUsage: number | string;
    storageUsage: number | string;
    bandwidthUsage: number | string;
    duration: number | string;
  }): number {
    const { vm, cpuUsage, ramUsage, storageUsage, bandwidthUsage, duration } = params;

    const baseHourlyRate = parseFloat(String(vm.hourlyRate));
    const cpuUtilization = parseFloat(String(cpuUsage)) / 100;
    const ramUtilization = parseFloat(String(ramUsage)) / vm.ram;
    const storageUtilization = parseFloat(String(storageUsage)) / vm.storage;

    const bandwidthCostPerGB = 0.01;
    const bandwidthCost = (parseFloat(String(bandwidthUsage)) / 1024) * bandwidthCostPerGB;

    const cpuWeight = 0.4;
    const ramWeight = 0.4;
    const storageWeight = 0.2;

    const utilizationFactor =
      cpuUtilization * cpuWeight +
      ramUtilization * ramWeight +
      storageUtilization * storageWeight;

    const hourlyUsageCost = baseHourlyRate * utilizationFactor;
    const minuteCost = hourlyUsageCost / 60;
    const totalCost = minuteCost * parseInt(String(duration), 10) + bandwidthCost;

    return totalCost;
  }

  static async getVMUsage(vmId: string, options: UsageQueryOptions = {}): Promise<{ data: UsageRecord[]; pagination: Record<string, unknown>; statistics: UsageAggregationResult }> {
    try {
      const {
        startDate,
        endDate,
        page = 1,
        limit = 100,
      } = options;

      const where: Record<string, unknown> = { vmId };

      if (startDate || endDate) {
        where.timestamp = {};
        if (startDate) (where.timestamp as Record<string, unknown>).gte = new Date(startDate);
        if (endDate) (where.timestamp as Record<string, unknown>).lte = new Date(endDate);
      }

      const skip = (parseInt(String(page), 10) - 1) * parseInt(String(limit), 10);
      const [records, total] = await Promise.all([
        prisma.usageRecord.findMany({
          where,
          orderBy: { timestamp: 'desc' },
          skip,
          take: parseInt(String(limit), 10),
        }) as Promise<UsageRecord[]>,
        prisma.usageRecord.count({ where }),
      ]);

      const stats = await this.calculateUsageStatistics(vmId, { startDate, endDate });

      return {
        data: records,
        pagination: {
          page: parseInt(String(page), 10),
          limit: parseInt(String(limit), 10),
          total,
          totalPages: Math.ceil(total / parseInt(String(limit), 10)),
        },
        statistics: stats,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to get VM usage: ${message}`);
    }
  }

  static async calculateUsageStatistics(vmId: string, options: UsageQueryOptions = {}): Promise<UsageAggregationResult> {
    try {
      const { startDate, endDate } = options;

      const where: Record<string, unknown> = { vmId };
      if (startDate || endDate) {
        where.timestamp = {};
        if (startDate) (where.timestamp as Record<string, unknown>).gte = new Date(startDate);
        if (endDate) (where.timestamp as Record<string, unknown>).lte = new Date(endDate);
      }

      const aggregation = await prisma.usageRecord.aggregate({
        where,
        _avg: {
          cpuUsage: true,
          ramUsage: true,
          storageUsage: true,
          bandwidthUsage: true,
        },
        _max: {
          cpuUsage: true,
          ramUsage: true,
          storageUsage: true,
          bandwidthUsage: true,
        },
        _sum: {
          cost: true,
          duration: true,
          bandwidthUsage: true,
        },
        _count: true,
      });

      return {
        totalRecords: aggregation._count,
        totalCost: roundTo(aggregation._sum.cost || 0),
        totalDuration: aggregation._sum.duration || 0,
        totalBandwidth: roundTo((aggregation._sum.bandwidthUsage || 0) / 1024),
        averages: {
          cpu: roundTo(aggregation._avg.cpuUsage || 0),
          ram: roundTo(aggregation._avg.ramUsage || 0),
          storage: roundTo(aggregation._avg.storageUsage || 0),
          bandwidth: roundTo(aggregation._avg.bandwidthUsage || 0),
        },
        peaks: {
          cpu: roundTo(aggregation._max.cpuUsage || 0),
          ram: roundTo(aggregation._max.ramUsage || 0),
          storage: roundTo(aggregation._max.storageUsage || 0),
          bandwidth: roundTo(aggregation._max.bandwidthUsage || 0),
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to calculate usage statistics: ${message}`);
    }
  }

  static async getUserUsage(userId: string, options: UsageQueryOptions = {}): Promise<UsageSummaryResult> {
    try {
      const { startDate, endDate } = options;

      const userVMs = await prisma.virtualMachine.findMany({
        where: { userId },
        select: { id: true, name: true },
      }) as Array<{ id: string; name: string }>;

      const vmIds = userVMs.map((vm) => vm.id);

      if (vmIds.length === 0) {
        return {
          totalCost: 0,
          totalDuration: 0,
          totalBandwidth: 0,
          vmCount: 0,
          vms: [],
        } as unknown as UsageSummaryResult;
      }

      const where: Record<string, unknown> = { vmId: { in: vmIds } };
      if (startDate || endDate) {
        where.timestamp = {};
        if (startDate) (where.timestamp as Record<string, unknown>).gte = new Date(startDate);
        if (endDate) (where.timestamp as Record<string, unknown>).lte = new Date(endDate);
      }

      const aggregation = await prisma.usageRecord.aggregate({
        where,
        _sum: {
          cost: true,
          duration: true,
          bandwidthUsage: true,
        },
      });

      const vmUsage = await Promise.all(
        userVMs.map(async (vm) => {
          const stats = await this.calculateUsageStatistics(vm.id, { startDate, endDate });
          return {
            vmId: vm.id,
            vmName: vm.name,
            ...stats,
          };
        }),
      );

      return {
        totalCost: roundTo(aggregation._sum.cost || 0),
        totalDuration: aggregation._sum.duration || 0,
        totalBandwidth: roundTo((aggregation._sum.bandwidthUsage || 0) / 1024),
        vmCount: userVMs.length,
        vms: vmUsage,
      } as UsageSummaryResult;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to get user usage: ${message}`);
    }
  }

  static async startUsageTracking(vmId: string): Promise<{ success: boolean; message: string }> {
    try {
      const vm = await prisma.virtualMachine.findUnique({
        where: { id: vmId },
      }) as { id: string; name: string; userId: string; status: string } | null;

      if (!vm) {
        throw new Error('VM not found');
      }

      if (vm.status !== 'RUNNING') {
        throw new Error('VM must be running to track usage');
      }

      await this.recordUsage(vmId, {
        cpuUsage: 0,
        ramUsage: 0,
        storageUsage: 0,
        bandwidthUsage: 0,
        duration: 0,
      });

      await prisma.auditLog.create({
        data: {
          userId: vm.userId,
          action: 'USAGE_TRACKING_STARTED',
          resource: 'usage',
          resourceId: vmId,
          newValues: JSON.stringify({
            vmId,
            vmName: vm.name,
            startedAt: new Date(),
          }),
        },
      });

      return { success: true, message: 'Usage tracking started' };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to start usage tracking: ${message}`);
    }
  }

  static async stopUsageTracking(vmId: string): Promise<{ success: boolean; message: string }> {
    try {
      const vm = await prisma.virtualMachine.findUnique({
        where: { id: vmId },
      }) as { id: string; name: string; userId: string } | null;

      if (!vm) {
        throw new Error('VM not found');
      }

      await prisma.auditLog.create({
        data: {
          userId: vm.userId,
          action: 'USAGE_TRACKING_STOPPED',
          resource: 'usage',
          resourceId: vmId,
          newValues: JSON.stringify({
            vmId,
            vmName: vm.name,
            stoppedAt: new Date(),
          }),
        },
      });

      return { success: true, message: 'Usage tracking stopped' };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to stop usage tracking: ${message}`);
    }
  }

  static async collectCurrentUsage(vmId: string): Promise<{ cpuUsage: number; ramUsage: number; storageUsage: number; bandwidthUsage: number }> {
    try {
      const vm = await prisma.virtualMachine.findUnique({
        where: { id: vmId },
        select: {
          id: true,
          dockerContainerId: true,
          cpu: true,
          ram: true,
          storage: true,
          status: true,
        },
      }) as { id: string; dockerContainerId?: string | null; cpu: number; ram: number; storage: number; status: string } | null;

      if (!vm) {
        throw new Error('VM not found');
      }

      if (vm.status !== 'RUNNING' || !vm.dockerContainerId) {
        return {
          cpuUsage: 0,
          ramUsage: 0,
          storageUsage: 0,
          bandwidthUsage: 0,
        };
      }

      const dockerService = require('./dockerService');
      const containerStats = await dockerService.getContainerStats(vm.dockerContainerId);

      const cpuUsage = containerStats.cpu_stats?.cpu_usage?.total_usage || 0;
      const ramUsage = containerStats.memory_stats?.usage || 0;

      const cpuPercent = this.calculateCPUPercent(containerStats);
      const ramMB = ramUsage / (1024 * 1024);
      const storageUsage = vm.storage * 0.5;
      const networkStats = containerStats.networks || {};
      const bandwidthUsage = Object.values(networkStats).reduce(
        (total: number, net: any) => total + (net.rx_bytes || 0) + (net.tx_bytes || 0),
        0,
      ) / (1024 * 1024);

      return {
        cpuUsage: parseFloat(cpuPercent.toFixed(2)),
        ramUsage: parseFloat(ramMB.toFixed(2)),
        storageUsage: parseFloat(storageUsage.toFixed(2)),
        bandwidthUsage: parseFloat(bandwidthUsage.toFixed(2)),
      };
    } catch (error) {
      console.error('Error collecting usage:', error);
      return {
        cpuUsage: 0,
        ramUsage: 0,
        storageUsage: 0,
        bandwidthUsage: 0,
      };
    }
  }

  static calculateCPUPercent(stats: any): number {
    try {
      const cpuDelta = stats.cpu_stats.cpu_usage.total_usage - stats.precpu_stats.cpu_usage.total_usage;
      const systemDelta = stats.cpu_stats.system_cpu_usage - stats.precpu_stats.system_cpu_usage;
      const numberCpus = stats.cpu_stats.online_cpus || 1;

      if (systemDelta > 0 && cpuDelta > 0) {
        return (cpuDelta / systemDelta) * numberCpus * 100;
      }

      return 0;
    } catch {
      return 0;
    }
  }

  static async collectAllRunningVMsUsage(): Promise<{ success: number; failed: number; total: number; errors: Array<Record<string, unknown>> }> {
    try {
      const runningVMs = await prisma.virtualMachine.findMany({
        where: { status: 'RUNNING' },
        select: { id: true, name: true, userId: true },
      }) as Array<{ id: string; name: string; userId: string }>;

      const results: { success: number; failed: number; total: number; errors: Array<Record<string, unknown>> } = {
        success: 0,
        failed: 0,
        total: runningVMs.length,
        errors: [],
      };

      for (const vm of runningVMs) {
        try {
          const currentUsage = await this.collectCurrentUsage(vm.id);

          await this.recordUsage(vm.id, {
            ...currentUsage,
            duration: 5,
          });

          results.success++;
        } catch (error) {
          results.failed++;
          results.errors.push({
            vmId: vm.id,
            vmName: vm.name,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      return results;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to collect usage for running VMs: ${message}`);
    }
  }

  static async getUsageSummary(userId: string, options: UsageQueryOptions = {}): Promise<UsageSummaryResult> {
    try {
      const { startDate, endDate, groupBy = 'day' } = options;

      const usage = await this.getUserUsage(userId, { startDate, endDate });
      const breakdown = await this.getUsageBreakdown(userId, {
        startDate,
        endDate,
        groupBy,
      });

      return {
        summary: {
          totalCost: (usage as any).totalCost,
          totalDuration: (usage as any).totalDuration,
          totalBandwidth: (usage as any).totalBandwidth,
          vmCount: (usage as any).vmCount,
        },
        breakdown,
        vms: (usage as any).vms,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to get usage summary: ${message}`);
    }
  }

  static async getUsageBreakdown(userId: string, options: UsageQueryOptions = {}): Promise<Array<Record<string, unknown>>> {
    try {
      const { startDate, endDate, groupBy = 'day' } = options;

      const userVMs = await prisma.virtualMachine.findMany({
        where: { userId },
        select: { id: true },
      }) as Array<{ id: string }>;

      const vmIds = userVMs.map((vm) => vm.id);

      if (vmIds.length === 0) {
        return [];
      }

      const where: Record<string, unknown> = { vmId: { in: vmIds } };
      if (startDate || endDate) {
        where.timestamp = {};
        if (startDate) (where.timestamp as Record<string, unknown>).gte = new Date(startDate);
        if (endDate) (where.timestamp as Record<string, unknown>).lte = new Date(endDate);
      }

      const records = await prisma.usageRecord.findMany({
        where,
        orderBy: { timestamp: 'asc' },
      }) as UsageRecord[];

      return this.groupUsageByPeriod(records, groupBy);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to get usage breakdown: ${message}`);
    }
  }

  static groupUsageByPeriod(records: UsageRecord[], groupBy: BillingGroupBy): Array<Record<string, unknown>> {
    const grouped: Record<string, { period: string; cost: number; duration: number; bandwidth: number; records: number }> = {};

    records.forEach((record) => {
      const date = new Date(record.timestamp);
      let key: string;

      switch (groupBy) {
        case 'hour':
          key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:00`;
          break;
        case 'day':
          key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
          break;
        case 'week': {
          const weekStart = new Date(date);
          weekStart.setDate(date.getDate() - date.getDay());
          key = `${weekStart.getFullYear()}-W${String(Math.ceil((weekStart.getDate() + 1) / 7)).padStart(2, '0')}`;
          break;
        }
        case 'month':
          key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
          break;
        default:
          key = date.toISOString().split('T')[0];
      }

      if (!grouped[key]) {
        grouped[key] = {
          period: key,
          cost: 0,
          duration: 0,
          bandwidth: 0,
          records: 0,
        };
      }

      grouped[key].cost += parseFloat(String(record.cost));
      grouped[key].duration += record.duration;
      grouped[key].bandwidth += record.bandwidthUsage;
      grouped[key].records += 1;
    });

    return Object.values(grouped).map((item) => ({
      period: item.period,
      cost: roundTo(item.cost),
      duration: item.duration,
      bandwidth: roundTo(item.bandwidth / 1024),
      records: item.records,
    }));
  }

  static async generateMonthlyInvoice(userId: string, options: InvoiceCreationOptions = {}): Promise<InvoiceRecord & { items: unknown[] }> {
    try {
      const { month, year, dueInDays = 15 } = options;

      const now = new Date();
      const invoiceMonth = month !== undefined ? month : now.getMonth() - 1;
      const invoiceYear = year || (invoiceMonth < 0 ? now.getFullYear() - 1 : now.getFullYear());
      const adjustedMonth = invoiceMonth < 0 ? 11 : invoiceMonth;

      const startDate = new Date(invoiceYear, adjustedMonth, 1);
      const endDate = new Date(invoiceYear, adjustedMonth + 1, 0, 23, 59, 59);

      const existingInvoice = await prisma.invoice.findFirst({
        where: {
          userId,
          billingPeriodStart: startDate,
          billingPeriodEnd: endDate,
        },
      }) as InvoiceRecord | null;

      if (existingInvoice) {
        throw new Error('Invoice already exists for this billing period');
      }

      const usage = await this.getUserUsage(userId, {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      });

      if ((usage as any).totalCost === 0) {
        throw new Error('No usage found for this billing period');
      }

      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + dueInDays);

      const subtotal = (usage as any).totalCost;
      const taxRate = parseFloat(process.env.TAX_RATE || '0.15');
      const taxAmount = subtotal * taxRate;
      const total = subtotal + taxAmount;

      const invoice = await prisma.invoice.create({
        data: {
          userId,
          invoiceNumber: await this.generateInvoiceNumber(),
          billingPeriodStart: startDate,
          billingPeriodEnd: endDate,
          subtotal: roundTo(subtotal),
          tax: roundTo(taxAmount),
          discount: 0,
          amount: roundTo(total),
          status: 'PENDING',
          dueDate,
          currency: 'USD',
        },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      }) as InvoiceRecord;

      const invoiceItems = await Promise.all(
        (usage as any).vms.map(async (vm: any) => prisma.invoiceItem.create({
          data: {
            invoiceId: invoice.id,
            description: `VM: ${vm.vmName}`,
            quantity: 1,
            unitPrice: roundTo(vm.totalCost),
            totalPrice: roundTo(vm.totalCost),
            resourceType: 'VM',
            resourceId: vm.vmId,
            usageStart: startDate,
            usageEnd: endDate,
          },
        })),
      );

      await prisma.auditLog.create({
        data: {
          userId,
          action: 'INVOICE_GENERATED',
          resource: 'invoice',
          resourceId: invoice.id,
          newValues: JSON.stringify({
            invoiceNumber: invoice.invoiceNumber,
            amount: invoice.amount,
            billingPeriod: `${adjustedMonth + 1}/${invoiceYear}`,
          }),
        },
      });

      return {
        ...invoice,
        items: invoiceItems,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to generate invoice: ${message}`);
    }
  }

  static async generateInvoiceNumber(): Promise<string> {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');

    const startOfMonth = new Date(year, now.getMonth(), 1);
    const endOfMonth = new Date(year, now.getMonth() + 1, 0);

    const count = await prisma.invoice.count({
      where: {
        createdAt: {
          gte: startOfMonth,
          lte: endOfMonth,
        },
      },
    });

    const sequence = String(count + 1).padStart(4, '0');
    return `INV-${year}${month}-${sequence}`;
  }

  static async getInvoiceById(invoiceId: string, userId: string | null = null): Promise<InvoiceRecord | null> {
    try {
      const include = {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
        items: {
          orderBy: { createdAt: 'asc' as const },
        },
        payments: {
          orderBy: { createdAt: 'desc' as const },
        },
      };

      const invoice = userId
        ? await prisma.invoice.findFirst({
          where: { id: invoiceId, userId },
          include,
        })
        : await prisma.invoice.findUnique({
          where: { id: invoiceId },
          include,
        });

      return invoice;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to get invoice: ${message}`);
    }
  }

  static async getUserInvoices(userId: string | null, options: InvoiceQueryOptions = {}): Promise<{ data: InvoiceRecord[]; pagination: Record<string, unknown> }> {
    try {
      const {
        page = 1,
        limit = 10,
        status,
        startDate,
        endDate,
        sortBy = 'createdAt',
        sortOrder = 'desc',
      } = options;

      const where: Record<string, unknown> = {};

      if (userId) {
        where.userId = userId;
      }

      if (status) {
        where.status = status;
      }

      if (startDate || endDate) {
        where.createdAt = {};
        if (startDate) (where.createdAt as Record<string, unknown>).gte = new Date(startDate);
        if (endDate) (where.createdAt as Record<string, unknown>).lte = new Date(endDate);
      }

      const skip = (parseInt(String(page), 10) - 1) * parseInt(String(limit), 10);
      const [invoices, total] = await Promise.all([
        prisma.invoice.findMany({
          where,
          orderBy: { [sortBy]: sortOrder },
          skip,
          take: parseInt(String(limit), 10),
          include: {
            items: true,
            payments: {
              orderBy: { createdAt: 'desc' },
              take: 1,
            },
          },
        }) as Promise<InvoiceRecord[]>,
        prisma.invoice.count({ where }),
      ]);

      return {
        data: invoices,
        pagination: {
          page: parseInt(String(page), 10),
          limit: parseInt(String(limit), 10),
          total,
          totalPages: Math.ceil(total / parseInt(String(limit), 10)),
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to get user invoices: ${message}`);
    }
  }

  static async applyDiscount(invoiceId: string, discountData: DiscountInput): Promise<InvoiceRecord> {
    try {
      const { discountCode, discountAmount, discountPercentage, reason } = discountData;

      const invoice = await prisma.invoice.findUnique({
        where: { id: invoiceId },
      }) as InvoiceRecord | null;

      if (!invoice) {
        throw new Error('Invoice not found');
      }

      if (invoice.status !== 'PENDING') {
        throw new Error('Can only apply discount to pending invoices');
      }

      let finalDiscountAmount = 0;
      const invoiceSubtotal = Number(invoice.subtotal);

      if (discountAmount) {
        finalDiscountAmount = parseFloat(String(discountAmount));
      } else if (discountPercentage) {
        finalDiscountAmount = invoiceSubtotal * (parseFloat(String(discountPercentage)) / 100);
      }

      if (finalDiscountAmount > invoiceSubtotal) {
        throw new Error('Discount amount cannot exceed subtotal');
      }

      const currentTax = Number(invoice.tax);
      const taxRate = invoiceSubtotal > 0
        ? currentTax / invoiceSubtotal
        : parseFloat(process.env.TAX_RATE || '0.15');

      const newSubtotal = invoiceSubtotal - finalDiscountAmount;
      const newTaxAmount = newSubtotal * taxRate;
      const newTotal = newSubtotal + newTaxAmount;

      const updatedInvoice = await prisma.invoice.update({
        where: { id: invoiceId },
        data: {
          discount: roundTo(finalDiscountAmount),
          tax: roundTo(newTaxAmount),
          amount: roundTo(newTotal),
        },
        include: {
          user: true,
          items: true,
        },
      }) as InvoiceRecord;

      await prisma.auditLog.create({
        data: {
          userId: invoice.userId,
          action: 'DISCOUNT_APPLIED',
          resource: 'invoice',
          resourceId: invoiceId,
          newValues: JSON.stringify({ discountCode, discountAmount: finalDiscountAmount, reason }),
        },
      });

      return updatedInvoice;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to apply discount: ${message}`);
    }
  }

  static async updateInvoiceStatus(invoiceId: string, status: InvoiceStatus, metadata: InvoiceStatusUpdateMetadata = {}): Promise<InvoiceRecord> {
    try {
      const paidAt = metadata.paidAt instanceof Date ? metadata.paidAt : new Date();

      const updatedInvoice = await prisma.invoice.update({
        where: { id: invoiceId },
        data: {
          status,
          ...(status === 'PAID' && { paidAt }),
        },
      }) as InvoiceRecord;

      const actorUserId = typeof metadata.userId === 'string'
        ? metadata.userId
        : updatedInvoice.userId;

      await prisma.auditLog.create({
        data: {
          userId: actorUserId,
          action: 'INVOICE_STATUS_UPDATED',
          resource: 'invoice',
          resourceId: invoiceId,
          newValues: JSON.stringify({ status, ...metadata }),
        },
      });

      return updatedInvoice;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to update invoice status: ${message}`);
    }
  }

  static async generateAllMonthlyInvoices(options: InvoiceBatchOptions = {}): Promise<{ success: number; failed: number; total: number; errors: Array<Record<string, unknown>> }> {
    try {
      const { month, year } = options;

      const users = await prisma.user.findMany({
        where: { isActive: true },
        select: { id: true, email: true },
      }) as Array<{ id: string; email: string }>;

      const results: { success: number; failed: number; total: number; errors: Array<Record<string, unknown>> } = {
        success: 0,
        failed: 0,
        total: users.length,
        errors: [],
      };

      for (const user of users) {
        try {
          await this.generateMonthlyInvoice(user.id, { month, year });
          results.success++;
        } catch (error) {
          results.failed++;
          results.errors.push({
            userId: user.id,
            userEmail: user.email,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      return results;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to generate all monthly invoices: ${message}`);
    }
  }

  static async markOverdueInvoices(): Promise<{ success: number; failed: number; total: number; errors: Array<Record<string, unknown>> }> {
    try {
      const overdueInvoices = await prisma.invoice.findMany({
        where: {
          status: 'PENDING',
          dueDate: {
            lt: new Date(),
          },
        },
      }) as InvoiceRecord[];

      const results: { success: number; failed: number; total: number; errors: Array<Record<string, unknown>> } = {
        success: 0,
        failed: 0,
        total: overdueInvoices.length,
        errors: [],
      };

      for (const invoice of overdueInvoices) {
        try {
          await this.updateInvoiceStatus(invoice.id, 'OVERDUE', {
            markedAt: new Date(),
          });
          results.success++;
        } catch (error) {
          results.failed++;
          results.errors.push({
            invoiceId: invoice.id,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      return results;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to mark overdue invoices: ${message}`);
    }
  }

  static async getInvoiceStatistics(userId: string | null = null): Promise<Record<string, unknown>> {
    try {
      const where: Record<string, unknown> = userId ? { userId } : {};

      const [total, pending, paid, overdue, cancelled, refunded] = await Promise.all([
        prisma.invoice.count({ where }),
        prisma.invoice.count({ where: { ...where, status: 'PENDING' } }),
        prisma.invoice.count({ where: { ...where, status: 'PAID' } }),
        prisma.invoice.count({ where: { ...where, status: 'OVERDUE' } }),
        prisma.invoice.count({ where: { ...where, status: 'CANCELLED' } }),
        prisma.invoice.count({ where: { ...where, status: 'REFUNDED' } }),
      ]);

      const aggregation = await prisma.invoice.aggregate({
        where: { ...where, status: 'PAID' },
        _sum: {
          amount: true,
        },
      });

      return {
        counts: {
          total,
          pending,
          paid,
          overdue,
          cancelled,
          refunded,
        },
        amounts: {
          totalProcessed: roundTo(aggregation._sum?.amount || 0),
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to get invoice statistics: ${message}`);
    }
  }

  static async createPaymentIntent(invoiceId: string, userId: string): Promise<Record<string, unknown>> {
    try {
      const invoice = await prisma.invoice.findUnique({
        where: { id: invoiceId },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
            },
          },
          items: true,
        },
      }) as InvoiceRecord | null;

      if (!invoice) {
        throw new Error('Invoice not found');
      }

      if (invoice.userId !== userId) {
        throw new Error('Unauthorized access to invoice');
      }

      if (invoice.status === 'PAID') {
        throw new Error('Invoice is already paid');
      }

      if (invoice.status === 'CANCELLED') {
        throw new Error('Invoice is cancelled');
      }

      const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(Number(invoice.amount) * 100),
        currency: invoice.currency.toLowerCase(),
        metadata: {
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          userId: invoice.userId,
          userEmail: invoice.user?.email,
        },
        description: `Payment for invoice ${invoice.invoiceNumber}`,
        receipt_email: invoice.user?.email,
      });

      const payment = await prisma.payment.create({
        data: {
          invoiceId: invoice.id,
          amount: roundTo(invoice.amount),
          currency: invoice.currency,
          method: 'STRIPE',
          status: 'PENDING',
          gatewayId: paymentIntent.id,
          gatewayResponse: JSON.stringify({
            clientSecret: paymentIntent.client_secret,
          }),
        },
      }) as PaymentRecord;

      await prisma.auditLog.create({
        data: {
          userId: invoice.userId,
          action: 'PAYMENT_INTENT_CREATED',
          resource: 'payment',
          resourceId: payment.id,
          newValues: JSON.stringify({
            invoiceId: invoice.id,
            invoiceNumber: invoice.invoiceNumber,
            amount: invoice.amount,
            paymentIntentId: paymentIntent.id,
          }),
        },
      });

      return {
        paymentId: payment.id,
        clientSecret: paymentIntent.client_secret,
        amount: invoice.amount,
        currency: invoice.currency,
        invoice: {
          id: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          total: Number(invoice.amount),
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to create payment intent: ${message}`);
    }
  }

  static async processPayment(invoiceId: string, paymentData: PaymentIntentOptions): Promise<Record<string, unknown>> {
    try {
      const { paymentMethodId, savePaymentMethod = false } = paymentData;

      const invoice = await prisma.invoice.findUnique({
        where: { id: invoiceId },
        include: {
          user: {
            select: {
              id: true,
              email: true,
            },
          },
        },
      }) as (InvoiceRecord & { user: { id: string; email: string } }) | null;

      if (!invoice) {
        throw new Error('Invoice not found');
      }

      if (invoice.status === 'PAID') {
        throw new Error('Invoice is already paid');
      }

      let customerId: string | undefined;
      if (invoice.user?.email) {
        const customer = await stripe.customers.create({
          email: invoice.user.email,
          metadata: {
            userId: invoice.user.id,
          },
        });
        customerId = customer.id;
      }

      const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(Number(invoice.amount) * 100),
        currency: invoice.currency.toLowerCase(),
        ...(customerId ? { customer: customerId } : {}),
        ...(paymentMethodId ? { payment_method: paymentMethodId } : {}),
        confirm: true,
        metadata: {
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          userId: invoice.user.id,
        },
        description: `Payment for invoice ${invoice.invoiceNumber}`,
      });

      if (savePaymentMethod && paymentMethodId && customerId) {
        await stripe.paymentMethods.attach(paymentMethodId, {
          customer: customerId,
        });
      }

      const payment = await prisma.payment.create({
        data: {
          invoiceId: invoice.id,
          amount: roundTo(invoice.amount),
          currency: invoice.currency,
          method: 'STRIPE',
          status: paymentIntent.status === 'succeeded' ? 'COMPLETED' : 'PENDING',
          gatewayId: paymentIntent.id,
          processedAt: paymentIntent.status === 'succeeded' ? new Date() : null,
          gatewayResponse: JSON.stringify({
            paymentIntentStatus: paymentIntent.status,
            paymentMethodId: paymentMethodId || null,
            customerId: customerId || null,
          }),
        },
      }) as PaymentRecord;

      if (paymentIntent.status === 'succeeded') {
        await prisma.invoice.update({
          where: { id: invoiceId },
          data: {
            status: 'PAID',
            paidAt: new Date(),
          },
        });

        await prisma.auditLog.create({
          data: {
            userId: invoice.user.id,
            action: 'PAYMENT_COMPLETED',
            resource: 'payment',
            resourceId: payment.id,
            newValues: JSON.stringify({
              invoiceId: invoice.id,
              invoiceNumber: invoice.invoiceNumber,
              amount: invoice.amount,
              paymentIntentId: paymentIntent.id,
            }),
          },
        });
      }

      return {
        success: paymentIntent.status === 'succeeded',
        paymentId: payment.id,
        status: paymentIntent.status,
        invoice: {
          id: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          status: paymentIntent.status === 'succeeded' ? 'PAID' : invoice.status,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to process payment: ${message}`);
    }
  }

  static async handleWebhook(event: any): Promise<Record<string, unknown>> {
    try {
      switch (event.type) {
        case 'payment_intent.succeeded':
          return await this.handlePaymentSuccess(event.data.object);
        case 'payment_intent.payment_failed':
          return await this.handlePaymentFailure(event.data.object);
        case 'charge.refunded':
          return await this.handleRefund(event.data.object);
        case 'customer.subscription.created':
        case 'customer.subscription.updated':
        case 'customer.subscription.deleted':
          return await this.handleSubscriptionChange(event);
        default:
          console.log(`Unhandled event type: ${event.type}`);
          return { handled: false, eventType: event.type };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to handle webhook: ${message}`);
    }
  }

  static async handlePaymentSuccess(paymentIntent: any): Promise<Record<string, unknown>> {
    try {
      const invoiceId = paymentIntent.metadata.invoiceId;
      if (!invoiceId) {
        throw new Error('Invoice ID not found in payment intent metadata');
      }

      const payment = await prisma.payment.findFirst({
        where: { gatewayId: paymentIntent.id },
        include: {
          invoice: {
            select: {
              userId: true,
            },
          },
        },
      }) as PaymentRecord | null;

      if (!payment) {
        throw new Error('Payment record not found');
      }

      await prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: 'COMPLETED',
          processedAt: new Date(),
          gatewayResponse: JSON.stringify({
            paymentIntentStatus: paymentIntent.status,
            webhookProcessedAt: new Date().toISOString(),
          }),
        },
      });

      await prisma.invoice.update({
        where: { id: invoiceId },
        data: {
          status: 'PAID',
          paidAt: new Date(),
        },
      });

      await prisma.auditLog.create({
        data: {
          userId: payment.invoice?.userId,
          action: 'PAYMENT_WEBHOOK_SUCCESS',
          resource: 'payment',
          resourceId: payment.id,
          newValues: JSON.stringify({
            invoiceId,
            paymentIntentId: paymentIntent.id,
            amount: paymentIntent.amount / 100,
          }),
        },
      });

      return {
        handled: true,
        paymentId: payment.id,
        invoiceId,
        status: 'COMPLETED',
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to handle payment success: ${message}`);
    }
  }

  static async handlePaymentFailure(paymentIntent: any): Promise<Record<string, unknown>> {
    try {
      const invoiceId = paymentIntent.metadata.invoiceId;

      if (!invoiceId) {
        throw new Error('Invoice ID not found in payment intent metadata');
      }

      const payment = await prisma.payment.findFirst({
        where: { gatewayId: paymentIntent.id },
        include: {
          invoice: {
            select: {
              userId: true,
            },
          },
        },
      }) as PaymentRecord | null;

      if (!payment) {
        throw new Error('Payment record not found');
      }

      await prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: 'FAILED',
          gatewayResponse: JSON.stringify({
            paymentIntentStatus: paymentIntent.status,
            failureReason: paymentIntent.last_payment_error?.message,
            webhookProcessedAt: new Date().toISOString(),
          }),
        },
      });

      await prisma.auditLog.create({
        data: {
          userId: payment.invoice?.userId,
          action: 'PAYMENT_WEBHOOK_FAILED',
          resource: 'payment',
          resourceId: payment.id,
          newValues: JSON.stringify({
            invoiceId,
            paymentIntentId: paymentIntent.id,
            failureReason: paymentIntent.last_payment_error?.message,
          }),
        },
      });

      return {
        handled: true,
        paymentId: payment.id,
        invoiceId,
        status: 'FAILED',
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to handle payment failure: ${message}`);
    }
  }

  static async handleRefund(charge: any): Promise<Record<string, unknown>> {
    try {
      const paymentIntentId = charge.payment_intent;

      const payment = await prisma.payment.findFirst({
        where: { gatewayId: paymentIntentId },
        include: {
          invoice: {
            select: {
              userId: true,
            },
          },
        },
      }) as PaymentRecord | null;

      if (!payment) {
        throw new Error('Payment record not found');
      }

      await prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: 'REFUNDED',
          gatewayResponse: JSON.stringify({
            refundAmount: charge.amount_refunded / 100,
            webhookProcessedAt: new Date().toISOString(),
          }),
        },
      });

      await prisma.invoice.update({
        where: { id: payment.invoiceId },
        data: {
          status: 'REFUNDED',
        },
      });

      await prisma.auditLog.create({
        data: {
          userId: payment.invoice?.userId,
          action: 'PAYMENT_REFUNDED',
          resource: 'payment',
          resourceId: payment.id,
          newValues: JSON.stringify({
            invoiceId: payment.invoiceId,
            refundAmount: charge.amount_refunded / 100,
          }),
        },
      });

      return {
        handled: true,
        paymentId: payment.id,
        invoiceId: payment.invoiceId,
        status: 'REFUNDED',
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to handle refund: ${message}`);
    }
  }

  static async handleSubscriptionChange(event: any): Promise<Record<string, unknown>> {
    try {
      console.log(`Subscription event: ${event.type}`);

      return {
        handled: true,
        eventType: event.type,
        message: 'Subscription event logged',
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to handle subscription change: ${message}`);
    }
  }

  static async getPaymentById(paymentId: string, userId: string | null = null): Promise<Record<string, unknown> | null> {
    try {
      const include = {
        invoice: {
          include: {
            items: true,
            user: {
              select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
              },
            },
          },
        },
      };

      const payment = userId
        ? await prisma.payment.findFirst({
          where: {
            id: paymentId,
            invoice: {
              userId,
            },
          },
          include,
        })
        : await prisma.payment.findUnique({
          where: { id: paymentId },
          include,
        });

      return payment as Record<string, unknown> | null;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to get payment: ${message}`);
    }
  }

  static async getUserPayments(userId: string, options: PaymentQueryOptions = {}): Promise<{ data: Record<string, unknown>[]; pagination: Record<string, unknown> }> {
    try {
      const {
        page = 1,
        limit = 10,
        status,
        startDate,
        endDate,
        sortBy = 'createdAt',
        sortOrder = 'desc',
      } = options;

      const where: Record<string, unknown> = {
        invoice: {
          userId,
        },
      };

      if (status) {
        where.status = status;
      }

      if (startDate || endDate) {
        where.createdAt = {};
        if (startDate) (where.createdAt as Record<string, unknown>).gte = new Date(startDate);
        if (endDate) (where.createdAt as Record<string, unknown>).lte = new Date(endDate);
      }

      const skip = (parseInt(String(page), 10) - 1) * parseInt(String(limit), 10);
      const [payments, total] = await Promise.all([
        prisma.payment.findMany({
          where,
          orderBy: { [sortBy]: sortOrder },
          skip,
          take: parseInt(String(limit), 10),
          include: {
            invoice: {
              select: {
                id: true,
                invoiceNumber: true,
                amount: true,
                status: true,
              },
            },
          },
        }) as Promise<Record<string, unknown>[]>,
        prisma.payment.count({ where }),
      ]);

      return {
        data: payments,
        pagination: {
          page: parseInt(String(page), 10),
          limit: parseInt(String(limit), 10),
          total,
          totalPages: Math.ceil(total / parseInt(String(limit), 10)),
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to get user payments: ${message}`);
    }
  }

  static async refundPayment(paymentId: string, refundData: RefundInput): Promise<Record<string, unknown>> {
    try {
      const { amount, reason } = refundData;

      const payment = await prisma.payment.findUnique({
        where: { id: paymentId },
        include: { invoice: true },
      }) as any;

      if (!payment) {
        throw new Error('Payment not found');
      }

      if (payment.status !== 'COMPLETED') {
        throw new Error('Can only refund completed payments');
      }

      if (!payment.gatewayId) {
        throw new Error('Stripe payment intent ID not found');
      }

      const refundAmount = amount ? Math.round(parseFloat(String(amount)) * 100) : undefined;
      const refund = await stripe.refunds.create({
        payment_intent: payment.gatewayId,
        amount: refundAmount,
        reason: reason || 'requested_by_customer',
        metadata: {
          paymentId: payment.id,
          invoiceId: payment.invoiceId,
        },
      });

      await prisma.payment.update({
        where: { id: paymentId },
        data: {
          status: 'REFUNDED',
          gatewayResponse: JSON.stringify({
            refundId: refund.id,
            refundAmount: refund.amount / 100,
            refundReason: reason,
            refundedAt: new Date().toISOString(),
          }),
        },
      });

      await prisma.invoice.update({
        where: { id: payment.invoiceId },
        data: {
          status: 'REFUNDED',
        },
      });

      await prisma.auditLog.create({
        data: {
          userId: payment.invoice.userId,
          action: 'PAYMENT_REFUND_INITIATED',
          resource: 'payment',
          resourceId: paymentId,
          newValues: JSON.stringify({
            refundId: refund.id,
            refundAmount: refund.amount / 100,
            reason,
          }),
        },
      });

      return {
        success: true,
        refundId: refund.id,
        amount: refund.amount / 100,
        status: refund.status,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to refund payment: ${message}`);
    }
  }

  static async getPaymentStatistics(userId: string | null = null): Promise<Record<string, unknown>> {
    try {
      const where: Record<string, unknown> = userId
        ? {
          invoice: {
            userId,
          },
        }
        : {};

      const [total, completed, pending, failed, refunded] = await Promise.all([
        prisma.payment.count({ where }),
        prisma.payment.count({ where: { ...where, status: 'COMPLETED' } }),
        prisma.payment.count({ where: { ...where, status: 'PENDING' } }),
        prisma.payment.count({ where: { ...where, status: 'FAILED' } }),
        prisma.payment.count({ where: { ...where, status: 'REFUNDED' } }),
      ]);

      const aggregation = await prisma.payment.aggregate({
        where: { ...where, status: 'COMPLETED' },
        _sum: {
          amount: true,
        },
      });

      return {
        counts: {
          total,
          completed,
          pending,
          failed,
          refunded,
        },
        amounts: {
          totalProcessed: roundTo(aggregation._sum.amount || 0),
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to get payment statistics: ${message}`);
    }
  }

  static verifyWebhookSignature(payload: string, signature: string): any {
    try {
      const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

      if (!webhookSecret) {
        throw new Error('Webhook secret not configured');
      }

      return stripe.webhooks.constructEvent(payload, signature, webhookSecret);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Webhook signature verification failed: ${message}`);
    }
  }
}

export default BillingService;
