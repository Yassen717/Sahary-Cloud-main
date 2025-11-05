const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const path = require('path');

/**
 * Logger Configuration
 * Uses Winston for structured logging
 */

// Define log levels
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

// Define log colors
const colors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'blue',
};

winston.addColors(colors);

// Determine log level based on environment
const level = () => {
  const env = process.env.NODE_ENV || 'development';
  const isDevelopment = env === 'development';
  return isDevelopment ? 'debug' : process.env.LOG_LEVEL || 'info';
};

// Define log format
const format = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json()
);

// Console format for development
const consoleFormat = winston.format.combine(
  winston.format.colorize({ all: true }),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.printf(
    (info) => `${info.timestamp} ${info.level}: ${info.message}${info.stack ? '\n' + info.stack : ''}`
  )
);

// Define transports
const transports = [];

// Console transport
if (process.env.NODE_ENV !== 'production') {
  transports.push(
    new winston.transports.Console({
      format: consoleFormat,
    })
  );
}

// File transport for errors
const errorFileTransport = new DailyRotateFile({
  filename: path.join(process.env.LOG_FILE_PATH || './logs', 'error-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  level: 'error',
  maxSize: '20m',
  maxFiles: '14d',
  format,
});

// File transport for all logs
const combinedFileTransport = new DailyRotateFile({
  filename: path.join(process.env.LOG_FILE_PATH || './logs', 'combined-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  maxSize: '20m',
  maxFiles: '14d',
  format,
});

// File transport for HTTP logs
const httpFileTransport = new DailyRotateFile({
  filename: path.join(process.env.LOG_FILE_PATH || './logs', 'http-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  level: 'http',
  maxSize: '20m',
  maxFiles: '7d',
  format,
});

transports.push(errorFileTransport, combinedFileTransport, httpFileTransport);

// Create logger instance
const logger = winston.createLogger({
  level: level(),
  levels,
  format,
  transports,
  exitOnError: false,
});

// Create a stream object for Morgan
logger.stream = {
  write: (message) => {
    logger.http(message.trim());
  },
};

/**
 * Log HTTP request
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {number} responseTime - Response time in ms
 */
logger.logRequest = (req, res, responseTime) => {
  const logData = {
    method: req.method,
    url: req.originalUrl,
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
};

/**
 * Log database query
 * @param {string} query - Query string
 * @param {number} duration - Query duration in ms
 */
logger.logQuery = (query, duration) => {
  logger.debug('Database Query', {
    query,
    duration: `${duration}ms`,
  });
};

/**
 * Log authentication event
 * @param {string} event - Event type
 * @param {Object} data - Event data
 */
logger.logAuth = (event, data) => {
  logger.info(`Auth: ${event}`, data);
};

/**
 * Log security event
 * @param {string} event - Event type
 * @param {Object} data - Event data
 */
logger.logSecurity = (event, data) => {
  logger.warn(`Security: ${event}`, data);
};

/**
 * Log business event
 * @param {string} event - Event type
 * @param {Object} data - Event data
 */
logger.logBusiness = (event, data) => {
  logger.info(`Business: ${event}`, data);
};

/**
 * Log performance metric
 * @param {string} metric - Metric name
 * @param {number} value - Metric value
 * @param {Object} metadata - Additional metadata
 */
logger.logPerformance = (metric, value, metadata = {}) => {
  logger.info('Performance Metric', {
    metric,
    value,
    ...metadata,
  });
};

/**
 * Log cache event
 * @param {string} event - Event type
 * @param {Object} data - Event data
 */
logger.logCache = (event, data) => {
  logger.debug(`Cache: ${event}`, data);
};

/**
 * Log job execution
 * @param {string} jobName - Job name
 * @param {string} status - Job status
 * @param {Object} data - Job data
 */
logger.logJob = (jobName, status, data = {}) => {
  logger.info(`Job: ${jobName}`, {
    status,
    ...data,
  });
};

module.exports = logger;
