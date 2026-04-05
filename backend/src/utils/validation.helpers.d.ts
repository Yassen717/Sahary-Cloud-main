declare class ValidationHelpers {
  static hashPassword(password: string, rounds?: number): Promise<string>;
  static comparePassword(password: string, hash: string): Promise<boolean>;
  static validatePasswordStrength(password: string): {
    score: number;
    strength: string;
    feedback: string[];
    isValid: boolean;
  };
  static validateEmail(email: string): {
    isValid: boolean;
    errors: string[];
    domain?: string;
  };
  static validateVMResources(resources: {
    cpu: number;
    ram: number;
    storage: number;
    bandwidth?: number;
  }): {
    isValid: boolean;
    errors: string[];
    warnings: string[];
    estimatedHourlyCost: number;
  };
  static calculateVMCost(resources: {
    cpu: number;
    ram: number;
    storage: number;
    bandwidth?: number;
  }): number;
  static validateDateRange(
    startDate: string | Date,
    endDate: string | Date,
    options?: {
      maxDays?: number;
      allowFuture?: boolean;
      allowPast?: boolean;
    },
  ): {
    isValid: boolean;
    errors: string[];
    diffDays?: number;
    start?: Date;
    end?: Date;
  };
  static sanitizeString(input: unknown, options?: Record<string, unknown>): unknown;
  static validatePagination(params?: {
    page?: number | string;
    limit?: number | string;
  }): {
    page: number;
    limit: number;
    skip: number;
    take: number;
  };
}

export = ValidationHelpers;