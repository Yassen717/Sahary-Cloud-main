require('dotenv').config();

// Validate environment variables on startup (skip in test)
if (process.env.NODE_ENV !== 'test') {
  const { validateEnv, printEnvSummary } = require('./env.validation');
  validateEnv();
  if (process.env.LOG_LEVEL === 'debug' || process.env.NODE_ENV === 'development') {
    printEnvSummary();
  }
}

const config = {
  // Server configuration
  server: {
    port: parseInt(process.env.PORT) || 3000,
    host: process.env.HOST || 'localhost',
    env: process.env.NODE_ENV || 'development',
  },

  // Database configuration
  database: {
    url: process.env.DATABASE_URL,
  },

  // Redis configuration
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
    password: process.env.REDIS_PASSWORD || '',
  },

  // JWT configuration
  jwt: {
    secret: process.env.JWT_SECRET,
    expiresIn: process.env.JWT_EXPIRE || '30d',
    refreshSecret: process.env.JWT_REFRESH_SECRET,
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRE || '7d',
  },

  // Session configuration
  session: {
    secret: process.env.SESSION_SECRET,
    maxAge: parseInt(process.env.SESSION_MAX_AGE) || 24 * 60 * 60 * 1000, // 24 hours
  },

  // Email configuration
  email: {
    smtp: {
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    },
    from: {
      email: process.env.FROM_EMAIL || 'noreply@saharycloud.com',
      name: process.env.FROM_NAME || 'Sahary Cloud',
    },
  },

  // Payment configuration (Stripe)
  payment: {
    stripe: {
      secretKey: process.env.STRIPE_SECRET_KEY,
      publishableKey: process.env.STRIPE_PUBLISHABLE_KEY,
      webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
    },
  },

  // Solar API configuration
  solar: {
    apiUrl: process.env.SOLAR_API_URL || 'http://localhost:8080',
    apiKey: process.env.SOLAR_API_KEY,
  },

  // Docker configuration
  docker: {
    host: process.env.DOCKER_HOST || 'unix:///var/run/docker.sock',
    registry: process.env.DOCKER_REGISTRY || 'registry.saharycloud.com',
    tlsVerify: process.env.DOCKER_TLS_VERIFY === 'true',
    certPath: process.env.DOCKER_CERT_PATH || '',
    vmNetwork: process.env.DOCKER_VM_NETWORK || 'sahary-vm-network',
    vmSubnet: process.env.DOCKER_VM_SUBNET || '172.25.0.0/16',
  },

  // File upload configuration
  upload: {
    maxFileSize: parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024, // 10MB
    uploadPath: process.env.UPLOAD_PATH || './uploads',
  },

  // Rate limiting configuration
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  },

  // Logging configuration
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    filePath: process.env.LOG_FILE_PATH || './logs',
  },

  // Security configuration
  security: {
    bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS) || 12,
    corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:3001',
  },

  // Application URLs
  urls: {
    frontend: process.env.FRONTEND_URL || 'http://localhost:3001',
    backend: process.env.BACKEND_URL || 'http://localhost:3000',
    apiBase: process.env.API_BASE_URL || '/api/v1',
  },

  // Feature flags
  features: {
    enableSolarMonitoring: process.env.ENABLE_SOLAR_MONITORING !== 'false',
    enablePayments: process.env.ENABLE_PAYMENTS !== 'false',
    enableEmailNotifications: process.env.ENABLE_EMAIL_NOTIFICATIONS !== 'false',
  },
};

module.exports = config;