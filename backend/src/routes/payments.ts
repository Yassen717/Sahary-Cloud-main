// @ts-nocheck
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

// Stripe signature verification needs the exact raw body, so the webhook is
// registered BEFORE sanitizeInput()/xssProtection() — those middlewares must
// never touch the payload.
router.post('/webhook', express.raw({ type: 'application/json' }), PaymentController.handleWebhook);

router.use(sanitizeInput());
router.use(xssProtection());

router.post(
  '/intent/:invoiceId',
  apiRateLimit(),
  authenticate,
  requireEmailVerification,
  validate(paymentIntentSchema),
  requirePermission('payment:create'),
  PaymentController.createPaymentIntent,
);

router.post(
  '/process/:invoiceId',
  apiRateLimit(),
  authenticate,
  requireEmailVerification,
  validate(processPaymentSchema),
  requirePermission('payment:create'),
  PaymentController.processPayment,
);

router.get(
  '/',
  apiRateLimit(),
  authenticate,
  validate(paymentQuerySchema),
  requirePermission('payment:read:own'),
  PaymentController.getUserPayments,
);

router.get(
  '/stats',
  apiRateLimit(),
  authenticate,
  requireAnyPermission('payment:read:own', 'payment:read:all'),
  PaymentController.getPaymentStatistics,
);

router.get('/health', (_req: unknown, res: { status(code: number): { json(payload: unknown): void } }) => {
  res.status(200).json({
    success: true,
    message: 'Payment routes are healthy',
    timestamp: new Date().toISOString(),
  });
});

router.get(
  '/:id',
  apiRateLimit(),
  authenticate,
  validate(paymentIdSchema),
  requireAnyPermission('payment:read:own', 'payment:read:all'),
  PaymentController.getPaymentById,
);

router.post(
  '/:id/refund',
  apiRateLimit(),
  authenticate,
  validate(refundPaymentSchema),
  requirePermission('payment:refund'),
  PaymentController.refundPayment,
);

module.exports = router;
