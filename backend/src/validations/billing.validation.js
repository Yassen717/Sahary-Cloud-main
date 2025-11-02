const { z } = require('zod');

// Invoice query validation
const invoiceQuerySchema = z.object({
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

        status: z
            .enum(['PENDING', 'PAID', 'OVERDUE', 'CANCELLED', 'REFUNDED'])
            .optional(),

        startDate: z.string().datetime('Invalid start date format').optional(),

        endDate: z.string().datetime('Invalid end date format').optional(),

        sortBy: z
            .enum(['createdAt', 'total', 'dueDate', 'status'])
            .optional()
            .default('createdAt'),

        sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),

        userId: z.string().cuid('Invalid user ID format').optional(),
    }),
});

// Invoice ID validation
const invoiceIdSchema = z.object({
    params: z.object({
        id: z
            .string({
                required_error: 'Invoice ID is required',
            })
            .cuid('Invalid invoice ID format'),
    }),
});

// Usage query validation
const usageQuerySchema = z.object({
    query: z.object({
        startDate: z.string().datetime('Invalid start date format').optional(),

        endDate: z.string().datetime('Invalid end date format').optional(),

        groupBy: z.enum(['hour', 'day', 'week', 'month']).optional().default('day'),

        page: z
            .string()
            .regex(/^\d+$/, 'Page must be a positive integer')
            .transform(Number)
            .optional()
            .default('1'),

        limit: z
            .string()
            .regex(/^\d+$/, 'Limit must be a positive integer')
            .transform(Number)
            .optional()
            .default('100'),
    }),
});

// VM usage query validation
const vmUsageQuerySchema = z.object({
    params: z.object({
        vmId: z
            .string({
                required_error: 'VM ID is required',
            })
            .cuid('Invalid VM ID format'),
    }),

    query: z.object({
        startDate: z.string().datetime('Invalid start date format').optional(),

        endDate: z.string().datetime('Invalid end date format').optional(),

        page: z
            .string()
            .regex(/^\d+$/, 'Page must be a positive integer')
            .transform(Number)
            .optional()
            .default('1'),

        limit: z
            .string()
            .regex(/^\d+$/, 'Limit must be a positive integer')
            .transform(Number)
            .optional()
            .default('100'),
    }),
});

// Pricing calculation validation
const calculatePricingSchema = z.object({
    body: z.object({
        cpu: z
            .number({
                required_error: 'CPU cores is required',
            })
            .int('CPU cores must be an integer')
            .min(1, 'CPU cores must be at least 1')
            .max(32, 'CPU cores must not exceed 32'),

        ram: z
            .number({
                required_error: 'RAM is required',
            })
            .int('RAM must be an integer')
            .min(512, 'RAM must be at least 512 MB')
            .max(131072, 'RAM must not exceed 128 GB'),

        storage: z
            .number({
                required_error: 'Storage is required',
            })
            .int('Storage must be an integer')
            .min(10, 'Storage must be at least 10 GB')
            .max(2048, 'Storage must not exceed 2 TB'),

        bandwidth: z
            .number()
            .int('Bandwidth must be an integer')
            .min(100, 'Bandwidth must be at least 100 GB')
            .max(10000, 'Bandwidth must not exceed 10 TB')
            .optional()
            .default(1000),

        duration: z
            .number()
            .int('Duration must be an integer')
            .min(1, 'Duration must be at least 1 hour')
            .optional(),
    }),
});

// Discount validation
const applyDiscountSchema = z.object({
    body: z.object({
        discountCode: z
            .string()
            .min(3, 'Discount code must be at least 3 characters')
            .max(50, 'Discount code must not exceed 50 characters')
            .optional(),

        discountAmount: z.number().positive('Discount amount must be positive').optional(),

        discountPercentage: z
            .number()
            .min(0, 'Discount percentage must be at least 0')
            .max(100, 'Discount percentage must not exceed 100')
            .optional(),

        reason: z
            .string()
            .min(5, 'Reason must be at least 5 characters')
            .max(500, 'Reason must not exceed 500 characters')
            .optional(),
    }).refine(
        (data) => data.discountAmount || data.discountPercentage,
        'Either discountAmount or discountPercentage must be provided'
    ),

    params: z.object({
        id: z
            .string({
                required_error: 'Invoice ID is required',
            })
            .cuid('Invalid invoice ID format'),
    }),
});

// Generate invoice validation
const generateInvoiceSchema = z.object({
    body: z.object({
        month: z
            .number()
            .int('Month must be an integer')
            .min(0, 'Month must be between 0 and 11')
            .max(11, 'Month must be between 0 and 11')
            .optional(),

        year: z
            .number()
            .int('Year must be an integer')
            .min(2020, 'Year must be at least 2020')
            .max(2100, 'Year must not exceed 2100')
            .optional(),

        dueInDays: z
            .number()
            .int('Due in days must be an integer')
            .min(1, 'Due in days must be at least 1')
            .max(90, 'Due in days must not exceed 90')
            .optional()
            .default(15),
    }),

    params: z.object({
        userId: z
            .string({
                required_error: 'User ID is required',
            })
            .cuid('Invalid user ID format'),
    }),
});

// Batch generate invoices validation
const batchGenerateInvoicesSchema = z.object({
    body: z.object({
        month: z
            .number()
            .int('Month must be an integer')
            .min(0, 'Month must be between 0 and 11')
            .max(11, 'Month must be between 0 and 11')
            .optional(),

        year: z
            .number()
            .int('Year must be an integer')
            .min(2020, 'Year must be at least 2020')
            .max(2100, 'Year must not exceed 2100')
            .optional(),
    }),
});

// Update invoice status validation
const updateInvoiceStatusSchema = z.object({
    body: z.object({
        status: z.enum(['PENDING', 'PAID', 'OVERDUE', 'CANCELLED', 'REFUNDED'], {
            required_error: 'Status is required',
        }),

        metadata: z.record(z.any()).optional(),
    }),

    params: z.object({
        id: z
            .string({
                required_error: 'Invoice ID is required',
            })
            .cuid('Invalid invoice ID format'),
    }),
});

module.exports = {
    invoiceQuerySchema,
    invoiceIdSchema,
    usageQuerySchema,
    vmUsageQuerySchema,
    calculatePricingSchema,
    applyDiscountSchema,
    generateInvoiceSchema,
    batchGenerateInvoicesSchema,
    updateInvoiceStatusSchema,
};
