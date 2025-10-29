// User validations
const userValidations = require('./user.validation');

// VM validations
const vmValidations = require('./vm.validation');

// Billing validations
const billingValidations = require('./billing.validation');

// Admin validations
const adminValidations = require('./admin.validation');

// Solar validations
const solarValidations = require('./solar.validation');

// Export all validations
module.exports = {
  // User validations
  user: userValidations,
  
  // VM validations
  vm: vmValidations,
  
  // Billing validations
  billing: billingValidations,
  
  // Admin validations
  admin: adminValidations,
  
  // Solar validations
  solar: solarValidations,
  
  // Common validation schemas
  common: {
    // ID parameter validation
    idParam: require('zod').object({
      params: require('zod').object({
        id: require('zod')
          .string({
            required_error: 'ID is required',
          })
          .cuid('Invalid ID format'),
      }),
    }),
    
    // Pagination query validation
    paginationQuery: require('zod').object({
      query: require('zod').object({
        page: require('zod')
          .string()
          .regex(/^\d+$/, 'Page must be a positive integer')
          .transform(Number)
          .refine(val => val > 0, 'Page must be greater than 0')
          .optional()
          .default('1'),
        
        limit: require('zod')
          .string()
          .regex(/^\d+$/, 'Limit must be a positive integer')
          .transform(Number)
          .refine(val => val > 0 && val <= 100, 'Limit must be between 1 and 100')
          .optional()
          .default('10'),
        
        sortBy: require('zod')
          .string()
          .min(1, 'Sort field cannot be empty')
          .optional(),
        
        sortOrder: require('zod')
          .enum(['asc', 'desc'])
          .optional()
          .default('desc'),
      }),
    }),
    
    // Date range query validation
    dateRangeQuery: require('zod').object({
      query: require('zod').object({
        startDate: require('zod')
          .string()
          .datetime('Invalid start date format')
          .optional(),
        
        endDate: require('zod')
          .string()
          .datetime('Invalid end date format')
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
    }),
  },
};