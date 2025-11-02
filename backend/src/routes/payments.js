const express = require('express');
const PaymentController = require('../controllers/paymentController');
const { validate } = require('../middlewares/validation');
const { authenticate, requireEmailVerification } = require('../middlewares/auth');
const { requirePermission, requireAnyPermission } = require('../middlewares/rbac');
const { apiRateLimit, sanitizeInput, xssProtection } = require('../middlewares/security');
const {
    processPaymentSchema,
    paymentIntentSchema,
    paymentQuerySchema,
    refundPaymentSchema,
    paymentIdSchema,
} = require('../validations/payment.validation');

const router = express.Router();

// Apply security middleware to all routes
router.use(sanitizeInput());
router.use(xssProtection());

/**
 * @route   POST /api/v1/payments/webhook
 * @desc    Handle Stripe webhook events
 * @access  Public (Stripe only)
 */
router.post(
    '/webhook',
    express.raw({ type: 'application/json' }),
    PaymentController.handleWebhook
);

/**
 * @route   POST /api/v1/payments/intent/:invoiceId
 * @desc    Create payment intent for invoice
 * @access  Private (User+)
 */
router.post(
    '/intent/:invoiceId',
    apiRateLimit(),
    validate(paymentIntentSchema),
    authenticate,
    requireEmailVerification,
    requirePermission('payment:create'),
    PaymentController.createPaymentIntent
);

/**
 * @route   POST /api/v1/payments/process/:invoiceId
 * @desc    Process payment for invoice
 * @access  Private (User+)
 */
router.post(
    '/process/:invoiceId',
    apiRateLimit(),
    validate(processPaymentSchema),
    authenticate,
    requireEmailVerification,
    requirePermission('payment:create'),
    PaymentController.processPayment
);

/**
 * @route   GET /api/v1/payments
 * @desc    Get user payments
 * @access  Private (User+)
 */
router.get(
    '/',
    apiRateLimit(),
    validate(paymentQuerySchema),
    authenticate,
    requirePermission('payment:read:own'),
    PaymentController.getUserPayments
);

/**
 * @route   GET /api/v1/payments/:id
 * @desc    Get payment by ID
 * @access  Private (Owner or Admin)
 */
router.get(
    '/:id',
    apiRateLimit(),
    validate(paymentIdSchema),
    authenticate,
    requireAnyPermission('payment:read:own', 'payment:read:all'),
    PaymentController.getPaymentById
);

/**
 * @route   POST /api/v1/payments/:id/refund
 * @desc    Refund payment (Admin only)
 * @access  Private (Admin+)
 */
router.post(
    '/:id/refund',
    apiRateLimit(),
    validate(refundPaymentSchema),
    authenticate,
    requirePermission('payment:refund'),
    PaymentController.refundPayment
);

/**
 * @route   GET /api/v1/payments/stats
 * @desc    Get payment statistics
 * @access  Private (User+)
 */
router.get(
    '/stats',
    apiRateLimit(),
    authenticate,
    requireAnyPermission('payment:read:own', 'payment:read:all'),
    PaymentController.getPaymentStatistics
);

// Health check for payment routes
router.get('/health', (req, res) => {
    res.status(200).json({
        success: true,
        message: 'Payment routes are healthy',
        timestamp: new Date().toISOString(),
    });
});

module.exports = router;
