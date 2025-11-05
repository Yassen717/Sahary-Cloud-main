const { AppError, ErrorFactory } = require('../utils/errors');
const logger = require('../utils/logger');

/**
 * Error Handler Middleware
 * Centralized error handling for the application
 */

/**
 * Handle Prisma errors
 * @param {Error} err - Prisma error
 * @returns {AppError} Formatted error
 */
const handlePrismaError = (err) => {
  return ErrorFactory.fromPrismaError(err);
};

/**
 * Handle JWT errors
 * @param {Error} err - JWT error
 * @returns {AppError} Formatted error
 */
const handleJWTError = (err) => {
  return ErrorFactory.fromJWTError(err);
};

/**
 * Handle Zod validation errors
 * @param {Error} err - Zod error
 * @returns {AppError} Formatted error
 */
const handleZodError = (err) => {
  return ErrorFactory.fromZodError(err);
};

/**
 * Handle Joi validation errors
 * @param {Error} err - Joi error
 * @returns {AppError} Formatted error
 */
const handleJoiError = (err) => {
  return ErrorFactory.fromValidationError(err);
};

/**
 * Send error response in development
 * @param {Error} err - Error object
 * @param {Object} res - Express response object
 */
const sendErrorDev = (err, res) => {
  const statusCode = err.statusCode || 500;

  res.status(statusCode).json({
    success: false,
    error: {
      message: err.message,
      statusCode,
      errorCode: err.errorCode,
      details: err.details,
      stack: err.stack,
      timestamp: err.timestamp || new Date().toISOString()
    }
  });
};

/**
 * Send error response in production
 * @param {Error} err - Error object
 * @param {Object} res - Express response object
 */
const sendErrorProd = (err, res) => {
  const statusCode = err.statusCode || 500;

  // Operational, trusted error: send message to client
  if (err.isOperational) {
    res.status(statusCode).json({
      success: false,
      error: {
        message: err.message,
        errorCode: err.errorCode,
        details: err.details,
        timestamp: err.timestamp || new Date().toISOString()
      }
    });
  } else {
    // Programming or unknown error: don't leak error details
    logger.error('ERROR 💥', err);

    res.status(500).json({
      success: false,
      error: {
        message: 'Something went wrong',
        errorCode: 'INTERNAL_SERVER_ERROR',
        timestamp: new Date().toISOString()
      }
    });
  }
};

/**
 * Global error handler middleware
 */
const errorHandler = (err, req, res, next) => {
  let error = err;

  // Log error
  logger.error({
    message: err.message,
    stack: err.stack,
    url: req.originalUrl,
    method: req.method,
    ip: req.ip,
    userId: req.user?.id
  });

  // Convert known errors to AppError
  if (err.name === 'PrismaClientKnownRequestError' || err.name === 'PrismaClientValidationError') {
    error = handlePrismaError(err);
  } else if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    error = handleJWTError(err);
  } else if (err.name === 'ZodError') {
    error = handleZodError(err);
  } else if (err.name === 'ValidationError' && err.isJoi) {
    error = handleJoiError(err);
  } else if (err.code === 11000) {
    // MongoDB duplicate key error (if using MongoDB)
    const field = Object.keys(err.keyValue)[0];
    error = new AppError(`Duplicate ${field}`, 409, 'DUPLICATE_ERROR', { field });
  } else if (err.name === 'CastError') {
    error = new AppError('Invalid ID format', 400, 'INVALID_ID');
  } else if (err.name === 'MulterError') {
    error = new AppError(err.message, 400, 'FILE_UPLOAD_ERROR');
  } else if (!(err instanceof AppError)) {
    // Unknown error - wrap it
    error = new AppError(
      err.message || 'Internal server error',
      err.statusCode || 500,
      'UNKNOWN_ERROR'
    );
    error.isOperational = false;
  }

  // Send response
  if (process.env.NODE_ENV === 'development') {
    sendErrorDev(error, res);
  } else {
    sendErrorProd(error, res);
  }
};

/**
 * Handle 404 errors
 */
const notFoundHandler = (req, res, next) => {
  const error = new AppError(
    `Route ${req.originalUrl} not found`,
    404,
    'ROUTE_NOT_FOUND',
    {
      method: req.method,
      url: req.originalUrl
    }
  );

  next(error);
};

/**
 * Async error wrapper
 * Wraps async route handlers to catch errors
 */
const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

/**
 * Handle unhandled promise rejections
 */
const handleUnhandledRejection = () => {
  process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
    // Application specific logging, throwing an error, or other logic here
  });
};

/**
 * Handle uncaught exceptions
 */
const handleUncaughtException = () => {
  process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception:', error);
    // Perform cleanup and exit
    process.exit(1);
  });
};

module.exports = {
  errorHandler,
  notFoundHandler,
  asyncHandler,
  handleUnhandledRejection,
  handleUncaughtException
};
