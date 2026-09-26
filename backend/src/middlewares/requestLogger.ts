import type { NextFunction, Request, Response } from 'express';
import logger from '../utils/logger';

export interface RequestLoggerUser {
  id?: string;
}

export interface RequestLoggerRequest extends Request {
  correlationId?: string;
  user?: RequestLoggerUser;
}

// Fields redacted before bodies/queries are logged — tokens, passwords and
// secrets must never reach plaintext log files.
const REDACTED_FIELD_PATTERN = /password|token|secret|authorization|api[-_]?key|credential/i;

const redactSensitiveFields = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map((item) => redactSensitiveFields(item));
  }

  if (value && typeof value === 'object') {
    const redacted: Record<string, unknown> = {};
    for (const [key, nestedValue] of Object.entries(value)) {
      redacted[key] = REDACTED_FIELD_PATTERN.test(key) ? '[REDACTED]' : redactSensitiveFields(nestedValue);
    }
    return redacted;
  }

  return value;
};

const requestLogger = (req: RequestLoggerRequest, res: Response, next: NextFunction): void => {
  const startTime = Date.now();
  // Log the path only — the querystring can carry auth tokens (`?token=`)
  // that must not land in log files.
  const path = req.originalUrl.split('?')[0];

  logger.http(`→ ${req.method} ${path}`, {
    correlationId: req.correlationId,
    method: req.method,
    url: path,
    ip: req.ip,
    userAgent: req.get('user-agent'),
    userId: req.user?.id,
  });

  const originalSend = res.send.bind(res);
  res.send = ((data: unknown) => {
    const responseTime = Date.now() - startTime;

    // Mirror logger.logRequest but with the querystring stripped (its impl
    // logs req.originalUrl verbatim, including sensitive query params).
    const logData = {
      method: req.method,
      url: path,
      statusCode: res.statusCode,
      responseTime: `${responseTime}ms`,
      ip: req.ip,
      userAgent: req.get('user-agent'),
      userId: req.user?.id,
    };

    if (res.statusCode >= 400) {
      logger.error('HTTP Request Error', logData);
    } else {
      logger.http('HTTP Request', logData);
    }

    return originalSend(data);
  }) as Response['send'];

  next();
};

// NOTE: exported for optional use but intentionally not mounted in
// src/index.ts — mount before errorHandler if per-request error context is
// needed. Bodies/queries are redacted before logging.
const errorRequestLogger = (err: Error, req: RequestLoggerRequest, res: Response, next: NextFunction): void => {
  logger.error('Request Error', {
    correlationId: req.correlationId,
    error: err.message,
    stack: err.stack,
    method: req.method,
    url: req.originalUrl.split('?')[0],
    ip: req.ip,
    userId: req.user?.id,
    body: redactSensitiveFields(req.body),
    query: redactSensitiveFields(req.query),
    params: req.params,
  });

  next(err);
};

export { requestLogger, errorRequestLogger };

export default { requestLogger, errorRequestLogger };
