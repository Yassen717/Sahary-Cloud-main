import type { NextFunction, Request, Response } from 'express';
import validator = require('validator');
import { ValidationError } from '../utils/errors';

const SENSITIVE_FIELDS = new Set([
  'password',
  'currentPassword',
  'newPassword',
  'oldPassword',
  'confirmPassword',
  'newPasswordConfirm',
  'refreshToken',
  'token',
]);

// Free-text fields whose content must be preserved verbatim — sanitizing
// silently corrupts legitimate input like VM exec `command` arrays
// (`['sh', '-c', 'x > y']`), descriptions and reasons.
const PRESERVED_TEXT_FIELDS = new Set([
  'command',
  'commands',
  'args',
  'description',
  'reason',
  'content',
  'comment',
  'notes',
  'message',
  'text',
  'title',
]);

const isPreservedTextValue = (value: unknown): boolean => typeof value === 'string'
  || (Array.isArray(value) && value.every((item) => typeof item === 'string'));

const shouldSkipField = (key: string, value: unknown): boolean => SENSITIVE_FIELDS.has(key) || (PRESERVED_TEXT_FIELDS.has(key) && isPreservedTextValue(value));

const sanitizeString = (input: unknown): unknown => {
  if (typeof input !== 'string') {
    return input;
  }

  return validator.stripLow(input).trim();
};

const sanitizeObject = (obj: unknown): unknown => {
  if (obj === null || obj === undefined) {
    return obj;
  }

  // express.raw() bodies (e.g. the Stripe webhook) are Buffers — rewriting
  // them to objects destroys the signed bytes Stripe verification needs.
  if (Buffer.isBuffer(obj)) {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => sanitizeObject(item));
  }

  if (typeof obj === 'object') {
    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      sanitized[key] = shouldSkipField(key, value) ? value : sanitizeObject(value);
    }
    return sanitized;
  }

  if (typeof obj === 'string') {
    return sanitizeString(obj);
  }

  return obj;
};

const sanitizeBody = (req: Request, _res: Response, next: NextFunction): void => {
  if (req.body && typeof req.body === 'object') {
    req.body = sanitizeObject(req.body) as never;
  }

  next();
};

const sanitizeQuery = (req: Request, _res: Response, next: NextFunction): void => {
  if (req.query && typeof req.query === 'object') {
    req.query = sanitizeObject(req.query) as never;
  }

  next();
};

const sanitizeParams = (req: Request, _res: Response, next: NextFunction): void => {
  if (req.params && typeof req.params === 'object') {
    req.params = sanitizeObject(req.params) as never;
  }

  next();
};

const sanitizeAll = (req: Request, res: Response, next: NextFunction): void => {
  sanitizeBody(req, res, () => {
    sanitizeQuery(req, res, () => {
      sanitizeParams(req, res, next);
    });
  });
};

const validateEmail = (email: string): string => {
  if (!validator.isEmail(email)) {
    throw new ValidationError('Invalid email format');
  }

  return validator.normalizeEmail(email) || email;
};

const validateURL = (url: string): string => {
  if (!validator.isURL(url, { require_protocol: true })) {
    throw new ValidationError('Invalid URL format');
  }

  return url;
};

const validateUUID = (uuid: string): string => {
  if (!validator.isUUID(uuid)) {
    throw new ValidationError('Invalid UUID format');
  }

  return uuid;
};

// High-signal SQLi patterns (mirrors sqlInjectionProtection in security.ts):
// bare keywords or `--` in prose are legitimate and must not be flagged.
const SQL_INJECTION_PATTERNS = [
  /(\b(OR|AND)\s+\d+\s*=\s*\d+(\s*(--|#|\/\*))?)/gi,
  /('\s*(OR|AND)\s+[\w'"-]+\s*=\s*[\w'"-]+)/gi,
  /(\bUNION\s+(ALL\s+)?SELECT\b)/gi,
  /(;\s*(DROP|TRUNCATE|ALTER)\s+(TABLE|DATABASE|INDEX|VIEW))/gi,
  /(;\s*(DELETE\s+FROM|INSERT\s+INTO|UPDATE\s+\w+\s+SET))/gi,
  /('\s*(--|#|\/\*))/g,
  /(\bEXEC(UTE)?\s+(xp_|sp_))/gi,
];

const checkSQLInjection = (req: Request, _res: Response, next: NextFunction): void => {
  const checkValue = (value: unknown): void => {
    if (typeof value === 'string') {
      for (const pattern of SQL_INJECTION_PATTERNS) {
        pattern.lastIndex = 0;
        if (pattern.test(value)) {
          throw new ValidationError('Potential SQL injection detected', {
            field: 'input',
            pattern: pattern.toString(),
          });
        }
      }
    }
  };

  const checkObject = (obj: unknown): void => {
    if (obj && typeof obj === 'object') {
      for (const [key, value] of Object.entries(obj)) {
        if (shouldSkipField(key, value)) {
          continue;
        }

        if (Array.isArray(value)) {
          value.forEach((item) => checkValue(item));
        } else if (typeof value === 'object') {
          checkObject(value);
        } else {
          checkValue(value);
        }
      }
    }
  };

  try {
    checkObject(req.body);
    checkObject(req.query);
    checkObject(req.params);
    next();
  } catch (error) {
    next(error as Error);
  }
};

const checkXSS = (req: Request, _res: Response, next: NextFunction): void => {
  const xssPatterns = [
    /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
    /javascript:/gi,
  ];

  // `on*=` is only an event handler inside a tag — `done=true` or `tone=440`
  // in plain text are legitimate input.
  const eventHandlerPattern = /on\w+\s*=/gi;

  const checkValue = (value: unknown): void => {
    if (typeof value === 'string') {
      for (const pattern of xssPatterns) {
        pattern.lastIndex = 0;
        if (pattern.test(value)) {
          throw new ValidationError('Potential XSS attack detected', {
            field: 'input',
            pattern: pattern.toString(),
          });
        }
      }

      eventHandlerPattern.lastIndex = 0;
      if (value.includes('<') && eventHandlerPattern.test(value)) {
        throw new ValidationError('Potential XSS attack detected', {
          field: 'input',
          pattern: eventHandlerPattern.toString(),
        });
      }
    }
  };

  const checkObject = (obj: unknown): void => {
    if (obj && typeof obj === 'object') {
      for (const [key, value] of Object.entries(obj)) {
        if (shouldSkipField(key, value)) {
          continue;
        }

        if (Array.isArray(value)) {
          value.forEach((item) => checkValue(item));
        } else if (typeof value === 'object') {
          checkObject(value);
        } else {
          checkValue(value);
        }
      }
    }
  };

  try {
    checkObject(req.body);
    checkObject(req.query);
    checkObject(req.params);
    next();
  } catch (error) {
    next(error as Error);
  }
};

const preventNoSQLInjection = (req: Request, _res: Response, next: NextFunction): void => {
  const checkValue = (value: unknown): void => {
    if (value && typeof value === 'object') {
      for (const key of Object.keys(value)) {
        if (key.startsWith('$')) {
          throw new ValidationError('Potential NoSQL injection detected', {
            field: key,
          });
        }
      }
    }
  };

  const checkObject = (obj: unknown): void => {
    if (obj && typeof obj === 'object') {
      checkValue(obj);
      for (const value of Object.values(obj)) {
        if (typeof value === 'object') {
          checkObject(value);
        }
      }
    }
  };

  try {
    checkObject(req.body);
    checkObject(req.query);
    checkObject(req.params);
    next();
  } catch (error) {
    next(error as Error);
  }
};

export {
  sanitizeString,
  sanitizeObject,
  sanitizeBody,
  sanitizeQuery,
  sanitizeParams,
  sanitizeAll,
  validateEmail,
  validateURL,
  validateUUID,
  checkSQLInjection,
  checkXSS,
  preventNoSQLInjection,
};

export default {
  sanitizeString,
  sanitizeObject,
  sanitizeBody,
  sanitizeQuery,
  sanitizeParams,
  sanitizeAll,
  validateEmail,
  validateURL,
  validateUUID,
  checkSQLInjection,
  checkXSS,
  preventNoSQLInjection,
};
