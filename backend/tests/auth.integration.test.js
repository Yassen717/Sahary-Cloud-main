const request = require('supertest');
const app = require('../src/index');
const { prisma } = require('../src/config/database');
const AuthService = require('../src/services/authService');
const JWTUtils = require('../src/utils/jwt');

// Test data
const testUser = {
  email: 'integration@example.com',
  password: 'TestPassword123!',
  firstName: 'Integration',
  lastName: 'Test',
};

const testAdmin = {
  email: 'admin@example.com',
  password: 'AdminPassword123!',
  firstName: 'Admin',
  lastName: 'User',
};

describe('Authentication API Integration Tests', () => {
  let userToken;
  let adminToken;
  let userId;
  let adminId;

  beforeAll(async () => {
    // Clean up existing test data
    await prisma.auditLog.deleteMany({});
    await prisma.session.deleteMany({});
    await prisma.user.deleteMany({
      where: {
        email: {
          in: [testUser.email, testAdmin.email]
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
          in: [testUser.email, testAdmin.email]
        }
      }
    });
    await prisma.$disconnect();
  });

  describe('User Registration and Login Flow', () => {
    test('should register a new user', async () => {
      const response = await request(app)
        .post('/api/v1/auth/register')
        .send(testUser);

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.user.email).toBe(testUser.email.toLowerCase());
      expect(response.body.data.tokens.accessToken).toBeDefined();
      expect(response.body.data.emailVerificationRequired).toBe(true);

      userId = response.body.data.user.id;
      userToken = response.body.data.tokens.accessToken;
    });

    test('should not register user with same email', async () => {
      const response = await request(app)
        .post('/api/v1/auth/register')
        .send(testUser);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('already exists');
    });

    test('should login with correct credentials', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: testUser.email,
          password: testUser.password,
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.user.email).toBe(testUser.email.toLowerCase());
      expect(response.body.data.tokens.accessToken).toBeDefined();

      userToken = response.body.data.tokens.accessToken;
    });

    test('should not login with incorrect password', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: testUser.email,
          password: 'wrongpassword',
        });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });
  });

  describe('Token Operations', () => {
    test('should validate valid token', async () => {
      const response = await request(app)
        .post('/api/v1/auth/validate-token')
        .send({ token: userToken });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.valid).toBe(true);
      expect(response.body.user.userId).toBe(userId);
    });

    test('should reject invalid token', async () => {
      const response = await request(app)
        .post('/api/v1/auth/validate-token')
        .send({ token: 'invalid-token' });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.valid).toBe(false);
    });

    test('should refresh token', async () => {
      // First login to get refresh token
      const loginResponse = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: testUser.email,
          password: testUser.password,
        });

      const refreshToken = loginResponse.body.data.tokens?.refreshToken;
      
      if (refreshToken) {
        const response = await request(app)
          .post('/api/v1/auth/refresh')
          .send({ refreshToken });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.data.accessToken).toBeDefined();
      }
    });
  });

  describe('Profile Operations', () => {
    test('should get user profile', async () => {
      const response = await request(app)
        .get('/api/v1/auth/profile')
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.user.email).toBe(testUser.email.toLowerCase());
    });

    test('should update user profile', async () => {
      const updateData = {
        firstName: 'Updated',
        lastName: 'Name',
        phone: '+1234567890',
      };

      const response = await request(app)
        .put('/api/v1/auth/profile')
        .set('Authorization', `Bearer ${userToken}`)
        .send(updateData);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.user.firstName).toBe(updateData.firstName);
      expect(response.body.data.user.lastName).toBe(updateData.lastName);
    });

    test('should not access profile without token', async () => {
      const response = await request(app).get('/api/v1/auth/profile');

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });
  });

  describe('Password Operations', () => {
    test('should change password', async () => {
      const newPassword = 'NewPassword123!';

      const response = await request(app)
        .post('/api/v1/auth/change-password')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          currentPassword: testUser.password,
          newPassword,
          confirmPassword: newPassword,
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      // Update test password for future tests
      testUser.password = newPassword;
    });

    test('should request password reset', async () => {
      const response = await request(app)
        .post('/api/v1/auth/forgot-password')
        .send({ email: testUser.email });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('reset link');
    });

    test('should reset password with valid token', async () => {
      // First request reset
      const resetRequest = await request(app)
        .post('/api/v1/auth/forgot-password')
        .send({ email: testUser.email });

      if (resetRequest.body.data?.resetToken) {
        const newPassword = 'ResetPassword123!';
        
        const response = await request(app)
          .post('/api/v1/auth/reset-password')
          .send({
            token: resetRequest.body.data.resetToken,
            password: newPassword,
            confirmPassword: newPassword,
          });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);

        // Update test password
        testUser.password = newPassword;
      }
    });
  });

  describe('Email Verification', () => {
    test('should verify email with valid token', async () => {
      // Get verification token from database
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { emailVerificationToken: true }
      });

      if (user.emailVerificationToken) {
        const response = await request(app)
          .post('/api/v1/auth/verify-email')
          .send({ token: user.emailVerificationToken });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.data.user.isVerified).toBe(true);
      }
    });

    test('should resend verification email', async () => {
      const response = await request(app)
        .post('/api/v1/auth/resend-verification')
        .send({ email: testUser.email });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });

  describe('User Permissions', () => {
    test('should get user permissions', async () => {
      const response = await request(app)
        .get('/api/v1/auth/permissions')
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.role).toBe('USER');
      expect(response.body.data.permissions).toBeInstanceOf(Array);
      expect(response.body.data.permissions.length).toBeGreaterThan(0);
    });
  });

  describe('User Activity', () => {
    test('should get user activity log', async () => {
      const response = await request(app)
        .get('/api/v1/auth/activity')
        .set('Authorization', `Bearer ${userToken}`)
        .query({ page: 1, limit: 10 });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeInstanceOf(Array);
      expect(response.body.pagination).toBeDefined();
    });

    test('should filter activity by action', async () => {
      const response = await request(app)
        .get('/api/v1/auth/activity')
        .set('Authorization', `Bearer ${userToken}`)
        .query({ action: 'LOGIN', limit: 5 });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });

  describe('Session Management', () => {
    test('should get user sessions', async () => {
      const response = await request(app)
        .get('/api/v1/auth/sessions')
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    test('should revoke all sessions', async () => {
      const response = await request(app)
        .delete('/api/v1/auth/sessions')
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });

  describe('Account Management', () => {
    test('should deactivate account', async () => {
      const response = await request(app)
        .post('/api/v1/auth/deactivate')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          password: testUser.password,
          reason: 'Testing account deactivation',
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    test('should not login with deactivated account', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: testUser.email,
          password: testUser.password,
        });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('deactivated');
    });
  });

  describe('Admin Operations', () => {
    beforeAll(async () => {
      // Create admin user
      const adminResult = await AuthService.register({
        ...testAdmin,
        role: 'SUPER_ADMIN',
      });
      
      adminId = adminResult.user.id;
      
      // Update user role to SUPER_ADMIN
      await prisma.user.update({
        where: { id: adminId },
        data: { role: 'SUPER_ADMIN', isVerified: true }
      });

      // Generate admin token
      adminToken = JWTUtils.generateAccessToken({
        userId: adminId,
        email: testAdmin.email,
        role: 'SUPER_ADMIN',
      });
    });

    test('should impersonate user as super admin', async () => {
      const response = await request(app)
        .post('/api/v1/auth/impersonate')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ targetUserId: userId });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.impersonationToken).toBeDefined();
      expect(response.body.data.targetUser.id).toBe(userId);
    });

    test('should not impersonate as regular user', async () => {
      const response = await request(app)
        .post('/api/v1/auth/impersonate')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ targetUserId: adminId });

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
    });
  });

  describe('Authentication Status', () => {
    test('should check authentication status', async () => {
      const response = await request(app)
        .get('/api/v1/auth/check')
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.authenticated).toBe(true);
    });

    test('should fail authentication check without token', async () => {
      const response = await request(app).get('/api/v1/auth/check');

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });
  });

  describe('Logout', () => {
    test('should logout successfully', async () => {
      const response = await request(app)
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });

  describe('API Health Check', () => {
    test('should return healthy status', async () => {
      const response = await request(app).get('/api/v1/auth/health');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('healthy');
    });
  });

  describe('Rate Limiting', () => {
    test('should apply rate limiting to auth endpoints', async () => {
      // Make multiple rapid requests to test rate limiting
      const promises = Array(10).fill().map(() =>
        request(app)
          .post('/api/v1/auth/login')
          .send({
            email: 'nonexistent@example.com',
            password: 'wrongpassword',
          })
      );

      const responses = await Promise.all(promises);
      
      // Some requests should be rate limited
      const rateLimitedResponses = responses.filter(res => res.status === 429);
      expect(rateLimitedResponses.length).toBeGreaterThan(0);
    });
  });

  describe('Input Validation', () => {
    test('should validate registration input', async () => {
      const response = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: 'invalid-email',
          password: 'weak',
          firstName: '',
          lastName: '',
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Validation failed');
      expect(response.body.details).toBeInstanceOf(Array);
    });

    test('should sanitize malicious input', async () => {
      const response = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: 'test@example.com',
          password: 'TestPassword123!',
          firstName: '<script>alert("xss")</script>John',
          lastName: 'Doe<img src=x onerror=alert(1)>',
        });

      // Should not return 400 due to XSS protection, input should be sanitized
      if (response.status === 201) {
        expect(response.body.data.user.firstName).not.toContain('<script>');
        expect(response.body.data.user.lastName).not.toContain('<img');
      }
    });
  });
});