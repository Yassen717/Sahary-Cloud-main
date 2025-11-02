const BillingService = require('../services/billingService');

/**
 * Billing Controller
 * Handles HTTP requests for billing and invoice operations
 */
class BillingController {
    /**
     * Get user invoices
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     */
    static async getUserInvoices(req, res) {
        try {
            const userId = req.user.userId;
            const { page, limit, status, startDate, endDate, sortBy, sortOrder } = req.query;

            const result = await BillingService.getUserInvoices(userId, {
                page,
                limit,
                status,
                startDate,
                endDate,
                sortBy,
                sortOrder,
            });

            res.status(200).json({
                success: true,
                message: 'Invoices retrieved successfully',
                data: result.data,
                pagination: result.pagination,
            });
        } catch (error) {
            res.status(400).json({
                success: false,
                error: 'Failed to get invoices',
                message: error.message,
            });
        }
    }

    /**
     * Get invoice by ID
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     */
    static async getInvoiceById(req, res) {
        try {
            const { id } = req.params;
            const userId = req.user.userId;
            const isAdmin = ['ADMIN', 'SUPER_ADMIN'].includes(req.user.role);

            const invoice = await BillingService.getInvoiceById(id, isAdmin ? null : userId);

            if (!invoice) {
                return res.status(404).json({
                    success: false,
                    error: 'Invoice not found',
                    message: 'Invoice not found or access denied',
                });
            }

            res.status(200).json({
                success: true,
                message: 'Invoice retrieved successfully',
                data: { invoice },
            });
        } catch (error) {
            res.status(400).json({
                success: false,
                error: 'Failed to get invoice',
                message: error.message,
            });
        }
    }

    /**
     * Get user usage
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     */
    static async getUserUsage(req, res) {
        try {
            const userId = req.user.userId;
            const { startDate, endDate } = req.query;

            const usage = await BillingService.getUserUsage(userId, {
                startDate,
                endDate,
            });

            res.status(200).json({
                success: true,
                message: 'Usage retrieved successfully',
                data: usage,
            });
        } catch (error) {
            res.status(400).json({
                success: false,
                error: 'Failed to get usage',
                message: error.message,
            });
        }
    }

    /**
     * Get usage summary
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     */
    static async getUsageSummary(req, res) {
        try {
            const userId = req.user.userId;
            const { startDate, endDate, groupBy } = req.query;

            const summary = await BillingService.getUsageSummary(userId, {
                startDate,
                endDate,
                groupBy,
            });

            res.status(200).json({
                success: true,
                message: 'Usage summary retrieved successfully',
                data: summary,
            });
        } catch (error) {
            res.status(400).json({
                success: false,
                error: 'Failed to get usage summary',
                message: error.message,
            });
        }
    }

    /**
     * Get VM usage
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     */
    static async getVMUsage(req, res) {
        try {
            const { vmId } = req.params;
            const { startDate, endDate, page, limit } = req.query;

            const usage = await BillingService.getVMUsage(vmId, {
                startDate,
                endDate,
                page,
                limit,
            });

            res.status(200).json({
                success: true,
                message: 'VM usage retrieved successfully',
                data: usage.data,
                pagination: usage.pagination,
                statistics: usage.statistics,
            });
        } catch (error) {
            res.status(400).json({
                success: false,
                error: 'Failed to get VM usage',
                message: error.message,
            });
        }
    }

    /**
     * Get pricing estimate
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     */
    static async getPricingEstimate(req, res) {
        try {
            const { cpu, ram, storage, bandwidth, duration } = req.body;

            // Validate resources
            const ValidationHelpers = require('../utils/validation.helpers');
            const resourceValidation = ValidationHelpers.validateVMResources({
                cpu,
                ram,
                storage,
                bandwidth: bandwidth || 1000,
            });

            if (!resourceValidation.isValid) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid resources',
                    message: resourceValidation.errors.join(', '),
                });
            }

            // Calculate pricing
            const hourlyRate = ValidationHelpers.calculateVMCost({
                cpu,
                ram,
                storage,
                bandwidth: bandwidth || 1000,
            });

            const estimates = {
                hourly: parseFloat(hourlyRate.toFixed(4)),
                daily: parseFloat((hourlyRate * 24).toFixed(2)),
                weekly: parseFloat((hourlyRate * 24 * 7).toFixed(2)),
                monthly: parseFloat((hourlyRate * 24 * 30).toFixed(2)),
                yearly: parseFloat((hourlyRate * 24 * 365).toFixed(2)),
            };

            if (duration) {
                estimates.custom = parseFloat((hourlyRate * duration).toFixed(2));
            }

            res.status(200).json({
                success: true,
                message: 'Pricing estimate calculated successfully',
                data: {
                    resources: { cpu, ram, storage, bandwidth: bandwidth || 1000 },
                    estimates,
                    currency: 'USD',
                    warnings: resourceValidation.warnings || [],
                },
            });
        } catch (error) {
            res.status(400).json({
                success: false,
                error: 'Pricing calculation failed',
                message: error.message,
            });
        }
    }

    /**
     * Apply discount to invoice (admin only)
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     */
    static async applyDiscount(req, res) {
        try {
            const { id } = req.params;
            const { discountCode, discountAmount, discountPercentage, reason } = req.body;

            const invoice = await BillingService.applyDiscount(id, {
                discountCode,
                discountAmount,
                discountPercentage,
                reason,
            });

            res.status(200).json({
                success: true,
                message: 'Discount applied successfully',
                data: { invoice },
            });
        } catch (error) {
            res.status(400).json({
                success: false,
                error: 'Failed to apply discount',
                message: error.message,
            });
        }
    }

    /**
     * Get invoice statistics
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     */
    static async getInvoiceStatistics(req, res) {
        try {
            const userId = req.user.userId;
            const isAdmin = ['ADMIN', 'SUPER_ADMIN'].includes(req.user.role);

            const stats = await BillingService.getInvoiceStatistics(isAdmin ? null : userId);

            res.status(200).json({
                success: true,
                message: 'Invoice statistics retrieved successfully',
                data: stats,
            });
        } catch (error) {
            res.status(400).json({
                success: false,
                error: 'Failed to get invoice statistics',
                message: error.message,
            });
        }
    }

    /**
     * Generate monthly invoice (admin only)
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     */
    static async generateMonthlyInvoice(req, res) {
        try {
            const { userId } = req.params;
            const { month, year, dueInDays } = req.body;

            const invoice = await BillingService.generateMonthlyInvoice(userId, {
                month,
                year,
                dueInDays,
            });

            res.status(201).json({
                success: true,
                message: 'Invoice generated successfully',
                data: { invoice },
            });
        } catch (error) {
            res.status(400).json({
                success: false,
                error: 'Failed to generate invoice',
                message: error.message,
            });
        }
    }

    /**
     * Generate all monthly invoices (admin only)
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     */
    static async generateAllMonthlyInvoices(req, res) {
        try {
            const { month, year } = req.body;

            const results = await BillingService.generateAllMonthlyInvoices({
                month,
                year,
            });

            res.status(200).json({
                success: true,
                message: 'Batch invoice generation completed',
                data: results,
            });
        } catch (error) {
            res.status(400).json({
                success: false,
                error: 'Failed to generate invoices',
                message: error.message,
            });
        }
    }

    /**
     * Mark overdue invoices (admin only)
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     */
    static async markOverdueInvoices(req, res) {
        try {
            const results = await BillingService.markOverdueInvoices();

            res.status(200).json({
                success: true,
                message: 'Overdue invoices marked successfully',
                data: results,
            });
        } catch (error) {
            res.status(400).json({
                success: false,
                error: 'Failed to mark overdue invoices',
                message: error.message,
            });
        }
    }

    /**
     * Get all invoices (admin only)
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     */
    static async getAllInvoices(req, res) {
        try {
            const { page, limit, status, userId, startDate, endDate, sortBy, sortOrder } =
                req.query;

            // Build options
            const options = {
                page,
                limit,
                status,
                startDate,
                endDate,
                sortBy,
                sortOrder,
            };

            // If userId is provided, get user invoices, otherwise get all
            const result = userId
                ? await BillingService.getUserInvoices(userId, options)
                : await BillingService.getUserInvoices(null, options);

            res.status(200).json({
                success: true,
                message: 'Invoices retrieved successfully',
                data: result.data,
                pagination: result.pagination,
            });
        } catch (error) {
            res.status(400).json({
                success: false,
                error: 'Failed to get invoices',
                message: error.message,
            });
        }
    }

    /**
     * Update invoice status (admin only)
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     */
    static async updateInvoiceStatus(req, res) {
        try {
            const { id } = req.params;
            const { status, metadata } = req.body;

            const invoice = await BillingService.updateInvoiceStatus(id, status, metadata);

            res.status(200).json({
                success: true,
                message: 'Invoice status updated successfully',
                data: { invoice },
            });
        } catch (error) {
            res.status(400).json({
                success: false,
                error: 'Failed to update invoice status',
                message: error.message,
            });
        }
    }
}

module.exports = BillingController;
