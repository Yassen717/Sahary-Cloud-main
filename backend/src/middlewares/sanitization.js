const validator = require('validator');
const { ValidationError } = require('../utils/errors');

/**
 * Input Sanitization Middleware
 * Sanitizes and validates user input to prevent injection attacks
 */

/**
 * Sanitize string input
 * @param {string} input - Input string
 * @returns {string} Sanitized string
 */
const sanitizeString = (input) => {
  if (typeof input !== 'string') return input;
  
  // Remove any HTML tags
  let sanitized = validator.stripLow(input);
  sanitized = validator.escape(sanitized);
  
  return sanitized.trim();
};

/**
 * Sanitize object recursively
 * @param {Object} obj - Object to sanitize
 * @returns {Object} Sanitized object
 */
const sanitizeObject = (obj) => {
  if (obj === null || obj === undefined) return obj;
  
  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item));
  }
  
  if (typeof obj === 'object') {
    const sanitized = {};
    for (const [key, value] of Object.entries(obj)) {
      sanitized[key] = sanitizeObject(value);
    }
    return sanitized;
  }
  
  if (typeof obj === 'string') {
    return sanitizeString(obj);
  }
  
  return obj;
};

/**
 * Sanitize request body
 */
const sanitizeBody = (req, res, next) => {
  if (req.body && typeof req.body === 'object') {
    req.body = sanitizeObject(req.body);
  }
  next();
};

/**
 * Sanitize query parameters
 */
const sanitizeQuery = (req, res, next) => {
  if (req.query && typeof req.query === 'object') {
    req.query = sanitizeObject(req.query);
  }
  next();
};

/**
 * Sanitize URL parameters
 */
const sanitizeParams = (req, res, next) => {
  if (req.params && typeof req.params === 'object') {
    req.params = sanitizeObject(req.params);
  }
  next();
};

/**
 * Sanitize all inputs
 */
const sanitizeAll = (req, res, next) => {
  sanitizeBody(req, res, () => {
    sanitizeQuery(req, res, () => {
      sanitizeParams(req, res, next);
    });
  });
};

/**
 * Validate email
 */
const validateEmail = (email) => {
  if (!validator.isEmail(email)) {
    throw new ValidationError('Invalid email format');
  }
  return validator.normalizeEmail(email);
};

/**
 * Validate URL
 */
const validateURL = (url) => {
  if (!validator.isURL(url, { require_protocol: true })) {
    throw new ValidationError('Invalid URL format');
  }
  return url;
};

/**
 * Validate UUID
 */
const validateUUID = (uuid) => {
  if (!validator.isUUID(uuid)) {
    throw new ValidationError('Invalid UUID format');
  }
  return uuid;
};

/**
 * Check for SQL injection patterns
 */
const checkSQLInjection = (req, res, next) => {
  const sqlPatterns = [
    /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|EXECUTE)\b)/gi,
    /(UNION.*SELECT)/gi,
    /(;|\-\-|\/\*|\*\/)/g,
  ];

  const checkValue = (value) => {
    if (typeof value === 'string') {
      for (const pattern of sqlPatterns) {
        if (pattern.test(value)) {
          throw new ValidationError('Potential SQL injection detected', {
            field: 'input',
            pattern: pattern.toString(),
          });
        }
      }
    }
  };

  const checkObject = (obj) => {
    if (obj && typeof obj === 'object') {
      for (const value of Object.values(obj)) {
        if (Array.isArray(value)) {
          value.forEach(checkValue);
        } else if (typeof value === 'object') {
          checkObject(value);
        } else {
          checkValue(value);
        }
      }
    }
  };

  try {
    checkObject(req.body);
    checkObject(req.query);
    checkObject(req.params);
    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Check for XSS patterns
 */
const checkXSS = (req, res, next) => {
  const xssPatterns = [
    /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
    /javascript:/gi,
    /on\w+\s*=/gi,
  ];

  const checkValue = (value) => {
    if (typeof value === 'string') {
      for (const pattern of xssPatterns) {
        if (pattern.test(value)) {
          throw new ValidationError('Potential XSS attack detected', {
            field: 'input',
            pattern: pattern.toString(),
          });
        }
      }
    }
  };

  const checkObject = (obj) => {
    if (obj && typeof obj === 'object') {
      for (const value of Object.values(obj)) {
        if (Array.isArray(value)) {
          value.forEach(checkValue);
        } else if (typeof value === 'object') {
          checkObject(value);
        } else {
          checkValue(value);
        }
      }
    }
  };

  try {
    checkObject(req.body);
    checkObject(req.query);
    checkObject(req.params);
    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Prevent NoSQL injection
 */
const preventNoSQLInjection = (req, res, next) => {
  const checkValue = (value) => {
    if (value && typeof value === 'object') {
      const keys = Object.keys(value);
      for (const key of keys) {
        if (key.startsWith('$')) {
          throw new ValidationError('Potential NoSQL injection detected', {
            field: key,
          });
        }
      }
    }
  };

  const checkObject = (obj) => {
    if (obj && typeof obj === 'object') {
      checkValue(obj);
      for (const value of Object.values(obj)) {
        if (typeof value === 'object') {
          checkObject(value);
        }
      }
    }
  };

  try {
    checkObject(req.body);
    checkObject(req.query);
    next();
  } catch (error) {
    next(error);
  }
};

module.exports = {
  sanitizeString,
  sanitizeObject,
  sanitizeBody,
  sanitizeQuery,
  sanitizeParams,
  sanitizeAll,
  validateEmail,
  validateURL,
  validateUUID,
  checkSQLInjection,
  checkXSS,
  preventNoSQLInjection,
};
