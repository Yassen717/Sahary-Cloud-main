import { prisma } from '../config/database';
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

// Allowed invoice status transitions — anything else is rejected
const INVOICE_STATUS_TRANSITIONS: Record<string, InvoiceStatus[]> = {
  PENDING: ['PAID', 'OVERDUE', 'CANCELLED'],
  OVERDUE: ['PAID', 'CANCELLED'],
  PAID: ['REFUNDED'],
  CANCELLED: [],
  REFUNDED: [],
};

/**
 * Billing Service
 * Handles usage tracking, cost calculation, invoice generation, and payment operations
 */
class BillingService {
  static async recordUsage(vmId: string, usageData: UsageRecordInput): Promise<UsageRecord> {
    try {
      const {
        cpuUsage, ramUsage, storageUsage, bandwidthUsage, duration,
      } = usageData;

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
    const {
      vm, cpuUsage, ramUsage, storageUsage, bandwidthUsage, duration,
    } = params;

    const baseHourlyRate = parseFloat(String(vm.hourlyRate));
    const cpuUtilization = parseFloat(String(cpuUsage)) / 100;
    // Guard against zero-capacity VMs — dividing by 0 yields NaN/Infinity costs
    const ramUtilization = vm.ram > 0 ? parseFloat(String(ramUsage)) / vm.ram : 0;
    const storageUtilization = vm.storage > 0 ? parseFloat(String(storageUsage)) / vm.storage : 0;

    const bandwidthCostPerGB = 0.01;
    const bandwidthCost = (parseFloat(String(bandwidthUsage)) / 1024) * bandwidthCostPerGB;

    const cpuWeight = 0.4;
    const ramWeight = 0.4;
    const storageWeight = 0.2;

    const utilizationFactor = cpuUtilization * cpuWeight
      + ramUtilization * ramWeight
      + storageUtilization * storageWeight;

    const hourlyUsageCost = baseHourlyRate * utilizationFactor;
    const minuteCost = hourlyUsageCost / 60;
    const totalCost = minuteCost * parseInt(String(duration), 10) + bandwidthCost;

    return totalCost;
  }

  static async getVMUsage(vmId: string, options: UsageQueryOptions = {}, userId: string | null = null): Promise<{ data: UsageRecord[]; pagination: Record<string, unknown>; statistics: UsageAggregationResult }> {
    try {
      const {
        startDate,
        endDate,
        page = 1,
        limit = 100,
      } = options;

      // Verify the VM exists and belongs to the requester (null userId = privileged caller)
      const vm = await prisma.virtualMachine.findUnique({
        where: { id: vmId },
        select: { id: true, userId: true },
      }) as { id: string; userId: string } | null;

      if (!vm || (userId && vm.userId !== userId)) {
        throw new Error('VM not found');
      }

      const where: Record<string, unknown> = { vmId };

      if (startDate || endDate) {
        where.timestamp = {};
        if (startDate) (where.timestamp as Record<string, unknown>).gte = new Date(startDate);
        if (endDate) (where.timestamp as Record<string, unknown>).lte = new Date(endDate);
      }

      const pageNumber = Math.max(parseInt(String(page), 10) || 1, 1);
      const pageSize = Math.min(Math.max(parseInt(String(limit), 10) || 100, 1), 100);
      const skip = (pageNumber - 1) * pageSize;
      const [records, total] = await Promise.all([
        prisma.usageRecord.findMany({
          where,
          orderBy: { timestamp: 'desc' },
          skip,
          take: pageSize,
        }) as Promise<UsageRecord[]>,
        prisma.usageRecord.count({ where }),
      ]);

      const stats = await this.calculateUsageStatistics(vmId, { startDate, endDate });

      return {
        data: records,
        pagination: {
          page: pageNumber,
          limit: pageSize,
          total,
          totalPages: Math.ceil(total / pageSize),
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

      // Filter usage by userId directly — records of deleted VMs keep vmId = null
      // (onDelete: SetNull) and would otherwise become invisible and unbillable
      const where: Record<string, unknown> = { userId };
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

  static async collectCurrentUsage(vmId: string): Promise<{ cpuUsage: number; ramUsage: number; storageUsage: number; bandwidthUsage: number } | null> {
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
        return null;
      }

      const dockerService = require('./dockerService').default;
      const containerStats = await dockerService.getContainerStats(vm.dockerContainerId);

      // getContainerStats returns a transformed shape:
      // { cpu: { usage }, memory: { used, limit, percentage }, network: { rxBytes, txBytes, totalBytes } }
      const cpuPercent = containerStats.cpu?.usage || 0;
      const ramMB = (containerStats.memory?.used || 0) / (1024 * 1024);
      // Container stats do not expose disk usage — report 0 instead of a fabricated value
      const storageUsage = 0;
      // Cumulative MB since container start — callers must bill only the delta vs prior records
      const bandwidthUsage = (containerStats.network?.totalBytes || 0) / (1024 * 1024);

      return {
        cpuUsage: parseFloat(cpuPercent.toFixed(2)),
        ramUsage: parseFloat(ramMB.toFixed(2)),
        storageUsage: parseFloat(storageUsage.toFixed(2)),
        bandwidthUsage: parseFloat(bandwidthUsage.toFixed(2)),
      };
    } catch (error) {
      console.error('Error collecting usage:', error);
      // Signal failure instead of writing bogus zero records that corrupt billing
      return null;
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

  static async collectAllRunningVMsUsage(options: { intervalMs?: number } = {}): Promise<{ success: number; failed: number; total: number; errors: Array<Record<string, unknown>> }> {
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

      // The configured collection interval drives the fallback billing duration
      const intervalMs = options.intervalMs || parseInt(process.env.USAGE_COLLECTION_INTERVAL || '', 10) || 5 * 60 * 1000;
      const intervalMinutes = Math.max(1, Math.round(intervalMs / 60000));
      const maxDurationMinutes = Math.max(intervalMinutes * 2, 60);

      for (const vm of runningVMs) {
        try {
          const currentUsage = await this.collectCurrentUsage(vm.id);

          if (!currentUsage) {
            throw new Error('Failed to collect current usage');
          }

          const [lastRecord, billedBandwidth] = await Promise.all([
            prisma.usageRecord.findFirst({
              where: { vmId: vm.id },
              orderBy: { timestamp: 'desc' },
              select: { timestamp: true },
            }),
            prisma.usageRecord.aggregate({
              where: { vmId: vm.id },
              _sum: { bandwidthUsage: true },
            }),
          ]);

          // Network counters are cumulative since container start — bill only the
          // delta vs already-recorded usage, otherwise every cycle rebills history.
          // If the counter reset (e.g. container restart), bill the current reading.
          const previouslyBilled = billedBandwidth._sum.bandwidthUsage || 0;
          const bandwidthDelta = currentUsage.bandwidthUsage - previouslyBilled;
          const bandwidthUsage = bandwidthDelta >= 0 ? bandwidthDelta : currentUsage.bandwidthUsage;

          // Bill the elapsed time since the previous record instead of a hardcoded duration
          let duration = intervalMinutes;
          if (lastRecord) {
            const elapsedMinutes = Math.round((Date.now() - new Date(lastRecord.timestamp).getTime()) / 60000);
            duration = Math.min(Math.max(elapsedMinutes, 1), maxDurationMinutes);
          }

          await this.recordUsage(vm.id, {
            ...currentUsage,
            bandwidthUsage,
            duration,
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
      const {
        startDate, endDate, groupBy = 'day', limit,
      } = options;

      const usage = await this.getUserUsage(userId, { startDate, endDate });
      const breakdown = await this.getUsageBreakdown(userId, {
        startDate,
        endDate,
        groupBy,
        limit,
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
      const {
        startDate, endDate, groupBy = 'day', limit,
      } = options;

      // Filter usage by userId directly so records of deleted VMs (vmId = null) are included
      const where: Record<string, unknown> = { userId };
      if (startDate || endDate) {
        where.timestamp = {};
        if (startDate) (where.timestamp as Record<string, unknown>).gte = new Date(startDate);
        if (endDate) (where.timestamp as Record<string, unknown>).lte = new Date(endDate);
      }

      // Bound the result set — an unbounded findMany can exhaust memory on large histories
      const maxRecords = Math.min(Math.max(parseInt(String(limit), 10) || 10000, 1), 10000);
      const records = await prisma.usageRecord.findMany({
        where,
        orderBy: { timestamp: 'asc' },
        take: maxRecords,
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

      // Build the billing period in UTC so boundaries match the stored timestamps
      const now = new Date();
      const invoiceMonth = month !== undefined ? month : now.getUTCMonth() - 1;
      const invoiceYear = year || (invoiceMonth < 0 ? now.getUTCFullYear() - 1 : now.getUTCFullYear());
      const adjustedMonth = invoiceMonth < 0 ? 11 : invoiceMonth;

      const startDate = new Date(Date.UTC(invoiceYear, adjustedMonth, 1));
      const endDate = new Date(Date.UTC(invoiceYear, adjustedMonth + 1, 0, 23, 59, 59, 999));

      // Reject when any existing invoice overlaps this period
      const existingInvoice = await prisma.invoice.findFirst({
        where: {
          userId,
          billingPeriodStart: { lt: endDate },
          billingPeriodEnd: { gt: startDate },
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

      // Usage recorded against deleted VMs (vmId null) still rolls into the
      // totals — itemize it so the invoice lines add up to the subtotal
      const orphanUsage = await prisma.usageRecord.aggregate({
        where: {
          userId,
          vmId: null,
          timestamp: { gte: startDate, lte: endDate },
        },
        _sum: { cost: true },
      });
      const orphanCost = roundTo(orphanUsage._sum.cost || 0);

      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + dueInDays);

      const subtotal = (usage as any).totalCost;
      const taxRate = parseFloat(process.env.TAX_RATE || '0.15');
      const taxAmount = subtotal * taxRate;
      const total = subtotal + taxAmount;

      // Invoice + items + audit are created atomically — a failure anywhere rolls
      // the whole invoice back so retries never hit a partially-written invoice
      const createInvoice = async () => prisma.$transaction(async (tx) => {
        const createdInvoice = await tx.invoice.create({
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

        const itemInputs: Array<{ description: string; totalPrice: number; resourceId: string | null }> = (usage as any).vms.map((vm: any) => ({
          description: `VM: ${vm.vmName}`,
          totalPrice: roundTo(vm.totalCost),
          resourceId: vm.vmId as string | null,
        }));

        if (orphanCost > 0) {
          itemInputs.push({
            description: 'Usage from deleted VMs',
            totalPrice: orphanCost,
            resourceId: null,
          });
        }

        const invoiceItems = await Promise.all(
          itemInputs.map(async (item) => tx.invoiceItem.create({
            data: {
              invoiceId: createdInvoice.id,
              description: item.description,
              quantity: 1,
              unitPrice: item.totalPrice,
              totalPrice: item.totalPrice,
              resourceType: 'VM',
              resourceId: item.resourceId,
              usageStart: startDate,
              usageEnd: endDate,
            },
          })),
        );

        await tx.auditLog.create({
          data: {
            userId,
            action: 'INVOICE_GENERATED',
            resource: 'invoice',
            resourceId: createdInvoice.id,
            newValues: JSON.stringify({
              invoiceNumber: createdInvoice.invoiceNumber,
              amount: createdInvoice.amount,
              billingPeriod: `${adjustedMonth + 1}/${invoiceYear}`,
            }),
          },
        });

        return {
          ...createdInvoice,
          items: invoiceItems,
        };
      });

      // Concurrent generation can race on the sequential invoice number — retry
      // on the unique-constraint violation so a fresh number is picked each attempt
      const maxAttempts = 3;
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          return await createInvoice();
        } catch (error) {
          const isUniqueViolation = (error as { code?: string })?.code === 'P2002';
          if (!isUniqueViolation || attempt === maxAttempts) {
            throw error;
          }
        }
      }

      throw new Error('Failed to generate invoice');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to generate invoice: ${message}`);
    }
  }

  static async generateInvoiceNumber(): Promise<string> {
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = String(now.getUTCMonth() + 1).padStart(2, '0');

    const startOfMonth = new Date(Date.UTC(year, now.getUTCMonth(), 1));
    const endOfMonth = new Date(Date.UTC(year, now.getUTCMonth() + 1, 0, 23, 59, 59, 999));

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

      // Whitelist sortable columns — arbitrary input must not reach orderBy
      // ('total' is kept as an alias for the Invoice.amount column)
      const sortFieldMap: Record<string, string> = {
        createdAt: 'createdAt',
        amount: 'amount',
        total: 'amount',
        dueDate: 'dueDate',
        status: 'status',
      };
      const sortField = sortFieldMap[String(sortBy)] || 'createdAt';
      const order = sortOrder === 'asc' ? 'asc' : 'desc';

      const pageNumber = Math.max(parseInt(String(page), 10) || 1, 1);
      const pageSize = Math.min(Math.max(parseInt(String(limit), 10) || 10, 1), 100);
      const skip = (pageNumber - 1) * pageSize;
      const [invoices, total] = await Promise.all([
        prisma.invoice.findMany({
          where,
          orderBy: { [sortField]: order },
          skip,
          take: pageSize,
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
          page: pageNumber,
          limit: pageSize,
          total,
          totalPages: Math.ceil(total / pageSize),
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to get user invoices: ${message}`);
    }
  }

  static async applyDiscount(invoiceId: string, discountData: DiscountInput): Promise<InvoiceRecord> {
    try {
      const {
        discountCode, discountAmount, discountPercentage, reason,
      } = discountData;

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

      if (discountAmount !== undefined && discountAmount !== null) {
        finalDiscountAmount = parseFloat(String(discountAmount));
      } else if (discountPercentage !== undefined && discountPercentage !== null) {
        finalDiscountAmount = invoiceSubtotal * (parseFloat(String(discountPercentage)) / 100);
      }

      if (!Number.isFinite(finalDiscountAmount)) {
        finalDiscountAmount = 0;
      }

      // Clamp the discount into a sane range — never negative, never above the subtotal
      finalDiscountAmount = Math.min(Math.max(finalDiscountAmount, 0), invoiceSubtotal);

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
      const invoice = await prisma.invoice.findUnique({
        where: { id: invoiceId },
      }) as InvoiceRecord | null;

      if (!invoice) {
        throw new Error('Invoice not found');
      }

      // Already in the requested state — idempotent no-op (also avoids re-stamping paidAt)
      if (invoice.status === status) {
        return invoice;
      }

      const allowedTransitions = INVOICE_STATUS_TRANSITIONS[invoice.status] || [];
      if (!allowedTransitions.includes(status)) {
        throw new Error(`Cannot transition invoice from ${invoice.status} to ${status}`);
      }

      const paidAt = metadata.paidAt instanceof Date ? metadata.paidAt : new Date();

      const updatedInvoice = await prisma.invoice.update({
        where: { id: invoiceId },
        data: {
          status,
          ...(status === 'PAID' && { paidAt }),
        },
      }) as InvoiceRecord;

      // Attribute the audit entry to the real actor when provided; otherwise use
      // a system marker (null userId) instead of misattributing it to the invoice owner
      const actorUserId = typeof metadata.userId === 'string'
        ? metadata.userId
        : null;

      await prisma.auditLog.create({
        data: {
          userId: actorUserId,
          action: 'INVOICE_STATUS_UPDATED',
          resource: 'invoice',
          resourceId: invoiceId,
          newValues: JSON.stringify({
            status,
            ...metadata,
            actor: actorUserId || 'system',
          }),
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

  /**
   * NOTE: webhook event dedup is in-memory only — it resets on restart and is
   * scoped to this process. Replace with a persistent store (DB/Redis) before
   * running multiple instances.
   */
  private static processedWebhookEventIds = new Set<string>();

  static parseGatewayResponse(raw: string | null | undefined): Record<string, any> {
    try {
      const parsed = JSON.parse(raw || '{}');
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }

  /**
   * Idempotency guard: finds the newest PENDING payment row for an invoice
   * whose Stripe PaymentIntent is still live (retrievable and not canceled),
   * so callers can reuse it instead of creating a duplicate intent + row.
   * Stale rows (canceled/missing intents) are marked FAILED along the way.
   */
  static async findReusablePayment(invoiceId: string): Promise<{ payment: PaymentRecord; paymentIntent: any } | null> {
    const pendingPayments = await prisma.payment.findMany({
      where: {
        invoiceId,
        status: 'PENDING',
        gatewayId: { not: null },
      },
      orderBy: { createdAt: 'desc' },
    }) as PaymentRecord[];

    for (const pending of pendingPayments) {
      let intent: any;
      try {
        intent = await stripe.paymentIntents.retrieve(pending.gatewayId as string);
      } catch (retrieveError) {
        const code = (retrieveError as { code?: string })?.code;
        if (code === 'resource_missing') {
          await prisma.payment.update({
            where: { id: pending.id },
            data: {
              status: 'FAILED',
              gatewayResponse: JSON.stringify({
                staleGatewayId: pending.gatewayId,
                reason: 'payment_intent_missing',
              }),
            },
          }).catch(() => {});
          continue;
        }
        // State of the existing intent is unknown — do NOT create a second
        // one, or the customer could end up charged twice.
        throw retrieveError;
      }

      if (intent.status !== 'canceled') {
        return { payment: pending, paymentIntent: intent };
      }

      // The intent was canceled: retire the stale row and keep looking.
      await prisma.payment.update({
        where: { id: pending.id },
        data: {
          status: 'FAILED',
          gatewayResponse: JSON.stringify({
            staleGatewayId: pending.gatewayId,
            paymentIntentStatus: intent.status,
          }),
        },
      }).catch(() => {});
    }

    return null;
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

      if (invoice.status === 'REFUNDED') {
        throw new Error('Invoice is refunded');
      }

      if (!['PENDING', 'OVERDUE'].includes(invoice.status)) {
        throw new Error(`Invoice cannot be paid while in ${invoice.status} status`);
      }

      // Reuse an existing live intent rather than creating a new Stripe
      // PaymentIntent + Payment row on every call.
      const reusable = await this.findReusablePayment(invoice.id);
      if (reusable) {
        if (reusable.paymentIntent.status === 'succeeded') {
          // Stripe already collected — reconcile our records before reporting.
          try {
            await prisma.$transaction([
              prisma.payment.update({
                where: { id: reusable.payment.id },
                data: { status: 'COMPLETED', processedAt: new Date() },
              }),
              prisma.invoice.update({
                where: { id: invoice.id },
                data: { status: 'PAID', paidAt: new Date() },
              }),
            ]);
          } catch (reconcileError) {
            console.error(`Failed to reconcile succeeded payment intent ${reusable.paymentIntent.id}:`, reconcileError);
          }
          throw new Error('Invoice is already paid');
        }

        return {
          paymentId: reusable.payment.id,
          clientSecret: reusable.paymentIntent.client_secret,
          amount: invoice.amount,
          currency: invoice.currency,
          status: reusable.paymentIntent.status,
          invoice: {
            id: invoice.id,
            invoiceNumber: invoice.invoiceNumber,
            total: Number(invoice.amount),
          },
        };
      }

      // Create the PENDING Payment row BEFORE the Stripe intent so a failure
      // after intent creation can never leave an untracked intent behind.
      const attempt = (await prisma.payment.count({ where: { invoiceId: invoice.id } })) + 1;

      const payment = await prisma.payment.create({
        data: {
          invoiceId: invoice.id,
          amount: roundTo(invoice.amount),
          currency: invoice.currency,
          method: 'STRIPE',
          status: 'PENDING',
          gatewayResponse: JSON.stringify({ attempt }),
        },
      }) as PaymentRecord;

      let paymentIntent: any;
      try {
        paymentIntent = await stripe.paymentIntents.create(
          {
            amount: Math.round(Number(invoice.amount) * 100),
            currency: invoice.currency.toLowerCase(),
            automatic_payment_methods: { enabled: true },
            metadata: {
              invoiceId: invoice.id,
              invoiceNumber: invoice.invoiceNumber,
              userId: invoice.userId,
              userEmail: invoice.user?.email,
              paymentId: payment.id,
            },
            description: `Payment for invoice ${invoice.invoiceNumber}`,
            receipt_email: invoice.user?.email,
          },
          { idempotencyKey: `pi:${invoice.id}:${attempt}` },
        );
      } catch (intentError) {
        await prisma.payment.update({
          where: { id: payment.id },
          data: {
            status: 'FAILED',
            gatewayResponse: JSON.stringify({
              attempt,
              error: intentError instanceof Error ? intentError.message : String(intentError),
            }),
          },
        }).catch(() => {});
        throw intentError;
      }

      // Store the gateway id as soon as it is known.
      await prisma.payment.update({
        where: { id: payment.id },
        data: {
          gatewayId: paymentIntent.id,
          gatewayResponse: JSON.stringify({
            attempt,
            clientSecret: paymentIntent.client_secret,
          }),
        },
      });

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
        status: paymentIntent.status,
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
      const { userId, isAdmin = false } = paymentData as PaymentIntentOptions & {
        userId?: string;
        isAdmin?: boolean;
      };

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

      // IDOR guard: only the invoice owner (or an admin) may pay it.
      if (!userId || (invoice.userId !== userId && !isAdmin)) {
        throw new Error('Unauthorized access to invoice');
      }

      if (invoice.status === 'PAID') {
        throw new Error('Invoice is already paid');
      }

      if (invoice.status === 'CANCELLED') {
        throw new Error('Invoice is cancelled');
      }

      if (invoice.status === 'REFUNDED') {
        throw new Error('Invoice is refunded');
      }

      if (!['PENDING', 'OVERDUE'].includes(invoice.status)) {
        throw new Error(`Invoice cannot be paid while in ${invoice.status} status`);
      }

      // Reuse the Stripe customer for this user instead of creating a
      // duplicate on every payment. The User model has no stripeCustomerId
      // column, so the email lookup is the link.
      let customerId: string | undefined;
      if (invoice.user?.email) {
        const existingCustomers = await stripe.customers.list({
          email: invoice.user.email,
          limit: 1,
        });
        customerId = existingCustomers?.data?.[0]?.id;
        if (!customerId) {
          const customer = await stripe.customers.create({
            email: invoice.user.email,
            metadata: {
              userId: invoice.user.id,
            },
          });
          customerId = customer.id;
        }
      }

      // Reuse an existing PENDING payment + live PaymentIntent for this
      // invoice instead of creating duplicates on retry.
      let payment: PaymentRecord | null = null;
      let paymentIntent: any = null;

      const reusable = await this.findReusablePayment(invoice.id);
      if (reusable) {
        ({ payment, paymentIntent } = reusable);
      }

      if (!payment || !paymentIntent) {
        // Create the PENDING Payment row BEFORE charging so a post-charge
        // failure can never leave a succeeded charge with no local record.
        const attempt = (await prisma.payment.count({ where: { invoiceId: invoice.id } })) + 1;

        payment = await prisma.payment.create({
          data: {
            invoiceId: invoice.id,
            amount: roundTo(invoice.amount),
            currency: invoice.currency,
            method: 'STRIPE',
            status: 'PENDING',
            gatewayResponse: JSON.stringify({
              attempt,
              stripeCustomerId: customerId || null,
            }),
          },
        }) as PaymentRecord;

        try {
          paymentIntent = await stripe.paymentIntents.create(
            {
              amount: Math.round(Number(invoice.amount) * 100),
              currency: invoice.currency.toLowerCase(),
              ...(customerId ? { customer: customerId } : {}),
              confirm: false,
              automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
              metadata: {
                invoiceId: invoice.id,
                invoiceNumber: invoice.invoiceNumber,
                userId: invoice.user.id,
                paymentId: payment.id,
              },
              description: `Payment for invoice ${invoice.invoiceNumber}`,
            },
            { idempotencyKey: `pi:${invoice.id}:${attempt}` },
          );
        } catch (intentError) {
          await prisma.payment.update({
            where: { id: payment.id },
            data: {
              status: 'FAILED',
              gatewayResponse: JSON.stringify({
                attempt,
                stripeCustomerId: customerId || null,
                error: intentError instanceof Error ? intentError.message : String(intentError),
              }),
            },
          }).catch(() => {});
          throw intentError;
        }

        // Store the gateway id as soon as it is known.
        await prisma.payment.update({
          where: { id: payment.id },
          data: { gatewayId: paymentIntent.id },
        });
      }

      // Confirm the intent server-side. Intents in requires_action/processing/
      // succeeded are NOT re-confirmed — the client finishes them via the
      // returned clientSecret (3DS etc.) or they are already settled.
      let confirmed = paymentIntent;
      if (['requires_confirmation', 'requires_payment_method'].includes(paymentIntent.status)) {
        if (paymentIntent.status === 'requires_payment_method' && !paymentMethodId) {
          return {
            success: false,
            paymentId: payment.id,
            status: paymentIntent.status,
            clientSecret: paymentIntent.client_secret,
            invoice: {
              id: invoice.id,
              invoiceNumber: invoice.invoiceNumber,
              status: invoice.status,
            },
          };
        }

        try {
          confirmed = await stripe.paymentIntents.confirm(
            paymentIntent.id,
            paymentMethodId ? { payment_method: paymentMethodId } : {},
            { idempotencyKey: `pic:${payment.id}` },
          );
        } catch (confirmError) {
          const stripeError = confirmError as {
            type?: string;
            code?: string;
            message?: string;
            payment_intent?: any;
          };

          if (stripeError?.type === 'StripeCardError' || stripeError?.payment_intent) {
            // Card declined / invalid: keep the row PENDING so the intent can
            // be retried, record the failure and let the client act on it.
            const failedIntent = stripeError.payment_intent || paymentIntent;
            const priorGateway = this.parseGatewayResponse(payment.gatewayResponse);
            await prisma.payment.update({
              where: { id: payment.id },
              data: {
                gatewayResponse: JSON.stringify({
                  ...priorGateway,
                  stripeCustomerId: customerId || priorGateway.stripeCustomerId || null,
                  lastError: stripeError.message || 'Payment confirmation failed',
                  paymentIntentStatus: failedIntent.status || paymentIntent.status,
                }),
              },
            }).catch(() => {});

            return {
              success: false,
              paymentId: payment.id,
              status: failedIntent.status || 'requires_payment_method',
              clientSecret: failedIntent.client_secret || paymentIntent.client_secret,
              error: stripeError.message || 'Payment confirmation failed',
              invoice: {
                id: invoice.id,
                invoiceNumber: invoice.invoiceNumber,
                status: invoice.status,
              },
            };
          }

          throw confirmError;
        }
      }

      const priorGateway = this.parseGatewayResponse(payment.gatewayResponse);
      const mergedGatewayResponse = JSON.stringify({
        ...priorGateway,
        stripeCustomerId: customerId || priorGateway.stripeCustomerId || null,
        paymentIntentStatus: confirmed.status,
        paymentMethodId: paymentMethodId || priorGateway.paymentMethodId || null,
      });

      if (confirmed.status === 'succeeded') {
        // Post-charge writes are wrapped so a failure here can NEVER mask the
        // succeeded charge — log loudly for reconciliation (the
        // payment_intent.succeeded webhook will also settle the records).
        try {
          await prisma.$transaction([
            prisma.payment.update({
              where: { id: payment.id },
              data: {
                status: 'COMPLETED',
                processedAt: new Date(),
                gatewayResponse: mergedGatewayResponse,
              },
            }),
            prisma.invoice.update({
              where: { id: invoiceId },
              data: {
                status: 'PAID',
                paidAt: new Date(),
              },
            }),
          ]);

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
                paymentIntentId: confirmed.id,
              }),
            },
          });
        } catch (recordError) {
          console.error(
            `CRITICAL: Stripe payment intent ${confirmed.id} succeeded but post-charge DB writes failed; manual reconciliation required`,
            recordError,
          );
        }
      } else {
        await prisma.payment.update({
          where: { id: payment.id },
          data: { gatewayResponse: mergedGatewayResponse },
        }).catch(() => {});
      }

      // Save the payment method for reuse only after a successful-ish charge
      // attempt; attach failures must not fail the payment.
      if (savePaymentMethod && paymentMethodId && customerId && confirmed.status !== 'requires_payment_method') {
        try {
          await stripe.paymentMethods.attach(paymentMethodId, {
            customer: customerId,
          });
        } catch (attachError) {
          console.warn(`Failed to attach payment method ${paymentMethodId} to customer ${customerId}:`, attachError);
        }
      }

      return {
        success: confirmed.status === 'succeeded',
        paymentId: payment.id,
        status: confirmed.status,
        clientSecret: confirmed.client_secret,
        invoice: {
          id: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          status: confirmed.status === 'succeeded' ? 'PAID' : invoice.status,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to process payment: ${message}`);
    }
  }

  static async handleWebhook(event: any): Promise<Record<string, unknown>> {
    try {
      // Event-level dedup: Stripe retries deliveries, so the same event.id can
      // arrive multiple times and must only be processed once.
      const eventId = typeof event?.id === 'string' ? event.id : undefined;
      if (eventId) {
        if (this.processedWebhookEventIds.has(eventId)) {
          return { handled: true, duplicate: true, eventId };
        }
        this.processedWebhookEventIds.add(eventId);
        // Bound memory usage once the set grows large.
        if (this.processedWebhookEventIds.size > 10000) {
          this.processedWebhookEventIds.clear();
        }
      }

      switch (event.type) {
        case 'payment_intent.succeeded':
          return await this.handlePaymentSuccess(event.data.object, eventId);
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

  static async handlePaymentSuccess(paymentIntent: any, eventId?: string): Promise<Record<string, unknown>> {
    try {
      if (!paymentIntent.metadata?.invoiceId) {
        console.warn(`payment_intent.succeeded ${paymentIntent.id} missing invoiceId metadata`);
        return { handled: false, reason: 'missing_invoice_metadata', gatewayId: paymentIntent.id };
      }

      const payment = await prisma.payment.findFirst({
        where: { gatewayId: paymentIntent.id },
        include: {
          invoice: {
            select: {
              id: true,
              userId: true,
              amount: true,
              currency: true,
              status: true,
            },
          },
        },
      }) as (PaymentRecord & {
        invoice: {
          id: string;
          userId: string;
          amount: NumericLike;
          currency: string;
          status: string;
        } | null;
      }) | null;

      if (!payment) {
        // Unknown intent: acknowledge (200) so Stripe does not retry for days.
        console.warn(`payment_intent.succeeded for unknown gatewayId ${paymentIntent.id}`);
        return { handled: false, reason: 'payment_record_not_found', gatewayId: paymentIntent.id };
      }

      const { invoiceId } = payment;

      // Verify the charged amount/currency actually matches the invoice
      // before marking anything PAID.
      const expectedAmount = Math.round(Number(payment.invoice?.amount ?? payment.amount) * 100);
      const expectedCurrency = String(payment.invoice?.currency || payment.currency || '').toLowerCase();
      const receivedCurrency = String(paymentIntent.currency || '').toLowerCase();

      if (
        paymentIntent.amount !== expectedAmount
        || (expectedCurrency && receivedCurrency && receivedCurrency !== expectedCurrency)
      ) {
        console.error(
          `Payment intent ${paymentIntent.id} amount/currency mismatch: expected ${expectedAmount} ${expectedCurrency}, received ${paymentIntent.amount} ${receivedCurrency}`,
        );
        await prisma.auditLog.create({
          data: {
            userId: payment.invoice?.userId,
            action: 'PAYMENT_AMOUNT_MISMATCH',
            resource: 'payment',
            resourceId: payment.id,
            newValues: JSON.stringify({
              invoiceId,
              paymentIntentId: paymentIntent.id,
              expectedAmount,
              receivedAmount: paymentIntent.amount,
              expectedCurrency,
              receivedCurrency,
              eventId,
            }),
          },
        }).catch(() => {});
        return { handled: false, reason: 'amount_mismatch', paymentId: payment.id };
      }

      // Only PENDING/OVERDUE invoices may transition to PAID — terminal states
      // (PAID/CANCELLED/REFUNDED) no-op. The payment row is still reconciled
      // so it reflects the real charge.
      const invoiceStatus = payment.invoice?.status || '';
      const invoicePayable = ['PENDING', 'OVERDUE'].includes(invoiceStatus);
      if (!invoicePayable) {
        console.warn(
          `payment_intent.succeeded for invoice ${invoiceId} in terminal status ${invoiceStatus}; leaving invoice unchanged`,
        );
      }

      const priorGateway = this.parseGatewayResponse(payment.gatewayResponse);

      await prisma.$transaction([
        prisma.payment.update({
          where: { id: payment.id },
          data: {
            status: 'COMPLETED',
            processedAt: new Date(),
            gatewayResponse: JSON.stringify({
              ...priorGateway,
              paymentIntentStatus: paymentIntent.status,
              webhookProcessedAt: new Date().toISOString(),
              ...(eventId ? { eventId } : {}),
            }),
          },
        }),
        ...(invoicePayable
          ? [
            prisma.invoice.update({
              where: { id: invoiceId },
              data: {
                status: 'PAID',
                paidAt: new Date(),
              },
            }),
          ]
          : []),
        prisma.auditLog.create({
          data: {
            userId: payment.invoice?.userId,
            action: 'PAYMENT_WEBHOOK_SUCCESS',
            resource: 'payment',
            resourceId: payment.id,
            newValues: JSON.stringify({
              invoiceId,
              paymentIntentId: paymentIntent.id,
              amount: paymentIntent.amount / 100,
              invoiceUpdated: invoicePayable,
              eventId,
            }),
          },
        }),
      ]);

      return {
        handled: true,
        paymentId: payment.id,
        invoiceId,
        status: 'COMPLETED',
        invoiceUpdated: invoicePayable,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to handle payment success: ${message}`);
    }
  }

  static async handlePaymentFailure(paymentIntent: any): Promise<Record<string, unknown>> {
    try {
      if (!paymentIntent.metadata?.invoiceId) {
        console.warn(`payment_intent.payment_failed ${paymentIntent.id} missing invoiceId metadata`);
        return { handled: false, reason: 'missing_invoice_metadata', gatewayId: paymentIntent.id };
      }

      const { invoiceId } = paymentIntent.metadata;

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
        // Unknown intent: acknowledge (200) so Stripe does not retry for days.
        console.warn(`payment_intent.payment_failed for unknown gatewayId ${paymentIntent.id}`);
        return { handled: false, reason: 'payment_record_not_found', gatewayId: paymentIntent.id };
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
      if (!paymentIntentId) {
        return { handled: false, reason: 'missing_payment_intent' };
      }

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
        // Unknown intent: acknowledge (200) so Stripe does not retry for days.
        console.warn(`charge.refunded for unknown payment_intent ${paymentIntentId}`);
        return { handled: false, reason: 'payment_record_not_found', gatewayId: paymentIntentId };
      }

      // charge.amount_refunded is the CUMULATIVE refunded amount in cents —
      // partial refunds must not flip payment/invoice to REFUNDED.
      const refundedTotal = roundTo((charge.amount_refunded || 0) / 100);
      const paymentAmount = Number(payment.amount);
      const fullyRefunded = charge.refunded === true || refundedTotal >= paymentAmount - 0.0001;

      const priorGateway = this.parseGatewayResponse(payment.gatewayResponse);

      await prisma.$transaction([
        prisma.payment.update({
          where: { id: payment.id },
          data: {
            status: fullyRefunded ? 'REFUNDED' : 'COMPLETED',
            gatewayResponse: JSON.stringify({
              ...priorGateway,
              refundedTotal,
              lastRefundChargeId: charge.id,
              webhookProcessedAt: new Date().toISOString(),
            }),
          },
        }),
        ...(fullyRefunded
          ? [
            prisma.invoice.update({
              where: { id: payment.invoiceId },
              data: {
                status: 'REFUNDED',
              },
            }),
          ]
          : []),
        prisma.auditLog.create({
          data: {
            userId: payment.invoice?.userId,
            action: 'PAYMENT_REFUNDED',
            resource: 'payment',
            resourceId: payment.id,
            newValues: JSON.stringify({
              invoiceId: payment.invoiceId,
              refundedTotal,
              fullyRefunded,
              chargeId: charge.id,
            }),
          },
        }),
      ]);

      return {
        handled: true,
        paymentId: payment.id,
        invoiceId: payment.invoiceId,
        status: fullyRefunded ? 'REFUNDED' : 'PARTIALLY_REFUNDED',
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
      const { notes } = refundData as RefundInput & { notes?: string };

      const payment = await prisma.payment.findUnique({
        where: { id: paymentId },
        include: { invoice: true },
      }) as (PaymentRecord & { invoice: InvoiceRecord }) | null;

      if (!payment) {
        throw new Error('Payment not found');
      }

      if (payment.status !== 'COMPLETED') {
        throw new Error('Can only refund completed payments');
      }

      if (!payment.gatewayId) {
        throw new Error('Stripe payment intent ID not found');
      }

      // Track refunded total across partial refunds via gatewayResponse.
      const priorGateway = this.parseGatewayResponse(payment.gatewayResponse);
      const priorRefunds: Array<Record<string, any>> = Array.isArray(priorGateway.refunds)
        ? priorGateway.refunds
        : [];
      const alreadyRefunded = roundTo(
        typeof priorGateway.refundedTotal === 'number'
          ? priorGateway.refundedTotal
          : priorRefunds.reduce((sum: number, entry) => sum + Number(entry?.amount || 0), 0),
      );

      const paymentAmount = roundTo(payment.amount);
      const refundable = roundTo(paymentAmount - alreadyRefunded);
      if (refundable <= 0) {
        throw new Error('Payment has already been fully refunded');
      }

      // Refund amount may never exceed what is left of the original payment.
      const requestedAmount = amount !== undefined && amount !== null
        ? roundTo(parseFloat(String(amount)))
        : refundable;

      if (!Number.isFinite(requestedAmount) || requestedAmount <= 0) {
        throw new Error('Refund amount must be positive');
      }

      if (requestedAmount > refundable) {
        throw new Error(`Refund amount exceeds refundable balance of ${refundable}`);
      }

      // Stripe only accepts a fixed enum of refund reasons; any free-text
      // justification is forwarded via metadata instead.
      const stripeRefundReasons = ['duplicate', 'fraudulent', 'requested_by_customer', 'expired_uncaptured_charge'];
      const stripeReason = stripeRefundReasons.includes(String(reason))
        ? String(reason)
        : 'requested_by_customer';

      const refund = await stripe.refunds.create(
        {
          payment_intent: payment.gatewayId,
          amount: Math.round(requestedAmount * 100),
          reason: stripeReason,
          metadata: {
            paymentId: payment.id,
            invoiceId: payment.invoiceId,
            ...(notes ? { notes: String(notes) } : {}),
            ...(reason && !stripeRefundReasons.includes(String(reason))
              ? { reasonText: String(reason) }
              : {}),
          },
        },
        // Scoped per refund attempt so legitimate partial refunds are not
        // swallowed while retries of one attempt stay idempotent.
        { idempotencyKey: `refund:${payment.id}:${priorRefunds.length + 1}` },
      );

      const refundedTotal = roundTo(alreadyRefunded + refund.amount / 100);
      const fullyRefunded = refundedTotal >= paymentAmount - 0.0001;

      await prisma.$transaction([
        prisma.payment.update({
          where: { id: paymentId },
          data: {
            // Only a full refund flips the payment to REFUNDED — partial
            // refunds keep it COMPLETED (and the invoice PAID).
            status: fullyRefunded ? 'REFUNDED' : 'COMPLETED',
            gatewayResponse: JSON.stringify({
              ...priorGateway,
              refundedTotal,
              refunds: [
                ...priorRefunds,
                {
                  refundId: refund.id,
                  amount: refund.amount / 100,
                  reason: stripeReason,
                  notes: notes || null,
                  refundedAt: new Date().toISOString(),
                },
              ],
            }),
          },
        }),
        ...(fullyRefunded
          ? [
            prisma.invoice.update({
              where: { id: payment.invoiceId },
              data: {
                status: 'REFUNDED',
              },
            }),
          ]
          : []),
        prisma.auditLog.create({
          data: {
            userId: payment.invoice.userId,
            action: 'PAYMENT_REFUND_INITIATED',
            resource: 'payment',
            resourceId: paymentId,
            newValues: JSON.stringify({
              refundId: refund.id,
              refundAmount: refund.amount / 100,
              refundedTotal,
              fullyRefunded,
              reason: stripeReason,
              notes: notes || null,
            }),
          },
        }),
      ]);

      return {
        success: true,
        refundId: refund.id,
        amount: refund.amount / 100,
        refundedTotal,
        fullyRefunded,
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

  static verifyWebhookSignature(payload: string | Buffer, signature: string): any {
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
