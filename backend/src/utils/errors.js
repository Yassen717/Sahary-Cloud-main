/**
 * Custom Error Classes
 * Provides structured error handling across the application
 */

/**
 * Base Application Error
 */
class AppError extends Error {
  constructor(message, statusCode, errorCode = null, details = null) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.details = details;
    this.isOperational = true;
    this.timestamp = new Date().toISOString();

    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      error: {
        name: this.name,
        message: this.message,
        statusCode: this.statusCode,
        errorCode: this.errorCode,
        details: this.details,
        timestamp: this.timestamp
      }
    };
  }
}

/**
 * Validation Error (400)
 */
class ValidationError extends AppError {
  constructor(message, details = null) {
    super(message, 400, 'VALIDATION_ERROR', details);
  }
}

/**
 * Authentication Error (401)
 */
class AuthenticationError extends AppError {
  constructor(message = 'Authentication failed', details = null) {
    super(message, 401, 'AUTHENTICATION_ERROR', details);
  }
}

/**
 * Authorization Error (403)
 */
class AuthorizationError extends AppError {
  constructor(message = 'Access denied', details = null) {
    super(message, 403, 'AUTHORIZATION_ERROR', details);
  }
}

/**
 * Not Found Error (404)
 */
class NotFoundError extends AppError {
  constructor(resource = 'Resource', details = null) {
    super(`${resource} not found`, 404, 'NOT_FOUND_ERROR', details);
  }
}

/**
 * Conflict Error (409)
 */
class ConflictError extends AppError {
  constructor(message = 'Resource conflict', details = null) {
    super(message, 409, 'CONFLICT_ERROR', details);
  }
}

/**
 * Rate Limit Error (429)
 */
class RateLimitError extends AppError {
  constructor(message = 'Too many requests', retryAfter = null) {
    super(message, 429, 'RATE_LIMIT_ERROR', { retryAfter });
    this.retryAfter = retryAfter;
  }
}

/**
 * Internal Server Error (500)
 */
class InternalServerError extends AppError {
  constructor(message = 'Internal server error', details = null) {
    super(message, 500, 'INTERNAL_SERVER_ERROR', details);
  }
}

/**
 * Service Unavailable Error (503)
 */
class ServiceUnavailableError extends AppError {
  constructor(service = 'Service', details = null) {
    super(`${service} is currently unavailable`, 503, 'SERVICE_UNAVAILABLE_ERROR', details);
  }
}

/**
 * Database Error
 */
class DatabaseError extends AppError {
  constructor(message = 'Database operation failed', details = null) {
    super(message, 500, 'DATABASE_ERROR', details);
  }
}

/**
 * External API Error
 */
class ExternalAPIError extends AppError {
  constructor(service, message = 'External API request failed', details = null) {
    super(message, 502, 'EXTERNAL_API_ERROR', { service, ...details });
  }
}

/**
 * Payment Error
 */
class PaymentError extends AppError {
  constructor(message = 'Payment processing failed', details = null) {
    super(message, 402, 'PAYMENT_ERROR', details);
  }
}

/**
 * Resource Limit Error
 */
class ResourceLimitError extends AppError {
  constructor(resource = 'Resource', limit, details = null) {
    super(`${resource} limit exceeded`, 429, 'RESOURCE_LIMIT_ERROR', { limit, ...details });
  }
}

/**
 * File Upload Error
 */
class FileUploadError extends AppError {
  constructor(message = 'File upload failed', details = null) {
    super(message, 400, 'FILE_UPLOAD_ERROR', details);
  }
}

/**
 * Configuration Error
 */
class ConfigurationError extends AppError {
  constructor(message = 'Configuration error', details = null) {
    super(message, 500, 'CONFIGURATION_ERROR', details);
  }
}

/**
 * Timeout Error
 */
class TimeoutError extends AppError {
  constructor(operation = 'Operation', timeout, details = null) {
    super(`${operation} timed out after ${timeout}ms`, 408, 'TIMEOUT_ERROR', { timeout, ...details });
  }
}

/**
 * Error Factory
 * Creates appropriate error instances based on error type
 */
class ErrorFactory {
  /**
   * Create error from Prisma error
   * @param {Error} error - Prisma error
   * @returns {AppError} Appropriate error instance
   */
  static fromPrismaError(error) {
    // Unique constraint violation
    if (error.code === 'P2002') {
      const field = error.meta?.target?.[0] || 'field';
      return new ConflictError(`${field} already exists`, {
        field,
        code: error.code
      });
    }

    // Record not found
    if (error.code === 'P2025') {
      return new NotFoundError('Record', { code: error.code });
    }

    // Foreign key constraint failed
    if (error.code === 'P2003') {
      return new ValidationError('Invalid reference', {
        code: error.code,
        field: error.meta?.field_name
      });
    }

    // Default database error
    return new DatabaseError(error.message, { code: error.code });
  }

  /**
   * Create error from JWT error
   * @param {Error} error - JWT error
   * @returns {AppError} Appropriate error instance
   */
  static fromJWTError(error) {
    if (error.name === 'TokenExpiredError') {
      return new AuthenticationError('Token has expired', {
        expiredAt: error.expiredAt
      });
    }

    if (error.name === 'JsonWebTokenError') {
      return new AuthenticationError('Invalid token', {
        message: error.message
      });
    }

    return new AuthenticationError('Token verification failed');
  }

  /**
   * Create error from validation error
   * @param {Object} error - Validation error
   * @returns {ValidationError} Validation error instance
   */
  static fromValidationError(error) {
    if (error.details) {
      const details = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message,
        type: detail.type
      }));

      return new ValidationError('Validation failed', { errors: details });
    }

    return new ValidationError(error.message);
  }

  /**
   * Create error from Zod error
   * @param {Object} error - Zod error
   * @returns {ValidationError} Validation error instance
   */
  static fromZodError(error) {
    const details = error.errors.map(err => ({
      field: err.path.join('.'),
      message: err.message,
      code: err.code
    }));

    return new ValidationError('Validation failed', { errors: details });
  }
}

module.exports = {
  AppError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  RateLimitError,
  InternalServerError,
  ServiceUnavailableError,
  DatabaseError,
  ExternalAPIError,
  PaymentError,
  ResourceLimitError,
  FileUploadError,
  ConfigurationError,
  TimeoutError,
  ErrorFactory
};
