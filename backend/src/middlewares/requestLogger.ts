import type { NextFunction, Request, Response } from 'express';
import logger from '../utils/logger';

export interface RequestLoggerUser {
  id?: string;
}

export interface RequestLoggerRequest extends Request {
  correlationId?: string;
  user?: RequestLoggerUser;
}

const requestLogger = (req: RequestLoggerRequest, res: Response, next: NextFunction): void => {
  const startTime = Date.now();

  logger.http(`→ ${req.method} ${req.originalUrl}`, {
    correlationId: req.correlationId,
    method: req.method,
    url: req.originalUrl,
    ip: req.ip,
    userAgent: req.get('user-agent'),
    userId: req.user?.id,
  });

  const originalSend = res.send.bind(res);
  res.send = ((data: unknown) => {
    const responseTime = Date.now() - startTime;

    logger.logRequest(req, res, responseTime);

    return originalSend(data);
  }) as Response['send'];

  next();
};

const errorRequestLogger = (err: Error, req: RequestLoggerRequest, res: Response, next: NextFunction): void => {
  logger.error('Request Error', {
    correlationId: req.correlationId,
    error: err.message,
    stack: err.stack,
    method: req.method,
    url: req.originalUrl,
    ip: req.ip,
    userId: req.user?.id,
    body: req.body,
    query: req.query,
    params: req.params,
  });

  next(err);
};

export { requestLogger, errorRequestLogger };

export default { requestLogger, errorRequestLogger };
