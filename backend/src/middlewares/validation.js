const { z } = require('zod');

/**
 * Validation middleware factory
 * @param {Object} schema - Zod validation schema
 * @returns {Function} Express middleware function
 */
const validate = (schema) => {
  return async (req, res, next) => {
    try {
      // Validate the request against the schema
      const validatedData = await schema.parseAsync({
        body: req.body,
        query: req.query,
        params: req.params,
      });

      // Replace request data with validated data
      req.body = validatedData.body || req.body;
      req.query = validatedData.query || req.query;
      req.params = validatedData.params || req.params;

      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        // Format Zod validation errors
        const formattedErrors = error.errors.map((err) => ({
          field: err.path.join('.'),
          message: err.message,
          code: err.code,
          received: err.received,
        }));

        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: formattedErrors,
          timestamp: new Date().toISOString(),
        });
      }

      // Handle other validation errors
      return res.status(400).json({
        success: false,
        error: 'Validation error',
        message: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  };
};

/**
 * Sanitize input data
 * @param {Object} data - Data to sanitize
 * @returns {Object} Sanitized data
 */
const sanitizeInput = (data) => {
  if (typeof data === 'string') {
    // Remove potentially dangerous characters
    return data
      .trim()
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '') // Remove script tags
      .replace(/javascript:/gi, '') // Remove javascript: protocol
      .replace(/on\w+\s*=/gi, ''); // Remove event handlers
  }

  if (Array.isArray(data)) {
    return data.map(sanitizeInput);
  }

  if (typeof data === 'object' && data !== null) {
    const sanitized = {};
    for (const [key, value] of Object.entries(data)) {
      sanitized[key] = sanitizeInput(value);
    }
    return sanitized;
  }

  return data;
};

/**
 * Input sanitization middleware
 */
const sanitize = (req, res, next) => {
  try {
    if (req.body) {
      req.body = sanitizeInput(req.body);
    }
    
    if (req.query) {
      req.query = sanitizeInput(req.query);
    }
    
    if (req.params) {
      req.params = sanitizeInput(req.params);
    }

    next();
  } catch (error) {
    return res.status(400).json({
      success: false,
      error: 'Input sanitization failed',
      message: error.message,
      timestamp: new Date().toISOString(),
    });
  }
};

/**
 * Custom validation helpers
 */
const customValidators = {
  /**
   * Validate CUID format
   * @param {string} value - Value to validate
   * @returns {boolean} Is valid CUID
   */
  isCuid: (value) => {
    const cuidRegex = /^c[a-z0-9]{24}$/;
    return cuidRegex.test(value);
  },

  /**
   * Validate email format (more strict than Zod default)
   * @param {string} email - Email to validate
   * @returns {boolean} Is valid email
   */
  isValidEmail: (email) => {
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    return emailRegex.test(email);
  },

  /**
   * Validate password strength
   * @param {string} password - Password to validate
   * @returns {Object} Validation result with score and feedback
   */
  validatePasswordStrength: (password) => {
    let score = 0;
    const feedback = [];

    // Length check
    if (password.length >= 8) score += 1;
    else feedback.push('Password should be at least 8 characters long');

    if (password.length >= 12) score += 1;

    // Character variety checks
    if (/[a-z]/.test(password)) score += 1;
    else feedback.push('Password should contain lowercase letters');

    if (/[A-Z]/.test(password)) score += 1;
    else feedback.push('Password should contain uppercase letters');

    if (/\d/.test(password)) score += 1;
    else feedback.push('Password should contain numbers');

    if (/[@$!%*?&]/.test(password)) score += 1;
    else feedback.push('Password should contain special characters');

    // Common patterns check
    if (!/(.)\1{2,}/.test(password)) score += 1;
    else feedback.push('Password should not contain repeated characters');

    const strength = score >= 6 ? 'strong' : score >= 4 ? 'medium' : 'weak';

    return {
      score,
      strength,
      feedback,
      isValid: score >= 4,
    };
  },

  /**
   * Validate VM resource combination
   * @param {Object} resources - VM resources
   * @returns {Object} Validation result
   */
  validateVMResources: (resources) => {
    const { cpu, ram, storage } = resources;
    const errors = [];

    // Check minimum RAM per CPU core
    const minRamPerCore = 512; // 512MB per core
    if (ram < cpu * minRamPerCore) {
      errors.push(`RAM should be at least ${cpu * minRamPerCore}MB for ${cpu} CPU core(s)`);
    }

    // Check storage vs RAM ratio
    const minStorageGB = Math.max(10, Math.ceil(ram / 1024) * 2);
    if (storage < minStorageGB) {
      errors.push(`Storage should be at least ${minStorageGB}GB for ${ram}MB of RAM`);
    }

    // Check for reasonable resource limits
    if (cpu > 16 && ram < 8192) {
      errors.push('High CPU count requires more RAM for optimal performance');
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  },

  /**
   * Validate date range
   * @param {string} startDate - Start date
   * @param {string} endDate - End date
   * @param {number} maxDays - Maximum allowed days between dates
   * @returns {Object} Validation result
   */
  validateDateRange: (startDate, endDate, maxDays = 365) => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const now = new Date();

    const errors = [];

    if (start > end) {
      errors.push('Start date must be before end date');
    }

    if (end > now) {
      errors.push('End date cannot be in the future');
    }

    const diffDays = (end - start) / (1000 * 60 * 60 * 24);
    if (diffDays > maxDays) {
      errors.push(`Date range cannot exceed ${maxDays} days`);
    }

    return {
      isValid: errors.length === 0,
      errors,
      diffDays,
    };
  },
};

/**
 * Create a validation middleware with custom error handling
 * @param {Object} schema - Zod schema
 * @param {Object} options - Validation options
 * @returns {Function} Validation middleware
 */
const createValidator = (schema, options = {}) => {
  const {
    allowUnknown = false,
    stripUnknown = true,
    customErrorHandler = null,
  } = options;

  return async (req, res, next) => {
    try {
      const validationOptions = {
        stripUnknown,
        allowUnknown,
      };

      const validatedData = await schema.parseAsync(
        {
          body: req.body,
          query: req.query,
          params: req.params,
        },
        validationOptions
      );

      // Update request with validated data
      req.body = validatedData.body || req.body;
      req.query = validatedData.query || req.query;
      req.params = validatedData.params || req.params;

      // Add validation metadata to request
      req.validationPassed = true;
      req.validatedAt = new Date().toISOString();

      next();
    } catch (error) {
      if (customErrorHandler) {
        return customErrorHandler(error, req, res, next);
      }

      if (error instanceof z.ZodError) {
        const formattedErrors = error.errors.map((err) => ({
          field: err.path.join('.'),
          message: err.message,
          code: err.code,
          received: err.received,
        }));

        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: formattedErrors,
          timestamp: new Date().toISOString(),
        });
      }

      return res.status(400).json({
        success: false,
        error: 'Validation error',
        message: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  };
};

module.exports = {
  validate,
  sanitize,
  customValidators,
  createValidator,
};