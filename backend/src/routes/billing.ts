const express = require('express');
import BillingController from '../controllers/billingController';
const { validate } = require('../middlewares/validation');
const { authenticate } = require('../middlewares/auth');
const { requirePermission, requireAnyPermission } = require('../middlewares/rbac');
const { apiRateLimit, sanitizeInput, xssProtection } = require('../middlewares/security');
const {
  invoiceQuerySchema,
  invoiceIdSchema,
  usageQuerySchema,
  vmUsageQuerySchema,
  calculatePricingSchema,
  applyDiscountSchema,
  generateInvoiceSchema,
  batchGenerateInvoicesSchema,
  updateInvoiceStatusSchema,
} = require('../validations/billing.validation');

const router = express.Router();

router.use(sanitizeInput());
router.use(xssProtection());

router.get(
  '/invoices',
  apiRateLimit(),
  validate(invoiceQuerySchema),
  authenticate,
  requirePermission('invoice:read:own'),
  BillingController.getUserInvoices,
);

router.get(
  '/invoices/all',
  apiRateLimit(),
  validate(invoiceQuerySchema),
  authenticate,
  requirePermission('invoice:read:all'),
  BillingController.getAllInvoices,
);

router.get(
  '/invoices/:id',
  apiRateLimit(),
  validate(invoiceIdSchema),
  authenticate,
  requireAnyPermission('invoice:read:own', 'invoice:read:all'),
  BillingController.getInvoiceById,
);

router.post(
  '/invoices/generate/:userId',
  apiRateLimit(),
  validate(generateInvoiceSchema),
  authenticate,
  requirePermission('invoice:create'),
  BillingController.generateMonthlyInvoice,
);

router.post(
  '/invoices/generate-all',
  apiRateLimit(),
  validate(batchGenerateInvoicesSchema),
  authenticate,
  requirePermission('invoice:create'),
  BillingController.generateAllMonthlyInvoices,
);

router.post(
  '/invoices/:id/discount',
  apiRateLimit(),
  validate(applyDiscountSchema),
  authenticate,
  requirePermission('invoice:update'),
  BillingController.applyDiscount,
);

router.put(
  '/invoices/:id/status',
  apiRateLimit(),
  validate(updateInvoiceStatusSchema),
  authenticate,
  requirePermission('invoice:update'),
  BillingController.updateInvoiceStatus,
);

router.post(
  '/invoices/mark-overdue',
  apiRateLimit(),
  authenticate,
  requirePermission('invoice:update'),
  BillingController.markOverdueInvoices,
);

router.get(
  '/invoices/stats',
  apiRateLimit(),
  authenticate,
  requireAnyPermission('invoice:read:own', 'invoice:read:all'),
  BillingController.getInvoiceStatistics,
);

router.get(
  '/usage',
  apiRateLimit(),
  validate(usageQuerySchema),
  authenticate,
  requirePermission('usage:read:own'),
  BillingController.getUserUsage,
);

router.get(
  '/usage/summary',
  apiRateLimit(),
  validate(usageQuerySchema),
  authenticate,
  requirePermission('usage:read:own'),
  BillingController.getUsageSummary,
);

router.get(
  '/usage/vm/:vmId',
  apiRateLimit(),
  validate(vmUsageQuerySchema),
  authenticate,
  requireAnyPermission('usage:read:own', 'usage:read:all'),
  BillingController.getVMUsage,
);

router.post(
  '/pricing/estimate',
  apiRateLimit(),
  validate(calculatePricingSchema),
  authenticate,
  BillingController.getPricingEstimate,
);

router.get('/health', (_req: unknown, res: { status(code: number): { json(payload: unknown): void } }) => {
  res.status(200).json({
    success: true,
    message: 'Billing routes are healthy',
    timestamp: new Date().toISOString(),
  });
});

export default router;