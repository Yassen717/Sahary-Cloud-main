import BillingService from './billingService';
import type {
  PaymentIntentOptions,
  PaymentQueryOptions,
  RefundInput,
} from '../types/billing';

type PaymentWebhookEvent = {
  type: string;
  data: {
    object: Record<string, any>;
  };
};

class PaymentService {
  static async createPaymentIntent(invoiceId: string, userId: string): Promise<Record<string, unknown>> {
    return BillingService.createPaymentIntent(invoiceId, userId);
  }

  static async processPayment(invoiceId: string, paymentData: PaymentIntentOptions): Promise<Record<string, unknown>> {
    return BillingService.processPayment(invoiceId, paymentData);
  }

  static async handleWebhook(event: PaymentWebhookEvent): Promise<Record<string, unknown>> {
    return BillingService.handleWebhook(event);
  }

  static async handlePaymentSuccess(paymentIntent: Record<string, any>): Promise<Record<string, unknown>> {
    return BillingService.handlePaymentSuccess(paymentIntent);
  }

  static async handlePaymentFailure(paymentIntent: Record<string, any>): Promise<Record<string, unknown>> {
    return BillingService.handlePaymentFailure(paymentIntent);
  }

  static async handleRefund(charge: Record<string, any>): Promise<Record<string, unknown>> {
    return BillingService.handleRefund(charge);
  }

  static async handleSubscriptionChange(event: PaymentWebhookEvent): Promise<Record<string, unknown>> {
    return BillingService.handleSubscriptionChange(event);
  }

  static async getPaymentById(paymentId: string, userId: string | null = null): Promise<Record<string, unknown> | null> {
    return BillingService.getPaymentById(paymentId, userId);
  }

  static async getUserPayments(userId: string, options: PaymentQueryOptions = {}): Promise<{ data: Record<string, unknown>[]; pagination: Record<string, unknown> }> {
    return BillingService.getUserPayments(userId, options);
  }

  static async refundPayment(paymentId: string, refundData: RefundInput): Promise<Record<string, unknown>> {
    return BillingService.refundPayment(paymentId, refundData);
  }

  static async getPaymentStatistics(userId: string | null = null): Promise<Record<string, unknown>> {
    return BillingService.getPaymentStatistics(userId);
  }

  static verifyWebhookSignature(payload: string, signature: string): Record<string, unknown> {
    return BillingService.verifyWebhookSignature(payload, signature);
  }
}

export default PaymentService;