import { randomUUID } from 'crypto';
import type { NextFunction, Request, Response } from 'express';

export interface CorrelationRequest extends Request {
  correlationId?: string;
}

const getHeaderValue = (value: string | string[] | undefined): string | undefined => {
  if (typeof value === 'string') {
    return value;
  }

  if (Array.isArray(value) && value.length > 0) {
    return value[0];
  }

  return undefined;
};

// Client-supplied IDs are echoed into a response header and log lines, so
// they must be restricted to a safe shape — anything else (invalid header
// chars, forged log lines) falls back to a generated UUID.
const CORRELATION_ID_PATTERN = /^[\w-]{1,128}$/;

const sanitizeCorrelationId = (value: string | undefined): string | undefined => (value && CORRELATION_ID_PATTERN.test(value) ? value : undefined);

const correlationId = (req: CorrelationRequest, res: Response, next: NextFunction): void => {
  const id = sanitizeCorrelationId(getHeaderValue(req.headers['x-correlation-id']))
    || sanitizeCorrelationId(getHeaderValue(req.headers['x-request-id']))
    || randomUUID();

  req.correlationId = id;
  res.setHeader('X-Correlation-Id', id);

  next();
};

export { correlationId };

export default { correlationId };
