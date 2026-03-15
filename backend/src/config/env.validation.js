const Joi = require('joi');

/**
 * Environment Variables Validation
 * Validates all required and optional environment variables on startup
 * Uses Joi for schema validation with clear, categorized error messages
 */

// ─── Validation Schema ──────────────────────────────────────────────────────

const envSchema = Joi.object({
    // ── Server Configuration ──────────────────────────────────────────────────
    NODE_ENV: Joi.string()
        .valid('development', 'production', 'test', 'staging')
        .default('development')
        .description('Application environment'),
    PORT: Joi.number()
        .integer()
        .min(1)
        .max(65535)
        .default(3000)
        .description('Server port'),
    HOST: Joi.string()
        .default('localhost')
        .description('Server host'),

    // ── Database Configuration ────────────────────────────────────────────────
    DATABASE_URL: Joi.string()
        .uri({ scheme: ['postgresql', 'postgres'] })
        .required()
        .description('PostgreSQL connection URL'),

    // ── Redis Configuration ───────────────────────────────────────────────────
    REDIS_URL: Joi.string()
        .uri({ scheme: ['redis', 'rediss'] })
        .default('redis://localhost:6379')
        .description('Redis connection URL'),
    REDIS_PASSWORD: Joi.string()
        .allow('')
        .default('')
        .description('Redis password'),
    REDIS_DEFAULT_TTL: Joi.number()
        .integer()
        .min(0)
        .default(3600)
        .description('Redis default TTL in seconds'),
    CACHE_CLEANUP_SCHEDULE: Joi.string()
        .default('0 * * * *')
        .description('Cache cleanup cron schedule'),

    // ── JWT Configuration ─────────────────────────────────────────────────────
    JWT_SECRET: Joi.string()
        .min(16)
        .required()
        .description('JWT signing secret (min 16 characters)'),
    JWT_EXPIRE: Joi.string()
        .default('30d')
        .description('JWT access token expiration'),
    JWT_REFRESH_SECRET: Joi.string()
        .min(16)
        .required()
        .description('JWT refresh token secret (min 16 characters)'),
    JWT_REFRESH_EXPIRE: Joi.string()
        .default('7d')
        .description('JWT refresh token expiration'),

    // ── Session Configuration ─────────────────────────────────────────────────
    SESSION_SECRET: Joi.string()
        .min(16)
        .required()
        .description('Session signing secret (min 16 characters)'),
    SESSION_MAX_AGE: Joi.number()
        .integer()
        .min(0)
        .default(86400000)
        .description('Session max age in milliseconds'),

    // ── Email Configuration (SMTP) ────────────────────────────────────────────
    SMTP_HOST: Joi.string()
        .default('smtp.gmail.com')
        .description('SMTP server hostname'),
    SMTP_PORT: Joi.number()
        .integer()
        .valid(25, 465, 587, 2525)
        .default(587)
        .description('SMTP server port'),
    SMTP_SECURE: Joi.boolean()
        .default(false)
        .description('Use TLS for SMTP'),
    SMTP_USER: Joi.string()
        .when('NODE_ENV', {
            is: 'production',
            then: Joi.required(),
            otherwise: Joi.optional().default(''),
        })
        .description('SMTP username'),
    SMTP_PASS: Joi.string()
        .when('NODE_ENV', {
            is: 'production',
            then: Joi.required(),
            otherwise: Joi.optional().default(''),
        })
        .description('SMTP password'),
    FROM_EMAIL: Joi.string()
        .email()
        .default('noreply@saharycloud.com')
        .description('Default sender email'),
    FROM_NAME: Joi.string()
        .default('Sahary Cloud')
        .description('Default sender name'),

    // ── Payment Gateway (Stripe) ──────────────────────────────────────────────
    STRIPE_SECRET_KEY: Joi.string()
        .pattern(/^sk_(test|live)_/)
        .when('NODE_ENV', {
            is: 'production',
            then: Joi.required(),
            otherwise: Joi.optional().default(''),
        })
        .description('Stripe secret API key'),
    STRIPE_PUBLISHABLE_KEY: Joi.string()
        .pattern(/^pk_(test|live)_/)
        .when('NODE_ENV', {
            is: 'production',
            then: Joi.required(),
            otherwise: Joi.optional().default(''),
        })
        .description('Stripe publishable API key'),
    STRIPE_WEBHOOK_SECRET: Joi.string()
        .when('NODE_ENV', {
            is: 'production',
            then: Joi.required(),
            otherwise: Joi.optional().default(''),
        })
        .description('Stripe webhook signing secret'),

    // ── Solar Energy Monitoring ───────────────────────────────────────────────
    SOLAR_API_URL: Joi.string()
        .uri()
        .default('http://localhost:8080')
        .description('Solar monitoring API URL'),
    SOLAR_API_KEY: Joi.string()
        .default('')
        .description('Solar monitoring API key'),
    SOLAR_COLLECTION_SCHEDULE: Joi.string()
        .default('*/15 * * * *')
        .description('Solar data collection cron schedule'),

    // ── Solar Alert Thresholds ────────────────────────────────────────────────
    LOW_PRODUCTION_THRESHOLD: Joi.number()
        .min(0).max(100)
        .default(20)
        .description('Low solar production alert threshold (%)'),
    CRITICAL_PRODUCTION_THRESHOLD: Joi.number()
        .min(0).max(100)
        .default(10)
        .description('Critical solar production alert threshold (%)'),
    LOW_BATTERY_THRESHOLD: Joi.number()
        .min(0).max(100)
        .default(30)
        .description('Low battery alert threshold (%)'),
    CRITICAL_BATTERY_THRESHOLD: Joi.number()
        .min(0).max(100)
        .default(15)
        .description('Critical battery alert threshold (%)'),
    HIGH_CONSUMPTION_THRESHOLD: Joi.number()
        .min(0).max(100)
        .default(90)
        .description('High consumption alert threshold (%)'),

    // ── Docker Configuration ──────────────────────────────────────────────────
    DOCKER_HOST: Joi.string()
        .default('unix:///var/run/docker.sock')
        .description('Docker daemon socket path or TCP address'),
    DOCKER_REGISTRY: Joi.string()
        .default('registry.saharycloud.com')
        .description('Docker registry URL'),
    DOCKER_TLS_VERIFY: Joi.boolean()
        .default(false)
        .description('Enable TLS verification for Docker daemon'),
    DOCKER_CERT_PATH: Joi.string()
        .when('DOCKER_TLS_VERIFY', {
            is: true,
            then: Joi.required(),
            otherwise: Joi.optional().default(''),
        })
        .description('Path to Docker TLS certificates'),
    DOCKER_VM_NETWORK: Joi.string()
        .default('sahary-vm-network')
        .description('Docker network name for VM isolation'),
    DOCKER_VM_SUBNET: Joi.string()
        .default('172.25.0.0/16')
        .description('Docker VM network subnet'),

    // ── Shared Hosting / Nginx VHost ─────────────────────────────────────────
    HOSTING_NGINX_ENABLED: Joi.boolean()
        .default(false)
        .description('Enable Nginx vhost provisioning actions'),
    HOSTING_NGINX_SITES_AVAILABLE: Joi.string()
        .default('/etc/nginx/sites-available')
        .description('Nginx sites-available directory'),
    HOSTING_NGINX_SITES_ENABLED: Joi.string()
        .default('/etc/nginx/sites-enabled')
        .description('Nginx sites-enabled directory'),
    HOSTING_NGINX_TEST_COMMAND: Joi.string()
        .default('nginx -t')
        .description('Nginx config test command'),
    HOSTING_NGINX_RELOAD_COMMAND: Joi.string()
        .default('nginx -s reload')
        .description('Nginx reload command'),
    HOSTING_WWW_BASE: Joi.string()
        .default('/var/www')
        .description('Base directory for hosting document roots'),
    HOSTING_BASE_DOMAIN: Joi.string()
        .default('sahary.cloud')
        .description('Base domain for auto-assigned hosting subdomains'),

    // ── File Upload Configuration ─────────────────────────────────────────────
    MAX_FILE_SIZE: Joi.number()
        .integer()
        .min(1024)
        .default(10485760)
        .description('Max file upload size in bytes'),
    UPLOAD_PATH: Joi.string()
        .default('./uploads')
        .description('File upload directory path'),

    // ── Rate Limiting ─────────────────────────────────────────────────────────
    RATE_LIMIT_WINDOW_MS: Joi.number()
        .integer()
        .min(1000)
        .default(900000)
        .description('Rate limit window in milliseconds'),
    RATE_LIMIT_MAX_REQUESTS: Joi.number()
        .integer()
        .min(1)
        .default(100)
        .description('Max requests per rate limit window'),

    // ── Logging ───────────────────────────────────────────────────────────────
    LOG_LEVEL: Joi.string()
        .valid('error', 'warn', 'info', 'http', 'verbose', 'debug', 'silly')
        .default('info')
        .description('Winston log level'),
    LOG_FILE_PATH: Joi.string()
        .default('./logs')
        .description('Log files directory path'),

    // ── Error Tracking ────────────────────────────────────────────────────────
    ERROR_THRESHOLD: Joi.number()
        .integer()
        .min(1)
        .default(10)
        .description('Error count threshold for alerts'),
    ERROR_TIME_WINDOW: Joi.number()
        .integer()
        .min(1000)
        .default(60000)
        .description('Error tracking time window in ms'),

    // ── Performance Monitoring ────────────────────────────────────────────────
    SLOW_REQUEST_THRESHOLD: Joi.number()
        .integer()
        .min(100)
        .default(1000)
        .description('Slow request threshold in ms'),

    // ── DDoS Protection ───────────────────────────────────────────────────────
    DDOS_REQUEST_THRESHOLD: Joi.number()
        .integer()
        .min(10)
        .default(100)
        .description('DDoS request threshold'),
    DDOS_TIME_WINDOW: Joi.number()
        .integer()
        .min(1000)
        .default(60000)
        .description('DDoS detection time window in ms'),
    DDOS_BLOCK_DURATION: Joi.number()
        .integer()
        .min(1000)
        .default(3600000)
        .description('DDoS block duration in ms'),
    MAX_CONNECTIONS_PER_IP: Joi.number()
        .integer()
        .min(1)
        .default(10)
        .description('Max concurrent connections per IP'),

    // ── Security ──────────────────────────────────────────────────────────────
    BCRYPT_ROUNDS: Joi.number()
        .integer()
        .min(4)
        .max(20)
        .default(12)
        .description('Bcrypt hashing rounds'),
    CORS_ORIGIN: Joi.string()
        .default('http://localhost:3001')
        .description('Allowed CORS origin'),

    // ── Application URLs ──────────────────────────────────────────────────────
    FRONTEND_URL: Joi.string()
        .uri()
        .default('http://localhost:3001')
        .description('Frontend application URL'),
    BACKEND_URL: Joi.string()
        .uri()
        .default('http://localhost:3000')
        .description('Backend application URL'),
    API_BASE_URL: Joi.string()
        .default('/api/v1')
        .description('API base URL path'),

    // ── Feature Flags ─────────────────────────────────────────────────────────
    ENABLE_SOLAR_MONITORING: Joi.boolean()
        .default(true)
        .description('Enable solar energy monitoring'),
    ENABLE_PAYMENTS: Joi.boolean()
        .default(true)
        .description('Enable payment processing'),
    ENABLE_EMAIL_NOTIFICATIONS: Joi.boolean()
        .default(true)
        .description('Enable email notifications'),

}).options({
    // Allow unknown env vars (system vars, npm vars, etc.)
    allowUnknown: true,
    // Strip unknown vars from the validated output
    stripUnknown: false,
    // Report all errors, not just the first one
    abortEarly: false,
});

// ─── Validation Function ────────────────────────────────────────────────────

/**
 * Validate environment variables against the schema
 * @returns {Object} Validated and defaulted environment variables
 * @throws {Error} If required variables are missing or invalid
 */
function validateEnv() {
    const { error, value } = envSchema.validate(process.env);

    if (error) {
        const errors = error.details;
        const requiredErrors = [];
        const warnings = [];

        errors.forEach((err) => {
            const key = err.context?.key || err.path.join('.');
            const message = err.message.replace(/"/g, '');

            // Check if this is a required field error
            if (err.type === 'any.required' || err.type === 'string.min') {
                requiredErrors.push({ key, message });
            } else {
                warnings.push({ key, message });
            }
        });

        // Print errors grouped
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

        // For non-required validation errors, log warnings but continue
        if (warnings.length > 0) {
            console.warn('⚠️  Server will start with default values for invalid variables.\n');
        }
    }

    // Log success
    console.log('✅ Environment variables validated successfully');

    return value;
}

// ─── Summary Function ───────────────────────────────────────────────────────

/**
 * Print a summary of the current environment configuration
 * Useful for debugging startup issues
 */
function printEnvSummary() {
    const env = process.env;
    const maskSecret = (val) => {
        if (!val || val.length < 8) return '***';
        return val.substring(0, 4) + '***' + val.substring(val.length - 2);
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

module.exports = {
    validateEnv,
    printEnvSummary,
    envSchema,
};
