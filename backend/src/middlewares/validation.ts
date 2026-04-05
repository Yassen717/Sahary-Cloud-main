import { z } from 'zod';

type NextFunction = (error?: unknown) => void;

type ValidationRequest = {
  body?: unknown;
  query?: unknown;
  params?: unknown;
  validationPassed?: boolean;
  validatedAt?: string;
};

type ValidationResponse = {
  status(code: number): ValidationResponse;
  json(payload: unknown): unknown;
};

type ValidationMiddleware = (req: ValidationRequest, res: ValidationResponse, next: NextFunction) => Promise<void> | void;

type ValidationOptions = {
  allowUnknown?: boolean;
  stripUnknown?: boolean;
  customErrorHandler?: (error: unknown, req: ValidationRequest, res: ValidationResponse, next: NextFunction) => void;
};

type ValidationErrorResult = {
  isValid: boolean;
  errors: string[];
  warnings?: string[];
  score?: number;
  strength?: string;
  feedback?: string[];
  estimatedHourlyCost?: number;
  diffDays?: number;
  domain?: string;
};

const sanitizeInput = (data: unknown): unknown => {
  if (typeof data === 'string') {
    return data
      .trim()
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/javascript:/gi, '')
      .replace(/on\w+\s*=/gi, '');
  }

  if (Array.isArray(data)) {
    return data.map((item) => sanitizeInput(item));
  }

  if (typeof data === 'object' && data !== null) {
    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      sanitized[key] = sanitizeInput(value);
    }
    return sanitized;
  }

  return data;
};

const validate = (schema: z.ZodTypeAny): ValidationMiddleware => {
  return async (req, res, next) => {
    try {
      const validatedData = await schema.parseAsync({
        body: req.body,
        query: req.query,
        params: req.params,
      });

      req.body = validatedData.body || req.body;
      req.query = validatedData.query || req.query;
      req.params = validatedData.params || req.params;

      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        const formattedErrors = error.errors.map((issue) => {
          const received = 'received' in issue ? issue.received : undefined;
          return {
            field: issue.path.join('.'),
            message: issue.message,
            code: issue.code,
            ...(received !== undefined ? { received } : {}),
          };
        });

        res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: formattedErrors,
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const message = error instanceof Error ? error.message : 'Validation error';
      res.status(400).json({
        success: false,
        error: 'Validation error',
        message,
        timestamp: new Date().toISOString(),
      });
    }
  };
};

const sanitize: ValidationMiddleware = (req, res, next) => {
  try {
    if (req.body) {
      req.body = sanitizeInput(req.body);
    }

    if (req.query) {
      req.query = sanitizeInput(req.query);
    }

    if (req.params) {
      req.params = sanitizeInput(req.params);
    }

    next();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Input sanitization failed';
    res.status(400).json({
      success: false,
      error: 'Input sanitization failed',
      message,
      timestamp: new Date().toISOString(),
    });
  }
};

const customValidators = {
  isCuid: (value: string): boolean => {
    const cuidRegex = /^c[a-z0-9]{24}$/;
    return cuidRegex.test(value);
  },

  isValidEmail: (email: string): boolean => {
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    return emailRegex.test(email);
  },

  validatePasswordStrength: (password: string): ValidationErrorResult => {
    let score = 0;
    const feedback: string[] = [];

    if (password.length >= 8) score += 1;
    else feedback.push('Password should be at least 8 characters long');

    if (password.length >= 12) score += 1;

    if (/[a-z]/.test(password)) score += 1;
    else feedback.push('Password should contain lowercase letters');

    if (/[A-Z]/.test(password)) score += 1;
    else feedback.push('Password should contain uppercase letters');

    if (/\d/.test(password)) score += 1;
    else feedback.push('Password should contain numbers');

    if (/[@$!%*?&]/.test(password)) score += 1;
    else feedback.push('Password should contain special characters');

    if (!/(.)\1{2,}/.test(password)) score += 1;
    else feedback.push('Password should not contain repeated characters');

    const strength = score >= 6 ? 'strong' : score >= 4 ? 'medium' : 'weak';

    return {
      score,
      strength,
      feedback,
      errors: [],
      isValid: score >= 4,
    };
  },

  validateVMResources: (resources: { cpu: number; ram: number; storage: number; bandwidth?: number }): ValidationErrorResult => {
    const { cpu, ram, storage, bandwidth } = resources;
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!Number.isInteger(cpu) || cpu < 1 || cpu > 32) {
      errors.push('CPU cores must be between 1 and 32');
    }

    if (!Number.isInteger(ram) || ram < 512 || ram > 131072) {
      errors.push('RAM must be between 512MB and 128GB');
    }

    if (!Number.isInteger(storage) || storage < 10 || storage > 2048) {
      errors.push('Storage must be between 10GB and 2TB');
    }

    if (bandwidth !== undefined && (!Number.isInteger(bandwidth) || bandwidth < 100 || bandwidth > 10000)) {
      errors.push('Bandwidth must be between 100GB and 10TB');
    }

    if (cpu && ram) {
      const minRamPerCore = 512;
      if (ram < cpu * minRamPerCore) {
        errors.push(`RAM should be at least ${cpu * minRamPerCore}MB for ${cpu} CPU core(s)`);
      }

      if (cpu > 4 && ram < 4096) {
        warnings.push('High CPU count with low RAM may impact performance');
      }
    }

    if (ram && storage) {
      const minStorageGB = Math.max(10, Math.ceil(ram / 1024) * 2);
      if (storage < minStorageGB) {
        warnings.push(`Consider at least ${minStorageGB}GB storage for ${ram}MB RAM`);
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      estimatedHourlyCost: customValidators.calculateVMCost(resources),
    };
  },

  calculateVMCost: (resources: { cpu: number; ram: number; storage: number; bandwidth?: number }): number => {
    const { cpu, ram, storage, bandwidth = 1000 } = resources;

    const cpuCost = cpu * 0.01;
    const ramCost = (ram / 1024) * 0.005;
    const storageCost = storage * 0.0001;
    const bandwidthCost = (bandwidth / 1000) * 0.001;

    return Number((cpuCost + ramCost + storageCost + bandwidthCost).toFixed(4));
  },

  validateDateRange: (
    startDate: string | Date,
    endDate: string | Date,
    options: { maxDays?: number; allowFuture?: boolean; allowPast?: boolean } = {},
  ): ValidationErrorResult => {
    const { maxDays = 365 } = options;

    const errors: string[] = [];
    const start = new Date(startDate);
    const end = new Date(endDate);
    const now = new Date();

    if (Number.isNaN(start.getTime())) {
      errors.push('Invalid start date');
    }

    if (Number.isNaN(end.getTime())) {
      errors.push('Invalid end date');
    }

    if (errors.length > 0) {
      return { isValid: false, errors };
    }

    if (start > end) {
      errors.push('Start date must be before or equal to end date');
    }

    if (end > now) {
      errors.push('End date cannot be in the future');
    }

    const diffDays = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
    if (diffDays > maxDays) {
      errors.push(`Date range cannot exceed ${maxDays} days`);
    }

    return {
      isValid: errors.length === 0,
      errors,
      diffDays,
    };
  },
};

const createValidator = (schema: z.ZodTypeAny, options: ValidationOptions = {}): ValidationMiddleware => {
  const { customErrorHandler } = options;

  return async (req, res, next) => {
    try {
      const validatedData = await schema.parseAsync(
        {
          body: req.body,
          query: req.query,
          params: req.params,
        },
      );

      req.body = validatedData.body || req.body;
      req.query = validatedData.query || req.query;
      req.params = validatedData.params || req.params;
      req.validationPassed = true;
      req.validatedAt = new Date().toISOString();

      next();
    } catch (error) {
      if (customErrorHandler) {
        customErrorHandler(error, req, res, next);
        return;
      }

      if (error instanceof z.ZodError) {
        const formattedErrors = error.errors.map((issue) => {
          const received = 'received' in issue ? issue.received : undefined;
          return {
            field: issue.path.join('.'),
            message: issue.message,
            code: issue.code,
            ...(received !== undefined ? { received } : {}),
          };
        });

        res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: formattedErrors,
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const message = error instanceof Error ? error.message : 'Validation error';
      res.status(400).json({
        success: false,
        error: 'Validation error',
        message,
        timestamp: new Date().toISOString(),
      });
    }
  };
};

export {
  validate,
  sanitize,
  sanitizeInput,
  customValidators,
  createValidator,
};
