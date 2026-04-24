import type { ErrorRequestHandler, NextFunction, Request, Response } from 'express';
import logger from '../utils/logger';
import { AppError, ErrorFactory } from '../utils/errors';

type ErrorLike = Error & {
  statusCode?: number;
  errorCode?: string | null;
  details?: unknown;
  isOperational?: boolean;
  timestamp?: string;
  code?: string | number;
  keyValue?: Record<string, unknown>;
  isJoi?: boolean;
};

type PrismaKnownErrorLike = ErrorLike & {
  name: 'PrismaClientKnownRequestError' | 'PrismaClientValidationError';
};

type JwtErrorLike = ErrorLike & {
  name: 'JsonWebTokenError' | 'TokenExpiredError';
};

type ZodErrorLike = ErrorLike & {
  name: 'ZodError';
};

type JoiErrorLike = ErrorLike & {
  name: 'ValidationError';
  isJoi: true;
};

type ErrorResponse = {
  success: false;
  error: {
    message: string;
    statusCode: number;
    errorCode?: string | null;
    details?: unknown;
    stack?: string;
    timestamp: string;
  };
};

const handlePrismaError = (err: PrismaKnownErrorLike): AppError => ErrorFactory.fromPrismaError(err as never);

const handleJWTError = (err: JwtErrorLike): AppError => ErrorFactory.fromJWTError(err);

const handleZodError = (err: ZodErrorLike): AppError => ErrorFactory.fromZodError(err as never);

const handleJoiError = (err: JoiErrorLike): AppError => ErrorFactory.fromValidationError(err as never);

const sendErrorDev = (err: AppError, res: Response): void => {
  const statusCode = err.statusCode || 500;

  res.status(statusCode).json({
    success: false,
    error: {
      message: err.message,
      statusCode,
      errorCode: err.errorCode,
      details: err.details,
      stack: err.stack,
      timestamp: err.timestamp || new Date().toISOString(),
    },
  } as ErrorResponse);
};

const sendErrorProd = (err: AppError, res: Response): void => {
  const statusCode = err.statusCode || 500;

  if (err.isOperational) {
    res.status(statusCode).json({
      success: false,
      error: {
        message: err.message,
        errorCode: err.errorCode,
        details: err.details,
        timestamp: err.timestamp || new Date().toISOString(),
      },
    } as ErrorResponse);
    return;
  }

  logger.error('ERROR 💥', err);

  res.status(500).json({
    success: false,
    error: {
      message: 'Something went wrong',
      errorCode: 'INTERNAL_SERVER_ERROR',
      timestamp: new Date().toISOString(),
    },
  } as ErrorResponse);
};

const errorHandler: ErrorRequestHandler = (err: ErrorLike, req: Request, res: Response, _next: NextFunction) => {
  let error: AppError = err instanceof AppError
    ? err
    : new AppError(err.message || 'Internal server error', err.statusCode || 500, 'UNKNOWN_ERROR');

  logger.error({
    message: err.message,
    stack: err.stack,
    url: req.originalUrl,
    method: req.method,
    ip: req.ip,
    userId: (req as Request & { user?: { id?: string } }).user?.id,
  });

  if (err.name === 'PrismaClientKnownRequestError' || err.name === 'PrismaClientValidationError') {
    error = handlePrismaError(err as PrismaKnownErrorLike);
  } else if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    error = handleJWTError(err as JwtErrorLike);
  } else if (err.name === 'ZodError') {
    error = handleZodError(err as ZodErrorLike);
  } else if (err.name === 'ValidationError' && err.isJoi) {
    error = handleJoiError(err as JoiErrorLike);
  } else if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] || 'field';
    error = new AppError(`Duplicate ${field}`, 409, 'DUPLICATE_ERROR', { field });
  } else if (err.name === 'CastError') {
    error = new AppError('Invalid ID format', 400, 'INVALID_ID');
  } else if (err.name === 'MulterError') {
    error = new AppError(err.message, 400, 'FILE_UPLOAD_ERROR');
  } else if (!(err instanceof AppError)) {
    error = new AppError(err.message || 'Internal server error', err.statusCode || 500, 'UNKNOWN_ERROR');
    error.isOperational = false;
  }

  if (process.env.NODE_ENV === 'development') {
    sendErrorDev(error, res);
  } else {
    sendErrorProd(error, res);
  }
};

const notFoundHandler = (req: Request, _res: Response, next: NextFunction): void => {
  const error = new AppError(
    `Route ${req.originalUrl} not found`,
    404,
    'ROUTE_NOT_FOUND',
    {
      method: req.method,
      url: req.originalUrl,
    },
  );

  next(error);
};

const asyncHandler = <T extends (req: Request, res: Response, next: NextFunction) => Promise<unknown> | unknown>(fn: T) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

const handleUnhandledRejection = (): void => {
  process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  });
};

const handleUncaughtException = (): void => {
  process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception:', error);
    process.exit(1);
  });
};

export {
  errorHandler,
  notFoundHandler,
  asyncHandler,
  handleUnhandledRejection,
  handleUncaughtException,
};

export default {
  errorHandler,
  notFoundHandler,
  asyncHandler,
  handleUnhandledRejection,
  handleUncaughtException,
};