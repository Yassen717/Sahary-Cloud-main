import bcrypt from 'bcryptjs';

export interface PasswordStrengthResult {
  score: number;
  strength: 'invalid' | 'weak' | 'medium' | 'strong';
  feedback: string[];
  isValid: boolean;
}

export interface EmailValidationResult {
  isValid: boolean;
  errors: string[];
  domain?: string;
}

export interface VMResourcesInput {
  cpu: number;
  ram: number;
  storage: number;
  bandwidth?: number;
}

export interface VMResourcesValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  estimatedHourlyCost: number;
}

export interface DateRangeValidationOptions {
  maxDays?: number;
  allowFuture?: boolean;
  allowPast?: boolean;
}

export interface DateRangeValidationResult {
  isValid: boolean;
  errors: string[];
  diffDays?: number;
  start?: Date;
  end?: Date;
}

export interface FileUploadLike {
  size: number;
  mimetype: string;
  originalname: string;
}

export interface FileUploadValidationOptions {
  maxSize?: number;
  allowedTypes?: string[];
  allowedExtensions?: string[];
}

export interface FileUploadValidationResult {
  isValid: boolean;
  errors: string[];
  fileInfo?: {
    size: number;
    type: string;
    extension: string;
  };
}

export interface SanitizeStringOptions {
  removeHtml?: boolean;
  removeScripts?: boolean;
  trim?: boolean;
  maxLength?: number | null;
}

export interface PaginationValidationInput {
  page?: number | string;
  limit?: number | string;
}

export interface PaginationValidationResult {
  page: number;
  limit: number;
  skip: number;
  take: number;
}

const COMMON_PASSWORDS = [
  'password',
  '123456',
  '123456789',
  'qwerty',
  'abc123',
  'password123',
  'admin',
  'letmein',
  'welcome',
  'monkey',
];

class ValidationHelpers {
  static async hashPassword(password: string, rounds = 12): Promise<string> {
    const passwordValidation = this.validatePasswordStrength(password);
    if (!passwordValidation.isValid) {
      throw new Error(`Password validation failed: ${passwordValidation.feedback.join(', ')}`);
    }

    return bcrypt.hash(password, rounds);
  }

  static async comparePassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  static validatePasswordStrength(password: string): PasswordStrengthResult {
    let score = 0;
    const feedback: string[] = [];

    if (!password || typeof password !== 'string') {
      return {
        score: 0,
        strength: 'invalid',
        feedback: ['Password is required'],
        isValid: false,
      };
    }

    if (password.length >= 8) {
      score += 1;
    } else {
      feedback.push('Password must be at least 8 characters long');
    }

    if (password.length >= 12) {
      score += 1;
    }

    if (/[a-z]/.test(password)) {
      score += 1;
    } else {
      feedback.push('Password must contain lowercase letters');
    }

    if (/[A-Z]/.test(password)) {
      score += 1;
    } else {
      feedback.push('Password must contain uppercase letters');
    }

    if (/\d/.test(password)) {
      score += 1;
    } else {
      feedback.push('Password must contain numbers');
    }

    if (/[@$!%*?&]/.test(password)) {
      score += 1;
    } else {
      feedback.push('Password must contain special characters (@$!%*?&)');
    }

    if (!/(.)\1{2,}/.test(password)) {
      score += 1;
    } else {
      feedback.push('Password should not contain repeated characters');
    }

    if (!COMMON_PASSWORDS.includes(password.toLowerCase())) {
      score += 1;
    } else {
      feedback.push('Password is too common');
    }

    const strength: PasswordStrengthResult['strength'] = score >= 7 ? 'strong' : score >= 5 ? 'medium' : 'weak';

    return {
      score,
      strength,
      feedback,
      isValid: score >= 5,
    };
  }

  static validateEmail(email: string): EmailValidationResult {
    if (!email || typeof email !== 'string') {
      return {
        isValid: false,
        errors: ['Email is required'],
      };
    }

    const errors: string[] = [];

    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!emailRegex.test(email)) {
      errors.push('Invalid email format');
    }

    if (email.length > 254) {
      errors.push('Email is too long');
    }

    const [localPart] = email.split('@');
    if (localPart && localPart.length > 64) {
      errors.push('Email local part is too long');
    }

    const disposableDomains = [
      '10minutemail.com',
      'tempmail.org',
      'guerrillamail.com',
      'mailinator.com',
      'throwaway.email',
    ];

    const domain = email.split('@')[1]?.toLowerCase();
    if (domain && disposableDomains.includes(domain)) {
      errors.push('Disposable email addresses are not allowed');
    }

    return {
      isValid: errors.length === 0,
      errors,
      domain,
    };
  }

  static validateVMResources(resources: VMResourcesInput): VMResourcesValidationResult {
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

    const estimatedHourlyCost = this.calculateVMCost(resources);

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      estimatedHourlyCost,
    };
  }

  static calculateVMCost(resources: VMResourcesInput): number {
    const { cpu, ram, storage, bandwidth = 1000 } = resources;

    const cpuCost = cpu * 0.01;
    const ramCost = (ram / 1024) * 0.005;
    const storageCost = storage * 0.0001;
    const bandwidthCost = (bandwidth / 1000) * 0.001;

    return Number((cpuCost + ramCost + storageCost + bandwidthCost).toFixed(4));
  }

  static validateDateRange(
    startDate: string | Date,
    endDate: string | Date,
    options: DateRangeValidationOptions = {},
  ): DateRangeValidationResult {
    const {
      maxDays = 365,
      allowFuture = false,
      allowPast = true,
    } = options;

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

    if (!allowFuture && end > now) {
      errors.push('End date cannot be in the future');
    }

    if (!allowPast && start < now) {
      errors.push('Start date cannot be in the past');
    }

    const diffDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays > maxDays) {
      errors.push(`Date range cannot exceed ${maxDays} days`);
    }

    return {
      isValid: errors.length === 0,
      errors,
      diffDays,
      start,
      end,
    };
  }

  static validateFileUpload(
    file: FileUploadLike | null | undefined,
    options: FileUploadValidationOptions = {},
  ): FileUploadValidationResult {
    const {
      maxSize = 10 * 1024 * 1024,
      allowedTypes = ['image/jpeg', 'image/png', 'image/gif'],
      allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif'],
    } = options;

    const errors: string[] = [];

    if (!file) {
      return { isValid: false, errors: ['File is required'] };
    }

    if (file.size > maxSize) {
      errors.push(`File size cannot exceed ${Math.round(maxSize / 1024 / 1024)}MB`);
    }

    if (allowedTypes.length > 0 && !allowedTypes.includes(file.mimetype)) {
      errors.push(`File type not allowed. Allowed types: ${allowedTypes.join(', ')}`);
    }

    if (allowedExtensions.length > 0) {
      const fileExtension = file.originalname.toLowerCase().substring(file.originalname.lastIndexOf('.'));
      if (!allowedExtensions.includes(fileExtension)) {
        errors.push(`File extension not allowed. Allowed extensions: ${allowedExtensions.join(', ')}`);
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      fileInfo: {
        size: file.size,
        type: file.mimetype,
        extension: file.originalname.substring(file.originalname.lastIndexOf('.')),
      },
    };
  }

  static sanitizeString(input: unknown, options: SanitizeStringOptions = {}): unknown {
    if (typeof input !== 'string') {
      return input;
    }

    const {
      removeHtml = true,
      removeScripts = true,
      trim = true,
      maxLength = null,
    } = options;

    let sanitized = input;

    if (trim) {
      sanitized = sanitized.trim();
    }

    if (removeScripts) {
      sanitized = sanitized.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
      sanitized = sanitized.replace(/javascript:/gi, '');
      sanitized = sanitized.replace(/on\w+\s*=/gi, '');
    }

    if (removeHtml) {
      sanitized = sanitized.replace(/<[^>]*>/g, '');
    }

    if (typeof maxLength === 'number' && sanitized.length > maxLength) {
      sanitized = sanitized.substring(0, maxLength);
    }

    return sanitized;
  }

  static validatePagination(params: PaginationValidationInput = {}): PaginationValidationResult {
    const { page = 1, limit = 10 } = params;

    const validatedPage = Math.max(1, Number.parseInt(String(page), 10) || 1);
    const validatedLimit = Math.min(100, Math.max(1, Number.parseInt(String(limit), 10) || 10));

    return {
      page: validatedPage,
      limit: validatedLimit,
      skip: (validatedPage - 1) * validatedLimit,
      take: validatedLimit,
    };
  }
}

export default ValidationHelpers;