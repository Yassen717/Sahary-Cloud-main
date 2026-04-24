type ErrorDetails = Record<string, unknown> | Array<Record<string, unknown>> | null;

export class AppError extends Error {
  statusCode: number;

  errorCode: string | null;

  details: ErrorDetails;

  isOperational: boolean;

  timestamp: string;

  constructor(message: string, statusCode: number, errorCode: string | null = null, details: ErrorDetails = null) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.details = details;
    this.isOperational = true;
    this.timestamp = new Date().toISOString();

    Error.captureStackTrace?.(this, this.constructor);
  }

  toJSON(): { error: Record<string, unknown> } {
    return {
      error: {
        name: this.name,
        message: this.message,
        statusCode: this.statusCode,
        errorCode: this.errorCode,
        details: this.details,
        timestamp: this.timestamp,
      },
    };
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details: ErrorDetails = null) {
    super(message, 400, 'VALIDATION_ERROR', details);
  }
}

export class AuthenticationError extends AppError {
  constructor(message = 'Authentication failed', details: ErrorDetails = null) {
    super(message, 401, 'AUTHENTICATION_ERROR', details);
  }
}

export class AuthorizationError extends AppError {
  constructor(message = 'Access denied', details: ErrorDetails = null) {
    super(message, 403, 'AUTHORIZATION_ERROR', details);
  }
}

export class NotFoundError extends AppError {
  constructor(resource = 'Resource', details: ErrorDetails = null) {
    super(`${resource} not found`, 404, 'NOT_FOUND_ERROR', details);
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Resource conflict', details: ErrorDetails = null) {
    super(message, 409, 'CONFLICT_ERROR', details);
  }
}

export class RateLimitError extends AppError {
  retryAfter: number | null;

  constructor(message = 'Too many requests', retryAfter: number | null = null) {
    super(message, 429, 'RATE_LIMIT_ERROR', { retryAfter });
    this.retryAfter = retryAfter;
  }
}

export class InternalServerError extends AppError {
  constructor(message = 'Internal server error', details: ErrorDetails = null) {
    super(message, 500, 'INTERNAL_SERVER_ERROR', details);
  }
}

export class ServiceUnavailableError extends AppError {
  constructor(service = 'Service', details: ErrorDetails = null) {
    super(`${service} is currently unavailable`, 503, 'SERVICE_UNAVAILABLE_ERROR', details);
  }
}

export class DatabaseError extends AppError {
  constructor(message = 'Database operation failed', details: ErrorDetails = null) {
    super(message, 500, 'DATABASE_ERROR', details);
  }
}

export class ExternalAPIError extends AppError {
  constructor(service: string, message = 'External API request failed', details: Record<string, unknown> = {}) {
    super(message, 502, 'EXTERNAL_API_ERROR', { service, ...details });
  }
}

export class PaymentError extends AppError {
  constructor(message = 'Payment processing failed', details: ErrorDetails = null) {
    super(message, 402, 'PAYMENT_ERROR', details);
  }
}

export class ResourceLimitError extends AppError {
  constructor(resource = 'Resource', limit: unknown, details: Record<string, unknown> = {}) {
    super(`${resource} limit exceeded`, 429, 'RESOURCE_LIMIT_ERROR', { limit, ...details });
  }
}

export class FileUploadError extends AppError {
  constructor(message = 'File upload failed', details: ErrorDetails = null) {
    super(message, 400, 'FILE_UPLOAD_ERROR', details);
  }
}

export class ConfigurationError extends AppError {
  constructor(message = 'Configuration error', details: ErrorDetails = null) {
    super(message, 500, 'CONFIGURATION_ERROR', details);
  }
}

export class TimeoutError extends AppError {
  constructor(operation = 'Operation', timeout: number, details: Record<string, unknown> = {}) {
    super(`${operation} timed out after ${timeout}ms`, 408, 'TIMEOUT_ERROR', { timeout, ...details });
  }
}

type PrismaErrorLike = {
  code?: string;
  message: string;
  meta?: {
    target?: string[];
    field_name?: string;
  };
};

type JwtErrorLike = {
  name?: string;
  message: string;
  expiredAt?: Date;
};

type JoiErrorLike = {
  details?: Array<{
    path: Array<string | number>;
    message: string;
    type: string;
  }>;
  message: string;
};

type ZodErrorLike = {
  errors: Array<{
    path: Array<string | number>;
    message: string;
    code: string;
  }>;
};

export class ErrorFactory {
  static fromPrismaError(error: PrismaErrorLike): AppError {
    if (error.code === 'P2002') {
      const field = error.meta?.target?.[0] || 'field';
      return new ConflictError(`${field} already exists`, {
        field,
        code: error.code,
      });
    }

    if (error.code === 'P2025') {
      return new NotFoundError('Record', { code: error.code });
    }

    if (error.code === 'P2003') {
      return new ValidationError('Invalid reference', {
        code: error.code,
        field: error.meta?.field_name,
      });
    }

    return new DatabaseError(error.message, { code: error.code });
  }

  static fromJWTError(error: JwtErrorLike): AppError {
    if (error.name === 'TokenExpiredError') {
      return new AuthenticationError('Token has expired', {
        expiredAt: error.expiredAt,
      });
    }

    if (error.name === 'JsonWebTokenError') {
      return new AuthenticationError('Invalid token', {
        message: error.message,
      });
    }

    return new AuthenticationError('Token verification failed');
  }

  static fromValidationError(error: JoiErrorLike): ValidationError {
    if (error.details) {
      const details = error.details.map((detail) => ({
        field: detail.path.join('.'),
        message: detail.message,
        type: detail.type,
      }));

      return new ValidationError('Validation failed', { errors: details });
    }

    return new ValidationError(error.message);
  }

  static fromZodError(error: ZodErrorLike): ValidationError {
    const details = error.errors.map((err) => ({
      field: err.path.join('.'),
      message: err.message,
      code: err.code,
    }));

    return new ValidationError('Validation failed', { errors: details });
  }
}

export default {
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
  ErrorFactory,
};