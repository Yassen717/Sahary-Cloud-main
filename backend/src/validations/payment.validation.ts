// @ts-nocheck
const { z } = require('zod');

// Process payment validation
const processPaymentSchema = z.object({
  body: z.object({
    paymentMethodId: z
      .string({
        required_error: 'Payment method ID is required',
      })
      .min(1, 'Payment method ID cannot be empty'),

    savePaymentMethod: z.boolean().optional().default(false),
  }),

  params: z.object({
    invoiceId: z
      .string({
        required_error: 'Invoice ID is required',
      })
      .cuid('Invalid invoice ID format'),
  }),
});

// Payment intent validation
const paymentIntentSchema = z.object({
  params: z.object({
    invoiceId: z
      .string({
        required_error: 'Invoice ID is required',
      })
      .cuid('Invalid invoice ID format'),
  }),
});

// Payment query validation
const paymentQuerySchema = z.object({
  query: z.object({
    page: z
      .string()
      .regex(/^\d+$/, 'Page must be a positive integer')
      .transform(Number)
      .refine((val) => val > 0, 'Page must be greater than 0')
      .optional()
      .default('1'),

    limit: z
      .string()
      .regex(/^\d+$/, 'Limit must be a positive integer')
      .transform(Number)
      .refine((val) => val > 0 && val <= 100, 'Limit must be between 1 and 100')
      .optional()
      .default('10'),

    status: z.enum(['PENDING', 'COMPLETED', 'FAILED', 'REFUNDED']).optional(),

    startDate: z.string().datetime('Invalid start date format').optional(),

    endDate: z.string().datetime('Invalid end date format').optional(),

    sortBy: z.enum(['createdAt', 'amount', 'status']).optional().default('createdAt'),

    sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
  }),
});

// Refund validation
const refundPaymentSchema = z.object({
  body: z.object({
    amount: z
      .number()
      .positive('Refund amount must be positive')
      .optional(), // If not provided, full refund

    // Stripe refunds only accept a fixed enum of reasons — free-text
    // justification goes through `notes` and is forwarded via metadata.
    reason: z
      .enum(['duplicate', 'fraudulent', 'requested_by_customer', 'expired_uncaptured_charge'], {
        required_error: 'Refund reason is required',
        invalid_type_error:
                    'Refund reason must be one of: duplicate, fraudulent, requested_by_customer, expired_uncaptured_charge',
      }),

    notes: z
      .string()
      .min(10, 'Refund notes must be at least 10 characters')
      .max(500, 'Refund notes must not exceed 500 characters')
      .optional(),
  }),

  params: z.object({
    id: z
      .string({
        required_error: 'Payment ID is required',
      })
      .cuid('Invalid payment ID format'),
  }),
});

// Payment ID validation
const paymentIdSchema = z.object({
  params: z.object({
    id: z
      .string({
        required_error: 'Payment ID is required',
      })
      .cuid('Invalid payment ID format'),
  }),
});

module.exports = {
  processPaymentSchema,
  paymentIntentSchema,
  paymentQuerySchema,
  refundPaymentSchema,
  paymentIdSchema,
};
