import 'dotenv/config';
import fs from 'fs';
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
import type { Server as SocketIOServer } from 'socket.io';
// Side-effect import: runs validateEnv() (and the env summary in dev) on boot.
import './config';
import { connectDatabase, checkDatabaseHealth, disconnectDatabase } from './config/database';
import { validateAuthConfig } from './config/auth';
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
import { getHostingConfig } from './config/hosting';
import { ddosProtectionMiddleware, connectionLimitMiddleware } from './middlewares/ddosProtection';

const redisService = require('./services/redisService');
const swaggerSpec = require('./config/swagger');
const { initSocket } = require('./socket/index') as { initSocket: (server: http.Server) => SocketIOServer };
const VhostService = require('./services/vhostService');
const mysqlProvisionService = require('./services/mysqlProvisionService');
const ftpService = require('./services/ftpService');
const sslService = require('./services/sslService');

// The VPS/Docker VM product is out of scope for the shared-hosting MVP.
// ENABLE_VPS=false keeps the code in the tree but disables every Docker
// touchpoint: /api/v1/vms + /api/v1/docker 404, no daemon connect, no
// terminal WebSocket, no VM usage/invoice jobs.
const VPS_ENABLED = process.env.ENABLE_VPS === 'true';

type BackgroundJob = {
  start: () => void;
  stop: () => void;
};

type HostingCheckStatus = 'disabled' | 'ok' | 'error';

handleUnhandledRejection();
handleUncaughtException();

// Fail fast on missing JWT/session secrets (warn-only under NODE_ENV=test).
validateAuthConfig();

const app = express();

// The app sits behind nginx: trust X-Forwarded-* for the configured number of
// proxy hops. Without this every IP-keyed control (rate limits, ddos
// protection, account lockouts) keys on the proxy IP → site-wide lockouts.
app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS ?? 1));

const parsedPort = Number.parseInt(process.env.PORT ?? '', 10);
const PORT = Number.isNaN(parsedPort) ? 3000 : parsedPort;
const HOST = process.env.HOST || 'localhost';

// Runtime handles retained for graceful shutdown / lazy wiring.
let httpServer: http.Server | null = null;
let io: SocketIOServer | null = null;
let sessionMw: express.RequestHandler | null = null;
let shutdownStarted = false;

const loadJob = (jobPath: string): BackgroundJob => require(jobPath) as BackgroundJob;

const stopBackgroundJobs = (): void => {
  if (process.env.NODE_ENV === 'test') {
    return;
  }

  if (VPS_ENABLED) {
    loadJob('./jobs/usageCollector').stop();
    // stop() is being added to this job by the jobs refactor — call defensively.
    loadJob('./jobs/invoiceGenerator').stop?.();
  }
  loadJob('./jobs/solarDataCollector').stop();
  loadJob('./jobs/cacheCleanup').stop();

  if (getHostingConfig().jobsEnabled) {
    loadJob('./jobs/hostingMeterJob').stop();
    loadJob('./jobs/sslRenewalJob').stop();
    loadJob('./jobs/hostingReconcileJob').stop();
    loadJob('./jobs/hostingRetentionJob').stop();
  }
};

const startBackgroundJobs = (): void => {
  if (process.env.NODE_ENV === 'test') {
    return;
  }

  if (VPS_ENABLED) {
    loadJob('./jobs/usageCollector').start();
    loadJob('./jobs/invoiceGenerator').start();
  }
  loadJob('./jobs/solarDataCollector').start();
  loadJob('./jobs/cacheCleanup').start();

  if (getHostingConfig().jobsEnabled) {
    loadJob('./jobs/hostingMeterJob').start();
    loadJob('./jobs/sslRenewalJob').start();
    loadJob('./jobs/hostingReconcileJob').start();
    loadJob('./jobs/hostingRetentionJob').start();
  }
};

const shutdown = async (signal: 'SIGINT' | 'SIGTERM'): Promise<void> => {
  // SIGINT and SIGTERM can both arrive — run the teardown exactly once.
  if (shutdownStarted) {
    return;
  }
  shutdownStarted = true;

  console.log(`${signal} received, shutting down gracefully`);

  // If any close below hangs (e.g. a server.close callback that never fires),
  // force the process out instead of leaving it half-dead.
  setTimeout(() => process.exit(1), 10000).unref();

  try {
    stopBackgroundJobs();
  } catch (error) {
    console.warn('⚠️  Failed to stop background jobs:', error);
  }

  // Capture refs once so a second signal or a late assignment can't matter.
  const server = httpServer;
  const socketIo = io;

  await Promise.allSettled([
    server
      ? new Promise<void>((resolve) => {
        server.close(() => resolve());
      })
      : Promise.resolve(),
    socketIo ? socketIo.close() : Promise.resolve(),
    redisService.disconnect(),
    VPS_ENABLED ? dockerService.disconnect() : Promise.resolve(),
    disconnectDatabase(),
  ]);

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
  }),
);

if (process.env.NODE_ENV === 'production') {
  app.use(ddosProtectionMiddleware);
  app.use(connectionLimitMiddleware);
}

app.use(
  cors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:3001',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Requested-With',
      'X-CSRF-Token',
      'X-API-Key',
      'X-Correlation-Id',
      'X-Request-Id',
    ],
  }),
);

app.use(compression());

const limiter = rateLimit({
  windowMs: Number.parseInt(process.env.RATE_LIMIT_WINDOW_MS || '', 10) || 15 * 60 * 1000,
  max: Number.parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '', 10) || 1000,
  message: {
    error: 'Too many requests from this IP, please try again later.',
    retryAfter: Math.ceil(
      (Number.parseInt(process.env.RATE_LIMIT_WINDOW_MS || '', 10) || 15 * 60 * 1000) / 1000,
    ),
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Stripe retries failed webhook deliveries in bursts — never throttle them.
  skip: (req) => req.originalUrl.startsWith('/api/v1/payments/webhook'),
});

app.use('/api/', limiter);

app.use(cookieParser());

// NOTE: ordering is load-bearing — Stripe's webhook signature verification
// needs the raw request bytes, so the raw body parser for this route must be
// mounted BEFORE express.json() consumes the stream.
app.use('/api/v1/payments/webhook', express.raw({ type: 'application/json' }));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Sessions are wired lazily: the Redis-backed store only exists after
// redisService.connect() runs inside startServer(), long after this middleware
// is registered. Delegate to it once built; pass through until then (and
// permanently when Redis or SESSION_SECRET is unavailable).
app.use((req, res, next) => (sessionMw ? sessionMw(req, res, next) : next()));

app.use(sanitizeAll);
app.use(checkXSS);
app.use(preventNoSQLInjection);

if (process.env.NODE_ENV !== 'test') {
  app.use(requestLogger);
  app.use(performanceMonitor);
}

const createSessionMiddleware = (client: unknown, secret: string): express.RequestHandler => session({
  store: new RedisStore({ client: client as never }),
  secret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: Number.parseInt(process.env.SESSION_MAX_AGE || '', 10) || 24 * 60 * 60 * 1000,
  },
});

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
    }),
  );

  app.get('/api-docs.json', (_req: Request, res: Response) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(swaggerSpec);
  });
}

// nginx -t probes are cached: /health is polled by load balancers and must
// never turn into an exec storm. The result is only a config parse — never
// a reload.
const NGINX_HEALTH_CACHE_MS = 60_000;
let nginxHealthCache: { checkedAt: number; ok: boolean } | null = null;

const getNginxHealth = async (): Promise<HostingCheckStatus> => {
  if (nginxHealthCache && Date.now() - nginxHealthCache.checkedAt < NGINX_HEALTH_CACHE_MS) {
    return nginxHealthCache.ok ? 'ok' : 'error';
  }
  let ok = false;
  try {
    await VhostService.testConfig();
    ok = true;
  } catch {
    ok = false;
  }
  nginxHealthCache = { checkedAt: Date.now(), ok };
  return ok ? 'ok' : 'error';
};

const runHostingHealthCheck = async (
  check: () => Promise<{ ok: boolean; message?: string }>,
): Promise<HostingCheckStatus> => {
  try {
    return (await check()).ok ? 'ok' : 'error';
  } catch {
    return 'error';
  }
};

// Free GB on the hosting document-root filesystem. fs.statfs is unavailable
// on some platforms, so a failed probe degrades to null instead of throwing.
const getHostingDiskFreeGB = async (wwwBase: string): Promise<number | null> => {
  try {
    const stats = await fs.promises.statfs(wwwBase);
    return Math.round(((stats.bavail * stats.bsize) / 1024 ** 3) * 100) / 100;
  } catch {
    return null;
  }
};

type HostingHealth = {
  checks: {
    nginx: HostingCheckStatus;
    mysql: HostingCheckStatus;
    ftp: HostingCheckStatus;
    ssl: HostingCheckStatus;
    disk: number | null;
  };
  degraded: boolean;
};

const getHostingHealth = async (): Promise<HostingHealth> => {
  const hosting = getHostingConfig();

  const [nginx, mysql, ftp, ssl, disk] = await Promise.all([
    hosting.nginx.enabled ? getNginxHealth() : Promise.resolve<HostingCheckStatus>('disabled'),
    hosting.mysql.enabled
      ? runHostingHealthCheck(mysqlProvisionService.healthCheck)
      : Promise.resolve<HostingCheckStatus>('disabled'),
    hosting.ftp.driver !== 'none'
      ? runHostingHealthCheck(ftpService.healthCheck)
      : Promise.resolve<HostingCheckStatus>('disabled'),
    hosting.ssl.enabled
      ? runHostingHealthCheck(sslService.healthCheck)
      : Promise.resolve<HostingCheckStatus>('disabled'),
    getHostingDiskFreeGB(hosting.wwwBase),
  ]);

  const anyFeatureEnabled = hosting.nginx.enabled || hosting.mysql.enabled
    || hosting.ftp.driver !== 'none' || hosting.ssl.enabled;

  // On a real hosting node the docroot filesystem must be measurable; treat
  // an unreadable wwwBase as a problem only when hosting infra is enabled
  // (dev machines may have no /var/www at all).
  const degraded = [nginx, mysql, ftp, ssl].includes('error')
    || (anyFeatureEnabled && disk === null);

  return { checks: { nginx, mysql, ftp, ssl, disk }, degraded };
};

app.get('/health', async (_req: Request, res: Response) => {
  try {
    const [dbHealth, dockerHealth, hosting] = await Promise.all([
      checkDatabaseHealth(),
      VPS_ENABLED ? dockerService.getHealthStatus() : Promise.resolve(null),
      getHostingHealth(),
    ]);

    const dbHealthy = dbHealth.status === 'healthy';
    const redisReady = redisService.isReady();
    const dockerReady = !VPS_ENABLED || dockerService.isReady();

    // 503 only when a hard dependency is down: without the database almost
    // every route fails. Redis/Docker outages and hosting-infra problems
    // degrade features but the API keeps serving → DEGRADED on a 200.
    const degraded = !dbHealthy || !redisReady || !dockerReady || hosting.degraded;

    // Health is unauthenticated: never echo raw error internals (query
    // errors, socket paths) to callers in production.
    const stripInternals = (health: object): Record<string, unknown> => {
      const { error: _error, ...safe } = health as Record<string, unknown>;
      return process.env.NODE_ENV === 'production' ? safe : (health as Record<string, unknown>);
    };

    res.status(dbHealthy ? 200 : 503).json({
      status: dbHealthy ? (degraded ? 'DEGRADED' : 'OK') : 'ERROR',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV,
      version: process.env.npm_package_version || '1.0.0',
      database: stripInternals(dbHealth),
      redis: redisReady ? 'connected' : 'disconnected',
      docker: VPS_ENABLED && dockerHealth ? stripInternals(dockerHealth) : 'disabled',
      hosting: hosting.checks,
    });
  } catch (error) {
    // Both health probes swallow errors internally, but never let a stray
    // rejection hang the request anyway.
    console.error('❌ Health check failed:', error);
    res.status(503).json({
      status: 'ERROR',
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV,
      version: process.env.npm_package_version || '1.0.0',
    });
  }
});

app.get('/api', (_req: Request, res: Response) => {
  res.json({
    message: 'Welcome to Sahary Cloud API',
    version: '1.0.0',
    documentation: '/api-docs',
    status: 'active',
  });
});

// Route modules may export the router directly (module.exports) or as a
// default export ({ default: router }) — unwrap either shape defensively.
const asMiddleware = (m: unknown) => ((m as any)?.default ?? m) as express.RequestHandler;

app.use('/api/v1/auth', asMiddleware(require('./routes/auth')));
app.use('/api/v1/hosting', asMiddleware(require('./routes/hosting')));
if (VPS_ENABLED) {
  app.use('/api/v1/vms', asMiddleware(require('./routes/vms')));
  app.use('/api/v1/docker', asMiddleware(require('./routes/docker')));
} else {
  // The VPS routers are not mounted at all — answer every call under these
  // prefixes with an explicit, informative 404 instead of the generic
  // notFoundHandler.
  const vpsDisabled: express.RequestHandler = (_req, res) => {
    res.status(404).json({ success: false, message: 'VPS hosting is not enabled' });
  };
  app.use('/api/v1/vms', vpsDisabled);
  app.use('/api/v1/docker', vpsDisabled);
}
app.use('/api/v1/payments', asMiddleware(require('./routes/payments')));
app.use('/api/v1/billing', asMiddleware(require('./routes/billing')));
app.use('/api/v1/admin', asMiddleware(require('./routes/admin')));
app.use('/api/v1/solar', asMiddleware(require('./routes/solar')));
app.use('/api/v1/cache', asMiddleware(require('./routes/cache')));
app.use('/api/v1/monitoring', asMiddleware(require('./routes/monitoring')));
app.use('/api/v1/security', asMiddleware(require('./routes/security')));

app.use('*', notFoundHandler);
app.use(errorHandler);

// Signal handlers are skipped under NODE_ENV=test so importing app in jest
// doesn't register process.exit hooks on the test runner.
if (process.env.NODE_ENV !== 'test') {
  process.on('SIGTERM', () => {
    void shutdown('SIGTERM');
  });

  process.on('SIGINT', () => {
    void shutdown('SIGINT');
  });
}

if (process.env.NODE_ENV !== 'test') {
  const startServer = async (): Promise<void> => {
    try {
      await connectDatabase();
      await redisService.connect();
      if (VPS_ENABLED) {
        await dockerService.connect();
      }

      if (redisService.isReady()) {
        const sessionSecret = process.env.SESSION_SECRET;
        if (sessionSecret) {
          sessionMw = createSessionMiddleware(redisService.getClient(), sessionSecret);
        } else {
          console.warn('⚠️  SESSION_SECRET is not set — session middleware disabled');
        }
      } else {
        console.warn('⚠️  Skipping Redis-dependent features (sessions)');
      }

      startBackgroundJobs();

      httpServer = http.createServer(app);
      // Socket.IO only exists for the Docker exec terminal — with VPS off
      // nothing else needs it, so no WebSocket server is created at all.
      if (VPS_ENABLED) {
        io = initSocket(httpServer);
      }

      httpServer.listen(PORT, HOST, () => {
        console.log(`🚀 Sahary Cloud API Server running on http://${HOST}:${PORT}`);
        console.log(`📊 Environment: ${process.env.NODE_ENV}`);
        console.log(`🔗 API Base URL: http://${HOST}:${PORT}/api`);
        console.log(`❤️  Health Check: http://${HOST}:${PORT}/health`);
        console.log('🗄️  Database: Connected');
        console.log(`🔴 Redis: ${redisService.isReady() ? 'Connected' : 'Disconnected'}`);
        console.log(`🐳 Docker: ${VPS_ENABLED ? (dockerService.isReady() ? 'Connected' : 'Disconnected') : 'Disabled (ENABLE_VPS=false)'}`);
        console.log(`🖥️  WebSocket: ${VPS_ENABLED ? 'Enabled (/terminal)' : 'Disabled (ENABLE_VPS=false)'}`);
        console.log(`📈 Usage Collector: ${VPS_ENABLED ? 'Started' : 'Disabled (ENABLE_VPS=false)'}`);
        console.log(`💰 Invoice Generator: ${VPS_ENABLED ? 'Started' : 'Disabled (ENABLE_VPS=false)'}`);
        console.log('🌞 Solar Data Collector: Started');
        console.log('🧹 Cache Cleanup: Started');
      });
    } catch (error) {
      console.error('❌ Failed to start server:', error);
      process.exit(1);
    }
  };

  void startServer();
}

export = app;
