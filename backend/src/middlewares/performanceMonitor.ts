import type { NextFunction, Request, Response } from 'express';
import logger from '../utils/logger';

const monitoringService = require('../services/monitoringService');

export interface PerformanceMonitorRequest extends Request {
  correlationId?: string;
  user?: { id?: string };
}

const performanceMonitor = (req: PerformanceMonitorRequest, res: Response, next: NextFunction): void => {
  const startTime = Date.now();
  const originalSend = res.send.bind(res);

  res.send = ((data: unknown) => {
    const responseTime = Date.now() - startTime;
    const success = res.statusCode < 400;

    monitoringService.recordRequest(responseTime, success);

    const slowRequestThreshold = Number.parseInt(process.env.SLOW_REQUEST_THRESHOLD || '1000', 10);
    if (responseTime > slowRequestThreshold) {
      logger.warn('Slow Request Detected', {
        method: req.method,
        url: req.originalUrl,
        responseTime: `${responseTime}ms`,
        statusCode: res.statusCode,
      });
    }

    logger.logPerformance('request_duration', responseTime, {
      method: req.method,
      url: req.originalUrl,
      statusCode: res.statusCode,
    });

    return originalSend(data);
  }) as Response['send'];

  next();
};

export { performanceMonitor };

export default performanceMonitor;