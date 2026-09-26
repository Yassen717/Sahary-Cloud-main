import BillingService from '../services/billingService';
import { roleHasPermission } from '../middlewares/rbac';
import ValidationHelpers from '../utils/validation.helpers';
import type {
  DiscountInput,
  InvoiceBatchOptions,
  InvoiceCreationOptions,
  InvoiceQueryOptions,
  InvoiceStatus,
  InvoiceStatusUpdateMetadata,
  UsageQueryOptions,
} from '../types/billing';

type BillingUser = {
  userId: string;
  role: string;
};

type BillingParams = Record<string, string>;

type BillingQuery = Record<string, string | undefined>;

type BillingBody = Record<string, unknown>;

type BillingRequest = {
  user?: BillingUser;
  params?: BillingParams;
  query?: BillingQuery;
  body?: BillingBody;
};

type BillingResponse = {
  status(code: number): BillingResponse;
  json(payload: unknown): unknown;
};

type PricingEstimateBody = {
  cpu?: number;
  ram?: number;
  storage?: number;
  bandwidth?: number;
  duration?: number;
};

const getAuthenticatedUser = (req: BillingRequest): BillingUser => {
  if (!req.user) {
    throw new Error('Authenticated user context is required');
  }

  return req.user;
};

// Map errors to a safe HTTP response without echoing internal error details
const sendError = (res: BillingResponse, error: unknown, fallback: string): void => {
  const message = error instanceof Error ? error.message : '';

  if (/authenticated user context/i.test(message)) {
    res.status(401).json({
      success: false,
      error: 'Authentication required',
      message: 'Please authenticate to access this resource',
    });
    return;
  }

  if (/not found/i.test(message)) {
    res.status(404).json({
      success: false,
      error: fallback,
      message: 'The requested resource was not found',
    });
    return;
  }

  res.status(500).json({
    success: false,
    error: fallback,
    message: 'An unexpected error occurred',
  });
};

class BillingController {
  static async getUserInvoices(req: BillingRequest, res: BillingResponse): Promise<void> {
    try {
      const user = getAuthenticatedUser(req);
      const query = req.query ?? {};

      const result = await BillingService.getUserInvoices(user.userId, {
        page: query.page,
        limit: query.limit,
        status: query.status as never,
        startDate: query.startDate,
        endDate: query.endDate,
        sortBy: query.sortBy,
        sortOrder: query.sortOrder as 'asc' | 'desc' | undefined,
      });

      res.status(200).json({
        success: true,
        message: 'Invoices retrieved successfully',
        data: result.data,
        pagination: result.pagination,
      });
    } catch (error: unknown) {
      sendError(res, error, 'Failed to get invoices');
    }
  }

  static async getInvoiceById(req: BillingRequest, res: BillingResponse): Promise<void> {
    try {
      const { id } = req.params ?? {};
      const user = getAuthenticatedUser(req);
      const isAdmin = ['ADMIN', 'SUPER_ADMIN'].includes(user.role);

      const invoice = await BillingService.getInvoiceById(id, isAdmin ? null : user.userId);

      if (!invoice) {
        res.status(404).json({
          success: false,
          error: 'Invoice not found',
          message: 'Invoice not found or access denied',
        });
        return;
      }

      res.status(200).json({
        success: true,
        message: 'Invoice retrieved successfully',
        data: { invoice },
      });
    } catch (error: unknown) {
      sendError(res, error, 'Failed to get invoice');
    }
  }

  static async getUserUsage(req: BillingRequest, res: BillingResponse): Promise<void> {
    try {
      const user = getAuthenticatedUser(req);
      const query = req.query ?? {};

      const usage = await BillingService.getUserUsage(user.userId, {
        startDate: query.startDate,
        endDate: query.endDate,
      });

      res.status(200).json({
        success: true,
        message: 'Usage retrieved successfully',
        data: usage,
      });
    } catch (error: unknown) {
      sendError(res, error, 'Failed to get usage');
    }
  }

  static async getUsageSummary(req: BillingRequest, res: BillingResponse): Promise<void> {
    try {
      const user = getAuthenticatedUser(req);
      const query = req.query ?? {};

      const summary = await BillingService.getUsageSummary(user.userId, {
        startDate: query.startDate,
        endDate: query.endDate,
        groupBy: query.groupBy as UsageQueryOptions['groupBy'],
      });

      res.status(200).json({
        success: true,
        message: 'Usage summary retrieved successfully',
        data: summary,
      });
    } catch (error: unknown) {
      sendError(res, error, 'Failed to get usage summary');
    }
  }

  static async getVMUsage(req: BillingRequest, res: BillingResponse): Promise<void> {
    try {
      const user = getAuthenticatedUser(req);
      const { vmId } = req.params ?? {};
      const query = req.query ?? {};

      // Scope to the VM owner unless the caller holds the usage:read:all permission
      const canReadAllUsage = roleHasPermission(user.role, 'usage:read:all');

      const usage = await BillingService.getVMUsage(vmId, {
        startDate: query.startDate,
        endDate: query.endDate,
        page: query.page,
        limit: query.limit,
      }, canReadAllUsage ? null : user.userId);

      res.status(200).json({
        success: true,
        message: 'VM usage retrieved successfully',
        data: usage.data,
        pagination: usage.pagination,
        statistics: usage.statistics,
      });
    } catch (error: unknown) {
      sendError(res, error, 'Failed to get VM usage');
    }
  }

  static async getPricingEstimate(req: BillingRequest, res: BillingResponse): Promise<void> {
    try {
      const {
        cpu, ram, storage, bandwidth, duration,
      } = (req.body ?? {}) as PricingEstimateBody;

      if (
        typeof cpu !== 'number'
        || typeof ram !== 'number'
        || typeof storage !== 'number'
      ) {
        res.status(400).json({
          success: false,
          error: 'Invalid resources',
          message: 'cpu, ram, and storage are required numeric values',
        });
        return;
      }

      const normalizedBandwidth = typeof bandwidth === 'number' ? bandwidth : 1000;

      const resourceValidation = ValidationHelpers.validateVMResources({
        cpu,
        ram,
        storage,
        bandwidth: normalizedBandwidth,
      });

      if (!resourceValidation.isValid) {
        res.status(400).json({
          success: false,
          error: 'Invalid resources',
          message: resourceValidation.errors.join(', '),
        });
        return;
      }

      const hourlyRate = ValidationHelpers.calculateVMCost({
        cpu,
        ram,
        storage,
        bandwidth: normalizedBandwidth,
      });

      const estimates: Record<string, number> = {
        hourly: parseFloat(hourlyRate.toFixed(4)),
        daily: parseFloat((hourlyRate * 24).toFixed(2)),
        weekly: parseFloat((hourlyRate * 24 * 7).toFixed(2)),
        monthly: parseFloat((hourlyRate * 24 * 30).toFixed(2)),
        yearly: parseFloat((hourlyRate * 24 * 365).toFixed(2)),
      };

      if (typeof duration === 'number') {
        estimates.custom = parseFloat((hourlyRate * duration).toFixed(2));
      }

      res.status(200).json({
        success: true,
        message: 'Pricing estimate calculated successfully',
        data: {
          resources: {
            cpu, ram, storage, bandwidth: normalizedBandwidth,
          },
          estimates,
          currency: 'USD',
          warnings: resourceValidation.warnings || [],
        },
      });
    } catch (error: unknown) {
      sendError(res, error, 'Pricing calculation failed');
    }
  }

  static async applyDiscount(req: BillingRequest, res: BillingResponse): Promise<void> {
    try {
      const { id } = req.params ?? {};
      const {
        discountCode, discountAmount, discountPercentage, reason,
      } = (req.body ?? {}) as DiscountInput;

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
    } catch (error: unknown) {
      sendError(res, error, 'Failed to apply discount');
    }
  }

  static async getInvoiceStatistics(req: BillingRequest, res: BillingResponse): Promise<void> {
    try {
      const user = getAuthenticatedUser(req);
      const isAdmin = ['ADMIN', 'SUPER_ADMIN'].includes(user.role);

      const stats = await BillingService.getInvoiceStatistics(isAdmin ? null : user.userId);

      res.status(200).json({
        success: true,
        message: 'Invoice statistics retrieved successfully',
        data: stats,
      });
    } catch (error: unknown) {
      sendError(res, error, 'Failed to get invoice statistics');
    }
  }

  static async generateMonthlyInvoice(req: BillingRequest, res: BillingResponse): Promise<void> {
    try {
      const { userId } = req.params ?? {};
      const { month, year, dueInDays } = (req.body ?? {}) as InvoiceCreationOptions;

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
    } catch (error: unknown) {
      sendError(res, error, 'Failed to generate invoice');
    }
  }

  static async generateAllMonthlyInvoices(req: BillingRequest, res: BillingResponse): Promise<void> {
    try {
      const { month, year } = (req.body ?? {}) as InvoiceBatchOptions;

      const results = await BillingService.generateAllMonthlyInvoices({
        month,
        year,
      });

      res.status(200).json({
        success: true,
        message: 'Batch invoice generation completed',
        data: results,
      });
    } catch (error: unknown) {
      sendError(res, error, 'Failed to generate invoices');
    }
  }

  static async markOverdueInvoices(_req: BillingRequest, res: BillingResponse): Promise<void> {
    try {
      const results = await BillingService.markOverdueInvoices();

      res.status(200).json({
        success: true,
        message: 'Overdue invoices marked successfully',
        data: results,
      });
    } catch (error: unknown) {
      sendError(res, error, 'Failed to mark overdue invoices');
    }
  }

  static async getAllInvoices(req: BillingRequest, res: BillingResponse): Promise<void> {
    try {
      const query = req.query ?? {};
      const { userId } = query;

      const options: InvoiceQueryOptions = {
        page: query.page,
        limit: query.limit,
        status: query.status as never,
        startDate: query.startDate,
        endDate: query.endDate,
        sortBy: query.sortBy,
        sortOrder: query.sortOrder as 'asc' | 'desc' | undefined,
      };

      const result = userId
        ? await BillingService.getUserInvoices(userId, options)
        : await BillingService.getUserInvoices(null, options);

      res.status(200).json({
        success: true,
        message: 'Invoices retrieved successfully',
        data: result.data,
        pagination: result.pagination,
      });
    } catch (error: unknown) {
      sendError(res, error, 'Failed to get invoices');
    }
  }

  static async updateInvoiceStatus(req: BillingRequest, res: BillingResponse): Promise<void> {
    try {
      const user = getAuthenticatedUser(req);
      const { id } = req.params ?? {};
      const { status, metadata } = (req.body ?? {}) as {
        status: InvoiceStatus;
        metadata?: InvoiceStatusUpdateMetadata;
      };

      // Attribute the audit entry to the acting user — server-set, not client-controlled
      const invoice = await BillingService.updateInvoiceStatus(id, status, {
        ...(metadata || {}),
        userId: user.userId,
      });

      res.status(200).json({
        success: true,
        message: 'Invoice status updated successfully',
        data: { invoice },
      });
    } catch (error: unknown) {
      sendError(res, error, 'Failed to update invoice status');
    }
  }
}

export = BillingController;
