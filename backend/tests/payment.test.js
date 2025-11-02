const { prisma } = require('../src/config/database');
const PaymentService = require('../src/services/paymentService');
const BillingService = require('../src/services/billingService');
const VMService = require('../src/services/vmService');
const AuthService = require('../src/services/authService');

/**
 * Payment Service Tests
 * Tests payment processing, Stripe integration, and webhook handling
 */

// Mock Stripe
jest.mock('stripe', () => {
    return jest.fn().mockImplementation(() => ({
        paymentIntents: {
            create: jest.fn().mockResolvedValue({
                id: 'pi_test_123456',
                client_secret: 'pi_test_123456_secret_test',
                status: 'requires_payment_method',
                amount: 5000,
            }),
        },
        customers: {
            create: jest.fn().mockResolvedValue({
                id: 'cus_test_123456',
            }),
        },
        paymentMethods: {
            attach: jest.fn().mockResolvedValue({}),
        },
        refunds: {
            create: jest.fn().mockResolvedValue({
                id: 'ref_test_123456',
                amount: 5000,
                status: 'succeeded',
            }),
        },
        webhooks: {
            constructEvent: jest.fn().mockImplementation((payload, signature, secret) => {
                return JSON.parse(payload);
            }),
        },
    }));
});

describe('Payment Service', () => {
    let testUser;
    let testVM;
    let testInvoice;

    beforeAll(async () => {
        // Clean up existing test data
        await prisma.payment.deleteMany({});
        await prisma.invoice.deleteMany({});
        await prisma.usageRecord.deleteMany({});
        await prisma.virtualMachine.deleteMany({});
        await prisma.user.deleteMany({
            where: { email: 'payment-test@example.com' },
        });

        // Create test user
        const userResult = await AuthService.register({
            email: 'payment-test@example.com',
            password: 'TestPassword123!',
            firstName: 'Payment',
            lastName: 'Test',
        });

        testUser = userResult.user;

        // Verify user
        await prisma.user.update({
            where: { id: testUser.id },
            data: { isVerified: true },
        });

        // Create test VM
        testVM = await VMService.createVM(testUser.id, {
            name: 'payment-test-vm',
            description: 'VM for payment tests',
            cpu: 2,
            ram: 2048,
            storage: 40,
            bandwidth: 1000,
        });

        // Create usage records
        const usageRecords = [
            { cpuUsage: 40, ramUsage: 1000, storageUsage: 18, bandwidthUsage: 400, duration: 60 },
            { cpuUsage: 55, ramUsage: 1300, storageUsage: 22, bandwidthUsage: 600, duration: 60 },
        ];

        for (const usage of usageRecords) {
            await BillingService.recordUsage(testVM.id, usage);
        }

        // Generate invoice
        const now = new Date();
        testInvoice = await BillingService.generateMonthlyInvoice(testUser.id, {
            month: now.getMonth(),
            year: now.getFullYear(),
        });
    });

    afterAll(async () => {
        // Clean up test data
        await prisma.payment.deleteMany({});
        await prisma.invoice.deleteMany({});
        await prisma.usageRecord.deleteMany({});
        await prisma.virtualMachine.deleteMany({});
        await prisma.user.deleteMany({
            where: { email: 'payment-test@example.com' },
        });
        await prisma.$disconnect();
    });

    describe('Payment Intent Creation', () => {
        it('should create payment intent for invoice', async () => {
            const paymentIntent = await PaymentService.createPaymentIntent(
                testInvoice.id,
                testUser.id
            );

            expect(paymentIntent).toBeDefined();
            expect(paymentIntent.paymentId).toBeDefined();
            expect(paymentIntent.clientSecret).toBeDefined();
            expect(paymentIntent.amount).toBe(testInvoice.total);
            expect(paymentIntent.currency).toBe(testInvoice.currency);
            expect(paymentIntent.invoice).toBeDefined();
            expect(paymentIntent.invoice.id).toBe(testInvoice.id);
        });

        it('should reject payment intent for non-existent invoice', async () => {
            await expect(
                PaymentService.createPaymentIntent('non-existent-id', testUser.id)
            ).rejects.toThrow('Invoice not found');
        });

        it('should reject payment intent for unauthorized user', async () => {
            const otherUser = await AuthService.register({
                email: 'other-payment-user@example.com',
                password: 'TestPassword123!',
                firstName: 'Other',
                lastName: 'User',
            });

            await expect(
                PaymentService.createPaymentIntent(testInvoice.id, otherUser.user.id)
            ).rejects.toThrow('Unauthorized');

            // Cleanup
            await prisma.user.delete({ where: { id: otherUser.user.id } });
        });

        it('should reject payment intent for paid invoice', async () => {
            // Mark invoice as paid
            await prisma.invoice.update({
                where: { id: testInvoice.id },
                data: { status: 'PAID', paidAt: new Date() },
            });

            await expect(
                PaymentService.createPaymentIntent(testInvoice.id, testUser.id)
            ).rejects.toThrow('already paid');

            // Revert status
            await prisma.invoice.update({
                where: { id: testInvoice.id },
                data: { status: 'PENDING', paidAt: null },
            });
        });
    });

    describe('Payment Retrieval', () => {
        let testPayment;

        beforeAll(async () => {
            // Create a payment record for testing
            testPayment = await prisma.payment.create({
                data: {
                    invoiceId: testInvoice.id,
                    userId: testUser.id,
                    amount: testInvoice.total,
                    currency: testInvoice.currency,
                    paymentMethod: 'STRIPE',
                    status: 'COMPLETED',
                    stripePaymentIntentId: 'pi_test_completed',
                    completedAt: new Date(),
                },
            });
        });

        it('should get payment by ID', async () => {
            const payment = await PaymentService.getPaymentById(testPayment.id, testUser.id);

            expect(payment).toBeDefined();
            expect(payment.id).toBe(testPayment.id);
            expect(payment.invoice).toBeDefined();
            expect(payment.user).toBeDefined();
        });

        it('should return null for non-existent payment', async () => {
            const payment = await PaymentService.getPaymentById(
                'non-existent-id',
                testUser.id
            );

            expect(payment).toBeNull();
        });

        it('should get user payments with pagination', async () => {
            const result = await PaymentService.getUserPayments(testUser.id, {
                page: 1,
                limit: 10,
            });

            expect(result).toBeDefined();
            expect(result.data).toBeInstanceOf(Array);
            expect(result.data.length).toBeGreaterThan(0);
            expect(result.pagination).toBeDefined();
        });

        it('should filter payments by status', async () => {
            const result = await PaymentService.getUserPayments(testUser.id, {
                status: 'COMPLETED',
            });

            expect(result.data).toBeInstanceOf(Array);
            result.data.forEach((payment) => {
                expect(payment.status).toBe('COMPLETED');
            });
        });
    });

    describe('Payment Statistics', () => {
        it('should get payment statistics for user', async () => {
            const stats = await PaymentService.getPaymentStatistics(testUser.id);

            expect(stats).toBeDefined();
            expect(stats.counts).toBeDefined();
            expect(stats.counts.total).toBeGreaterThan(0);
            expect(stats.amounts).toBeDefined();
            expect(stats.amounts.totalProcessed).toBeGreaterThanOrEqual(0);
        });

        it('should get global payment statistics', async () => {
            const stats = await PaymentService.getPaymentStatistics();

            expect(stats).toBeDefined();
            expect(stats.counts).toBeDefined();
            expect(stats.amounts).toBeDefined();
        });
    });

    describe('Webhook Signature Verification', () => {
        it('should verify valid webhook signature', () => {
            const payload = JSON.stringify({
                type: 'payment_intent.succeeded',
                data: { object: {} },
            });
            const signature = 'test_signature';

            // Mock environment variable
            process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_secret';

            const event = PaymentService.verifyWebhookSignature(payload, signature);

            expect(event).toBeDefined();
            expect(event.type).toBe('payment_intent.succeeded');
        });

        it('should reject webhook without secret', () => {
            delete process.env.STRIPE_WEBHOOK_SECRET;

            const payload = JSON.stringify({ type: 'test' });
            const signature = 'test_signature';

            expect(() => {
                PaymentService.verifyWebhookSignature(payload, signature);
            }).toThrow('Webhook secret not configured');

            // Restore
            process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_secret';
        });
    });

    describe('Webhook Event Handling', () => {
        it('should handle payment success webhook', async () => {
            // Create a pending payment
            const pendingPayment = await prisma.payment.create({
                data: {
                    invoiceId: testInvoice.id,
                    userId: testUser.id,
                    amount: testInvoice.total,
                    currency: testInvoice.currency,
                    paymentMethod: 'STRIPE',
                    status: 'PENDING',
                    stripePaymentIntentId: 'pi_test_webhook_success',
                },
            });

            const event = {
                type: 'payment_intent.succeeded',
                data: {
                    object: {
                        id: 'pi_test_webhook_success',
                        status: 'succeeded',
                        amount: Math.round(testInvoice.total * 100),
                        metadata: {
                            invoiceId: testInvoice.id,
                        },
                    },
                },
            };

            const result = await PaymentService.handleWebhook(event);

            expect(result.handled).toBe(true);
            expect(result.status).toBe('COMPLETED');

            // Verify payment was updated
            const updatedPayment = await prisma.payment.findUnique({
                where: { id: pendingPayment.id },
            });

            expect(updatedPayment.status).toBe('COMPLETED');
        });

        it('should handle payment failure webhook', async () => {
            // Create a pending payment
            const pendingPayment = await prisma.payment.create({
                data: {
                    invoiceId: testInvoice.id,
                    userId: testUser.id,
                    amount: testInvoice.total,
                    currency: testInvoice.currency,
                    paymentMethod: 'STRIPE',
                    status: 'PENDING',
                    stripePaymentIntentId: 'pi_test_webhook_failed',
                },
            });

            const event = {
                type: 'payment_intent.payment_failed',
                data: {
                    object: {
                        id: 'pi_test_webhook_failed',
                        status: 'failed',
                        metadata: {
                            invoiceId: testInvoice.id,
                        },
                        last_payment_error: {
                            message: 'Card declined',
                        },
                    },
                },
            };

            const result = await PaymentService.handleWebhook(event);

            expect(result.handled).toBe(true);
            expect(result.status).toBe('FAILED');

            // Verify payment was updated
            const updatedPayment = await prisma.payment.findUnique({
                where: { id: pendingPayment.id },
            });

            expect(updatedPayment.status).toBe('FAILED');
        });

        it('should handle unrecognized webhook events', async () => {
            const event = {
                type: 'unknown.event.type',
                data: { object: {} },
            };

            const result = await PaymentService.handleWebhook(event);

            expect(result.handled).toBe(false);
            expect(result.eventType).toBe('unknown.event.type');
        });
    });

    describe('Refund Processing', () => {
        let completedPayment;

        beforeAll(async () => {
            // Create a completed payment for refund testing
            completedPayment = await prisma.payment.create({
                data: {
                    invoiceId: testInvoice.id,
                    userId: testUser.id,
                    amount: testInvoice.total,
                    currency: testInvoice.currency,
                    paymentMethod: 'STRIPE',
                    status: 'COMPLETED',
                    stripePaymentIntentId: 'pi_test_refund',
                    completedAt: new Date(),
                },
            });
        });

        it('should process full refund', async () => {
            const result = await PaymentService.refundPayment(completedPayment.id, {
                reason: 'Customer requested refund',
            });

            expect(result.success).toBe(true);
            expect(result.refundId).toBeDefined();
            expect(result.status).toBe('succeeded');

            // Verify payment was updated
            const updatedPayment = await prisma.payment.findUnique({
                where: { id: completedPayment.id },
            });

            expect(updatedPayment.status).toBe('REFUNDED');
            expect(updatedPayment.refundedAt).toBeDefined();
        });

        it('should reject refund for non-completed payment', async () => {
            const pendingPayment = await prisma.payment.create({
                data: {
                    invoiceId: testInvoice.id,
                    userId: testUser.id,
                    amount: testInvoice.total,
                    currency: testInvoice.currency,
                    paymentMethod: 'STRIPE',
                    status: 'PENDING',
                    stripePaymentIntentId: 'pi_test_pending',
                },
            });

            await expect(
                PaymentService.refundPayment(pendingPayment.id, {
                    reason: 'Test refund',
                })
            ).rejects.toThrow('completed payments');

            // Cleanup
            await prisma.payment.delete({ where: { id: pendingPayment.id } });
        });
    });
});
