const monitoringService = require('../services/monitoringService');
const logger = require('../utils/logger');

/**
 * Performance Monitoring Middleware
 * Tracks request performance and records metrics
 */

const performanceMonitor = (req, res, next) => {
  const startTime = Date.now();

  // Capture response
  const originalSend = res.send;
  res.send = function (data) {
    const responseTime = Date.now() - startTime;
    const success = res.statusCode < 400;

    // Record metrics
    monitoringService.recordRequest(responseTime, success);

    // Log slow requests
    const slowRequestThreshold = parseInt(process.env.SLOW_REQUEST_THRESHOLD) || 1000;
    if (responseTime > slowRequestThreshold) {
      logger.warn('Slow Request Detected', {
        method: req.method,
        url: req.originalUrl,
        responseTime: `${responseTime}ms`,
        statusCode: res.statusCode,
      });
    }

    // Log performance metric
    logger.logPerformance('request_duration', responseTime, {
      method: req.method,
      url: req.originalUrl,
      statusCode: res.statusCode,
    });

    // Call original send
    originalSend.call(this, data);
  };

  next();
};

module.exports = performanceMonitor;
