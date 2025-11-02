const PaymentService = require('../services/paymentService');

/**
 * Payment Controller
 * Handles HTTP requests for payment operations
 */
class PaymentController {
    /**
     * Create payment intent
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     */
    static async createPaymentIntent(req, res) {
        try {
            const { invoiceId } = req.params;
            const userId = req.user.userId;

            const paymentIntent = await PaymentService.createPaymentIntent(invoiceId, userId);

            res.status(200).json({
                success: true,
                message: 'Payment intent created successfully',
                data: paymentIntent,
            });
        } catch (error) {
            res.status(400).json({
                success: false,
                error: 'Payment intent creation failed',
                message: error.message,
            });
        }
    }

    /**
     * Process payment
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     */
    static async processPayment(req, res) {
        try {
            const { invoiceId } = req.params;
            const { paymentMethodId, savePaymentMethod } = req.body;

            const result = await PaymentService.processPayment(invoiceId, {
                paymentMethodId,
                savePaymentMethod,
            });

            res.status(200).json({
                success: result.success,
                message: result.success ? 'Payment processed successfully' : 'Payment processing initiated',
                data: result,
            });
        } catch (error) {
            res.status(400).json({
                success: false,
                error: 'Payment processing failed',
                message: error.message,
            });
        }
    }

    /**
     * Handle Stripe webhook
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     */
    static async handleWebhook(req, res) {
        try {
            const signature = req.headers['stripe-signature'];
            const payload = req.body;

            // Verify webhook signature
            const event = PaymentService.verifyWebhookSignature(payload, signature);

            // Handle the event
            const result = await PaymentService.handleWebhook(event);

            res.status(200).json({
                success: true,
                message: 'Webhook processed successfully',
                data: result,
            });
        } catch (error) {
            console.error('Webhook error:', error);
            res.status(400).json({
                success: false,
                error: 'Webhook processing failed',
                message: error.message,
            });
        }
    }

    /**
     * Get payment by ID
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     */
    static async getPaymentById(req, res) {
        try {
            const { id } = req.params;
            const userId = req.user.userId;
            const isAdmin = ['ADMIN', 'SUPER_ADMIN'].includes(req.user.role);

            const payment = await PaymentService.getPaymentById(id, isAdmin ? null : userId);

            if (!payment) {
                return res.status(404).json({
                    success: false,
                    error: 'Payment not found',
                    message: 'Payment not found or access denied',
                });
            }

            res.status(200).json({
                success: true,
                message: 'Payment retrieved successfully',
                data: { payment },
            });
        } catch (error) {
            res.status(400).json({
                success: false,
                error: 'Failed to get payment',
                message: error.message,
            });
        }
    }

    /**
     * Get user payments
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     */
    static async getUserPayments(req, res) {
        try {
            const userId = req.user.userId;
            const { page, limit, status, startDate, endDate, sortBy, sortOrder } = req.query;

            const result = await PaymentService.getUserPayments(userId, {
                page,
                limit,
                status,
                startDate,
                endDate,
                sortBy,
                sortOrder,
            });

            res.status(200).json({
                success: true,
                message: 'Payments retrieved successfully',
                data: result.data,
                pagination: result.pagination,
            });
        } catch (error) {
            res.status(400).json({
                success: false,
                error: 'Failed to get payments',
                message: error.message,
            });
        }
    }

    /**
     * Refund payment (admin only)
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     */
    static async refundPayment(req, res) {
        try {
            const { id } = req.params;
            const { amount, reason } = req.body;

            const result = await PaymentService.refundPayment(id, {
                amount,
                reason,
            });

            res.status(200).json({
                success: true,
                message: 'Payment refunded successfully',
                data: result,
            });
        } catch (error) {
            res.status(400).json({
                success: false,
                error: 'Refund failed',
                message: error.message,
            });
        }
    }

    /**
     * Get payment statistics
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     */
    static async getPaymentStatistics(req, res) {
        try {
            const userId = req.user.userId;
            const isAdmin = ['ADMIN', 'SUPER_ADMIN'].includes(req.user.role);

            const stats = await PaymentService.getPaymentStatistics(isAdmin ? null : userId);

            res.status(200).json({
                success: true,
                message: 'Payment statistics retrieved successfully',
                data: stats,
            });
        } catch (error) {
            res.status(400).json({
                success: false,
                error: 'Failed to get payment statistics',
                message: error.message,
            });
        }
    }
}

module.exports = PaymentController;
