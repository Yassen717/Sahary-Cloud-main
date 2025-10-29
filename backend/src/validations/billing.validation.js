const { z } = require('zod');

// Invoice query validation
const invoiceQuerySchema = z.object({
  query: z.object({
    page: z
      .string()
      .regex(/^\d+$/, 'Page must be a positive integer')
      .transform(Number)
      .refine(val => val > 0, 'Page must be greater than 0')
      .optional()
      .default('1'),
    
    limit: z
      .string()
      .regex(/^\d+$/, 'Limit must be a positive integer')
      .transform(Number)
      .refine(val => val > 0 && val <= 100, 'Limit must be between 1 and 100')
      .optional()
      .default('10'),
    
    status: z
      .enum(['DRAFT', 'PENDING', 'PAID', 'OVERDUE', 'CANCELLED', 'REFUNDED'])
      .optional(),
    
    startDate: z
      .string()
      .datetime('Invalid start date format')
      .optional(),
    
    endDate: z
      .string()
      .datetime('Invalid end date format')
      .optional(),
    
    minAmount: z
      .string()
      .regex(/^\d+(\.\d{1,2})?$/, 'Invalid minimum amount format')
      .transform(Number)
      .optional(),
    
    maxAmount: z
      .string()
      .regex(/^\d+(\.\d{1,2})?$/, 'Invalid maximum amount format')
      .transform(Number)
      .optional(),
    
    sortBy: z
      .enum(['createdAt', 'amount', 'dueDate', 'status'])
      .optional()
      .default('createdAt'),
    
    sortOrder: z
      .enum(['asc', 'desc'])
      .optional()
      .default('desc'),
  }).refine((data) => {
    if (data.startDate && data.endDate) {
      return new Date(data.startDate) <= new Date(data.endDate);
    }
    return true;
  }, {
    message: 'Start date must be before or equal to end date',
    path: ['endDate'],
  }).refine((data) => {
    if (data.minAmount && data.maxAmount) {
      return data.minAmount <= data.maxAmount;
    }
    return true;
  }, {
    message: 'Minimum amount must be less than or equal to maximum amount',
    path: ['maxAmount'],
  }),
});

// Payment processing validation
const processPaymentSchema = z.object({
  body: z.object({
    paymentMethod: z
      .enum(['STRIPE', 'PAYPAL', 'BANK_TRANSFER', 'CRYPTO'], {
        required_error: 'Payment method is required',
      }),
    
    paymentToken: z
      .string({
        required_error: 'Payment token is required',
      })
      .min(1, 'Payment token cannot be empty'),
    
    savePaymentMethod: z
      .boolean()
      .optional()
      .default(false),
  }),
  
  params: z.object({
    invoiceId: z
      .string({
        required_error: 'Invoice ID is required',
      })
      .cuid('Invalid invoice ID format'),
  }),
});

// Usage record validation
const usageRecordSchema = z.object({
  body: z.object({
    vmId: z
      .string({
        required_error: 'VM ID is required',
      })
      .cuid('Invalid VM ID format'),
    
    cpuUsage: z
      .number({
        required_error: 'CPU usage is required',
      })
      .min(0, 'CPU usage cannot be negative')
      .max(100, 'CPU usage cannot exceed 100%'),
    
    ramUsage: z
      .number({
        required_error: 'RAM usage is required',
      })
      .min(0, 'RAM usage cannot be negative'),
    
    storageUsage: z
      .number({
        required_error: 'Storage usage is required',
      })
      .min(0, 'Storage usage cannot be negative'),
    
    bandwidthUsage: z
      .number({
        required_error: 'Bandwidth usage is required',
      })
      .min(0, 'Bandwidth usage cannot be negative'),
    
    duration: z
      .number({
        required_error: 'Duration is required',
      })
      .int('Duration must be an integer')
      .min(1, 'Duration must be at least 1 minute')
      .max(1440, 'Duration cannot exceed 24 hours'), // 24 hours in minutes
    
    timestamp: z
      .string()
      .datetime('Invalid timestamp format')
      .optional(),
  }),
});

// Usage query validation
const usageQuerySchema = z.object({
  query: z.object({
    vmId: z
      .string()
      .cuid('Invalid VM ID format')
      .optional(),
    
    startDate: z
      .string()
      .datetime('Invalid start date format')
      .optional(),
    
    endDate: z
      .string()
      .datetime('Invalid end date format')
      .optional(),
    
    groupBy: z
      .enum(['hour', 'day', 'week', 'month'])
      .optional()
      .default('day'),
    
    page: z
      .string()
      .regex(/^\d+$/, 'Page must be a positive integer')
      .transform(Number)
      .refine(val => val > 0, 'Page must be greater than 0')
      .optional()
      .default('1'),
    
    limit: z
      .string()
      .regex(/^\d+$/, 'Limit must be a positive integer')
      .transform(Number)
      .refine(val => val > 0 && val <= 1000, 'Limit must be between 1 and 1000')
      .optional()
      .default('100'),
  }).refine((data) => {
    if (data.startDate && data.endDate) {
      return new Date(data.startDate) <= new Date(data.endDate);
    }
    return true;
  }, {
    message: 'Start date must be before or equal to end date',
    path: ['endDate'],
  }),
});

// Pricing calculation validation
const calculatePricingSchema = z.object({
  body: z.object({
    resources: z.object({
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
    }),
    
    duration: z
      .number({
        required_error: 'Duration is required',
      })
      .int('Duration must be an integer')
      .min(1, 'Duration must be at least 1 hour')
      .max(8760, 'Duration cannot exceed 1 year'), // 1 year in hours
    
    currency: z
      .string()
      .length(3, 'Currency must be a 3-letter code')
      .toUpperCase()
      .optional()
      .default('USD'),
  }),
});

// Discount validation
const applyDiscountSchema = z.object({
  body: z.object({
    discountCode: z
      .string({
        required_error: 'Discount code is required',
      })
      .min(3, 'Discount code must be at least 3 characters')
      .max(50, 'Discount code must not exceed 50 characters')
      .toUpperCase(),
  }),
  
  params: z.object({
    invoiceId: z
      .string({
        required_error: 'Invoice ID is required',
      })
      .cuid('Invalid invoice ID format'),
  }),
});

// Refund validation
const processRefundSchema = z.object({
  body: z.object({
    amount: z
      .number()
      .positive('Refund amount must be positive')
      .optional(), // If not provided, full refund
    
    reason: z
      .string({
        required_error: 'Refund reason is required',
      })
      .min(10, 'Refund reason must be at least 10 characters')
      .max(500, 'Refund reason must not exceed 500 characters'),
  }),
  
  params: z.object({
    paymentId: z
      .string({
        required_error: 'Payment ID is required',
      })
      .cuid('Invalid payment ID format'),
  }),
});

module.exports = {
  invoiceQuerySchema,
  processPaymentSchema,
  usageRecordSchema,
  usageQuerySchema,
  calculatePricingSchema,
  applyDiscountSchema,
  processRefundSchema,
};