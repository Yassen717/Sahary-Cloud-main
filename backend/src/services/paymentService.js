const { prisma } = require('../config/database');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

/**
 * Payment Service
 * Handles payment processing, Stripe integration, and payment management
 */
class PaymentService {
    /**
     * Create payment intent for invoice
     * @param {string} invoiceId - Invoice ID
     * @param {string} userId - User ID
     * @returns {Promise<Object>} Payment intent details
     */
    static async createPaymentIntent(invoiceId, userId) {
        try {
            // Get invoice
            const invoice = await prisma.invoice.findUnique({
                where: { id: invoiceId },
                include: {
                    user: {
                        select: {
                            id: true,
                            email: true,
                            firstName: true,
                            lastName: true,
                        },
                    },
                    items: true,
                },
            });

            if (!invoice) {
                throw new Error('Invoice not found');
            }

            if (invoice.userId !== userId) {
                throw new Error('Unauthorized access to invoice');
            }

            if (invoice.status === 'PAID') {
                throw new Error('Invoice is already paid');
            }

            if (invoice.status === 'CANCELLED') {
                throw new Error('Invoice is cancelled');
            }

            // Create Stripe payment intent
            const paymentIntent = await stripe.paymentIntents.create({
                amount: Math.round(parseFloat(invoice.total) * 100), // Convert to cents
                currency: invoice.currency.toLowerCase(),
                metadata: {
                    invoiceId: invoice.id,
                    invoiceNumber: invoice.invoiceNumber,
                    userId: invoice.userId,
                    userEmail: invoice.user.email,
                },
                description: `Payment for invoice ${invoice.invoiceNumber}`,
                receipt_email: invoice.user.email,
            });

            // Create payment record
            const payment = await prisma.payment.create({
                data: {
                    invoiceId: invoice.id,
                    userId: invoice.userId,
                    amount: invoice.total,
                    currency: invoice.currency,
                    paymentMethod: 'STRIPE',
                    status: 'PENDING',
                    stripePaymentIntentId: paymentIntent.id,
                    metadata: {
                        clientSecret: paymentIntent.client_secret,
                    },
                },
            });

            // Log payment creation
            await prisma.auditLog.create({
                data: {
                    userId: invoice.userId,
                    action: 'PAYMENT_INTENT_CREATED',
                    resource: 'payment',
                    resourceId: payment.id,
                    newValues: {
                        invoiceId: invoice.id,
                        invoiceNumber: invoice.invoiceNumber,
                        amount: invoice.total,
                        paymentIntentId: paymentIntent.id,
                    },
                },
            });

            return {
                paymentId: payment.id,
                clientSecret: paymentIntent.client_secret,
                amount: invoice.total,
                currency: invoice.currency,
                invoice: {
                    id: invoice.id,
                    invoiceNumber: invoice.invoiceNumber,
                    total: invoice.total,
                },
            };
        } catch (error) {
            throw new Error(`Failed to create payment intent: ${error.message}`);
        }
    }

    /**
     * Process payment for invoice
     * @param {string} invoiceId - Invoice ID
     * @param {Object} paymentData - Payment data
     * @returns {Promise<Object>} Payment result
     */
    static async processPayment(invoiceId, paymentData) {
        try {
            const { paymentMethodId, savePaymentMethod = false } = paymentData;

            // Get invoice
            const invoice = await prisma.invoice.findUnique({
                where: { id: invoiceId },
                include: {
                    user: {
                        select: {
                            id: true,
                            email: true,
                            stripeCustomerId: true,
                        },
                    },
                },
            });

            if (!invoice) {
                throw new Error('Invoice not found');
            }

            if (invoice.status === 'PAID') {
                throw new Error('Invoice is already paid');
            }

            // Create or get Stripe customer
            let customerId = invoice.user.stripeCustomerId;
            if (!customerId) {
                const customer = await stripe.customers.create({
                    email: invoice.user.email,
                    metadata: {
                        userId: invoice.user.id,
                    },
                });
                customerId = customer.id;

                // Update user with Stripe customer ID
                await prisma.user.update({
                    where: { id: invoice.user.id },
                    data: { stripeCustomerId: customerId },
                });
            }

            // Create payment intent
            const paymentIntent = await stripe.paymentIntents.create({
                amount: Math.round(parseFloat(invoice.total) * 100),
                currency: invoice.currency.toLowerCase(),
                customer: customerId,
                payment_method: paymentMethodId,
                confirm: true,
                metadata: {
                    invoiceId: invoice.id,
                    invoiceNumber: invoice.invoiceNumber,
                    userId: invoice.user.id,
                },
                description: `Payment for invoice ${invoice.invoiceNumber}`,
            });

            // Save payment method if requested
            if (savePaymentMethod) {
                await stripe.paymentMethods.attach(paymentMethodId, {
                    customer: customerId,
                });
            }

            // Create payment record
            const payment = await prisma.payment.create({
                data: {
                    invoiceId: invoice.id,
                    userId: invoice.user.id,
                    amount: invoice.total,
                    currency: invoice.currency,
                    paymentMethod: 'STRIPE',
                    status: paymentIntent.status === 'succeeded' ? 'COMPLETED' : 'PENDING',
                    stripePaymentIntentId: paymentIntent.id,
                    stripePaymentMethodId: paymentMethodId,
                    metadata: {
                        paymentIntentStatus: paymentIntent.status,
                    },
                },
            });

            // Update invoice status if payment succeeded
            if (paymentIntent.status === 'succeeded') {
                await prisma.invoice.update({
                    where: { id: invoiceId },
                    data: {
                        status: 'PAID',
                        paidAt: new Date(),
                    },
                });

                // Log successful payment
                await prisma.auditLog.create({
                    data: {
                        userId: invoice.user.id,
                        action: 'PAYMENT_COMPLETED',
                        resource: 'payment',
                        resourceId: payment.id,
                        newValues: {
                            invoiceId: invoice.id,
                            invoiceNumber: invoice.invoiceNumber,
                            amount: invoice.total,
                            paymentIntentId: paymentIntent.id,
                        },
                    },
                });
            }

            return {
                success: paymentIntent.status === 'succeeded',
                paymentId: payment.id,
                status: paymentIntent.status,
                invoice: {
                    id: invoice.id,
                    invoiceNumber: invoice.invoiceNumber,
                    status: paymentIntent.status === 'succeeded' ? 'PAID' : invoice.status,
                },
            };
        } catch (error) {
            throw new Error(`Failed to process payment: ${error.message}`);
        }
    }

    /**
     * Handle Stripe webhook events
     * @param {Object} event - Stripe webhook event
     * @returns {Promise<Object>} Processing result
     */
    static async handleWebhook(event) {
        try {
            switch (event.type) {
                case 'payment_intent.succeeded':
                    return await this.handlePaymentSuccess(event.data.object);

                case 'payment_intent.payment_failed':
                    return await this.handlePaymentFailure(event.data.object);

                case 'charge.refunded':
                    return await this.handleRefund(event.data.object);

                case 'customer.subscription.created':
                case 'customer.subscription.updated':
                case 'customer.subscription.deleted':
                    return await this.handleSubscriptionChange(event);

                default:
                    console.log(`Unhandled event type: ${event.type}`);
                    return { handled: false, eventType: event.type };
            }
        } catch (error) {
            throw new Error(`Failed to handle webhook: ${error.message}`);
        }
    }

    /**
     * Handle successful payment
     * @param {Object} paymentIntent - Stripe payment intent
     * @returns {Promise<Object>} Processing result
     */
    static async handlePaymentSuccess(paymentIntent) {
        try {
            const invoiceId = paymentIntent.metadata.invoiceId;

            if (!invoiceId) {
                throw new Error('Invoice ID not found in payment intent metadata');
            }

            // Get payment record
            const payment = await prisma.payment.findFirst({
                where: { stripePaymentIntentId: paymentIntent.id },
            });

            if (!payment) {
                throw new Error('Payment record not found');
            }

            // Update payment status
            await prisma.payment.update({
                where: { id: payment.id },
                data: {
                    status: 'COMPLETED',
                    completedAt: new Date(),
                    metadata: {
                        ...payment.metadata,
                        paymentIntentStatus: paymentIntent.status,
                        webhookProcessedAt: new Date(),
                    },
                },
            });

            // Update invoice status
            await prisma.invoice.update({
                where: { id: invoiceId },
                data: {
                    status: 'PAID',
                    paidAt: new Date(),
                },
            });

            // Log successful payment
            await prisma.auditLog.create({
                data: {
                    userId: payment.userId,
                    action: 'PAYMENT_WEBHOOK_SUCCESS',
                    resource: 'payment',
                    resourceId: payment.id,
                    newValues: {
                        invoiceId,
                        paymentIntentId: paymentIntent.id,
                        amount: paymentIntent.amount / 100,
                    },
                },
            });

            return {
                handled: true,
                paymentId: payment.id,
                invoiceId,
                status: 'COMPLETED',
            };
        } catch (error) {
            throw new Error(`Failed to handle payment success: ${error.message}`);
        }
    }

    /**
     * Handle failed payment
     * @param {Object} paymentIntent - Stripe payment intent
     * @returns {Promise<Object>} Processing result
     */
    static async handlePaymentFailure(paymentIntent) {
        try {
            const invoiceId = paymentIntent.metadata.invoiceId;

            if (!invoiceId) {
                throw new Error('Invoice ID not found in payment intent metadata');
            }

            // Get payment record
            const payment = await prisma.payment.findFirst({
                where: { stripePaymentIntentId: paymentIntent.id },
            });

            if (!payment) {
                throw new Error('Payment record not found');
            }

            // Update payment status
            await prisma.payment.update({
                where: { id: payment.id },
                data: {
                    status: 'FAILED',
                    metadata: {
                        ...payment.metadata,
                        paymentIntentStatus: paymentIntent.status,
                        failureReason: paymentIntent.last_payment_error?.message,
                        webhookProcessedAt: new Date(),
                    },
                },
            });

            // Log failed payment
            await prisma.auditLog.create({
                data: {
                    userId: payment.userId,
                    action: 'PAYMENT_WEBHOOK_FAILED',
                    resource: 'payment',
                    resourceId: payment.id,
                    newValues: {
                        invoiceId,
                        paymentIntentId: paymentIntent.id,
                        failureReason: paymentIntent.last_payment_error?.message,
                    },
                },
            });

            return {
                handled: true,
                paymentId: payment.id,
                invoiceId,
                status: 'FAILED',
            };
        } catch (error) {
            throw new Error(`Failed to handle payment failure: ${error.message}`);
        }
    }

    /**
     * Handle refund
     * @param {Object} charge - Stripe charge object
     * @returns {Promise<Object>} Processing result
     */
    static async handleRefund(charge) {
        try {
            const paymentIntentId = charge.payment_intent;

            // Get payment record
            const payment = await prisma.payment.findFirst({
                where: { stripePaymentIntentId: paymentIntentId },
            });

            if (!payment) {
                throw new Error('Payment record not found');
            }

            // Update payment status
            await prisma.payment.update({
                where: { id: payment.id },
                data: {
                    status: 'REFUNDED',
                    refundedAt: new Date(),
                    metadata: {
                        ...payment.metadata,
                        refundAmount: charge.amount_refunded / 100,
                        webhookProcessedAt: new Date(),
                    },
                },
            });

            // Update invoice status
            await prisma.invoice.update({
                where: { id: payment.invoiceId },
                data: {
                    status: 'REFUNDED',
                },
            });

            // Log refund
            await prisma.auditLog.create({
                data: {
                    userId: payment.userId,
                    action: 'PAYMENT_REFUNDED',
                    resource: 'payment',
                    resourceId: payment.id,
                    newValues: {
                        invoiceId: payment.invoiceId,
                        refundAmount: charge.amount_refunded / 100,
                    },
                },
            });

            return {
                handled: true,
                paymentId: payment.id,
                invoiceId: payment.invoiceId,
                status: 'REFUNDED',
            };
        } catch (error) {
            throw new Error(`Failed to handle refund: ${error.message}`);
        }
    }

    /**
     * Handle subscription changes
     * @param {Object} event - Stripe event
     * @returns {Promise<Object>} Processing result
     */
    static async handleSubscriptionChange(event) {
        try {
            // Placeholder for subscription handling
            // Can be implemented when subscription features are added
            console.log(`Subscription event: ${event.type}`);

            return {
                handled: true,
                eventType: event.type,
                message: 'Subscription event logged',
            };
        } catch (error) {
            throw new Error(`Failed to handle subscription change: ${error.message}`);
        }
    }

    /**
     * Get payment by ID
     * @param {string} paymentId - Payment ID
     * @param {string} userId - User ID (for ownership check)
     * @returns {Promise<Object>} Payment details
     */
    static async getPaymentById(paymentId, userId = null) {
        try {
            const where = { id: paymentId };
            if (userId) {
                where.userId = userId;
            }

            const payment = await prisma.payment.findUnique({
                where,
                include: {
                    invoice: {
                        include: {
                            items: true,
                        },
                    },
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

            return payment;
        } catch (error) {
            throw new Error(`Failed to get payment: ${error.message}`);
        }
    }

    /**
     * Get user payments with pagination
     * @param {string} userId - User ID
     * @param {Object} options - Query options
     * @returns {Promise<Object>} Paginated payments
     */
    static async getUserPayments(userId, options = {}) {
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
            const [payments, total] = await Promise.all([
                prisma.payment.findMany({
                    where,
                    orderBy: { [sortBy]: sortOrder },
                    skip,
                    take: parseInt(limit),
                    include: {
                        invoice: {
                            select: {
                                id: true,
                                invoiceNumber: true,
                                total: true,
                                status: true,
                            },
                        },
                    },
                }),
                prisma.payment.count({ where }),
            ]);

            return {
                data: payments,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total,
                    totalPages: Math.ceil(total / parseInt(limit)),
                },
            };
        } catch (error) {
            throw new Error(`Failed to get user payments: ${error.message}`);
        }
    }

    /**
     * Refund payment
     * @param {string} paymentId - Payment ID
     * @param {Object} refundData - Refund data
     * @returns {Promise<Object>} Refund result
     */
    static async refundPayment(paymentId, refundData) {
        try {
            const { amount, reason } = refundData;

            // Get payment
            const payment = await prisma.payment.findUnique({
                where: { id: paymentId },
                include: {
                    invoice: true,
                },
            });

            if (!payment) {
                throw new Error('Payment not found');
            }

            if (payment.status !== 'COMPLETED') {
                throw new Error('Can only refund completed payments');
            }

            if (!payment.stripePaymentIntentId) {
                throw new Error('Stripe payment intent ID not found');
            }

            // Create refund in Stripe
            const refundAmount = amount ? Math.round(parseFloat(amount) * 100) : undefined;
            const refund = await stripe.refunds.create({
                payment_intent: payment.stripePaymentIntentId,
                amount: refundAmount,
                reason: reason || 'requested_by_customer',
                metadata: {
                    paymentId: payment.id,
                    invoiceId: payment.invoiceId,
                },
            });

            // Update payment status
            await prisma.payment.update({
                where: { id: paymentId },
                data: {
                    status: 'REFUNDED',
                    refundedAt: new Date(),
                    metadata: {
                        ...payment.metadata,
                        refundId: refund.id,
                        refundAmount: refund.amount / 100,
                        refundReason: reason,
                    },
                },
            });

            // Update invoice status
            await prisma.invoice.update({
                where: { id: payment.invoiceId },
                data: {
                    status: 'REFUNDED',
                },
            });

            // Log refund
            await prisma.auditLog.create({
                data: {
                    userId: payment.userId,
                    action: 'PAYMENT_REFUND_INITIATED',
                    resource: 'payment',
                    resourceId: paymentId,
                    newValues: {
                        refundId: refund.id,
                        refundAmount: refund.amount / 100,
                        reason,
                    },
                },
            });

            return {
                success: true,
                refundId: refund.id,
                amount: refund.amount / 100,
                status: refund.status,
            };
        } catch (error) {
            throw new Error(`Failed to refund payment: ${error.message}`);
        }
    }

    /**
     * Get payment statistics
     * @param {string} userId - User ID (optional, for user-specific stats)
     * @returns {Promise<Object>} Payment statistics
     */
    static async getPaymentStatistics(userId = null) {
        try {
            const where = userId ? { userId } : {};

            const [total, completed, pending, failed, refunded] = await Promise.all([
                prisma.payment.count({ where }),
                prisma.payment.count({ where: { ...where, status: 'COMPLETED' } }),
                prisma.payment.count({ where: { ...where, status: 'PENDING' } }),
                prisma.payment.count({ where: { ...where, status: 'FAILED' } }),
                prisma.payment.count({ where: { ...where, status: 'REFUNDED' } }),
            ]);

            const aggregation = await prisma.payment.aggregate({
                where: { ...where, status: 'COMPLETED' },
                _sum: {
                    amount: true,
                },
            });

            return {
                counts: {
                    total,
                    completed,
                    pending,
                    failed,
                    refunded,
                },
                amounts: {
                    totalProcessed: parseFloat((aggregation._sum.amount || 0).toFixed(2)),
                },
            };
        } catch (error) {
            throw new Error(`Failed to get payment statistics: ${error.message}`);
        }
    }

    /**
     * Verify webhook signature
     * @param {string} payload - Webhook payload
     * @param {string} signature - Stripe signature
     * @returns {Object} Verified event
     */
    static verifyWebhookSignature(payload, signature) {
        try {
            const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

            if (!webhookSecret) {
                throw new Error('Webhook secret not configured');
            }

            const event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);

            return event;
        } catch (error) {
            throw new Error(`Webhook signature verification failed: ${error.message}`);
        }
    }
}

module.exports = PaymentService;
