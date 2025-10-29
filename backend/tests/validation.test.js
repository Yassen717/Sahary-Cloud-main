const ValidationHelpers = require('../src/utils/validation.helpers');
const { validate } = require('../src/middlewares/validation');
const { registerSchema, loginSchema } = require('../src/validations/user.validation');
const { createVMSchema } = require('../src/validations/vm.validation');

describe('Validation Helpers', () => {
  describe('Password Validation', () => {
    test('should validate strong password', () => {
      const result = ValidationHelpers.validatePasswordStrength('StrongPass123!');
      expect(result.isValid).toBe(true);
      expect(result.strength).toBe('strong');
      expect(result.feedback).toHaveLength(0);
    });

    test('should reject weak password', () => {
      const result = ValidationHelpers.validatePasswordStrength('weak');
      expect(result.isValid).toBe(false);
      expect(result.strength).toBe('weak');
      expect(result.feedback.length).toBeGreaterThan(0);
    });

    test('should reject common passwords', () => {
      const result = ValidationHelpers.validatePasswordStrength('password123');
      expect(result.isValid).toBe(false);
      expect(result.feedback).toContain('Password is too common');
    });

    test('should hash and compare passwords', async () => {
      const password = 'TestPassword123!';
      const hash = await ValidationHelpers.hashPassword(password);
      
      expect(hash).toBeDefined();
      expect(hash).not.toBe(password);
      
      const isMatch = await ValidationHelpers.comparePassword(password, hash);
      expect(isMatch).toBe(true);
      
      const isNotMatch = await ValidationHelpers.comparePassword('wrongpassword', hash);
      expect(isNotMatch).toBe(false);
    });
  });

  describe('Email Validation', () => {
    test('should validate correct email', () => {
      const result = ValidationHelpers.validateEmail('test@example.com');
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.domain).toBe('example.com');
    });

    test('should reject invalid email format', () => {
      const result = ValidationHelpers.validateEmail('invalid-email');
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Invalid email format');
    });

    test('should reject disposable email', () => {
      const result = ValidationHelpers.validateEmail('test@10minutemail.com');
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Disposable email addresses are not allowed');
    });

    test('should reject too long email', () => {
      const longEmail = 'a'.repeat(250) + '@example.com';
      const result = ValidationHelpers.validateEmail(longEmail);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Email is too long');
    });
  });

  describe('VM Resource Validation', () => {
    test('should validate correct VM resources', () => {
      const resources = {
        cpu: 2,
        ram: 2048,
        storage: 40,
        bandwidth: 1000
      };
      
      const result = ValidationHelpers.validateVMResources(resources);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.estimatedHourlyCost).toBeGreaterThan(0);
    });

    test('should reject insufficient RAM for CPU', () => {
      const resources = {
        cpu: 4,
        ram: 1024, // Too low for 4 CPU cores
        storage: 40
      };
      
      const result = ValidationHelpers.validateVMResources(resources);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('RAM should be at least 2048MB for 4 CPU core(s)');
    });

    test('should provide performance warnings', () => {
      const resources = {
        cpu: 8,
        ram: 2048, // Low RAM for high CPU
        storage: 40
      };
      
      const result = ValidationHelpers.validateVMResources(resources);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain('High CPU count with low RAM');
    });

    test('should calculate VM cost', () => {
      const resources = {
        cpu: 2,
        ram: 2048,
        storage: 40,
        bandwidth: 1000
      };
      
      const cost = ValidationHelpers.calculateVMCost(resources);
      expect(cost).toBeGreaterThan(0);
      expect(typeof cost).toBe('number');
    });
  });

  describe('Date Range Validation', () => {
    test('should validate correct date range', () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');
      
      const result = ValidationHelpers.validateDateRange(startDate, endDate);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.diffDays).toBe(30);
    });

    test('should reject invalid date order', () => {
      const startDate = new Date('2024-01-31');
      const endDate = new Date('2024-01-01');
      
      const result = ValidationHelpers.validateDateRange(startDate, endDate);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Start date must be before or equal to end date');
    });

    test('should reject future dates when not allowed', () => {
      const startDate = new Date();
      const endDate = new Date(Date.now() + 24 * 60 * 60 * 1000); // Tomorrow
      
      const result = ValidationHelpers.validateDateRange(startDate, endDate, { allowFuture: false });
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('End date cannot be in the future');
    });

    test('should reject date range exceeding max days', () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-12-31');
      
      const result = ValidationHelpers.validateDateRange(startDate, endDate, { maxDays: 30 });
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Date range cannot exceed 30 days');
    });
  });

  describe('File Upload Validation', () => {
    test('should validate correct file', () => {
      const file = {
        size: 1024 * 1024, // 1MB
        mimetype: 'image/jpeg',
        originalname: 'test.jpg'
      };
      
      const result = ValidationHelpers.validateFileUpload(file);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.fileInfo.extension).toBe('.jpg');
    });

    test('should reject file too large', () => {
      const file = {
        size: 20 * 1024 * 1024, // 20MB
        mimetype: 'image/jpeg',
        originalname: 'test.jpg'
      };
      
      const result = ValidationHelpers.validateFileUpload(file);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('File size cannot exceed 10MB');
    });

    test('should reject invalid file type', () => {
      const file = {
        size: 1024 * 1024,
        mimetype: 'application/pdf',
        originalname: 'test.pdf'
      };
      
      const result = ValidationHelpers.validateFileUpload(file);
      expect(result.isValid).toBe(false);
      expect(result.errors[0]).toContain('File type not allowed');
    });
  });

  describe('String Sanitization', () => {
    test('should sanitize HTML content', () => {
      const input = '<script>alert("xss")</script>Hello <b>World</b>';
      const result = ValidationHelpers.sanitizeString(input);
      expect(result).toBe('Hello World');
      expect(result).not.toContain('<script>');
      expect(result).not.toContain('<b>');
    });

    test('should trim whitespace', () => {
      const input = '  Hello World  ';
      const result = ValidationHelpers.sanitizeString(input);
      expect(result).toBe('Hello World');
    });

    test('should limit string length', () => {
      const input = 'This is a very long string that should be truncated';
      const result = ValidationHelpers.sanitizeString(input, { maxLength: 10 });
      expect(result).toBe('This is a ');
      expect(result.length).toBe(10);
    });
  });

  describe('Pagination Validation', () => {
    test('should validate correct pagination', () => {
      const result = ValidationHelpers.validatePagination({ page: 2, limit: 20 });
      expect(result.page).toBe(2);
      expect(result.limit).toBe(20);
      expect(result.skip).toBe(20);
      expect(result.take).toBe(20);
    });

    test('should handle invalid pagination values', () => {
      const result = ValidationHelpers.validatePagination({ page: -1, limit: 200 });
      expect(result.page).toBe(1); // Minimum page
      expect(result.limit).toBe(100); // Maximum limit
      expect(result.skip).toBe(0);
    });

    test('should use default values', () => {
      const result = ValidationHelpers.validatePagination({});
      expect(result.page).toBe(1);
      expect(result.limit).toBe(10);
      expect(result.skip).toBe(0);
      expect(result.take).toBe(10);
    });
  });
});

describe('Zod Schema Validation', () => {
  describe('User Registration Schema', () => {
    test('should validate correct registration data', async () => {
      const validData = {
        body: {
          email: 'test@example.com',
          password: 'StrongPass123!',
          firstName: 'John',
          lastName: 'Doe'
        }
      };

      const result = await registerSchema.parseAsync(validData);
      expect(result.body.email).toBe('test@example.com');
      expect(result.body.firstName).toBe('John');
    });

    test('should reject invalid email', async () => {
      const invalidData = {
        body: {
          email: 'invalid-email',
          password: 'StrongPass123!',
          firstName: 'John',
          lastName: 'Doe'
        }
      };

      await expect(registerSchema.parseAsync(invalidData)).rejects.toThrow();
    });

    test('should reject weak password', async () => {
      const invalidData = {
        body: {
          email: 'test@example.com',
          password: 'weak',
          firstName: 'John',
          lastName: 'Doe'
        }
      };

      await expect(registerSchema.parseAsync(invalidData)).rejects.toThrow();
    });
  });

  describe('VM Creation Schema', () => {
    test('should validate correct VM data', async () => {
      const validData = {
        body: {
          name: 'test-vm',
          cpu: 2,
          ram: 2048,
          storage: 40
        }
      };

      const result = await createVMSchema.parseAsync(validData);
      expect(result.body.name).toBe('test-vm');
      expect(result.body.cpu).toBe(2);
    });

    test('should reject invalid VM name', async () => {
      const invalidData = {
        body: {
          name: 'invalid name with spaces',
          cpu: 2,
          ram: 2048,
          storage: 40
        }
      };

      await expect(createVMSchema.parseAsync(invalidData)).rejects.toThrow();
    });

    test('should reject invalid resource values', async () => {
      const invalidData = {
        body: {
          name: 'test-vm',
          cpu: 0, // Invalid
          ram: 2048,
          storage: 40
        }
      };

      await expect(createVMSchema.parseAsync(invalidData)).rejects.toThrow();
    });
  });
});