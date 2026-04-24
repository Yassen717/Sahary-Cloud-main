import http from 'http';
import express, { Request, Response } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import session from 'express-session';
import RedisStore from 'connect-redis';
import swaggerUi from 'swagger-ui-express';
import { connectDatabase, checkDatabaseHealth } from './config/database';
import redisService = require('./services/redisService');
import dockerService from './services/dockerService';
import {
  errorHandler,
  notFoundHandler,
  handleUnhandledRejection,
  handleUncaughtException,
} from './middlewares/errorHandler';
import { requestLogger } from './middlewares/requestLogger';
import { correlationId } from './middlewares/correlationId';
import { performanceMonitor } from './middlewares/performanceMonitor';
import { sanitizeAll, checkXSS, preventNoSQLInjection } from './middlewares/sanitization';
import { ddosProtectionMiddleware, connectionLimitMiddleware } from './middlewares/ddosProtection';

const swaggerSpec = require('./config/swagger');
const { initSocket } = require('./socket') as { initSocket: (server: http.Server) => void };

type BackgroundJob = {
  start: () => void;
  stop: () => void;
};

type RedisClientLike = ReturnType<typeof redisService.getClient> | undefined;

require('dotenv').config();

handleUnhandledRejection();
handleUncaughtException();

const app = express();
const PORT = Number.parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || 'localhost';

let redisClient: RedisClientLike;

const loadJob = (jobPath: string): BackgroundJob => require(jobPath) as BackgroundJob;

const stopBackgroundJobs = (): void => {
  if (process.env.NODE_ENV === 'test') {
    return;
  }

  loadJob('./jobs/usageCollector').stop();
  loadJob('./jobs/solarDataCollector').stop();
  loadJob('./jobs/cacheCleanup').stop();
};

const startBackgroundJobs = (): void => {
  if (process.env.NODE_ENV === 'test') {
    return;
  }

  loadJob('./jobs/usageCollector').start();
  loadJob('./jobs/invoiceGenerator').start();
  loadJob('./jobs/solarDataCollector').start();
  loadJob('./jobs/cacheCleanup').start();
};

const shutdown = async (signal: 'SIGINT' | 'SIGTERM'): Promise<void> => {
  console.log(`${signal} received, shutting down gracefully`);

  stopBackgroundJobs();

  await redisService.disconnect();
  await dockerService.disconnect();

  process.exit(0);
};

app.use(correlationId);

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'https:'],
      },
    },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    },
    frameguard: {
      action: 'deny',
    },
    noSniff: true,
    xssFilter: true,
  })
);

app.use(sanitizeAll);
app.use(checkXSS);
app.use(preventNoSQLInjection);

if (process.env.NODE_ENV === 'production') {
  app.use(ddosProtectionMiddleware);
  app.use(connectionLimitMiddleware);
}

app.use(
  cors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:3001',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  })
);

app.use(compression());

const limiter = rateLimit({
  windowMs: Number.parseInt(process.env.RATE_LIMIT_WINDOW_MS || '', 10) || 15 * 60 * 1000,
  max: Number.parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '', 10) || 100,
  message: {
    error: 'Too many requests from this IP, please try again later.',
    retryAfter: Math.ceil(
      (Number.parseInt(process.env.RATE_LIMIT_WINDOW_MS || '', 10) || 15 * 60 * 1000) / 1000,
    ),
  },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/', limiter);

app.use(cookieParser());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

if (process.env.NODE_ENV !== 'test') {
  app.use(requestLogger);
  app.use(performanceMonitor);
}

const setupSession = (client: unknown): void => {
  app.use(
    session({
      store: new RedisStore({ client: client as never }),
      secret: process.env.SESSION_SECRET as string,
      resave: false,
      saveUninitialized: false,
      cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: Number.parseInt(process.env.SESSION_MAX_AGE || '', 10) || 24 * 60 * 60 * 1000,
      },
    })
  );
};

if (process.env.NODE_ENV !== 'production') {
  app.use(
    '/api-docs',
    swaggerUi.serve,
    swaggerUi.setup(swaggerSpec, {
      customSiteTitle: 'Sahary Cloud API Docs',
      swaggerOptions: {
        persistAuthorization: true,
        docExpansion: 'list',
      },
    })
  );

  app.get('/api-docs.json', (_req: Request, res: Response) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(swaggerSpec);
  });
}

app.get('/health', async (_req: Request, res: Response) => {
  const dbHealth = await checkDatabaseHealth();
  const dockerHealth = await dockerService.getHealthStatus();

  res.status(dbHealth.status === 'healthy' ? 200 : 503).json({
    status: dbHealth.status === 'healthy' ? 'OK' : 'ERROR',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV,
    version: process.env.npm_package_version || '1.0.0',
    database: dbHealth,
    redis: redisClient ? 'connected' : 'disconnected',
    docker: dockerHealth,
  });
});

app.get('/api', (_req: Request, res: Response) => {
  res.json({
    message: 'Welcome to Sahary Cloud API',
    version: '1.0.0',
    documentation: '/api/docs',
    status: 'active',
  });
});

app.use('/api/v1/auth', require('./routes/auth'));
app.use('/api/v1/hosting', require('./routes/hosting'));
app.use('/api/v1/vms', require('./routes/vms'));
app.use('/api/v1/docker', require('./routes/docker'));
app.use('/api/v1/payments', require('./routes/payments'));
app.use('/api/v1/billing', require('./routes/billing'));
app.use('/api/v1/admin', require('./routes/admin'));
app.use('/api/v1/solar', require('./routes/solar'));
app.use('/api/v1/cache', require('./routes/cache'));
app.use('/api/v1/monitoring', require('./routes/monitoring'));
app.use('/api/v1/security', require('./routes/security'));

app.use('*', notFoundHandler);
app.use(errorHandler);

process.on('SIGTERM', () => {
  void shutdown('SIGTERM');
});

process.on('SIGINT', () => {
  void shutdown('SIGINT');
});

if (process.env.NODE_ENV !== 'test') {
  const startServer = async (): Promise<void> => {
    try {
      await connectDatabase();
      await redisService.connect();
      await dockerService.connect();

      if (redisService.isReady()) {
        redisClient = redisService.getClient();
        setupSession(redisClient);
      } else {
        console.warn('⚠️  Skipping Redis-dependent features (sessions)');
      }

      startBackgroundJobs();

      const httpServer = http.createServer(app);
      initSocket(httpServer);

      httpServer.listen(PORT, HOST, () => {
        console.log(`🚀 Sahary Cloud API Server running on http://${HOST}:${PORT}`);
        console.log(`📊 Environment: ${process.env.NODE_ENV}`);
        console.log(`🔗 API Base URL: http://${HOST}:${PORT}/api`);
        console.log(`❤️  Health Check: http://${HOST}:${PORT}/health`);
        console.log(`🗄️  Database: Connected`);
        console.log(`🔴 Redis: ${redisService.isReady() ? 'Connected' : 'Disconnected'}`);
        console.log(`🐳 Docker: ${dockerService.isReady() ? 'Connected' : 'Disconnected'}`);
        console.log(`🖥️  WebSocket: Enabled (/terminal)`);
        console.log(`📈 Usage Collector: Started`);
        console.log(`💰 Invoice Generator: Started`);
        console.log(`🌞 Solar Data Collector: Started`);
        console.log(`🧹 Cache Cleanup: Started`);
      });
    } catch (error) {
      console.error('❌ Failed to start server:', error);
      process.exit(1);
    }
  };

  void startServer();
}

export = app;