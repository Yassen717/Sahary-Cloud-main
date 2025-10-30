const { z } = require('zod');

// User registration validation
const registerSchema = z.object({
  body: z.object({
    email: z
      .string({
        required_error: 'Email is required',
      })
      .email('Invalid email format')
      .min(5, 'Email must be at least 5 characters')
      .max(100, 'Email must not exceed 100 characters')
      .toLowerCase(),
    
    password: z
      .string({
        required_error: 'Password is required',
      })
      .min(8, 'Password must be at least 8 characters')
      .max(128, 'Password must not exceed 128 characters')
      .regex(
        /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/,
        'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'
      ),
    
    firstName: z
      .string({
        required_error: 'First name is required',
      })
      .min(2, 'First name must be at least 2 characters')
      .max(50, 'First name must not exceed 50 characters')
      .regex(/^[a-zA-Z\s]+$/, 'First name can only contain letters and spaces'),
    
    lastName: z
      .string({
        required_error: 'Last name is required',
      })
      .min(2, 'Last name must be at least 2 characters')
      .max(50, 'Last name must not exceed 50 characters')
      .regex(/^[a-zA-Z\s]+$/, 'Last name can only contain letters and spaces'),
    
    phone: z
      .string()
      .regex(/^\+?[1-9]\d{1,14}$/, 'Invalid phone number format')
      .optional(),
  }),
});

// User login validation
const loginSchema = z.object({
  body: z.object({
    email: z
      .string({
        required_error: 'Email is required',
      })
      .email('Invalid email format')
      .toLowerCase(),
    
    password: z
      .string({
        required_error: 'Password is required',
      })
      .min(1, 'Password is required'),
  }),
});

// User profile update validation
const updateProfileSchema = z.object({
  body: z.object({
    firstName: z
      .string()
      .min(2, 'First name must be at least 2 characters')
      .max(50, 'First name must not exceed 50 characters')
      .regex(/^[a-zA-Z\s]+$/, 'First name can only contain letters and spaces')
      .optional(),
    
    lastName: z
      .string()
      .min(2, 'Last name must be at least 2 characters')
      .max(50, 'Last name must not exceed 50 characters')
      .regex(/^[a-zA-Z\s]+$/, 'Last name can only contain letters and spaces')
      .optional(),
    
    phone: z
      .string()
      .regex(/^\+?[1-9]\d{1,14}$/, 'Invalid phone number format')
      .optional()
      .or(z.literal('')),
    
    avatar: z
      .string()
      .url('Invalid avatar URL')
      .optional(),
  }),
});

// Password change validation
const changePasswordSchema = z.object({
  body: z.object({
    currentPassword: z
      .string({
        required_error: 'Current password is required',
      }),
    
    newPassword: z
      .string({
        required_error: 'New password is required',
      })
      .min(8, 'Password must be at least 8 characters')
      .max(128, 'Password must not exceed 128 characters')
      .regex(
        /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/,
        'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'
      ),
    
    confirmPassword: z
      .string({
        required_error: 'Password confirmation is required',
      }),
  }).refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  }),
});

// Forgot password validation
const forgotPasswordSchema = z.object({
  body: z.object({
    email: z
      .string({
        required_error: 'Email is required',
      })
      .email('Invalid email format')
      .toLowerCase(),
  }),
});

// Reset password validation
const resetPasswordSchema = z.object({
  body: z.object({
    token: z
      .string({
        required_error: 'Reset token is required',
      }),
    
    password: z
      .string({
        required_error: 'Password is required',
      })
      .min(8, 'Password must be at least 8 characters')
      .max(128, 'Password must not exceed 128 characters')
      .regex(
        /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/,
        'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'
      ),
    
    confirmPassword: z
      .string({
        required_error: 'Password confirmation is required',
      }),
  }).refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  }),
});

// Email verification validation
const verifyEmailSchema = z.object({
  body: z.object({
    token: z
      .string({
        required_error: 'Verification token is required',
      }),
  }),
});

// Token validation schema
const validateTokenSchema = z.object({
  body: z.object({
    token: z
      .string({
        required_error: 'Token is required',
      })
      .min(1, 'Token cannot be empty'),
  }),
});

// Impersonation validation
const impersonateUserSchema = z.object({
  body: z.object({
    targetUserId: z
      .string({
        required_error: 'Target user ID is required',
      })
      .cuid('Invalid user ID format'),
    
    reason: z
      .string()
      .min(10, 'Reason must be at least 10 characters')
      .max(500, 'Reason must not exceed 500 characters')
      .optional(),
  }),
});

// Account deactivation validation
const deactivateAccountSchema = z.object({
  body: z.object({
    password: z
      .string({
        required_error: 'Password is required',
      })
      .min(1, 'Password cannot be empty'),
    
    reason: z
      .string()
      .min(10, 'Reason must be at least 10 characters')
      .max(500, 'Reason must not exceed 500 characters')
      .optional(),
  }),
});

// Account reactivation validation
const reactivateAccountSchema = z.object({
  body: z.object({
    email: z
      .string({
        required_error: 'Email is required',
      })
      .email('Invalid email format')
      .toLowerCase(),
    
    token: z
      .string({
        required_error: 'Reactivation token is required',
      })
      .min(1, 'Token cannot be empty'),
  }),
});

// Activity log query validation
const activityQuerySchema = z.object({
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
    
    action: z
      .string()
      .min(1, 'Action cannot be empty')
      .max(100, 'Action must not exceed 100 characters')
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
      .enum(['timestamp', 'action', 'resource'])
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

module.exports = {
  registerSchema,
  loginSchema,
  updateProfileSchema,
  changePasswordSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  verifyEmailSchema,
  validateTokenSchema,
  impersonateUserSchema,
  deactivateAccountSchema,
  reactivateAccountSchema,
  activityQuerySchema,
};