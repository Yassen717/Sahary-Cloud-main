const bcrypt = require('bcryptjs');
const { z } = require('zod');

/**
 * Data validation helper functions
 */
class ValidationHelpers {
  /**
   * Validate and hash password
   * @param {string} password - Plain text password
   * @param {number} rounds - Bcrypt rounds (default: 12)
   * @returns {Promise<string>} Hashed password
   */
  static async hashPassword(password, rounds = 12) {
    // Validate password strength first
    const passwordValidation = this.validatePasswordStrength(password);
    if (!passwordValidation.isValid) {
      throw new Error(`Password validation failed: ${passwordValidation.feedback.join(', ')}`);
    }

    return bcrypt.hash(password, rounds);
  }

  /**
   * Compare password with hash
   * @param {string} password - Plain text password
   * @param {string} hash - Hashed password
   * @returns {Promise<boolean>} Password match result
   */
  static async comparePassword(password, hash) {
    return bcrypt.compare(password, hash);
  }

  /**
   * Validate password strength
   * @param {string} password - Password to validate
   * @returns {Object} Validation result
   */
  static validatePasswordStrength(password) {
    let score = 0;
    const feedback = [];

    if (!password || typeof password !== 'string') {
      return {
        score: 0,
        strength: 'invalid',
        feedback: ['Password is required'],
        isValid: false,
      };
    }

    // Length checks
    if (password.length >= 8) score += 1;
    else feedback.push('Password must be at least 8 characters long');

    if (password.length >= 12) score += 1;

    // Character variety checks
    if (/[a-z]/.test(password)) score += 1;
    else feedback.push('Password must contain lowercase letters');

    if (/[A-Z]/.test(password)) score += 1;
    else feedback.push('Password must contain uppercase letters');

    if (/\d/.test(password)) score += 1;
    else feedback.push('Password must contain numbers');

    if (/[@$!%*?&]/.test(password)) score += 1;
    else feedback.push('Password must contain special characters (@$!%*?&)');

    // Pattern checks
    if (!/(.)\1{2,}/.test(password)) score += 1;
    else feedback.push('Password should not contain repeated characters');

    // Common password check
    const commonPasswords = [
      'password', '123456', '123456789', 'qwerty', 'abc123',
      'password123', 'admin', 'letmein', 'welcome', 'monkey'
    ];
    
    if (!commonPasswords.includes(password.toLowerCase())) score += 1;
    else feedback.push('Password is too common');

    const strength = score >= 7 ? 'strong' : score >= 5 ? 'medium' : 'weak';

    return {
      score,
      strength,
      feedback,
      isValid: score >= 5, // Require at least medium strength
    };
  }

  /**
   * Validate email format and domain
   * @param {string} email - Email to validate
   * @returns {Object} Validation result
   */
  static validateEmail(email) {
    if (!email || typeof email !== 'string') {
      return {
        isValid: false,
        errors: ['Email is required'],
      };
    }

    const errors = [];

    // Basic format check
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!emailRegex.test(email)) {
      errors.push('Invalid email format');
    }

    // Length check
    if (email.length > 254) {
      errors.push('Email is too long');
    }

    // Local part length check
    const [localPart] = email.split('@');
    if (localPart && localPart.length > 64) {
      errors.push('Email local part is too long');
    }

    // Disposable email check (basic list)
    const disposableDomains = [
      '10minutemail.com', 'tempmail.org', 'guerrillamail.com',
      'mailinator.com', 'throwaway.email'
    ];
    
    const domain = email.split('@')[1]?.toLowerCase();
    if (domain && disposableDomains.includes(domain)) {
      errors.push('Disposable email addresses are not allowed');
    }

    return {
      isValid: errors.length === 0,
      errors,
      domain,
    };
  }

  /**
   * Validate VM resource configuration
   * @param {Object} resources - VM resources
   * @returns {Object} Validation result
   */
  static validateVMResources(resources) {
    const { cpu, ram, storage, bandwidth } = resources;
    const errors = [];
    const warnings = [];

    // CPU validation
    if (!Number.isInteger(cpu) || cpu < 1 || cpu > 32) {
      errors.push('CPU cores must be between 1 and 32');
    }

    // RAM validation
    if (!Number.isInteger(ram) || ram < 512 || ram > 131072) {
      errors.push('RAM must be between 512MB and 128GB');
    }

    // Storage validation
    if (!Number.isInteger(storage) || storage < 10 || storage > 2048) {
      errors.push('Storage must be between 10GB and 2TB');
    }

    // Bandwidth validation
    if (bandwidth !== undefined) {
      if (!Number.isInteger(bandwidth) || bandwidth < 100 || bandwidth > 10000) {
        errors.push('Bandwidth must be between 100GB and 10TB');
      }
    }

    // Resource ratio validations
    if (cpu && ram) {
      const minRamPerCore = 512;
      if (ram < cpu * minRamPerCore) {
        errors.push(`RAM should be at least ${cpu * minRamPerCore}MB for ${cpu} CPU core(s)`);
      }

      // Performance warnings
      if (cpu > 4 && ram < 4096) {
        warnings.push('High CPU count with low RAM may impact performance');
      }
    }

    if (ram && storage) {
      const minStorageGB = Math.max(10, Math.ceil(ram / 1024) * 2);
      if (storage < minStorageGB) {
        warnings.push(`Consider at least ${minStorageGB}GB storage for ${ram}MB RAM`);
      }
    }

    // Calculate estimated cost (basic calculation)
    const estimatedHourlyCost = this.calculateVMCost(resources);

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      estimatedHourlyCost,
    };
  }

  /**
   * Calculate VM cost estimation
   * @param {Object} resources - VM resources
   * @returns {number} Estimated hourly cost in USD
   */
  static calculateVMCost(resources) {
    const { cpu, ram, storage, bandwidth = 1000 } = resources;
    
    // Basic pricing model (per hour)
    const cpuCost = cpu * 0.01; // $0.01 per CPU core per hour
    const ramCost = (ram / 1024) * 0.005; // $0.005 per GB RAM per hour
    const storageCost = storage * 0.0001; // $0.0001 per GB storage per hour
    const bandwidthCost = (bandwidth / 1000) * 0.001; // $0.001 per TB bandwidth per hour

    return Number((cpuCost + ramCost + storageCost + bandwidthCost).toFixed(4));
  }

  /**
   * Validate date range
   * @param {string|Date} startDate - Start date
   * @param {string|Date} endDate - End date
   * @param {Object} options - Validation options
   * @returns {Object} Validation result
   */
  static validateDateRange(startDate, endDate, options = {}) {
    const {
      maxDays = 365,
      allowFuture = false,
      allowPast = true,
    } = options;

    const errors = [];
    const start = new Date(startDate);
    const end = new Date(endDate);
    const now = new Date();

    // Check if dates are valid
    if (isNaN(start.getTime())) {
      errors.push('Invalid start date');
    }

    if (isNaN(end.getTime())) {
      errors.push('Invalid end date');
    }

    if (errors.length > 0) {
      return { isValid: false, errors };
    }

    // Check date order
    if (start > end) {
      errors.push('Start date must be before or equal to end date');
    }

    // Check future dates
    if (!allowFuture && end > now) {
      errors.push('End date cannot be in the future');
    }

    // Check past dates
    if (!allowPast && start < now) {
      errors.push('Start date cannot be in the past');
    }

    // Check date range
    const diffDays = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
    if (diffDays > maxDays) {
      errors.push(`Date range cannot exceed ${maxDays} days`);
    }

    return {
      isValid: errors.length === 0,
      errors,
      diffDays,
      start,
      end,
    };
  }

  /**
   * Validate file upload
   * @param {Object} file - File object
   * @param {Object} options - Validation options
   * @returns {Object} Validation result
   */
  static validateFileUpload(file, options = {}) {
    const {
      maxSize = 10 * 1024 * 1024, // 10MB default
      allowedTypes = ['image/jpeg', 'image/png', 'image/gif'],
      allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif'],
    } = options;

    const errors = [];

    if (!file) {
      return { isValid: false, errors: ['File is required'] };
    }

    // Check file size
    if (file.size > maxSize) {
      errors.push(`File size cannot exceed ${Math.round(maxSize / 1024 / 1024)}MB`);
    }

    // Check file type
    if (allowedTypes.length > 0 && !allowedTypes.includes(file.mimetype)) {
      errors.push(`File type not allowed. Allowed types: ${allowedTypes.join(', ')}`);
    }

    // Check file extension
    if (allowedExtensions.length > 0) {
      const fileExtension = file.originalname.toLowerCase().substring(file.originalname.lastIndexOf('.'));
      if (!allowedExtensions.includes(fileExtension)) {
        errors.push(`File extension not allowed. Allowed extensions: ${allowedExtensions.join(', ')}`);
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      fileInfo: {
        size: file.size,
        type: file.mimetype,
        extension: file.originalname.substring(file.originalname.lastIndexOf('.')),
      },
    };
  }

  /**
   * Sanitize string input
   * @param {string} input - Input string
   * @param {Object} options - Sanitization options
   * @returns {string} Sanitized string
   */
  static sanitizeString(input, options = {}) {
    if (typeof input !== 'string') {
      return input;
    }

    const {
      removeHtml = true,
      removeScripts = true,
      trim = true,
      maxLength = null,
    } = options;

    let sanitized = input;

    if (trim) {
      sanitized = sanitized.trim();
    }

    if (removeScripts) {
      sanitized = sanitized.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
      sanitized = sanitized.replace(/javascript:/gi, '');
      sanitized = sanitized.replace(/on\w+\s*=/gi, '');
    }

    if (removeHtml) {
      sanitized = sanitized.replace(/<[^>]*>/g, '');
    }

    if (maxLength && sanitized.length > maxLength) {
      sanitized = sanitized.substring(0, maxLength);
    }

    return sanitized;
  }

  /**
   * Validate pagination parameters
   * @param {Object} params - Pagination parameters
   * @returns {Object} Validated pagination parameters
   */
  static validatePagination(params = {}) {
    const { page = 1, limit = 10 } = params;

    const validatedPage = Math.max(1, parseInt(page) || 1);
    const validatedLimit = Math.min(100, Math.max(1, parseInt(limit) || 10));

    return {
      page: validatedPage,
      limit: validatedLimit,
      skip: (validatedPage - 1) * validatedLimit,
      take: validatedLimit,
    };
  }
}

module.exports = ValidationHelpers;