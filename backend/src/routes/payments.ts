const express = require('express');
import PaymentController from '../controllers/paymentController';
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

router.use(sanitizeInput());
router.use(xssProtection());

router.post('/webhook', express.raw({ type: 'application/json' }), PaymentController.handleWebhook);

router.post(
  '/intent/:invoiceId',
  apiRateLimit(),
  validate(paymentIntentSchema),
  authenticate,
  requireEmailVerification,
  requirePermission('payment:create'),
  PaymentController.createPaymentIntent,
);

router.post(
  '/process/:invoiceId',
  apiRateLimit(),
  validate(processPaymentSchema),
  authenticate,
  requireEmailVerification,
  requirePermission('payment:create'),
  PaymentController.processPayment,
);

router.get(
  '/',
  apiRateLimit(),
  validate(paymentQuerySchema),
  authenticate,
  requirePermission('payment:read:own'),
  PaymentController.getUserPayments,
);

router.get(
  '/:id',
  apiRateLimit(),
  validate(paymentIdSchema),
  authenticate,
  requireAnyPermission('payment:read:own', 'payment:read:all'),
  PaymentController.getPaymentById,
);

router.post(
  '/:id/refund',
  apiRateLimit(),
  validate(refundPaymentSchema),
  authenticate,
  requirePermission('payment:refund'),
  PaymentController.refundPayment,
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

export default router;