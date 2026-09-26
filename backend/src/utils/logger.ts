import path from 'path';
import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import type { SaharyLogger } from '../types/logger';

const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

const colors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'blue',
};

winston.addColors(colors);

const level = () => {
  const env = process.env.NODE_ENV || 'development';
  // LOG_LEVEL is honored everywhere; dev only defaults to debug when unset.
  return process.env.LOG_LEVEL || (env === 'development' ? 'debug' : 'info');
};

const SENSITIVE_FIELD_PATTERN = /password|token|authorization|secret|refreshtoken|jwt/i;

// Masks credential-ish fields in logged metadata (recursively) so secrets
// can't leak into log files/stdout via logger.*(..., meta) calls.
const redactSensitive = winston.format((info) => {
  const mask = (obj: Record<string, unknown>) => {
    for (const key of Object.keys(obj)) {
      const value = obj[key];
      if (SENSITIVE_FIELD_PATTERN.test(key)) {
        obj[key] = '[REDACTED]';
      } else if (value && typeof value === 'object' && !Array.isArray(value)) {
        mask(value as Record<string, unknown>);
      }
    }
  };
  mask(info as unknown as Record<string, unknown>);
  return info;
});

const format = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  redactSensitive(),
  winston.format.json(),
);

const consoleFormat = winston.format.combine(
  redactSensitive(),
  winston.format.colorize({ all: true }),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.printf((info) => `${info.timestamp} ${info.level}: ${info.message}${info.stack ? `\n${info.stack}` : ''}`),
);

// Console is always on: in prod it emits JSON so docker/k8s log collectors
// capture it; elsewhere it uses the colored human-readable format.
const transports: Array<InstanceType<typeof winston.transports.Console> | DailyRotateFile> = [
  new winston.transports.Console({
    format: process.env.NODE_ENV === 'production' ? format : consoleFormat,
  }),
];

const errorFileTransport = new DailyRotateFile({
  filename: path.join(process.env.LOG_FILE_PATH || './logs', 'error-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  level: 'error',
  maxSize: '20m',
  maxFiles: '14d',
  format,
});

const combinedFileTransport = new DailyRotateFile({
  filename: path.join(process.env.LOG_FILE_PATH || './logs', 'combined-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  maxSize: '20m',
  maxFiles: '14d',
  format,
});

const httpFileTransport = new DailyRotateFile({
  filename: path.join(process.env.LOG_FILE_PATH || './logs', 'http-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  level: 'http',
  maxSize: '20m',
  maxFiles: '7d',
  format,
});

transports.push(errorFileTransport, combinedFileTransport, httpFileTransport);

const logger = winston.createLogger({
  level: level(),
  levels,
  format,
  transports,
  exitOnError: false,
}) as unknown as SaharyLogger;

logger.stream = {
  write: (message: string) => {
    logger.http(message.trim());
  },
};

logger.logRequest = (req, res, responseTime) => {
  const logData = {
    method: req.method,
    url: req.originalUrl,
    statusCode: res.statusCode,
    responseTime: `${responseTime}ms`,
    ip: req.ip,
    userAgent: req.get?.('user-agent'),
    userId: req.user?.id,
  };

  if (res.statusCode >= 400) {
    logger.error('HTTP Request Error', logData);
  } else {
    logger.http('HTTP Request', logData);
  }
};

logger.logQuery = (query, duration) => {
  logger.debug('Database Query', {
    query,
    duration: `${duration}ms`,
  });
};

logger.logAuth = (event, data) => {
  logger.info(`Auth: ${event}`, data);
};

logger.logSecurity = (event, data) => {
  logger.warn(`Security: ${event}`, data);
};

logger.logBusiness = (event, data) => {
  logger.info(`Business: ${event}`, data);
};

logger.logPerformance = (metric, value, metadata = {}) => {
  logger.info('Performance Metric', {
    metric,
    value,
    ...metadata,
  });
};

logger.logCache = (event, data) => {
  logger.debug(`Cache: ${event}`, data);
};

logger.logJob = (jobName, status, data = {}) => {
  logger.info(`Job: ${jobName}`, {
    status,
    ...data,
  });
};

export type { SaharyLogger } from '../types/logger';
export default logger;
