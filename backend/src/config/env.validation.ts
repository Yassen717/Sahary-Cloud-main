import Joi from 'joi';

export const envSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'production', 'test', 'staging').default('development'),
  PORT: Joi.number().integer().min(1).max(65535).default(3000),
  HOST: Joi.string().default('localhost'),

  DATABASE_URL: Joi.string().uri({ scheme: ['postgresql', 'postgres'] }).required(),

  REDIS_URL: Joi.string().uri({ scheme: ['redis', 'rediss'] }).default('redis://localhost:6379'),
  REDIS_PASSWORD: Joi.string().allow('').default(''),
  REDIS_DEFAULT_TTL: Joi.number().integer().min(0).default(3600),
  CACHE_CLEANUP_SCHEDULE: Joi.string().default('0 * * * *'),

  JWT_SECRET: Joi.string().min(16).required(),
  JWT_EXPIRE: Joi.string().default('30d'),
  JWT_REFRESH_SECRET: Joi.string().min(16).required(),
  JWT_REFRESH_EXPIRE: Joi.string().default('7d'),

  SESSION_SECRET: Joi.string().min(16).required(),
  SESSION_MAX_AGE: Joi.number().integer().min(0).default(86400000),

  SMTP_HOST: Joi.string().default('smtp.gmail.com'),
  SMTP_PORT: Joi.number().integer().valid(25, 465, 587, 2525).default(587),
  SMTP_SECURE: Joi.boolean().default(false),
  SMTP_USER: Joi.string().when('NODE_ENV', {
    is: 'production',
    then: Joi.required(),
    otherwise: Joi.optional().default(''),
  }),
  SMTP_PASS: Joi.string().when('NODE_ENV', {
    is: 'production',
    then: Joi.required(),
    otherwise: Joi.optional().default(''),
  }),
  FROM_EMAIL: Joi.string().email().default('noreply@saharycloud.com'),
  FROM_NAME: Joi.string().default('Sahary Cloud'),

  STRIPE_SECRET_KEY: Joi.string().pattern(/^sk_(test|live)_/).when('NODE_ENV', {
    is: 'production',
    then: Joi.required(),
    otherwise: Joi.optional().default(''),
  }),
  STRIPE_PUBLISHABLE_KEY: Joi.string().pattern(/^pk_(test|live)_/).when('NODE_ENV', {
    is: 'production',
    then: Joi.required(),
    otherwise: Joi.optional().default(''),
  }),
  STRIPE_WEBHOOK_SECRET: Joi.string().when('NODE_ENV', {
    is: 'production',
    then: Joi.required(),
    otherwise: Joi.optional().default(''),
  }),

  SOLAR_API_URL: Joi.string().uri().default('http://localhost:8080'),
  SOLAR_API_KEY: Joi.string().default(''),
  SOLAR_COLLECTION_SCHEDULE: Joi.string().default('*/15 * * * *'),

  LOW_PRODUCTION_THRESHOLD: Joi.number().min(0).max(100).default(20),
  CRITICAL_PRODUCTION_THRESHOLD: Joi.number().min(0).max(100).default(10),
  LOW_BATTERY_THRESHOLD: Joi.number().min(0).max(100).default(30),
  CRITICAL_BATTERY_THRESHOLD: Joi.number().min(0).max(100).default(15),
  HIGH_CONSUMPTION_THRESHOLD: Joi.number().min(0).max(100).default(90),

  DOCKER_HOST: Joi.string().default('unix:///var/run/docker.sock'),
  DOCKER_REGISTRY: Joi.string().default('registry.saharycloud.com'),
  DOCKER_TLS_VERIFY: Joi.boolean().default(false),
  DOCKER_CERT_PATH: Joi.string().when('DOCKER_TLS_VERIFY', {
    is: true,
    then: Joi.required(),
    otherwise: Joi.optional().default(''),
  }),
  DOCKER_VM_NETWORK: Joi.string().default('sahary-vm-network'),
  DOCKER_VM_SUBNET: Joi.string().default('172.25.0.0/16'),

  HOSTING_NGINX_ENABLED: Joi.boolean().default(false),
  HOSTING_NGINX_SITES_AVAILABLE: Joi.string().default('/etc/nginx/sites-available'),
  HOSTING_NGINX_SITES_ENABLED: Joi.string().default('/etc/nginx/sites-enabled'),
  HOSTING_NGINX_TEST_COMMAND: Joi.string().default('nginx -t'),
  HOSTING_NGINX_RELOAD_COMMAND: Joi.string().default('nginx -s reload'),
  HOSTING_WWW_BASE: Joi.string().default('/var/www'),
  HOSTING_BASE_DOMAIN: Joi.string().default('sahary.cloud'),

  MAX_FILE_SIZE: Joi.number().integer().min(1024).default(10485760),
  UPLOAD_PATH: Joi.string().default('./uploads'),

  RATE_LIMIT_WINDOW_MS: Joi.number().integer().min(1000).default(900000),
  RATE_LIMIT_MAX_REQUESTS: Joi.number().integer().min(1).default(100),

  LOG_LEVEL: Joi.string().valid('error', 'warn', 'info', 'http', 'verbose', 'debug', 'silly').default('info'),
  LOG_FILE_PATH: Joi.string().default('./logs'),

  ERROR_THRESHOLD: Joi.number().integer().min(1).default(10),
  ERROR_TIME_WINDOW: Joi.number().integer().min(1000).default(60000),

  SLOW_REQUEST_THRESHOLD: Joi.number().integer().min(100).default(1000),

  DDOS_REQUEST_THRESHOLD: Joi.number().integer().min(10).default(100),
  DDOS_TIME_WINDOW: Joi.number().integer().min(1000).default(60000),
  DDOS_BLOCK_DURATION: Joi.number().integer().min(1000).default(3600000),
  MAX_CONNECTIONS_PER_IP: Joi.number().integer().min(1).default(10),

  BCRYPT_ROUNDS: Joi.number().integer().min(4).max(20).default(12),
  CORS_ORIGIN: Joi.string().default('http://localhost:3001'),

  FRONTEND_URL: Joi.string().uri().default('http://localhost:3001'),
  BACKEND_URL: Joi.string().uri().default('http://localhost:3000'),
  API_BASE_URL: Joi.string().default('/api/v1'),

  ENABLE_SOLAR_MONITORING: Joi.boolean().default(true),
  ENABLE_PAYMENTS: Joi.boolean().default(true),
  ENABLE_EMAIL_NOTIFICATIONS: Joi.boolean().default(true),
}).options({
  allowUnknown: true,
  stripUnknown: false,
  abortEarly: false,
});

export function validateEnv(): Record<string, unknown> {
  const { error, value } = envSchema.validate(process.env);

  if (error) {
    const requiredErrors: Array<{ key: string; message: string }> = [];
    const warnings: Array<{ key: string; message: string }> = [];

    error.details.forEach((detail) => {
      const key = detail.context?.key || detail.path.join('.');
      const message = detail.message.replace(/"/g, '');

      if (detail.type === 'any.required' || detail.type === 'string.min') {
        requiredErrors.push({ key, message });
      } else {
        warnings.push({ key, message });
      }
    });

    if (requiredErrors.length > 0 || warnings.length > 0) {
      console.error('\n╔══════════════════════════════════════════════════════════════╗');
      console.error('║           ⚠️  ENVIRONMENT VARIABLE VALIDATION FAILED        ║');
      console.error('╚══════════════════════════════════════════════════════════════╝\n');
    }

    if (requiredErrors.length > 0) {
      console.error('❌ REQUIRED — The following variables must be set:\n');
      requiredErrors.forEach(({ key, message }) => {
        console.error(`   • ${key}: ${message}`);
      });
      console.error('');
    }

    if (warnings.length > 0) {
      console.warn('⚠️  INVALID — The following variables have invalid values:\n');
      warnings.forEach(({ key, message }) => {
        console.warn(`   • ${key}: ${message}`);
      });
      console.warn('');
    }

    if (requiredErrors.length > 0) {
      console.error('💡 Tip: Copy .env.example to .env and fill in the required values:');
      console.error('   cp .env.example .env\n');
      process.exit(1);
    }

    if (warnings.length > 0) {
      console.warn('⚠️  Server will start with default values for invalid variables.\n');
    }
  }

  console.log('✅ Environment variables validated successfully');

  return value as Record<string, unknown>;
}

export function printEnvSummary(): void {
  const env = process.env;
  const maskSecret = (value?: string) => {
    if (!value || value.length < 8) return '***';
    return `${value.substring(0, 4)}***${value.substring(value.length - 2)}`;
  };

  console.log('\n📋 Environment Configuration Summary:');
  console.log('  ├─ Server:     %s:%s (%s)', env.HOST || 'localhost', env.PORT || 3000, env.NODE_ENV || 'development');
  console.log('  ├─ Database:   %s', env.DATABASE_URL ? maskSecret(env.DATABASE_URL) : '❌ NOT SET');
  console.log('  ├─ Redis:      %s', env.REDIS_URL || 'redis://localhost:6379');
  console.log('  ├─ JWT:        %s', env.JWT_SECRET ? maskSecret(env.JWT_SECRET) : '❌ NOT SET');
  console.log('  ├─ SMTP:       %s:%s', env.SMTP_HOST || 'not set', env.SMTP_PORT || 'not set');
  console.log('  ├─ Stripe:     %s', env.STRIPE_SECRET_KEY ? maskSecret(env.STRIPE_SECRET_KEY) : 'not configured');
  console.log('  ├─ Docker:     %s', env.DOCKER_HOST || 'unix:///var/run/docker.sock');
  console.log('  ├─ CORS:       %s', env.CORS_ORIGIN || 'http://localhost:3001');
  console.log('  └─ Log Level:  %s', env.LOG_LEVEL || 'info');
  console.log('');
}

export default {
  validateEnv,
  printEnvSummary,
  envSchema,
};
