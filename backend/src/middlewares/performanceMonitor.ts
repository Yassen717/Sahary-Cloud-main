import type { NextFunction, Request, Response } from 'express';
import logger from '../utils/logger';

const monitoringService = require('../services/monitoringService');

export interface PerformanceMonitorRequest extends Request {
  correlationId?: string;
  user?: { id?: string };
}

const performanceMonitor = (req: PerformanceMonitorRequest, res: Response, next: NextFunction): void => {
  const startTime = Date.now();

  // 'finish' covers every response path (send, sendFile, streams), unlike a
  // res.send wrapper which misses non-send responses entirely.
  res.on('finish', () => {
    try {
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
    } catch (error) {
      // Monitoring must never break the response path.
      logger.error('Performance monitoring error', error);
    }
  });

  next();
};

export { performanceMonitor };

export default performanceMonitor;
