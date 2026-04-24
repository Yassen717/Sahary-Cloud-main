type RateLimitRule = {
  windowMs: number;
  max: number;
};

type JwtSettings = {
  secret?: string;
  refreshSecret?: string;
  expiresIn: string;
  refreshExpiresIn: string;
  issuer: string;
  audience: string;
  algorithm: 'HS256';
};

type SessionSettings = {
  secret?: string;
  maxAge: number;
  secure: boolean;
  httpOnly: boolean;
  sameSite: 'strict';
};

type PasswordSettings = {
  bcryptRounds: number;
  minLength: number;
  maxLength: number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireNumbers: boolean;
  requireSpecialChars: boolean;
  specialChars: string;
};

type TokenExpirationSettings = {
  accessToken: string;
  refreshToken: string;
  emailVerification: string;
  passwordReset: string;
  rememberMe: string;
};

type RateLimitingSettings = {
  auth: RateLimitRule;
  general: RateLimitRule;
  passwordReset: RateLimitRule;
};

type LockoutSettings = {
  enabled: boolean;
  maxAttempts: number;
  lockoutDuration: number;
};

type EmailVerificationSettings = {
  required: boolean;
  resendCooldown: number;
  maxResendAttempts: number;
};

type OAuthProviderSettings = {
  enabled: boolean;
  clientId?: string;
  clientSecret?: string;
};

type OAuthSettings = {
  google: OAuthProviderSettings;
  github: OAuthProviderSettings;
};

type SecurityHeadersSettings = {
  cors: {
    origin: string;
    credentials: boolean;
    methods: string[];
    allowedHeaders: string[];
  };
  helmet: {
    contentSecurityPolicy: {
      directives: Record<string, string[]>;
    };
  };
};

type CookieSettings = {
  refreshToken: {
    name: string;
    httpOnly: boolean;
    secure: boolean;
    sameSite: 'strict';
    maxAge: number;
  };
  session: {
    name: string;
    httpOnly: boolean;
    secure: boolean;
    sameSite: 'strict';
    maxAge: number;
  };
};

type AuditSettings = {
  enabled: boolean;
  events: string[];
};

type FeatureSettings = {
  registration: boolean;
  socialLogin: boolean;
  twoFactorAuth: boolean;
  rememberMe: boolean;
  accountLockout: boolean;
};

type EnvironmentOverrides = {
  jwt?: Partial<Pick<JwtSettings, 'expiresIn'>>;
  password?: Partial<Pick<PasswordSettings, 'bcryptRounds'>>;
  rateLimiting?: Partial<RateLimitingSettings>;
  lockout?: Partial<LockoutSettings>;
};

type AuthConfig = {
  jwt: JwtSettings;
  session: SessionSettings;
  password: PasswordSettings;
  tokenExpiration: TokenExpirationSettings;
  rateLimiting: RateLimitingSettings;
  lockout: LockoutSettings;
  emailVerification: EmailVerificationSettings;
  oauth: OAuthSettings;
  security: SecurityHeadersSettings;
  cookies: CookieSettings;
  audit: AuditSettings;
  features: FeatureSettings;
  development: EnvironmentOverrides;
  test: EnvironmentOverrides;
  production: EnvironmentOverrides;
};

type PlainObject = Record<string, unknown>;

const authConfig: AuthConfig = {
  jwt: {
    secret: process.env.JWT_SECRET,
    refreshSecret: process.env.JWT_REFRESH_SECRET,
    expiresIn: process.env.JWT_EXPIRE || '30d',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRE || '7d',
    issuer: 'sahary-cloud',
    audience: 'sahary-cloud-users',
    algorithm: 'HS256',
  },
  session: {
    secret: process.env.SESSION_SECRET,
    maxAge: Number.parseInt(process.env.SESSION_MAX_AGE || String(24 * 60 * 60 * 1000), 10),
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'strict',
  },
  password: {
    bcryptRounds: Number.parseInt(process.env.BCRYPT_ROUNDS || '12', 10),
    minLength: 8,
    maxLength: 128,
    requireUppercase: true,
    requireLowercase: true,
    requireNumbers: true,
    requireSpecialChars: true,
    specialChars: '@$!%*?&',
  },
  tokenExpiration: {
    accessToken: '15m',
    refreshToken: '7d',
    emailVerification: '24h',
    passwordReset: '1h',
    rememberMe: '30d',
  },
  rateLimiting: {
    auth: {
      windowMs: 15 * 60 * 1000,
      max: 5,
    },
    general: {
      windowMs: 15 * 60 * 1000,
      max: 20,
    },
    passwordReset: {
      windowMs: 60 * 60 * 1000,
      max: 3,
    },
  },
  lockout: {
    enabled: process.env.ENABLE_ACCOUNT_LOCKOUT !== 'false',
    maxAttempts: Number.parseInt(process.env.MAX_LOGIN_ATTEMPTS || '5', 10),
    lockoutDuration: Number.parseInt(process.env.LOCKOUT_DURATION || String(30 * 60 * 1000), 10),
  },
  emailVerification: {
    required: process.env.REQUIRE_EMAIL_VERIFICATION !== 'false',
    resendCooldown: 5 * 60 * 1000,
    maxResendAttempts: 3,
  },
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
          imgSrc: ["'self'", 'data:', 'https:'],
        },
      },
    },
  },
  cookies: {
    refreshToken: {
      name: 'refreshToken',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    },
    session: {
      name: 'sessionId',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 24 * 60 * 60 * 1000,
    },
  },
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
  features: {
    registration: process.env.ENABLE_REGISTRATION !== 'false',
    socialLogin: process.env.ENABLE_SOCIAL_LOGIN === 'true',
    twoFactorAuth: process.env.ENABLE_2FA === 'true',
    rememberMe: process.env.ENABLE_REMEMBER_ME !== 'false',
    accountLockout: process.env.ENABLE_ACCOUNT_LOCKOUT !== 'false',
  },
  development: {
    jwt: {
      expiresIn: '7d',
    },
    password: {
      bcryptRounds: 4,
    },
    rateLimiting: {
      auth: { windowMs: 15 * 60 * 1000, max: 100 },
      general: { windowMs: 15 * 60 * 1000, max: 1000 },
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
      auth: { windowMs: 15 * 60 * 1000, max: 1000 },
      general: { windowMs: 15 * 60 * 1000, max: 10000 },
    },
  },
  production: {
    jwt: {
      expiresIn: '15m',
    },
    password: {
      bcryptRounds: 12,
    },
    lockout: {
      enabled: true,
      maxAttempts: 3,
    },
  },
};

const mergeDeep = (target: PlainObject, source: PlainObject): PlainObject => {
  for (const key in source) {
    const sourceValue = source[key];

    if (sourceValue && typeof sourceValue === 'object' && !Array.isArray(sourceValue)) {
      const existingValue = target[key];
      const nextTarget = existingValue && typeof existingValue === 'object' && !Array.isArray(existingValue)
        ? { ...(existingValue as PlainObject) }
        : {};

      target[key] = mergeDeep(nextTarget, sourceValue as PlainObject);
    } else {
      target[key] = sourceValue;
    }
  }

  return target;
};

const getAuthConfig = (): AuthConfig => {
  const env = process.env.NODE_ENV || 'development';
  const envConfig = (authConfig as Record<string, PlainObject>)[env] || {};

  return mergeDeep({ ...authConfig }, envConfig) as AuthConfig;
};

const validateAuthConfig = (): string[] => {
  const required = ['JWT_SECRET', 'JWT_REFRESH_SECRET', 'SESSION_SECRET'];
  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    const message = `FATAL: Missing required secret environment variables: ${missing.join(', ')}. Set these in your .env file before starting the server.`;
    if (process.env.NODE_ENV === 'test') {
      console.warn('[test] ' + message);
    } else {
      throw new Error(message);
    }
  }

  return missing;
};

const isFeatureEnabled = (feature: string): boolean => {
  const config = getAuthConfig();
  return config.features[feature as keyof FeatureSettings] === true;
};

const getRateLimitConfig = (type: keyof RateLimitingSettings = 'general'): RateLimitRule => {
  const config = getAuthConfig();
  return config.rateLimiting[type] || config.rateLimiting.general;
};

export { authConfig, getAuthConfig, validateAuthConfig, isFeatureEnabled, getRateLimitConfig };

export default {
  authConfig,
  getAuthConfig,
  validateAuthConfig,
  isFeatureEnabled,
  getRateLimitConfig,
};