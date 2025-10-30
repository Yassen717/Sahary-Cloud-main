const request = require('supertest');
const bcrypt = require('bcryptjs');
const app = require('../src/index');
const { prisma } = require('../src/config/database');
const AuthService = require('../src/services/authService');
const JWTUtils = require('../src/utils/jwt');

// Test data
const testUser = {
  email: 'test@example.com',
  password: 'TestPassword123!',
  firstName: 'Test',
  lastName: 'User',
};

const testUser2 = {
  email: 'test2@example.com',
  password: 'TestPassword456!',
  firstName: 'Test2',
  lastName: 'User2',
};

describe('Authentication Service', () => {
  beforeEach(async () => {
    // Clean up test data
    await prisma.auditLog.deleteMany({});
    await prisma.session.deleteMany({});
    await prisma.user.deleteMany({
      where: {
        email: {
          in: [testUser.email, testUser2.email]
        }
      }
    });
  });

  afterAll(async () => {
    // Clean up after all tests
    await prisma.auditLog.deleteMany({});
    await prisma.session.deleteMany({});
    await prisma.user.deleteMany({
      where: {
        email: {
          in: [testUser.email, testUser2.email]
        }
      }
    });
    await prisma.$disconnect();
  });

  describe('User Registration', () => {
    test('should register a new user successfully', async () => {
      const result = await AuthService.register(testUser);

      expect(result).toBeDefined();
      expect(result.user).toBeDefined();
      expect(result.tokens).toBeDefined();
      expect(result.user.email).toBe(testUser.email.toLowerCase());
      expect(result.user.firstName).toBe(testUser.firstName);
      expect(result.emailVerificationRequired).toBe(true);
      expect(result.tokens.accessToken).toBeDefined();
      expect(result.tokens.refreshToken).toBeDefined();
    });

    test('should not register user with existing email', async () => {
      // Register first user
      await AuthService.register(testUser);

      // Try to register with same email
      await expect(AuthService.register(testUser)).rejects.toThrow('User with this email already exists');
    });

    test('should not register user with weak password', async () => {
      const weakPasswordUser = {
        ...testUser,
        password: 'weak',
      };

      await expect(AuthService.register(weakPasswordUser)).rejects.toThrow('Password validation failed');
    });
  });

  describe('User Login', () => {
    beforeEach(async () => {
      // Register a user for login tests
      await AuthService.register(testUser);
    });

    test('should login with correct credentials', async () => {
      const result = await AuthService.login({
        email: testUser.email,
        password: testUser.password,
      });

      expect(result).toBeDefined();
      expect(result.user).toBeDefined();
      expect(result.tokens).toBeDefined();
      expect(result.user.email).toBe(testUser.email.toLowerCase());
      expect(result.tokens.accessToken).toBeDefined();
      expect(result.tokens.refreshToken).toBeDefined();
    });

    test('should not login with incorrect password', async () => {
      await expect(AuthService.login({
        email: testUser.email,
        password: 'wrongpassword',
      })).rejects.toThrow('Invalid email or password');
    });

    test('should not login with non-existent email', async () => {
      await expect(AuthService.login({
        email: 'nonexistent@example.com',
        password: testUser.password,
      })).rejects.toThrow('Invalid email or password');
    });

    test('should not login inactive user', async () => {
      // Deactivate user
      await prisma.user.update({
        where: { email: testUser.email.toLowerCase() },
        data: { isActive: false }
      });

      await expect(AuthService.login({
        email: testUser.email,
        password: testUser.password,
      })).rejects.toThrow('Account is deactivated');
    });
  });

  describe('Token Operations', () => {
    let userTokens;

    beforeEach(async () => {
      // Register and login user
      await AuthService.register(testUser);
      const loginResult = await AuthService.login({
        email: testUser.email,
        password: testUser.password,
      });
      userTokens = loginResult.tokens;
    });

    test('should refresh token successfully', async () => {
      const newTokens = await AuthService.refreshToken(userTokens.refreshToken);

      expect(newTokens).toBeDefined();
      expect(newTokens.accessToken).toBeDefined();
      expect(newTokens.refreshToken).toBeDefined();
      expect(newTokens.accessToken).not.toBe(userTokens.accessToken);
    });

    test('should not refresh with invalid token', async () => {
      await expect(AuthService.refreshToken('invalid-token')).rejects.toThrow('Token refresh failed');
    });

    test('should logout successfully', async () => {
      await expect(AuthService.logout(userTokens.accessToken)).resolves.not.toThrow();
    });
  });

  describe('Password Operations', () => {
    let userId;

    beforeEach(async () => {
      const result = await AuthService.register(testUser);
      userId = result.user.id;
    });

    test('should change password successfully', async () => {
      const newPassword = 'NewPassword123!';

      await expect(AuthService.changePassword(
        userId,
        testUser.password,
        newPassword
      )).resolves.not.toThrow();

      // Verify new password works
      const loginResult = await AuthService.login({
        email: testUser.email,
        password: newPassword,
      });

      expect(loginResult.user).toBeDefined();
    });

    test('should not change password with incorrect current password', async () => {
      await expect(AuthService.changePassword(
        userId,
        'wrongpassword',
        'NewPassword123!'
      )).rejects.toThrow('Current password is incorrect');
    });

    test('should request password reset', async () => {
      const result = await AuthService.requestPasswordReset(testUser.email);

      expect(result).toBeDefined();
      expect(result.message).toContain('reset link has been sent');
      expect(result.resetToken).toBeDefined();
    });

    test('should reset password with valid token', async () => {
      const resetResult = await AuthService.requestPasswordReset(testUser.email);
      const newPassword = 'ResetPassword123!';

      await expect(AuthService.resetPassword(
        resetResult.resetToken,
        newPassword
      )).resolves.not.toThrow();

      // Verify new password works
      const loginResult = await AuthService.login({
        email: testUser.email,
        password: newPassword,
      });

      expect(loginResult.user).toBeDefined();
    });
  });

  describe('Email Verification', () => {
    let user;

    beforeEach(async () => {
      const result = await AuthService.register(testUser);
      user = result.user;
    });

    test('should verify email successfully', async () => {
      // Get verification token from database
      const dbUser = await prisma.user.findUnique({
        where: { id: user.id },
        select: { emailVerificationToken: true }
      });

      const result = await AuthService.verifyEmail(dbUser.emailVerificationToken);

      expect(result).toBeDefined();
      expect(result.user.isVerified).toBe(true);
      expect(result.message).toContain('verified successfully');
    });

    test('should resend verification email', async () => {
      const result = await AuthService.resendEmailVerification(testUser.email);

      expect(result).toBeDefined();
      expect(result.message).toContain('resent');
      expect(result.verificationToken).toBeDefined();
    });

    test('should not resend verification for verified user', async () => {
      // Verify user first
      await prisma.user.update({
        where: { id: user.id },
        data: { isVerified: true }
      });

      await expect(AuthService.resendEmailVerification(testUser.email))
        .rejects.toThrow('Email is already verified');
    });
  });

  describe('Profile Operations', () => {
    let userId;

    beforeEach(async () => {
      const result = await AuthService.register(testUser);
      userId = result.user.id;
    });

    test('should get user by ID', async () => {
      const user = await AuthService.getUserById(userId);

      expect(user).toBeDefined();
      expect(user.id).toBe(userId);
      expect(user.email).toBe(testUser.email.toLowerCase());
      expect(user.password).toBeUndefined(); // Password should not be returned
    });

    test('should update user profile', async () => {
      const updateData = {
        firstName: 'Updated',
        lastName: 'Name',
        phone: '+1234567890',
      };

      const updatedUser = await AuthService.updateProfile(userId, updateData);

      expect(updatedUser).toBeDefined();
      expect(updatedUser.firstName).toBe(updateData.firstName);
      expect(updatedUser.lastName).toBe(updateData.lastName);
      expect(updatedUser.phone).toBe(updateData.phone);
    });
  });
});

describe('JWT Utils', () => {
  const testPayload = {
    userId: 'test-user-id',
    email: 'test@example.com',
    role: 'USER',
  };

  describe('Token Generation', () => {
    test('should generate access token', () => {
      const token = JWTUtils.generateAccessToken(testPayload);

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3); // JWT has 3 parts
    });

    test('should generate refresh token', () => {
      const token = JWTUtils.generateRefreshToken(testPayload);

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3);
    });

    test('should generate token pair', () => {
      const tokens = JWTUtils.generateTokenPair(testPayload);

      expect(tokens).toBeDefined();
      expect(tokens.accessToken).toBeDefined();
      expect(tokens.refreshToken).toBeDefined();
      expect(tokens.tokenType).toBe('Bearer');
      expect(tokens.expiresIn).toBeDefined();
    });
  });

  describe('Token Verification', () => {
    let accessToken;
    let refreshToken;

    beforeEach(() => {
      const tokens = JWTUtils.generateTokenPair(testPayload);
      accessToken = tokens.accessToken;
      refreshToken = tokens.refreshToken;
    });

    test('should verify access token', async () => {
      const decoded = await JWTUtils.verifyAccessToken(accessToken);

      expect(decoded).toBeDefined();
      expect(decoded.userId).toBe(testPayload.userId);
      expect(decoded.email).toBe(testPayload.email);
      expect(decoded.type).toBe('access');
    });

    test('should verify refresh token', async () => {
      const decoded = await JWTUtils.verifyRefreshToken(refreshToken);

      expect(decoded).toBeDefined();
      expect(decoded.userId).toBe(testPayload.userId);
      expect(decoded.email).toBe(testPayload.email);
      expect(decoded.type).toBe('refresh');
    });

    test('should not verify invalid token', async () => {
      await expect(JWTUtils.verifyAccessToken('invalid-token'))
        .rejects.toThrow('Token verification failed');
    });

    test('should not verify wrong token type', async () => {
      await expect(JWTUtils.verifyAccessToken(refreshToken))
        .rejects.toThrow('Invalid token type');
    });
  });

  describe('Token Utilities', () => {
    let token;

    beforeEach(() => {
      token = JWTUtils.generateAccessToken(testPayload);
    });

    test('should decode token', () => {
      const decoded = JWTUtils.decodeToken(token);

      expect(decoded).toBeDefined();
      expect(decoded.payload.userId).toBe(testPayload.userId);
    });

    test('should get token expiration', () => {
      const exp = JWTUtils.getTokenExpiration(token);

      expect(exp).toBeDefined();
      expect(typeof exp).toBe('number');
      expect(exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
    });

    test('should check if token is expired', () => {
      const isExpired = JWTUtils.isTokenExpired(token);

      expect(typeof isExpired).toBe('boolean');
      expect(isExpired).toBe(false); // Fresh token should not be expired
    });

    test('should extract user ID from token', () => {
      const userId = JWTUtils.extractUserId(token);

      expect(userId).toBe(testPayload.userId);
    });
  });

  describe('Special Tokens', () => {
    test('should generate email verification token', () => {
      const token = JWTUtils.generateEmailVerificationToken('user-id', 'test@example.com');

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
    });

    test('should verify email verification token', async () => {
      const token = JWTUtils.generateEmailVerificationToken('user-id', 'test@example.com');
      const decoded = await JWTUtils.verifyEmailVerificationToken(token);

      expect(decoded).toBeDefined();
      expect(decoded.userId).toBe('user-id');
      expect(decoded.email).toBe('test@example.com');
      expect(decoded.type).toBe('email_verification');
    });

    test('should generate password reset token', () => {
      const token = JWTUtils.generatePasswordResetToken('user-id', 'test@example.com');

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
    });

    test('should verify password reset token', async () => {
      const token = JWTUtils.generatePasswordResetToken('user-id', 'test@example.com');
      const decoded = await JWTUtils.verifyPasswordResetToken(token);

      expect(decoded).toBeDefined();
      expect(decoded.userId).toBe('user-id');
      expect(decoded.email).toBe('test@example.com');
      expect(decoded.type).toBe('password_reset');
    });
  });
});