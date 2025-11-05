const logger = require('../utils/logger');

/**
 * Request Logger Middleware
 * Logs HTTP requests with timing information
 */

const requestLogger = (req, res, next) => {
  const startTime = Date.now();

  // Log request start
  logger.http(`→ ${req.method} ${req.originalUrl}`, {
    method: req.method,
    url: req.originalUrl,
    ip: req.ip,
    userAgent: req.get('user-agent'),
    userId: req.user?.id,
  });

  // Capture response
  const originalSend = res.send;
  res.send = function (data) {
    const responseTime = Date.now() - startTime;
    
    // Log response
    logger.logRequest(req, res, responseTime);

    // Call original send
    originalSend.call(this, data);
  };

  next();
};

/**
 * Error request logger
 * Logs failed requests with error details
 */
const errorRequestLogger = (err, req, res, next) => {
  logger.error('Request Error', {
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

module.exports = {
  requestLogger,
  errorRequestLogger,
};
