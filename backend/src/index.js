const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const session = require('express-session');
const RedisStore = require('connect-redis').default;
const { connectDatabase, checkDatabaseHealth } = require('./config/database');
const redisService = require('./services/redisService');
const logger = require('./utils/logger');
const { errorHandler, notFoundHandler, handleUnhandledRejection, handleUncaughtException } = require('./middlewares/errorHandler');
const { requestLogger } = require('./middlewares/requestLogger');
require('dotenv').config();

// Handle unhandled rejections and uncaught exceptions
handleUnhandledRejection();
handleUncaughtException();

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || 'localhost';

// Redis client for sessions (will be initialized in startServer)
let redisClient;

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
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
}));

// Input sanitization
const { sanitizeAll, checkXSS, preventNoSQLInjection } = require('./middlewares/sanitization');
app.use(sanitizeAll);
app.use(checkXSS);
app.use(preventNoSQLInjection);

// DDoS protection
if (process.env.NODE_ENV === 'production') {
  const { ddosProtectionMiddleware, connectionLimitMiddleware } = require('./middlewares/ddosProtection');
  app.use(ddosProtectionMiddleware);
  app.use(connectionLimitMiddleware);
}

// CORS configuration
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3001',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// Compression middleware
app.use(compression());

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100, // limit each IP to 100 requests per windowMs
  message: {
    error: 'Too many requests from this IP, please try again later.',
    retryAfter: Math.ceil((parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000) / 1000)
  },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/', limiter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging middleware
if (process.env.NODE_ENV !== 'test') {
  app.use(requestLogger);
  
  // Performance monitoring
  const performanceMonitor = require('./middlewares/performanceMonitor');
  app.use(performanceMonitor);
}

// Session configuration (will be set up after Redis connection)
const setupSession = (client) => {
  app.use(session({
    store: new RedisStore({ client }),
    secret: process.env.SESSION_SECRET || 'sahary-cloud-session-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      maxAge: parseInt(process.env.SESSION_MAX_AGE) || 24 * 60 * 60 * 1000 // 24 hours
    }
  }));
};

// Health check endpoint
app.get('/health', async (req, res) => {
  const dbHealth = await checkDatabaseHealth();
  
  res.status(dbHealth.status === 'healthy' ? 200 : 503).json({
    status: dbHealth.status === 'healthy' ? 'OK' : 'ERROR',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV,
    version: process.env.npm_package_version || '1.0.0',
    database: dbHealth,
    redis: redisClient ? 'connected' : 'disconnected'
  });
});

// API base route
app.get('/api', (req, res) => {
  res.json({
    message: 'Welcome to Sahary Cloud API',
    version: '1.0.0',
    documentation: '/api/docs',
    status: 'active'
  });
});

// Routes
app.use('/api/v1/auth', require('./routes/auth'));
app.use('/api/v1/vms', require('./routes/vms'));
app.use('/api/v1/docker', require('./routes/docker'));
app.use('/api/v1/payments', require('./routes/payments'));
app.use('/api/v1/billing', require('./routes/billing'));
app.use('/api/v1/admin', require('./routes/admin'));
app.use('/api/v1/solar', require('./routes/solar'));
app.use('/api/v1/cache', require('./routes/cache'));
app.use('/api/v1/monitoring', require('./routes/monitoring'));

// 404 handler
app.use('*', notFoundHandler);

// Global error handler
app.use(errorHandler);

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully');
  
  // Stop jobs
  if (process.env.NODE_ENV !== 'test') {
    const usageCollector = require('./jobs/usageCollector');
    usageCollector.stop();
    
    const solarDataCollector = require('./jobs/solarDataCollector');
    solarDataCollector.stop();
    
    const cacheCleanup = require('./jobs/cacheCleanup');
    cacheCleanup.stop();
  }
  
  // Disconnect Redis
  await redisService.disconnect();
  
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully');
  
  // Stop jobs
  if (process.env.NODE_ENV !== 'test') {
    const usageCollector = require('./jobs/usageCollector');
    usageCollector.stop();
    
    const solarDataCollector = require('./jobs/solarDataCollector');
    solarDataCollector.stop();
    
    const cacheCleanup = require('./jobs/cacheCleanup');
    cacheCleanup.stop();
  }
  
  // Disconnect Redis
  await redisService.disconnect();
  
  process.exit(0);
});

// Start server
if (process.env.NODE_ENV !== 'test') {
  const startServer = async () => {
    try {
      // Connect to database
      await connectDatabase();
      
      // Connect to Redis
      await redisService.connect();
      redisClient = redisService.getClient();
      
      // Setup session middleware after Redis connection
      setupSession(redisClient);
      
      // Start usage collector
      const usageCollector = require('./jobs/usageCollector');
      usageCollector.start();
      
      // Start invoice generator
      const invoiceGenerator = require('./jobs/invoiceGenerator');
      invoiceGenerator.start();
      
      // Start solar data collector
      const solarDataCollector = require('./jobs/solarDataCollector');
      solarDataCollector.start();
      
      // Start cache cleanup job
      const cacheCleanup = require('./jobs/cacheCleanup');
      cacheCleanup.start();
      
      // Start HTTP server
      app.listen(PORT, HOST, () => {
        console.log(`🚀 Sahary Cloud API Server running on http://${HOST}:${PORT}`);
        console.log(`📊 Environment: ${process.env.NODE_ENV}`);
        console.log(`🔗 API Base URL: http://${HOST}:${PORT}/api`);
        console.log(`❤️  Health Check: http://${HOST}:${PORT}/health`);
        console.log(`🗄️  Database: Connected`);
        console.log(`🔴 Redis: ${redisService.isReady() ? 'Connected' : 'Disconnected'}`);
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
  
  startServer();
}

module.exports = app;