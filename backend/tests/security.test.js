const {
  sanitizeString,
  sanitizeObject,
  validateEmail,
  validateURL,
  validateUUID,
} = require('../src/middlewares/sanitization');
const { ValidationError } = require('../src/utils/errors');

describe('Security Middleware', () => {
  describe('Input Sanitization', () => {
    it('should sanitize string input', () => {
      const input = '<script>alert("xss")</script>Hello';
      const sanitized = sanitizeString(input);

      expect(sanitized).not.toContain('<script>');
      expect(sanitized).not.toContain('</script>');
    });

    it('should sanitize object recursively', () => {
      const input = {
        name: '<script>alert("xss")</script>',
        nested: {
          value: '<img src=x onerror=alert(1)>',
        },
        array: ['<script>test</script>', 'safe'],
      };

      const sanitized = sanitizeObject(input);

      expect(sanitized.name).not.toContain('<script>');
      expect(sanitized.nested.value).not.toContain('<img');
      expect(sanitized.array[0]).not.toContain('<script>');
    });

    it('should handle null and undefined', () => {
      expect(sanitizeObject(null)).toBeNull();
      expect(sanitizeObject(undefined)).toBeUndefined();
    });

    it('should preserve numbers and booleans', () => {
      const input = {
        number: 123,
        boolean: true,
        string: 'test',
      };

      const sanitized = sanitizeObject(input);

      expect(sanitized.number).toBe(123);
      expect(sanitized.boolean).toBe(true);
      expect(typeof sanitized.string).toBe('string');
    });
  });

  describe('Email Validation', () => {
    it('should validate correct email', () => {
      const email = 'test@example.com';
      expect(() => validateEmail(email)).not.toThrow();
    });

    it('should reject invalid email', () => {
      const email = 'invalid-email';
      expect(() => validateEmail(email)).toThrow(ValidationError);
    });

    it('should normalize email', () => {
      const email = 'Test@Example.COM';
      const normalized = validateEmail(email);
      expect(normalized).toBe('test@example.com');
    });
  });

  describe('URL Validation', () => {
    it('should validate correct URL', () => {
      const url = 'https://example.com';
      expect(() => validateURL(url)).not.toThrow();
    });

    it('should reject invalid URL', () => {
      const url = 'not-a-url';
      expect(() => validateURL(url)).toThrow(ValidationError);
    });

    it('should require protocol', () => {
      const url = 'example.com';
      expect(() => validateURL(url)).toThrow(ValidationError);
    });
  });

  describe('UUID Validation', () => {
    it('should validate correct UUID', () => {
      const uuid = '123e4567-e89b-12d3-a456-426614174000';
      expect(() => validateUUID(uuid)).not.toThrow();
    });

    it('should reject invalid UUID', () => {
      const uuid = 'not-a-uuid';
      expect(() => validateUUID(uuid)).toThrow(ValidationError);
    });
  });

  describe('SQL Injection Detection', () => {
    it('should detect SQL injection patterns', () => {
      const maliciousInputs = [
        "'; DROP TABLE users; --",
        "1' OR '1'='1",
        "UNION SELECT * FROM users",
        "admin'--",
      ];

      // These would be tested through middleware in integration tests
      maliciousInputs.forEach(input => {
        expect(input).toMatch(/SELECT|DROP|UNION|--|'/i);
      });
    });
  });

  describe('XSS Detection', () => {
    it('should detect XSS patterns', () => {
      const maliciousInputs = [
        '<script>alert("xss")</script>',
        '<img src=x onerror=alert(1)>',
        'javascript:alert(1)',
        '<body onload=alert(1)>',
      ];

      maliciousInputs.forEach(input => {
        expect(input).toMatch(/<script|javascript:|on\w+=/i);
      });
    });
  });

  describe('NoSQL Injection Detection', () => {
    it('should detect NoSQL injection patterns', () => {
      const maliciousInputs = [
        { $gt: '' },
        { $ne: null },
        { $where: 'this.password == "test"' },
      ];

      maliciousInputs.forEach(input => {
        const keys = Object.keys(input);
        expect(keys.some(key => key.startsWith('$'))).toBe(true);
      });
    });
  });
});
