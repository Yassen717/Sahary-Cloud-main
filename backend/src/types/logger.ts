import type { Logger as WinstonLogger } from 'winston';

type BaseLogger = Omit<WinstonLogger, 'stream'>;

export interface LogContext {
  [key: string]: unknown;
}

export interface RequestLike {
  method: string;
  originalUrl?: string;
  ip?: string;
  get?: (headerName: string) => string | undefined;
  user?: {
    id?: string;
  };
}

export interface ResponseLike {
  statusCode: number;
}

export type SaharyLogger = BaseLogger & {
  stream: {
    write: (message: string) => void;
  };
  logRequest: (req: RequestLike, res: ResponseLike, responseTime: number) => void;
  logQuery: (query: string, duration: number) => void;
  logAuth: (event: string, data?: LogContext) => void;
  logSecurity: (event: string, data?: LogContext) => void;
  logBusiness: (event: string, data?: LogContext) => void;
  logPerformance: (metric: string, value: number, metadata?: LogContext) => void;
  logCache: (event: string, data?: LogContext) => void;
  logJob: (jobName: string, status: string, data?: LogContext) => void;
};
