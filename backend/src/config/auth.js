/**
 * Authentication configuration
 */
const authConfig = {
  // JWT settings
  jwt: {
    secret: process.env.JWT_SECRET || 'sahary-cloud-jwt-secret',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'sahary-cloud-refresh-secret',
    expiresIn: process.env.JWT_EXPIRE || '30d',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRE || '7d',
    issuer: 'sahary-cloud',
    audience: 'sahary-cloud-users',
    algorithm: 'HS256',
  },

  // Session settings
  session: {
    secret: process.env.SESSION_SECRET || 'sahary-cloud-session-secret',
    maxAge: parseInt(process.env.SESSION_MAX_AGE) || 24 * 60 * 60 * 1000, // 24 hours
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'strict',
  },

  // Password settings
  password: {
    bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS) || 12,
    minLength: 8,
    maxLength: 128,
    requireUppercase: true,
    requireLowercase: true,
    requireNumbers: true,
    requireSpecialChars: true,
    specialChars: '@$!%*?&',
  },

  // Token expiration times
  tokenExpiration: {
    accessToken: '15m', // 15 minutes
    refreshToken: '7d', // 7 days
    emailVerification: '24h', // 24 hours
    passwordReset: '1h', // 1 hour
    rememberMe: '30d', // 30 days
  },

  // Rate limiting
  rateLimiting: {
    auth: {
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 5, // 5 attempts per window
    },
    general: {
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 20, // 20 requests per window
    },
    passwordReset: {
      windowMs: 60 * 60 * 1000, // 1 hour
      max: 3, // 3 attempts per hour
    },
  },

  // Account lockout settings
  lockout: {
    enabled: process.env.ENABLE_ACCOUNT_LOCKOUT !== 'false',
    maxAttempts: parseInt(process.env.MAX_LOGIN_ATTEMPTS) || 5,
    lockoutDuration: parseInt(process.env.LOCKOUT_DURATION) || 30 * 60 * 1000, // 30 minutes
  },

  // Email verification settings
  emailVerification: {
    required: process.env.REQUIRE_EMAIL_VERIFICATION !== 'false',
    resendCooldown: 5 * 60 * 1000, // 5 minutes
    maxResendAttempts: 3,
  },

  // OAuth settings (for future implementation)
  oauth: {
    google: {
      enabled: process.env.GOOGLE_OAUTH_ENABLED === 'true',
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    },
    github: {
      enabled: process.env.GITHUB_OAUTH_ENABLED === 'true',
      clientId: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
    },
  },

  // Security headers
  security: {
    cors: {
      origin: process.env.CORS_ORIGIN || 'http://localhost:3001',
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    },
    helmet: {
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", "data:", "https:"],
        },
      },
    },
  },

  // Cookie settings
  cookies: {
    refreshToken: {
      name: 'refreshToken',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    },
    session: {
      name: 'sessionId',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    },
  },

  // Audit logging
  audit: {
    enabled: process.env.ENABLE_AUDIT_LOGGING !== 'false',
    events: [
      'USER_REGISTERED',
      'USER_LOGIN',
      'USER_LOGOUT',
      'LOGIN_FAILED',
      'PASSWORD_CHANGED',
      'PASSWORD_RESET_REQUESTED',
      'PASSWORD_RESET_COMPLETED',
      'EMAIL_VERIFIED',
      'EMAIL_VERIFICATION_RESENT',
      'TOKEN_REFRESHED',
      'PROFILE_UPDATED',
      'ACCOUNT_LOCKED',
      'ACCOUNT_UNLOCKED',
    ],
  },

  // Feature flags
  features: {
    registration: process.env.ENABLE_REGISTRATION !== 'false',
    socialLogin: process.env.ENABLE_SOCIAL_LOGIN === 'true',
    twoFactorAuth: process.env.ENABLE_2FA === 'true',
    rememberMe: process.env.ENABLE_REMEMBER_ME !== 'false',
    accountLockout: process.env.ENABLE_ACCOUNT_LOCKOUT !== 'false',
  },

  // Environment-specific overrides
  development: {
    jwt: {
      expiresIn: '7d', // Longer expiration for development
    },
    password: {
      bcryptRounds: 4, // Faster hashing for development
    },
    rateLimiting: {
      auth: { max: 100 },
      general: { max: 1000 },
    },
  },

  test: {
    jwt: {
      expiresIn: '1h',
    },
    password: {
      bcryptRounds: 4,
    },
    rateLimiting: {
      auth: { max: 1000 },
      general: { max: 10000 },
    },
  },

  production: {
    jwt: {
      expiresIn: '15m', // Shorter expiration for production
    },
    password: {
      bcryptRounds: 12,
    },
    lockout: {
      enabled: true,
      maxAttempts: 3, // Stricter in production
    },
  },
};

/**
 * Get configuration for current environment
 * @returns {Object} Merged configuration
 */
const getAuthConfig = () => {
  const env = process.env.NODE_ENV || 'development';
  const envConfig = authConfig[env] || {};
  
  // Deep merge environment-specific config
  const mergeDeep = (target, source) => {
    for (const key in source) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        target[key] = target[key] || {};
        mergeDeep(target[key], source[key]);
      } else {
        target[key] = source[key];
      }
    }
    return target;
  };

  return mergeDeep({ ...authConfig }, envConfig);
};

/**
 * Validate required environment variables
 * @returns {Array} Missing environment variables
 */
const validateAuthConfig = () => {
  const required = [
    'JWT_SECRET',
    'JWT_REFRESH_SECRET',
  ];

  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0 && process.env.NODE_ENV !== 'test') {
    console.warn('Missing required auth environment variables:', missing);
  }

  return missing;
};

/**
 * Check if a feature is enabled
 * @param {string} feature - Feature name
 * @returns {boolean} Is feature enabled
 */
const isFeatureEnabled = (feature) => {
  const config = getAuthConfig();
  return config.features[feature] === true;
};

/**
 * Get rate limiting config for a specific type
 * @param {string} type - Rate limit type (auth, general, passwordReset)
 * @returns {Object} Rate limiting configuration
 */
const getRateLimitConfig = (type = 'general') => {
  const config = getAuthConfig();
  return config.rateLimiting[type] || config.rateLimiting.general;
};

module.exports = {
  authConfig,
  getAuthConfig,
  validateAuthConfig,
  isFeatureEnabled,
  getRateLimitConfig,
};