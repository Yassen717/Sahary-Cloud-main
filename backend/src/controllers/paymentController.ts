import PaymentService from '../services/paymentService';
import type { PaymentIntentOptions, PaymentQueryOptions, RefundInput } from '../types/billing';

type PaymentUser = {
  userId: string;
  role: string;
};

type PaymentParams = Record<string, string>;

type PaymentQuery = Record<string, string | undefined>;

type PaymentBody = Record<string, unknown>;

type PaymentHeaders = {
  'stripe-signature'?: string | string[];
};

type PaymentRequest = {
  user?: PaymentUser;
  params?: PaymentParams;
  query?: PaymentQuery;
  body?: PaymentBody | string | Buffer;
  headers?: PaymentHeaders;
};

type PaymentResponse = {
  status(code: number): PaymentResponse;
  json(payload: unknown): unknown;
};

const getAuthenticatedUser = (req: PaymentRequest): PaymentUser => {
  if (!req.user) {
    throw new Error('Authenticated user context is required');
  }

  return req.user;
};

const normalizeWebhookSignature = (headers: PaymentHeaders | undefined): string => {
  const signature = headers?.['stripe-signature'];

  if (Array.isArray(signature)) {
    return signature[0] || '';
  }

  return signature || '';
};

const normalizeWebhookPayload = (body: PaymentRequest['body']): Buffer | string => {
  // Prefer the raw Buffer produced by express.raw — Stripe signature
  // verification requires the exact bytes that were received.
  if (Buffer.isBuffer(body)) {
    return body;
  }

  if (typeof body === 'string') {
    return body;
  }

  // Graceful fallback only: re-serialized JSON is not guaranteed to match the
  // signed payload byte-for-byte, so warn loudly whenever this path is taken.
  console.warn(
    'Stripe webhook arrived without a raw Buffer body; re-serializing JSON payload. '
      + 'Ensure express.raw is mounted for /api/v1/payments/webhook before express.json.',
  );
  return JSON.stringify(body ?? {});
};

class PaymentController {
  static async createPaymentIntent(req: PaymentRequest, res: PaymentResponse): Promise<void> {
    try {
      const { invoiceId } = req.params ?? {};
      const user = getAuthenticatedUser(req);

      const paymentIntent = await PaymentService.createPaymentIntent(invoiceId, user.userId);

      res.status(200).json({
        success: true,
        message: 'Payment intent created successfully',
        data: paymentIntent,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(400).json({
        success: false,
        error: 'Payment intent creation failed',
        message,
      });
    }
  }

  static async processPayment(req: PaymentRequest, res: PaymentResponse): Promise<void> {
    try {
      const { invoiceId } = req.params ?? {};
      const user = getAuthenticatedUser(req);
      const isAdmin = ['ADMIN', 'SUPER_ADMIN'].includes(user.role);
      const { paymentMethodId, savePaymentMethod } = (req.body ?? {}) as unknown as PaymentIntentOptions & {
        savePaymentMethod?: boolean;
      };

      // userId/isAdmin travel inside paymentData so invoice ownership (IDOR)
      // can be enforced in the service layer.
      const result = await PaymentService.processPayment(invoiceId, {
        paymentMethodId,
        savePaymentMethod,
        userId: user.userId,
        isAdmin,
      } as PaymentIntentOptions & { userId: string; isAdmin: boolean });

      // 200 with success:false (rather than an error status) so the client can
      // still act on the returned clientSecret/status (e.g. 3DS, retry).
      res.status(200).json({
        success: result.success,
        message: result.success
          ? 'Payment processed successfully'
          : 'Payment requires additional action or could not be completed',
        data: result,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(400).json({
        success: false,
        error: 'Payment processing failed',
        message,
      });
    }
  }

  static async handleWebhook(req: PaymentRequest, res: PaymentResponse): Promise<void> {
    try {
      const signature = normalizeWebhookSignature(req.headers);
      const payload = normalizeWebhookPayload(req.body);

      // Buffer payloads are passed straight through to
      // stripe.webhooks.constructEvent at runtime.
      const event = PaymentService.verifyWebhookSignature(payload as string, signature);
      const result = await PaymentService.handleWebhook(event as never);

      res.status(200).json({
        success: true,
        message: 'Webhook processed successfully',
        data: result,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(400).json({
        success: false,
        error: 'Webhook processing failed',
        message,
      });
    }
  }

  static async getPaymentById(req: PaymentRequest, res: PaymentResponse): Promise<void> {
    try {
      const { id } = req.params ?? {};
      const user = getAuthenticatedUser(req);
      const isAdmin = ['ADMIN', 'SUPER_ADMIN'].includes(user.role);

      const payment = await PaymentService.getPaymentById(id, isAdmin ? null : user.userId);

      if (!payment) {
        res.status(404).json({
          success: false,
          error: 'Payment not found',
          message: 'Payment not found or access denied',
        });
        return;
      }

      res.status(200).json({
        success: true,
        message: 'Payment retrieved successfully',
        data: { payment },
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(400).json({
        success: false,
        error: 'Failed to get payment',
        message,
      });
    }
  }

  static async getUserPayments(req: PaymentRequest, res: PaymentResponse): Promise<void> {
    try {
      const user = getAuthenticatedUser(req);
      const query = req.query ?? {};

      const result = await PaymentService.getUserPayments(user.userId, {
        page: query.page,
        limit: query.limit,
        status: query.status as PaymentQueryOptions['status'],
        startDate: query.startDate,
        endDate: query.endDate,
        sortBy: query.sortBy,
        sortOrder: query.sortOrder as 'asc' | 'desc' | undefined,
      });

      res.status(200).json({
        success: true,
        message: 'Payments retrieved successfully',
        data: result.data,
        pagination: result.pagination,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(400).json({
        success: false,
        error: 'Failed to get payments',
        message,
      });
    }
  }

  static async refundPayment(req: PaymentRequest, res: PaymentResponse): Promise<void> {
    try {
      const { id } = req.params ?? {};
      const { amount, reason, notes } = (req.body ?? {}) as unknown as RefundInput & { notes?: string };

      const refundData: RefundInput & { notes?: string } = {
        amount,
        reason,
        notes,
      };

      const result = await PaymentService.refundPayment(id, refundData);

      res.status(200).json({
        success: true,
        message: 'Payment refunded successfully',
        data: result,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(400).json({
        success: false,
        error: 'Refund failed',
        message,
      });
    }
  }

  static async getPaymentStatistics(req: PaymentRequest, res: PaymentResponse): Promise<void> {
    try {
      const user = getAuthenticatedUser(req);
      const isAdmin = ['ADMIN', 'SUPER_ADMIN'].includes(user.role);

      const stats = await PaymentService.getPaymentStatistics(isAdmin ? null : user.userId);

      res.status(200).json({
        success: true,
        message: 'Payment statistics retrieved successfully',
        data: stats,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(400).json({
        success: false,
        error: 'Failed to get payment statistics',
        message,
      });
    }
  }
}

export = PaymentController;
