const {
  AppError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  ErrorFactory,
} = require('../src/utils/errors');

describe('Error Handling', () => {
  describe('Custom Error Classes', () => {
    it('should create AppError with correct properties', () => {
      const error = new AppError('Test error', 400, 'TEST_ERROR', { detail: 'test' });

      expect(error.message).toBe('Test error');
      expect(error.statusCode).toBe(400);
      expect(error.errorCode).toBe('TEST_ERROR');
      expect(error.details).toEqual({ detail: 'test' });
      expect(error.isOperational).toBe(true);
      expect(error.timestamp).toBeDefined();
    });

    it('should create ValidationError', () => {
      const error = new ValidationError('Validation failed', { field: 'email' });

      expect(error.statusCode).toBe(400);
      expect(error.errorCode).toBe('VALIDATION_ERROR');
      expect(error.details).toEqual({ field: 'email' });
    });

    it('should create AuthenticationError', () => {
      const error = new AuthenticationError('Invalid credentials');

      expect(error.statusCode).toBe(401);
      expect(error.errorCode).toBe('AUTHENTICATION_ERROR');
    });

    it('should create AuthorizationError', () => {
      const error = new AuthorizationError('Access denied');

      expect(error.statusCode).toBe(403);
      expect(error.errorCode).toBe('AUTHORIZATION_ERROR');
    });

    it('should create NotFoundError', () => {
      const error = new NotFoundError('User');

      expect(error.message).toBe('User not found');
      expect(error.statusCode).toBe(404);
      expect(error.errorCode).toBe('NOT_FOUND_ERROR');
    });

    it('should create ConflictError', () => {
      const error = new ConflictError('Email already exists');

      expect(error.statusCode).toBe(409);
      expect(error.errorCode).toBe('CONFLICT_ERROR');
    });

    it('should convert error to JSON', () => {
      const error = new AppError('Test error', 400, 'TEST_ERROR');
      const json = error.toJSON();

      expect(json.error).toBeDefined();
      expect(json.error.message).toBe('Test error');
      expect(json.error.statusCode).toBe(400);
      expect(json.error.errorCode).toBe('TEST_ERROR');
    });
  });

  describe('Error Factory', () => {
    it('should create error from Prisma unique constraint violation', () => {
      const prismaError = {
        code: 'P2002',
        meta: { target: ['email'] },
        message: 'Unique constraint failed',
      };

      const error = ErrorFactory.fromPrismaError(prismaError);

      expect(error).toBeInstanceOf(ConflictError);
      expect(error.message).toContain('email');
    });

    it('should create error from Prisma record not found', () => {
      const prismaError = {
        code: 'P2025',
        message: 'Record not found',
      };

      const error = ErrorFactory.fromPrismaError(prismaError);

      expect(error).toBeInstanceOf(NotFoundError);
    });

    it('should create error from JWT TokenExpiredError', () => {
      const jwtError = {
        name: 'TokenExpiredError',
        expiredAt: new Date(),
      };

      const error = ErrorFactory.fromJWTError(jwtError);

      expect(error).toBeInstanceOf(AuthenticationError);
      expect(error.message).toContain('expired');
    });

    it('should create error from JWT JsonWebTokenError', () => {
      const jwtError = {
        name: 'JsonWebTokenError',
        message: 'invalid token',
      };

      const error = ErrorFactory.fromJWTError(jwtError);

      expect(error).toBeInstanceOf(AuthenticationError);
      expect(error.message).toContain('Invalid token');
    });

    it('should create error from Zod validation error', () => {
      const zodError = {
        errors: [
          {
            path: ['email'],
            message: 'Invalid email',
            code: 'invalid_string',
          },
          {
            path: ['password'],
            message: 'Password too short',
            code: 'too_small',
          },
        ],
      };

      const error = ErrorFactory.fromZodError(zodError);

      expect(error).toBeInstanceOf(ValidationError);
      expect(error.details.errors).toHaveLength(2);
      expect(error.details.errors[0].field).toBe('email');
    });

    it('should create error from Joi validation error', () => {
      const joiError = {
        details: [
          {
            path: ['username'],
            message: 'Username is required',
            type: 'any.required',
          },
        ],
      };

      const error = ErrorFactory.fromValidationError(joiError);

      expect(error).toBeInstanceOf(ValidationError);
      expect(error.details.errors).toHaveLength(1);
      expect(error.details.errors[0].field).toBe('username');
    });
  });

  describe('Error Properties', () => {
    it('should have stack trace', () => {
      const error = new AppError('Test error', 500);

      expect(error.stack).toBeDefined();
      expect(error.stack).toContain('AppError');
    });

    it('should have correct error name', () => {
      const validationError = new ValidationError('Test');
      const authError = new AuthenticationError('Test');

      expect(validationError.name).toBe('ValidationError');
      expect(authError.name).toBe('AuthenticationError');
    });

    it('should mark errors as operational', () => {
      const error = new AppError('Test', 400);

      expect(error.isOperational).toBe(true);
    });
  });
});
