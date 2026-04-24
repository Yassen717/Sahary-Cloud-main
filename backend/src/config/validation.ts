type ValidationConfigMap = Record<string, Record<string, unknown>>;
type ValidationOverrideSet = Record<string, Record<string, unknown>>;

const validationConfig = {
  password: {
    minLength: 8,
    maxLength: 128,
    requireUppercase: true,
    requireLowercase: true,
    requireNumbers: true,
    requireSpecialChars: true,
    specialChars: '@$!%*?&',
    minStrengthScore: 5,
    bcryptRounds: Number.parseInt(process.env.BCRYPT_ROUNDS || '', 10) || 12,
  },
  email: {
    maxLength: 254,
    localPartMaxLength: 64,
    allowDisposable: process.env.ALLOW_DISPOSABLE_EMAIL === 'true',
    disposableDomains: [
      '10minutemail.com',
      'tempmail.org',
      'guerrillamail.com',
      'mailinator.com',
      'throwaway.email',
      'temp-mail.org',
      'yopmail.com',
    ],
  },
  vm: {
    name: {
      minLength: 3,
      maxLength: 50,
      pattern: /^[a-zA-Z0-9-_]+$/,
    },
    cpu: {
      min: 1,
      max: 32,
    },
    ram: {
      min: 512,
      max: 131072,
      minPerCpu: 512,
    },
    storage: {
      min: 10,
      max: 2048,
    },
    bandwidth: {
      min: 100,
      max: 10000,
      default: 1000,
    },
  },
  fileUpload: {
    maxSize: Number.parseInt(process.env.MAX_FILE_SIZE || '', 10) || 10 * 1024 * 1024,
    allowedImageTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
    allowedImageExtensions: ['.jpg', '.jpeg', '.png', '.gif', '.webp'],
    allowedDocumentTypes: ['application/pdf', 'text/plain'],
    allowedDocumentExtensions: ['.pdf', '.txt'],
  },
  pagination: {
    defaultPage: 1,
    defaultLimit: 10,
    maxLimit: 100,
    maxLimitForReports: 1000,
  },
  dateRange: {
    maxDaysDefault: 365,
    maxDaysForReports: 1095,
    maxDaysForAnalytics: 30,
  },
  rateLimiting: {
    general: {
      windowMs: 15 * 60 * 1000,
      max: 100,
    },
    auth: {
      windowMs: 15 * 60 * 1000,
      max: 5,
    },
    api: {
      windowMs: 60 * 1000,
      max: 60,
    },
    upload: {
      windowMs: 60 * 1000,
      max: 10,
    },
  },
  sanitization: {
    removeHtml: true,
    removeScripts: true,
    trimWhitespace: true,
    maxStringLength: 10000,
  },
  billing: {
    currency: {
      default: 'USD',
      supported: ['USD', 'EUR', 'GBP'],
    },
    amount: {
      min: 0.01,
      max: 10000.0,
      precision: 2,
    },
    invoice: {
      numberPattern: /^INV-\d{4}-\d{6}$/,
    },
  },
  solar: {
    production: {
      min: 0,
      max: 1000,
    },
    consumption: {
      min: 0,
      max: 1000,
    },
    efficiency: {
      min: 0,
      max: 100,
    },
    temperature: {
      min: -50,
      max: 70,
    },
    solarIrradiance: {
      min: 0,
      max: 1500,
    },
  },
  admin: {
    systemSettings: {
      keyPattern: /^[a-z_]+$/,
      keyMaxLength: 100,
      valueMaxLength: 1000,
      descriptionMaxLength: 500,
    },
    auditLog: {
      actionMaxLength: 100,
      resourceMaxLength: 100,
      reasonMaxLength: 500,
    },
  },
  notification: {
    title: {
      minLength: 5,
      maxLength: 100,
    },
    message: {
      minLength: 10,
      maxLength: 1000,
    },
  },
  backup: {
    name: {
      minLength: 3,
      maxLength: 100,
      pattern: /^[a-zA-Z0-9-_\s]+$/,
    },
    description: {
      maxLength: 500,
    },
  },
} as const;

const getValidationConfig = (section: string): Record<string, unknown> => {
  return (validationConfig as unknown as ValidationConfigMap)[section] || {};
};

const isFeatureEnabled = (feature: string): boolean => {
  const featureFlags: Record<string, boolean> = {
    allowDisposableEmail: validationConfig.email.allowDisposable,
    strictPasswordValidation: process.env.STRICT_PASSWORD_VALIDATION !== 'false',
    enableFileUpload: process.env.ENABLE_FILE_UPLOAD !== 'false',
    enableSolarValidation: process.env.ENABLE_SOLAR_MONITORING !== 'false',
  };

  return featureFlags[feature] !== false;
};

const getEnvironmentOverrides = (): Record<string, unknown> => {
  const env = process.env.NODE_ENV || 'development';

  const overrides: ValidationOverrideSet = {
    development: {
      password: {
        minStrengthScore: 3,
      },
      rateLimiting: {
        general: { max: 1000 },
        auth: { max: 50 },
      },
    },
    test: {
      password: {
        bcryptRounds: 4,
        minStrengthScore: 1,
      },
      rateLimiting: {
        general: { max: 10000 },
        auth: { max: 1000 },
      },
    },
    production: {
      password: {
        minStrengthScore: 6,
      },
      email: {
        allowDisposable: false,
      },
    },
  };

  return overrides[env] || {};
};

const getMergedConfig = (section: string): Record<string, unknown> => {
  const baseConfig = getValidationConfig(section);
  const overrides = getEnvironmentOverrides() as ValidationConfigMap;
  const sectionOverrides = overrides[section] || {};

  return {
    ...baseConfig,
    ...sectionOverrides,
  };
};

export {
  validationConfig,
  getValidationConfig,
  isFeatureEnabled,
  getEnvironmentOverrides,
  getMergedConfig,
};

export default validationConfig;