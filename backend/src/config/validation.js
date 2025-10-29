/**
 * Validation configuration
 */
const validationConfig = {
  // Password requirements
  password: {
    minLength: 8,
    maxLength: 128,
    requireUppercase: true,
    requireLowercase: true,
    requireNumbers: true,
    requireSpecialChars: true,
    specialChars: '@$!%*?&',
    minStrengthScore: 5, // Out of 8
    bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS) || 12,
  },

  // Email settings
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

  // VM resource limits
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
      min: 512, // MB
      max: 131072, // 128GB in MB
      minPerCpu: 512, // Minimum RAM per CPU core
    },
    storage: {
      min: 10, // GB
      max: 2048, // 2TB in GB
    },
    bandwidth: {
      min: 100, // GB
      max: 10000, // 10TB in GB
      default: 1000, // 1TB default
    },
  },

  // File upload limits
  fileUpload: {
    maxSize: parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024, // 10MB
    allowedImageTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
    allowedImageExtensions: ['.jpg', '.jpeg', '.png', '.gif', '.webp'],
    allowedDocumentTypes: ['application/pdf', 'text/plain'],
    allowedDocumentExtensions: ['.pdf', '.txt'],
  },

  // Pagination limits
  pagination: {
    defaultPage: 1,
    defaultLimit: 10,
    maxLimit: 100,
    maxLimitForReports: 1000,
  },

  // Date range limits
  dateRange: {
    maxDaysDefault: 365,
    maxDaysForReports: 1095, // 3 years
    maxDaysForAnalytics: 30,
  },

  // Rate limiting (requests per window)
  rateLimiting: {
    general: {
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 100,
    },
    auth: {
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 5, // 5 login attempts per 15 minutes
    },
    api: {
      windowMs: 60 * 1000, // 1 minute
      max: 60, // 60 requests per minute
    },
    upload: {
      windowMs: 60 * 1000, // 1 minute
      max: 10, // 10 uploads per minute
    },
  },

  // Input sanitization
  sanitization: {
    removeHtml: true,
    removeScripts: true,
    trimWhitespace: true,
    maxStringLength: 10000,
  },

  // Billing validation
  billing: {
    currency: {
      default: 'USD',
      supported: ['USD', 'EUR', 'GBP'],
    },
    amount: {
      min: 0.01,
      max: 10000.00,
      precision: 2,
    },
    invoice: {
      numberPattern: /^INV-\d{4}-\d{6}$/,
    },
  },

  // Solar data validation
  solar: {
    production: {
      min: 0,
      max: 1000, // kWh
    },
    consumption: {
      min: 0,
      max: 1000, // kWh
    },
    efficiency: {
      min: 0,
      max: 100, // percentage
    },
    temperature: {
      min: -50, // Celsius
      max: 70,
    },
    solarIrradiance: {
      min: 0,
      max: 1500, // W/m²
    },
  },

  // Admin validation
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

  // Notification validation
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

  // Backup validation
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
};

/**
 * Get validation config for a specific section
 * @param {string} section - Config section name
 * @returns {Object} Section configuration
 */
const getValidationConfig = (section) => {
  return validationConfig[section] || {};
};

/**
 * Check if a feature is enabled
 * @param {string} feature - Feature name
 * @returns {boolean} Is feature enabled
 */
const isFeatureEnabled = (feature) => {
  const featureFlags = {
    allowDisposableEmail: validationConfig.email.allowDisposable,
    strictPasswordValidation: process.env.STRICT_PASSWORD_VALIDATION !== 'false',
    enableFileUpload: process.env.ENABLE_FILE_UPLOAD !== 'false',
    enableSolarValidation: process.env.ENABLE_SOLAR_MONITORING !== 'false',
  };

  return featureFlags[feature] !== false;
};

/**
 * Get environment-specific validation overrides
 * @returns {Object} Environment overrides
 */
const getEnvironmentOverrides = () => {
  const env = process.env.NODE_ENV || 'development';
  
  const overrides = {
    development: {
      password: {
        minStrengthScore: 3, // Relaxed for development
      },
      rateLimiting: {
        general: { max: 1000 },
        auth: { max: 50 },
      },
    },
    test: {
      password: {
        bcryptRounds: 4, // Faster for tests
        minStrengthScore: 1,
      },
      rateLimiting: {
        general: { max: 10000 },
        auth: { max: 1000 },
      },
    },
    production: {
      password: {
        minStrengthScore: 6, // Stricter for production
      },
      email: {
        allowDisposable: false,
      },
    },
  };

  return overrides[env] || {};
};

/**
 * Merge configuration with environment overrides
 * @param {string} section - Config section
 * @returns {Object} Merged configuration
 */
const getMergedConfig = (section) => {
  const baseConfig = getValidationConfig(section);
  const overrides = getEnvironmentOverrides();
  const sectionOverrides = overrides[section] || {};

  return {
    ...baseConfig,
    ...sectionOverrides,
  };
};

module.exports = {
  validationConfig,
  getValidationConfig,
  isFeatureEnabled,
  getEnvironmentOverrides,
  getMergedConfig,
};