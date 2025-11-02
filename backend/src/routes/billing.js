const express = require('express');
const BillingController = require('../controllers/billingController');
const { validate } = require('../middlewares/validation');
const { authenticate, requireEmailVerification } = require('../middlewares/auth');
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

// Apply security middleware to all routes
router.use(sanitizeInput());
router.use(xssProtection());

// ==================== Invoice Routes ====================

/**
 * @route   GET /api/v1/billing/invoices
 * @desc    Get user invoices
 * @access  Private (User+)
 */
router.get(
    '/invoices',
    apiRateLimit(),
    validate(invoiceQuerySchema),
    authenticate,
    requirePermission('invoice:read:own'),
    BillingController.getUserInvoices
);

/**
 * @route   GET /api/v1/billing/invoices/all
 * @desc    Get all invoices (Admin only)
 * @access  Private (Admin+)
 */
router.get(
    '/invoices/all',
    apiRateLimit(),
    validate(invoiceQuerySchema),
    authenticate,
    requirePermission('invoice:read:all'),
    BillingController.getAllInvoices
);

/**
 * @route   GET /api/v1/billing/invoices/:id
 * @desc    Get invoice by ID
 * @access  Private (Owner or Admin)
 */
router.get(
    '/invoices/:id',
    apiRateLimit(),
    validate(invoiceIdSchema),
    authenticate,
    requireAnyPermission('invoice:read:own', 'invoice:read:all'),
    BillingController.getInvoiceById
);

/**
 * @route   POST /api/v1/billing/invoices/generate/:userId
 * @desc    Generate monthly invoice for user (Admin only)
 * @access  Private (Admin+)
 */
router.post(
    '/invoices/generate/:userId',
    apiRateLimit(),
    validate(generateInvoiceSchema),
    authenticate,
    requirePermission('invoice:create'),
    BillingController.generateMonthlyInvoice
);

/**
 * @route   POST /api/v1/billing/invoices/generate-all
 * @desc    Generate monthly invoices for all users (Admin only)
 * @access  Private (Admin+)
 */
router.post(
    '/invoices/generate-all',
    apiRateLimit(),
    validate(batchGenerateInvoicesSchema),
    authenticate,
    requirePermission('invoice:create'),
    BillingController.generateAllMonthlyInvoices
);

/**
 * @route   POST /api/v1/billing/invoices/:id/discount
 * @desc    Apply discount to invoice (Admin only)
 * @access  Private (Admin+)
 */
router.post(
    '/invoices/:id/discount',
    apiRateLimit(),
    validate(applyDiscountSchema),
    authenticate,
    requirePermission('invoice:update'),
    BillingController.applyDiscount
);

/**
 * @route   PUT /api/v1/billing/invoices/:id/status
 * @desc    Update invoice status (Admin only)
 * @access  Private (Admin+)
 */
router.put(
    '/invoices/:id/status',
    apiRateLimit(),
    validate(updateInvoiceStatusSchema),
    authenticate,
    requirePermission('invoice:update'),
    BillingController.updateInvoiceStatus
);

/**
 * @route   POST /api/v1/billing/invoices/mark-overdue
 * @desc    Mark overdue invoices (Admin only)
 * @access  Private (Admin+)
 */
router.post(
    '/invoices/mark-overdue',
    apiRateLimit(),
    authenticate,
    requirePermission('invoice:update'),
    BillingController.markOverdueInvoices
);

/**
 * @route   GET /api/v1/billing/invoices/stats
 * @desc    Get invoice statistics
 * @access  Private (User+)
 */
router.get(
    '/invoices/stats',
    apiRateLimit(),
    authenticate,
    requireAnyPermission('invoice:read:own', 'invoice:read:all'),
    BillingController.getInvoiceStatistics
);

// ==================== Usage Routes ====================

/**
 * @route   GET /api/v1/billing/usage
 * @desc    Get user usage
 * @access  Private (User+)
 */
router.get(
    '/usage',
    apiRateLimit(),
    validate(usageQuerySchema),
    authenticate,
    requirePermission('usage:read:own'),
    BillingController.getUserUsage
);

/**
 * @route   GET /api/v1/billing/usage/summary
 * @desc    Get usage summary with breakdown
 * @access  Private (User+)
 */
router.get(
    '/usage/summary',
    apiRateLimit(),
    validate(usageQuerySchema),
    authenticate,
    requirePermission('usage:read:own'),
    BillingController.getUsageSummary
);

/**
 * @route   GET /api/v1/billing/usage/vm/:vmId
 * @desc    Get VM usage
 * @access  Private (Owner or Admin)
 */
router.get(
    '/usage/vm/:vmId',
    apiRateLimit(),
    validate(vmUsageQuerySchema),
    authenticate,
    requireAnyPermission('usage:read:own', 'usage:read:all'),
    BillingController.getVMUsage
);

// ==================== Pricing Routes ====================

/**
 * @route   POST /api/v1/billing/pricing/estimate
 * @desc    Get pricing estimate
 * @access  Private (User+)
 */
router.post(
    '/pricing/estimate',
    apiRateLimit(),
    validate(calculatePricingSchema),
    authenticate,
    BillingController.getPricingEstimate
);

// Health check for billing routes
router.get('/health', (req, res) => {
    res.status(200).json({
        success: true,
        message: 'Billing routes are healthy',
        timestamp: new Date().toISOString(),
    });
});

module.exports = router;
