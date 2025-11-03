const { prisma } = require('../config/database');
const ValidationHelpers = require('../utils/validation.helpers');

/**
 * Billing Service
 * Handles usage tracking, cost calculation, and billing operations
 */
class BillingService {
    /**
     * Record VM usage for billing
     * @param {string} vmId - Virtual Machine ID
     * @param {Object} usageData - Usage data
     * @returns {Promise<Object>} Created usage record
     */
    static async recordUsage(vmId, usageData) {
        try {
            const { cpuUsage, ramUsage, storageUsage, bandwidthUsage, duration } = usageData;

            // Get VM details for cost calculation
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
            });

            if (!vm) {
                throw new Error('VM not found');
            }

            // Calculate cost for this usage period
            const cost = this.calculateUsageCost({
                vm,
                cpuUsage,
                ramUsage,
                storageUsage,
                bandwidthUsage,
                duration,
            });

            // Create usage record
            const usageRecord = await prisma.usageRecord.create({
                data: {
                    vmId,
                    cpuUsage: parseFloat(cpuUsage),
                    ramUsage: parseFloat(ramUsage),
                    storageUsage: parseFloat(storageUsage),
                    bandwidthUsage: parseFloat(bandwidthUsage),
                    duration: parseInt(duration),
                    cost: parseFloat(cost.toFixed(4)),
                    timestamp: new Date(),
                },
            });

            return usageRecord;
        } catch (error) {
            throw new Error(`Failed to record usage: ${error.message}`);
        }
    }

    /**
     * Calculate cost for usage period
     * @param {Object} params - Calculation parameters
     * @returns {number} Calculated cost
     */
    static calculateUsageCost(params) {
        const { vm, cpuUsage, ramUsage, storageUsage, bandwidthUsage, duration } = params;

        // Base hourly rate from VM configuration
        const baseHourlyRate = parseFloat(vm.hourlyRate);

        // Calculate actual usage percentage
        const cpuUtilization = cpuUsage / 100; // Convert percentage to decimal
        const ramUtilization = ramUsage / vm.ram; // Actual RAM used / Total RAM
        const storageUtilization = storageUsage / vm.storage; // Actual storage / Total storage

        // Bandwidth cost (per GB)
        const bandwidthCostPerGB = 0.01; // $0.01 per GB
        const bandwidthCost = (bandwidthUsage / 1024) * bandwidthCostPerGB; // Convert MB to GB

        // Calculate weighted cost based on actual usage
        // CPU and RAM are the primary cost factors
        const cpuWeight = 0.4;
        const ramWeight = 0.4;
        const storageWeight = 0.2;

        const utilizationFactor =
            cpuUtilization * cpuWeight +
            ramUtilization * ramWeight +
            storageUtilization * storageWeight;

        // Calculate cost for the duration (in minutes)
        const hourlyUsageCost = baseHourlyRate * utilizationFactor;
        const minuteCost = hourlyUsageCost / 60;
        const totalCost = minuteCost * duration + bandwidthCost;

        return totalCost;
    }

    /**
     * Get usage records for a VM
     * @param {string} vmId - Virtual Machine ID
     * @param {Object} options - Query options
     * @returns {Promise<Object>} Usage records with pagination
     */
    static async getVMUsage(vmId, options = {}) {
        try {
            const {
                startDate,
                endDate,
                page = 1,
                limit = 100,
                groupBy = 'hour',
            } = options;

            // Build where clause
            const where = { vmId };

            if (startDate || endDate) {
                where.timestamp = {};
                if (startDate) where.timestamp.gte = new Date(startDate);
                if (endDate) where.timestamp.lte = new Date(endDate);
            }

            // Get paginated records
            const skip = (parseInt(page) - 1) * parseInt(limit);
            const [records, total] = await Promise.all([
                prisma.usageRecord.findMany({
                    where,
                    orderBy: { timestamp: 'desc' },
                    skip,
                    take: parseInt(limit),
                }),
                prisma.usageRecord.count({ where }),
            ]);

            // Calculate aggregated statistics
            const stats = await this.calculateUsageStatistics(vmId, { startDate, endDate });

            return {
                data: records,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total,
                    totalPages: Math.ceil(total / parseInt(limit)),
                },
                statistics: stats,
            };
        } catch (error) {
            throw new Error(`Failed to get VM usage: ${error.message}`);
        }
    }

    /**
     * Calculate usage statistics for a VM
     * @param {string} vmId - Virtual Machine ID
     * @param {Object} options - Query options
     * @returns {Promise<Object>} Usage statistics
     */
    static async calculateUsageStatistics(vmId, options = {}) {
        try {
            const { startDate, endDate } = options;

            const where = { vmId };
            if (startDate || endDate) {
                where.timestamp = {};
                if (startDate) where.timestamp.gte = new Date(startDate);
                if (endDate) where.timestamp.lte = new Date(endDate);
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
                totalCost: parseFloat((aggregation._sum.cost || 0).toFixed(2)),
                totalDuration: aggregation._sum.duration || 0,
                totalBandwidth: parseFloat(((aggregation._sum.bandwidthUsage || 0) / 1024).toFixed(2)), // Convert to GB
                averages: {
                    cpu: parseFloat((aggregation._avg.cpuUsage || 0).toFixed(2)),
                    ram: parseFloat((aggregation._avg.ramUsage || 0).toFixed(2)),
                    storage: parseFloat((aggregation._avg.storageUsage || 0).toFixed(2)),
                    bandwidth: parseFloat((aggregation._avg.bandwidthUsage || 0).toFixed(2)),
                },
                peaks: {
                    cpu: parseFloat((aggregation._max.cpuUsage || 0).toFixed(2)),
                    ram: parseFloat((aggregation._max.ramUsage || 0).toFixed(2)),
                    storage: parseFloat((aggregation._max.storageUsage || 0).toFixed(2)),
                    bandwidth: parseFloat((aggregation._max.bandwidthUsage || 0).toFixed(2)),
                },
            };
        } catch (error) {
            throw new Error(`Failed to calculate usage statistics: ${error.message}`);
        }
    }

    /**
     * Get user's total usage across all VMs
     * @param {string} userId - User ID
     * @param {Object} options - Query options
     * @returns {Promise<Object>} User usage summary
     */
    static async getUserUsage(userId, options = {}) {
        try {
            const { startDate, endDate } = options;

            // Get all user's VMs
            const userVMs = await prisma.virtualMachine.findMany({
                where: { userId },
                select: { id: true, name: true },
            });

            const vmIds = userVMs.map((vm) => vm.id);

            if (vmIds.length === 0) {
                return {
                    totalCost: 0,
                    totalDuration: 0,
                    totalBandwidth: 0,
                    vmCount: 0,
                    vms: [],
                };
            }

            // Build where clause
            const where = { vmId: { in: vmIds } };
            if (startDate || endDate) {
                where.timestamp = {};
                if (startDate) where.timestamp.gte = new Date(startDate);
                if (endDate) where.timestamp.lte = new Date(endDate);
            }

            // Get aggregated usage
            const aggregation = await prisma.usageRecord.aggregate({
                where,
                _sum: {
                    cost: true,
                    duration: true,
                    bandwidthUsage: true,
                },
            });

            // Get usage per VM
            const vmUsage = await Promise.all(
                userVMs.map(async (vm) => {
                    const stats = await this.calculateUsageStatistics(vm.id, { startDate, endDate });
                    return {
                        vmId: vm.id,
                        vmName: vm.name,
                        ...stats,
                    };
                })
            );

            return {
                totalCost: parseFloat((aggregation._sum.cost || 0).toFixed(2)),
                totalDuration: aggregation._sum.duration || 0,
                totalBandwidth: parseFloat(((aggregation._sum.bandwidthUsage || 0) / 1024).toFixed(2)),
                vmCount: userVMs.length,
                vms: vmUsage,
            };
        } catch (error) {
            throw new Error(`Failed to get user usage: ${error.message}`);
        }
    }

    /**
     * Start real-time usage tracking for a VM
     * @param {string} vmId - Virtual Machine ID
     * @returns {Promise<void>}
     */
    static async startUsageTracking(vmId) {
        try {
            // Verify VM exists and is running
            const vm = await prisma.virtualMachine.findUnique({
                where: { id: vmId },
            });

            if (!vm) {
                throw new Error('VM not found');
            }

            if (vm.status !== 'RUNNING') {
                throw new Error('VM must be running to track usage');
            }

            // Create initial usage record
            await this.recordUsage(vmId, {
                cpuUsage: 0,
                ramUsage: 0,
                storageUsage: 0,
                bandwidthUsage: 0,
                duration: 0,
            });

            // Log tracking start
            await prisma.auditLog.create({
                data: {
                    userId: vm.userId,
                    action: 'USAGE_TRACKING_STARTED',
                    resource: 'usage',
                    resourceId: vmId,
                    newValues: {
                        vmId,
                        vmName: vm.name,
                        startedAt: new Date(),
                    },
                },
            });

            return { success: true, message: 'Usage tracking started' };
        } catch (error) {
            throw new Error(`Failed to start usage tracking: ${error.message}`);
        }
    }

    /**
     * Stop usage tracking for a VM
     * @param {string} vmId - Virtual Machine ID
     * @returns {Promise<void>}
     */
    static async stopUsageTracking(vmId) {
        try {
            const vm = await prisma.virtualMachine.findUnique({
                where: { id: vmId },
            });

            if (!vm) {
                throw new Error('VM not found');
            }

            // Log tracking stop
            await prisma.auditLog.create({
                data: {
                    userId: vm.userId,
                    action: 'USAGE_TRACKING_STOPPED',
                    resource: 'usage',
                    resourceId: vmId,
                    newValues: {
                        vmId,
                        vmName: vm.name,
                        stoppedAt: new Date(),
                    },
                },
            });

            return { success: true, message: 'Usage tracking stopped' };
        } catch (error) {
            throw new Error(`Failed to stop usage tracking: ${error.message}`);
        }
    }

    /**
     * Collect current usage metrics from Docker container
     * @param {string} vmId - Virtual Machine ID
     * @returns {Promise<Object>} Current usage metrics
     */
    static async collectCurrentUsage(vmId) {
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
            });

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

            // Get Docker service for container stats
            const dockerService = require('./dockerService');
            const containerStats = await dockerService.getContainerStats(vm.dockerContainerId);

            // Extract usage metrics
            const cpuUsage = containerStats.cpu_stats?.cpu_usage?.total_usage || 0;
            const ramUsage = containerStats.memory_stats?.usage || 0;

            // Calculate percentages and actual values
            const cpuPercent = this.calculateCPUPercent(containerStats);
            const ramMB = ramUsage / (1024 * 1024); // Convert bytes to MB

            // Storage usage (simplified - would need actual disk usage check)
            const storageUsage = vm.storage * 0.5; // Assume 50% usage for now

            // Bandwidth usage (from network stats)
            const networkStats = containerStats.networks || {};
            const bandwidthUsage = Object.values(networkStats).reduce(
                (total, net) => total + (net.rx_bytes || 0) + (net.tx_bytes || 0),
                0
            ) / (1024 * 1024); // Convert to MB

            return {
                cpuUsage: parseFloat(cpuPercent.toFixed(2)),
                ramUsage: parseFloat(ramMB.toFixed(2)),
                storageUsage: parseFloat(storageUsage.toFixed(2)),
                bandwidthUsage: parseFloat(bandwidthUsage.toFixed(2)),
            };
        } catch (error) {
            console.error('Error collecting usage:', error);
            // Return zero usage on error
            return {
                cpuUsage: 0,
                ramUsage: 0,
                storageUsage: 0,
                bandwidthUsage: 0,
            };
        }
    }

    /**
     * Calculate CPU usage percentage from Docker stats
     * @param {Object} stats - Docker container stats
     * @returns {number} CPU usage percentage
     */
    static calculateCPUPercent(stats) {
        try {
            const cpuDelta =
                stats.cpu_stats.cpu_usage.total_usage -
                stats.precpu_stats.cpu_usage.total_usage;
            const systemDelta =
                stats.cpu_stats.system_cpu_usage - stats.precpu_stats.system_cpu_usage;
            const numberCpus = stats.cpu_stats.online_cpus || 1;

            if (systemDelta > 0 && cpuDelta > 0) {
                return (cpuDelta / systemDelta) * numberCpus * 100;
            }
            return 0;
        } catch (error) {
            return 0;
        }
    }

    /**
     * Periodic usage collection job (to be called by scheduler)
     * @returns {Promise<Object>} Collection results
     */
    static async collectAllRunningVMsUsage() {
        try {
            // Get all running VMs
            const runningVMs = await prisma.virtualMachine.findMany({
                where: { status: 'RUNNING' },
                select: { id: true, name: true, userId: true },
            });

            const results = {
                success: 0,
                failed: 0,
                total: runningVMs.length,
                errors: [],
            };

            // Collect usage for each VM
            for (const vm of runningVMs) {
                try {
                    const currentUsage = await this.collectCurrentUsage(vm.id);

                    // Record usage with 5-minute duration (typical collection interval)
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
                        error: error.message,
                    });
                }
            }

            return results;
        } catch (error) {
            throw new Error(`Failed to collect usage for running VMs: ${error.message}`);
        }
    }

    /**
     * Get usage summary for date range
     * @param {string} userId - User ID
     * @param {Object} options - Query options
     * @returns {Promise<Object>} Usage summary
     */
    static async getUsageSummary(userId, options = {}) {
        try {
            const { startDate, endDate, groupBy = 'day' } = options;

            const usage = await this.getUserUsage(userId, { startDate, endDate });

            // Get daily/hourly breakdown
            const breakdown = await this.getUsageBreakdown(userId, {
                startDate,
                endDate,
                groupBy,
            });

            return {
                summary: {
                    totalCost: usage.totalCost,
                    totalDuration: usage.totalDuration,
                    totalBandwidth: usage.totalBandwidth,
                    vmCount: usage.vmCount,
                },
                breakdown,
                vms: usage.vms,
            };
        } catch (error) {
            throw new Error(`Failed to get usage summary: ${error.message}`);
        }
    }

    /**
     * Get usage breakdown by time period
     * @param {string} userId - User ID
     * @param {Object} options - Query options
     * @returns {Promise<Array>} Usage breakdown
     */
    static async getUsageBreakdown(userId, options = {}) {
        try {
            const { startDate, endDate, groupBy = 'day' } = options;

            // Get all user's VMs
            const userVMs = await prisma.virtualMachine.findMany({
                where: { userId },
                select: { id: true },
            });

            const vmIds = userVMs.map((vm) => vm.id);

            if (vmIds.length === 0) {
                return [];
            }

            // Build where clause
            const where = { vmId: { in: vmIds } };
            if (startDate || endDate) {
                where.timestamp = {};
                if (startDate) where.timestamp.gte = new Date(startDate);
                if (endDate) where.timestamp.lte = new Date(endDate);
            }

            // Get all records
            const records = await prisma.usageRecord.findMany({
                where,
                orderBy: { timestamp: 'asc' },
            });

            // Group by time period
            const grouped = this.groupUsageByPeriod(records, groupBy);

            return grouped;
        } catch (error) {
            throw new Error(`Failed to get usage breakdown: ${error.message}`);
        }
    }

    /**
     * Group usage records by time period
     * @param {Array} records - Usage records
     * @param {string} groupBy - Grouping period (hour, day, week, month)
     * @returns {Array} Grouped usage data
     */
    static groupUsageByPeriod(records, groupBy) {
        const grouped = {};

        records.forEach((record) => {
            const date = new Date(record.timestamp);
            let key;

            switch (groupBy) {
                case 'hour':
                    key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:00`;
                    break;
                case 'day':
                    key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
                    break;
                case 'week':
                    const weekStart = new Date(date);
                    weekStart.setDate(date.getDate() - date.getDay());
                    key = `${weekStart.getFullYear()}-W${String(Math.ceil((weekStart.getDate() + 1) / 7)).padStart(2, '0')}`;
                    break;
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

            grouped[key].cost += parseFloat(record.cost);
            grouped[key].duration += record.duration;
            grouped[key].bandwidth += record.bandwidthUsage;
            grouped[key].records += 1;
        });

        // Convert to array and format
        return Object.values(grouped).map((item) => ({
            period: item.period,
            cost: parseFloat(item.cost.toFixed(2)),
            duration: item.duration,
            bandwidth: parseFloat((item.bandwidth / 1024).toFixed(2)), // Convert to GB
            records: item.records,
        }));
    }
    // ==================== Invoice Generation ====================

    /**
     * Generate monthly invoice for a user
     * @param {string} userId - User ID
     * @param {Object} options - Invoice options
     * @returns {Promise<Object>} Generated invoice
     */
    static async generateMonthlyInvoice(userId, options = {}) {
        try {
            const { month, year, dueInDays = 15 } = options;

            // Default to previous month if not specified
            const now = new Date();
            const invoiceMonth = month !== undefined ? month : now.getMonth() - 1;
            const invoiceYear = year || (invoiceMonth < 0 ? now.getFullYear() - 1 : now.getFullYear());
            const adjustedMonth = invoiceMonth < 0 ? 11 : invoiceMonth;

            // Calculate billing period
            const startDate = new Date(invoiceYear, adjustedMonth, 1);
            const endDate = new Date(invoiceYear, adjustedMonth + 1, 0, 23, 59, 59);

            // Check if invoice already exists for this period
            const existingInvoice = await prisma.invoice.findFirst({
                where: {
                    userId,
                    billingPeriodStart: startDate,
                    billingPeriodEnd: endDate,
                },
            });

            if (existingInvoice) {
                throw new Error('Invoice already exists for this billing period');
            }

            // Get user usage for the period
            const usage = await this.getUserUsage(userId, {
                startDate: startDate.toISOString(),
                endDate: endDate.toISOString(),
            });

            if (usage.totalCost === 0) {
                throw new Error('No usage found for this billing period');
            }

            // Calculate due date
            const dueDate = new Date();
            dueDate.setDate(dueDate.getDate() + dueInDays);

            // Calculate subtotal, tax, and total
            const subtotal = usage.totalCost;
            const taxRate = parseFloat(process.env.TAX_RATE) || 0.15; // 15% default
            const taxAmount = subtotal * taxRate;
            const total = subtotal + taxAmount;

            // Create invoice
            const invoice = await prisma.invoice.create({
                data: {
                    userId,
                    invoiceNumber: await this.generateInvoiceNumber(),
                    billingPeriodStart: startDate,
                    billingPeriodEnd: endDate,
                    subtotal: parseFloat(subtotal.toFixed(2)),
                    taxRate: parseFloat(taxRate.toFixed(4)),
                    taxAmount: parseFloat(taxAmount.toFixed(2)),
                    discountAmount: 0,
                    total: parseFloat(total.toFixed(2)),
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
            });

            // Create invoice items for each VM
            const invoiceItems = await Promise.all(
                usage.vms.map(async (vm) => {
                    return prisma.invoiceItem.create({
                        data: {
                            invoiceId: invoice.id,
                            description: `VM: ${vm.vmName}`,
                            quantity: 1,
                            unitPrice: parseFloat(vm.totalCost.toFixed(2)),
                            amount: parseFloat(vm.totalCost.toFixed(2)),
                            metadata: {
                                vmId: vm.vmId,
                                vmName: vm.vmName,
                                totalDuration: vm.totalDuration,
                                totalBandwidth: vm.totalBandwidth,
                                averageCPU: vm.averages?.cpu || 0,
                                averageRAM: vm.averages?.ram || 0,
                            },
                        },
                    });
                })
            );

            // Log invoice creation
            await prisma.auditLog.create({
                data: {
                    userId,
                    action: 'INVOICE_GENERATED',
                    resource: 'invoice',
                    resourceId: invoice.id,
                    newValues: {
                        invoiceNumber: invoice.invoiceNumber,
                        total: invoice.total,
                        billingPeriod: `${adjustedMonth + 1}/${invoiceYear}`,
                    },
                },
            });

            return {
                ...invoice,
                items: invoiceItems,
            };
        } catch (error) {
            throw new Error(`Failed to generate invoice: ${error.message}`);
        }
    }

    /**
     * Generate unique invoice number
     * @returns {Promise<string>} Invoice number
     */
    static async generateInvoiceNumber() {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');

        // Get count of invoices this month
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

    /**
     * Get invoice by ID
     * @param {string} invoiceId - Invoice ID
     * @param {string} userId - User ID (for ownership check)
     * @returns {Promise<Object>} Invoice details
     */
    static async getInvoiceById(invoiceId, userId = null) {
        try {
            const where = { id: invoiceId };
            if (userId) {
                where.userId = userId;
            }

            const invoice = await prisma.invoice.findUnique({
                where,
                include: {
                    user: {
                        select: {
                            id: true,
                            email: true,
                            firstName: true,
                            lastName: true,
                        },
                    },
                    items: {
                        orderBy: { createdAt: 'asc' },
                    },
                    payments: {
                        orderBy: { createdAt: 'desc' },
                    },
                },
            });

            return invoice;
        } catch (error) {
            throw new Error(`Failed to get invoice: ${error.message}`);
        }
    }

    /**
     * Get user invoices with pagination
     * @param {string} userId - User ID
     * @param {Object} options - Query options
     * @returns {Promise<Object>} Paginated invoices
     */
    static async getUserInvoices(userId, options = {}) {
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

            // Build where clause
            const where = { userId };

            if (status) {
                where.status = status;
            }

            if (startDate || endDate) {
                where.createdAt = {};
                if (startDate) where.createdAt.gte = new Date(startDate);
                if (endDate) where.createdAt.lte = new Date(endDate);
            }

            // Get paginated results
            const skip = (parseInt(page) - 1) * parseInt(limit);
            const [invoices, total] = await Promise.all([
                prisma.invoice.findMany({
                    where,
                    orderBy: { [sortBy]: sortOrder },
                    skip,
                    take: parseInt(limit),
                    include: {
                        items: true,
                        payments: {
                            orderBy: { createdAt: 'desc' },
                            take: 1,
                        },
                    },
                }),
                prisma.invoice.count({ where }),
            ]);

            return {
                data: invoices,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total,
                    totalPages: Math.ceil(total / parseInt(limit)),
                },
            };
        } catch (error) {
            throw new Error(`Failed to get user invoices: ${error.message}`);
        }
    }

    /**
     * Apply discount to invoice
     * @param {string} invoiceId - Invoice ID
     * @param {Object} discountData - Discount data
     * @returns {Promise<Object>} Updated invoice
     */
    static async applyDiscount(invoiceId, discountData) {
        try {
            const { discountCode, discountAmount, discountPercentage, reason } = discountData;

            // Get invoice
            const invoice = await prisma.invoice.findUnique({
                where: { id: invoiceId },
            });

            if (!invoice) {
                throw new Error('Invoice not found');
            }

            if (invoice.status !== 'PENDING') {
                throw new Error('Can only apply discount to pending invoices');
            }

            // Calculate discount amount
            let finalDiscountAmount = 0;

            if (discountAmount) {
                finalDiscountAmount = parseFloat(discountAmount);
            } else if (discountPercentage) {
                finalDiscountAmount = invoice.subtotal * (parseFloat(discountPercentage) / 100);
            }

            if (finalDiscountAmount > invoice.subtotal) {
                throw new Error('Discount amount cannot exceed subtotal');
            }

            // Calculate new total
            const newSubtotal = invoice.subtotal - finalDiscountAmount;
            const newTaxAmount = newSubtotal * invoice.taxRate;
            const newTotal = newSubtotal + newTaxAmount;

            // Update invoice
            const updatedInvoice = await prisma.invoice.update({
                where: { id: invoiceId },
                data: {
                    discountAmount: parseFloat(finalDiscountAmount.toFixed(2)),
                    discountCode: discountCode || null,
                    discountReason: reason || null,
                    taxAmount: parseFloat(newTaxAmount.toFixed(2)),
                    total: parseFloat(newTotal.toFixed(2)),
                },
                include: {
                    user: true,
                    items: true,
                },
            });

            // Log discount application
            await prisma.auditLog.create({
                data: {
                    userId: invoice.userId,
                    action: 'DISCOUNT_APPLIED',
                    resource: 'invoice',
                    resourceId: invoiceId,
                    newValues: {
                        discountCode,
                        discountAmount: finalDiscountAmount,
                        oldTotal: invoice.total,
                        newTotal,
                    },
                },
            });

            return updatedInvoice;
        } catch (error) {
            throw new Error(`Failed to apply discount: ${error.message}`);
        }
    }

    /**
     * Update invoice status
     * @param {string} invoiceId - Invoice ID
     * @param {string} status - New status
     * @param {Object} metadata - Additional metadata
     * @returns {Promise<Object>} Updated invoice
     */
    static async updateInvoiceStatus(invoiceId, status, metadata = {}) {
        try {
            const validStatuses = ['PENDING', 'PAID', 'OVERDUE', 'CANCELLED', 'REFUNDED'];

            if (!validStatuses.includes(status)) {
                throw new Error(`Invalid status. Must be one of: ${validStatuses.join(', ')}`);
            }

            const invoice = await prisma.invoice.findUnique({
                where: { id: invoiceId },
            });

            if (!invoice) {
                throw new Error('Invoice not found');
            }

            const updateData = { status };

            if (status === 'PAID') {
                updateData.paidAt = new Date();
            }

            const updatedInvoice = await prisma.invoice.update({
                where: { id: invoiceId },
                data: updateData,
                include: {
                    user: true,
                    items: true,
                },
            });

            // Log status change
            await prisma.auditLog.create({
                data: {
                    userId: invoice.userId,
                    action: 'INVOICE_STATUS_CHANGED',
                    resource: 'invoice',
                    resourceId: invoiceId,
                    oldValues: { status: invoice.status },
                    newValues: { status, ...metadata },
                },
            });

            return updatedInvoice;
        } catch (error) {
            throw new Error(`Failed to update invoice status: ${error.message}`);
        }
    }

    /**
     * Generate invoices for all users (batch job)
     * @param {Object} options - Generation options
     * @returns {Promise<Object>} Generation results
     */
    static async generateAllMonthlyInvoices(options = {}) {
        try {
            const { month, year } = options;

            // Get all active users with VMs
            const users = await prisma.user.findMany({
                where: {
                    isActive: true,
                    vms: {
                        some: {},
                    },
                },
                select: {
                    id: true,
                    email: true,
                    firstName: true,
                    lastName: true,
                },
            });

            const results = {
                success: 0,
                failed: 0,
                skipped: 0,
                total: users.length,
                errors: [],
                invoices: [],
            };

            for (const user of users) {
                try {
                    const invoice = await this.generateMonthlyInvoice(user.id, { month, year });
                    results.success++;
                    results.invoices.push({
                        userId: user.id,
                        userEmail: user.email,
                        invoiceId: invoice.id,
                        invoiceNumber: invoice.invoiceNumber,
                        total: invoice.total,
                    });
                } catch (error) {
                    if (error.message.includes('already exists')) {
                        results.skipped++;
                    } else if (error.message.includes('No usage found')) {
                        results.skipped++;
                    } else {
                        results.failed++;
                        results.errors.push({
                            userId: user.id,
                            userEmail: user.email,
                            error: error.message,
                        });
                    }
                }
            }

            return results;
        } catch (error) {
            throw new Error(`Failed to generate monthly invoices: ${error.message}`);
        }
    }

    /**
     * Check and mark overdue invoices
     * @returns {Promise<Object>} Update results
     */
    static async markOverdueInvoices() {
        try {
            const now = new Date();

            const result = await prisma.invoice.updateMany({
                where: {
                    status: 'PENDING',
                    dueDate: {
                        lt: now,
                    },
                },
                data: {
                    status: 'OVERDUE',
                },
            });

            return {
                updated: result.count,
                timestamp: now,
            };
        } catch (error) {
            throw new Error(`Failed to mark overdue invoices: ${error.message}`);
        }
    }

    /**
     * Get invoice statistics
     * @param {string} userId - User ID (optional, for user-specific stats)
     * @returns {Promise<Object>} Invoice statistics
     */
    static async getInvoiceStatistics(userId = null) {
        try {
            const where = userId ? { userId } : {};

            const [total, pending, paid, overdue, cancelled] = await Promise.all([
                prisma.invoice.count({ where }),
                prisma.invoice.count({ where: { ...where, status: 'PENDING' } }),
                prisma.invoice.count({ where: { ...where, status: 'PAID' } }),
                prisma.invoice.count({ where: { ...where, status: 'OVERDUE' } }),
                prisma.invoice.count({ where: { ...where, status: 'CANCELLED' } }),
            ]);

            const aggregation = await prisma.invoice.aggregate({
                where,
                _sum: {
                    total: true,
                    subtotal: true,
                    taxAmount: true,
                    discountAmount: true,
                },
            });

            return {
                counts: {
                    total,
                    pending,
                    paid,
                    overdue,
                    cancelled,
                },
                amounts: {
                    totalRevenue: parseFloat((aggregation._sum.total || 0).toFixed(2)),
                    totalSubtotal: parseFloat((aggregation._sum.subtotal || 0).toFixed(2)),
                    totalTax: parseFloat((aggregation._sum.taxAmount || 0).toFixed(2)),
                    totalDiscounts: parseFloat((aggregation._sum.discountAmount || 0).toFixed(2)),
                },
            };
        } catch (error) {
            throw new Error(`Failed to get invoice statistics: ${error.message}`);
        }
    }
}

module.exports = BillingService;
