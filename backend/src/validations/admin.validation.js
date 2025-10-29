const { z } = require('zod');

// Admin user management validation
const updateUserStatusSchema = z.object({
  body: z.object({
    isActive: z
      .boolean({
        required_error: 'Active status is required',
      }),
    
    reason: z
      .string()
      .min(10, 'Reason must be at least 10 characters')
      .max(500, 'Reason must not exceed 500 characters')
      .optional(),
  }),
  
  params: z.object({
    userId: z
      .string({
        required_error: 'User ID is required',
      })
      .cuid('Invalid user ID format'),
  }),
});

// Admin user role update validation
const updateUserRoleSchema = z.object({
  body: z.object({
    role: z
      .enum(['USER', 'ADMIN', 'SUPER_ADMIN'], {
        required_error: 'Role is required',
      }),
    
    reason: z
      .string()
      .min(10, 'Reason must be at least 10 characters')
      .max(500, 'Reason must not exceed 500 characters')
      .optional(),
  }),
  
  params: z.object({
    userId: z
      .string({
        required_error: 'User ID is required',
      })
      .cuid('Invalid user ID format'),
  }),
});

// Admin users query validation
const adminUsersQuerySchema = z.object({
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
      .default('20'),
    
    role: z
      .enum(['USER', 'ADMIN', 'SUPER_ADMIN'])
      .optional(),
    
    isActive: z
      .string()
      .transform(val => val === 'true')
      .optional(),
    
    isVerified: z
      .string()
      .transform(val => val === 'true')
      .optional(),
    
    search: z
      .string()
      .min(1, 'Search term cannot be empty')
      .max(100, 'Search term must not exceed 100 characters')
      .optional(),
    
    sortBy: z
      .enum(['createdAt', 'email', 'firstName', 'lastName', 'lastLoginAt'])
      .optional()
      .default('createdAt'),
    
    sortOrder: z
      .enum(['asc', 'desc'])
      .optional()
      .default('desc'),
    
    registeredAfter: z
      .string()
      .datetime('Invalid date format')
      .optional(),
    
    registeredBefore: z
      .string()
      .datetime('Invalid date format')
      .optional(),
  }).refine((data) => {
    if (data.registeredAfter && data.registeredBefore) {
      return new Date(data.registeredAfter) <= new Date(data.registeredBefore);
    }
    return true;
  }, {
    message: 'Registered after date must be before or equal to registered before date',
    path: ['registeredBefore'],
  }),
});

// System statistics query validation
const systemStatsQuerySchema = z.object({
  query: z.object({
    period: z
      .enum(['hour', 'day', 'week', 'month', 'year'])
      .optional()
      .default('day'),
    
    startDate: z
      .string()
      .datetime('Invalid start date format')
      .optional(),
    
    endDate: z
      .string()
      .datetime('Invalid end date format')
      .optional(),
    
    metrics: z
      .string()
      .transform(val => val.split(',').map(m => m.trim()))
      .refine(
        val => val.every(metric => 
          ['users', 'vms', 'revenue', 'usage', 'solar'].includes(metric)
        ),
        'Invalid metrics specified'
      )
      .optional(),
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

// System settings validation
const updateSystemSettingSchema = z.object({
  body: z.object({
    value: z
      .string({
        required_error: 'Setting value is required',
      })
      .min(1, 'Setting value cannot be empty')
      .max(1000, 'Setting value must not exceed 1000 characters'),
    
    description: z
      .string()
      .max(500, 'Description must not exceed 500 characters')
      .optional(),
  }),
  
  params: z.object({
    key: z
      .string({
        required_error: 'Setting key is required',
      })
      .min(1, 'Setting key cannot be empty')
      .max(100, 'Setting key must not exceed 100 characters')
      .regex(/^[a-z_]+$/, 'Setting key can only contain lowercase letters and underscores'),
  }),
});

// Create system setting validation
const createSystemSettingSchema = z.object({
  body: z.object({
    key: z
      .string({
        required_error: 'Setting key is required',
      })
      .min(1, 'Setting key cannot be empty')
      .max(100, 'Setting key must not exceed 100 characters')
      .regex(/^[a-z_]+$/, 'Setting key can only contain lowercase letters and underscores'),
    
    value: z
      .string({
        required_error: 'Setting value is required',
      })
      .min(1, 'Setting value cannot be empty')
      .max(1000, 'Setting value must not exceed 1000 characters'),
    
    description: z
      .string()
      .max(500, 'Description must not exceed 500 characters')
      .optional(),
    
    category: z
      .string()
      .min(1, 'Category cannot be empty')
      .max(50, 'Category must not exceed 50 characters')
      .regex(/^[a-z_]+$/, 'Category can only contain lowercase letters and underscores')
      .optional()
      .default('general'),
  }),
});

// VM management validation for admins
const adminVMActionSchema = z.object({
  body: z.object({
    action: z
      .enum(['start', 'stop', 'restart', 'suspend', 'resume', 'delete'], {
        required_error: 'Action is required',
      }),
    
    reason: z
      .string()
      .min(10, 'Reason must be at least 10 characters')
      .max(500, 'Reason must not exceed 500 characters')
      .optional(),
    
    notifyUser: z
      .boolean()
      .optional()
      .default(true),
  }),
  
  params: z.object({
    vmId: z
      .string({
        required_error: 'VM ID is required',
      })
      .cuid('Invalid VM ID format'),
  }),
});

// Audit log query validation
const auditLogQuerySchema = z.object({
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
      .default('50'),
    
    userId: z
      .string()
      .cuid('Invalid user ID format')
      .optional(),
    
    action: z
      .string()
      .min(1, 'Action cannot be empty')
      .max(100, 'Action must not exceed 100 characters')
      .optional(),
    
    resource: z
      .string()
      .min(1, 'Resource cannot be empty')
      .max(100, 'Resource must not exceed 100 characters')
      .optional(),
    
    startDate: z
      .string()
      .datetime('Invalid start date format')
      .optional(),
    
    endDate: z
      .string()
      .datetime('Invalid end date format')
      .optional(),
    
    sortBy: z
      .enum(['timestamp', 'action', 'resource', 'userId'])
      .optional()
      .default('timestamp'),
    
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
  }),
});

// Notification creation validation
const createNotificationSchema = z.object({
  body: z.object({
    title: z
      .string({
        required_error: 'Notification title is required',
      })
      .min(5, 'Title must be at least 5 characters')
      .max(100, 'Title must not exceed 100 characters'),
    
    message: z
      .string({
        required_error: 'Notification message is required',
      })
      .min(10, 'Message must be at least 10 characters')
      .max(1000, 'Message must not exceed 1000 characters'),
    
    type: z
      .enum(['INFO', 'SUCCESS', 'WARNING', 'ERROR', 'SYSTEM'])
      .optional()
      .default('INFO'),
    
    userIds: z
      .array(z.string().cuid('Invalid user ID format'))
      .min(1, 'At least one user ID is required')
      .optional(),
    
    sendToAll: z
      .boolean()
      .optional()
      .default(false),
    
    metadata: z
      .record(z.any())
      .optional(),
  }).refine((data) => {
    return data.userIds || data.sendToAll;
  }, {
    message: 'Either specify user IDs or set sendToAll to true',
    path: ['userIds'],
  }),
});

module.exports = {
  updateUserStatusSchema,
  updateUserRoleSchema,
  adminUsersQuerySchema,
  systemStatsQuerySchema,
  updateSystemSettingSchema,
  createSystemSettingSchema,
  adminVMActionSchema,
  auditLogQuerySchema,
  createNotificationSchema,
};