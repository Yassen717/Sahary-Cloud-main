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

const correlationId = (req: CorrelationRequest, res: Response, next: NextFunction): void => {
  const id =
    getHeaderValue(req.headers['x-correlation-id']) ||
    getHeaderValue(req.headers['x-request-id']) ||
    randomUUID();

  req.correlationId = id;
  res.setHeader('X-Correlation-Id', id);

  next();
};

export { correlationId };

export default { correlationId };