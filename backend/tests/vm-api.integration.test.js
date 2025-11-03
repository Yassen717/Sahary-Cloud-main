const request = require('supertest');
const app = require('../src/index');
const { prisma } = require('../src/config/database');
const AuthService = require('../src/services/authService');
const JWTUtils = require('../src/utils/jwt');

/**
 * Comprehensive VM API Integration Tests
 * Tests all VM management endpoints with proper validation and error handling
 */

describe('VM API Integration Tests', () => {
  let testUser;
  let testAdmin;
  let userToken;
  let adminToken;
  let testVMId;
  let testBackupId;

  // Setup test users and authentication
  beforeAll(async () => {
    // Clean up existing test data
    await prisma.usageRecord.deleteMany({});
    await prisma.backup.deleteMany({});
    await prisma.virtualMachine.deleteMany({});
    await prisma.auditLog.deleteMany({});
    await prisma.user.deleteMany({
      where: {
        email: {
          in: ['vmintegration@test.com', 'vmadmin@test.com'],
        },
      },
    });

    // Create test user
    const userResult = await AuthService.register({
      email: 'vmintegration@test.com',
      password: 'TestPassword123!',
      firstName: 'VM',
      lastName: 'Integration',
    });

    testUser = userResult.user;
    userToken = userResult.tokens.accessToken;

    // Verify user email
    await prisma.user.update({
      where: { id: testUser.id },
      data: { isVerified: true },
    });

    // Create admin user
    const adminResult = await AuthService.register({
      email: 'vmadmin@test.com',
      password: 'AdminPassword123!',
      firstName: 'VM',
      lastName: 'Admin',
    });

    testAdmin = adminResult.user;

    // Update admin role
    await prisma.user.update({
      where: { id: testAdmin.id },
      data: { role: 'ADMIN', isVerified: true },
    });

    // Generate admin token
    adminToken = JWTUtils.generateAccessToken({
      userId: testAdmin.id,
      email: testAdmin.email,
      role: 'ADMIN',
    });
  });

  afterAll(async () => {
    // Clean up test data
    await prisma.usageRecord.deleteMany({});
    await prisma.backup.deleteMany({});
    await prisma.virtualMachine.deleteMany({});
    await prisma.auditLog.deleteMany({});
    await prisma.user.deleteMany({
      where: {
        email: {
          in: ['vmintegration@test.com', 'vmadmin@test.com'],
        },
      },
    });
    await prisma.$disconnect();
  });

  describe('POST /api/v1/vms - Create VM', () => {
    it('should create a VM with valid data', async () => {
      const response = await request(app)
        .post('/api/v1/vms')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          name: 'integration-test-vm',
          description: 'VM for integration testing',
          cpu: 2,
          ram: 2048,
          storage: 40,
          bandwidth: 1000,
          dockerImage: 'ubuntu:latest',
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.vm).toBeDefined();
      expect(response.body.data.vm.name).toBe('integration-test-vm');
      expect(response.body.data.vm.status).toBe('STOPPED');

      testVMId = response.body.data.vm.id;
    });

    it('should reject VM creation with invalid name', async () => {
      const response = await request(app)
        .post('/api/v1/vms')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          name: 'ab', // Too short
          cpu: 2,
          ram: 2048,
          storage: 40,
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Validation failed');
    });

    it('should reject VM creation with invalid resources', async () => {
      const response = await request(app)
        .post('/api/v1/vms')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          name: 'invalid-resources-vm',
          cpu: 0, // Invalid
          ram: 100, // Too low
          storage: 5, // Too low
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it('should reject VM creation without authentication', async () => {
      const response = await request(app)
        .post('/api/v1/vms')
        .send({
          name: 'no-auth-vm',
          cpu: 2,
          ram: 2048,
          storage: 40,
        });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });

    it('should reject duplicate VM name', async () => {
      const response = await request(app)
        .post('/api/v1/vms')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          name: 'integration-test-vm', // Duplicate
          cpu: 2,
          ram: 2048,
          storage: 40,
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('already exists');
    });
  });

  describe('GET /api/v1/vms - Get User VMs', () => {
    it('should get user VMs with pagination', async () => {
      const response = await request(app)
        .get('/api/v1/vms')
        .set('Authorization', `Bearer ${userToken}`)
        .query({ page: 1, limit: 10 });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeInstanceOf(Array);
      expect(response.body.pagination).toBeDefined();
      expect(response.body.pagination.page).toBe(1);
    });

    it('should filter VMs by status', async () => {
      const response = await request(app)
        .get('/api/v1/vms')
        .set('Authorization', `Bearer ${userToken}`)
        .query({ status: 'STOPPED' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      response.body.data.forEach((vm) => {
        expect(vm.status).toBe('STOPPED');
      });
    });

    it('should search VMs by name', async () => {
      const response = await request(app)
        .get('/api/v1/vms')
        .set('Authorization', `Bearer ${userToken}`)
        .query({ search: 'integration' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBeGreaterThan(0);
    });

    it('should sort VMs by different fields', async () => {
      const response = await request(app)
        .get('/api/v1/vms')
        .set('Authorization', `Bearer ${userToken}`)
        .query({ sortBy: 'name', sortOrder: 'asc' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });

  describe('GET /api/v1/vms/:id - Get VM by ID', () => {
    it('should get VM details by ID', async () => {
      const response = await request(app)
        .get(`/api/v1/vms/${testVMId}`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.vm.id).toBe(testVMId);
      expect(response.body.data.vm.name).toBe('integration-test-vm');
    });

    it('should return 404 for non-existent VM', async () => {
      const response = await request(app)
        .get('/api/v1/vms/clxxxxxxxxxxxxxxxxxx')
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
    });

    it('should reject invalid VM ID format', async () => {
      const response = await request(app)
        .get('/api/v1/vms/invalid-id')
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });

  describe('PUT /api/v1/vms/:id - Update VM', () => {
    it('should update VM configuration', async () => {
      const response = await request(app)
        .put(`/api/v1/vms/${testVMId}`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          name: 'updated-integration-vm',
          description: 'Updated description',
          cpu: 4,
          ram: 4096,
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.vm.name).toBe('updated-integration-vm');
      expect(response.body.data.vm.cpu).toBe(4);
      expect(response.body.data.vm.ram).toBe(4096);
    });

    it('should reject invalid resource updates', async () => {
      const response = await request(app)
        .put(`/api/v1/vms/${testVMId}`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          cpu: 0, // Invalid
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it('should not allow updating another user VM', async () => {
      // Create another user's VM first
      const otherUserResult = await AuthService.register({
        email: 'otheruser@test.com',
        password: 'TestPassword123!',
        firstName: 'Other',
        lastName: 'User',
      });

      await prisma.user.update({
        where: { id: otherUserResult.user.id },
        data: { isVerified: true },
      });

      const otherUserToken = otherUserResult.tokens.accessToken;

      const response = await request(app)
        .put(`/api/v1/vms/${testVMId}`)
        .set('Authorization', `Bearer ${otherUserToken}`)
        .send({
          name: 'hacked-vm',
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);

      // Cleanup
      await prisma.user.delete({
        where: { id: otherUserResult.user.id },
      });
    });
  });

  describe('GET /api/v1/vms/resources - Get Resource Usage', () => {
    it('should get user resource usage and limits', async () => {
      const response = await request(app)
        .get('/api/v1/vms/resources')
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.usage).toBeDefined();
      expect(response.body.data.limits).toBeDefined();
      expect(response.body.data.usagePercentages).toBeDefined();
      expect(response.body.data.available).toBeDefined();
    });
  });

  describe('POST /api/v1/vms/pricing - Get Pricing Estimate', () => {
    it('should calculate pricing estimate', async () => {
      const response = await request(app)
        .post('/api/v1/vms/pricing')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          resources: {
            cpu: 2,
            ram: 2048,
            storage: 40,
            bandwidth: 1000,
          },
          duration: 24,
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.estimates).toBeDefined();
      expect(response.body.data.estimates.hourly).toBeGreaterThan(0);
      expect(response.body.data.estimates.daily).toBeGreaterThan(0);
      expect(response.body.data.estimates.monthly).toBeGreaterThan(0);
    });

    it('should reject invalid pricing request', async () => {
      const response = await request(app)
        .post('/api/v1/vms/pricing')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          resources: {
            cpu: 0, // Invalid
            ram: 100, // Too low
            storage: 5, // Too low
          },
          duration: 24,
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/v1/vms/:id/start - Start VM', () => {
    it('should start a stopped VM', async () => {
      const response = await request(app)
        .post(`/api/v1/vms/${testVMId}/start`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.vm.status).toBe('STARTING');

      // Wait for VM to start
      await new Promise((resolve) => setTimeout(resolve, 2500));
    });

    it('should reject starting an already running VM', async () => {
      const response = await request(app)
        .post(`/api/v1/vms/${testVMId}/start`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('already running');
    });
  });

  describe('POST /api/v1/vms/:id/restart - Restart VM', () => {
    it('should restart a running VM', async () => {
      const response = await request(app)
        .post(`/api/v1/vms/${testVMId}/restart`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.vm.status).toBe('RESTARTING');

      // Wait for VM to restart
      await new Promise((resolve) => setTimeout(resolve, 3500));
    });
  });

  describe('GET /api/v1/vms/:id/stats - Get VM Statistics', () => {
    it('should get VM statistics', async () => {
      const response = await request(app)
        .get(`/api/v1/vms/${testVMId}/stats`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
      expect(response.body.data.totalRecords).toBeDefined();
      expect(response.body.data.totalCost).toBeDefined();
    });

    it('should get VM statistics with date range', async () => {
      const startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const endDate = new Date().toISOString();

      const response = await request(app)
        .get(`/api/v1/vms/${testVMId}/stats`)
        .set('Authorization', `Bearer ${userToken}`)
        .query({ startDate, endDate, granularity: 'day' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });

  describe('POST /api/v1/vms/:id/stop - Stop VM', () => {
    it('should stop a running VM', async () => {
      const response = await request(app)
        .post(`/api/v1/vms/${testVMId}/stop`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.vm.status).toBe('STOPPING');

      // Wait for VM to stop
      await new Promise((resolve) => setTimeout(resolve, 2000));
    });

    it('should reject stopping an already stopped VM', async () => {
      const response = await request(app)
        .post(`/api/v1/vms/${testVMId}/stop`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('already stopped');
    });
  });

  describe('Admin Operations', () => {
    describe('GET /api/v1/vms/all - Get All VMs (Admin)', () => {
      it('should get all VMs as admin', async () => {
        const response = await request(app)
          .get('/api/v1/vms/all')
          .set('Authorization', `Bearer ${adminToken}`)
          .query({ page: 1, limit: 20 });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.data).toBeInstanceOf(Array);
        expect(response.body.pagination).toBeDefined();
      });

      it('should reject non-admin access', async () => {
        const response = await request(app)
          .get('/api/v1/vms/all')
          .set('Authorization', `Bearer ${userToken}`);

        expect(response.status).toBe(403);
        expect(response.body.success).toBe(false);
      });

      it('should filter VMs by user ID', async () => {
        const response = await request(app)
          .get('/api/v1/vms/all')
          .set('Authorization', `Bearer ${adminToken}`)
          .query({ userId: testUser.id });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
      });
    });

    describe('GET /api/v1/vms/stats - Get System Stats (Admin)', () => {
      it('should get system resource statistics', async () => {
        const response = await request(app)
          .get('/api/v1/vms/stats')
          .set('Authorization', `Bearer ${adminToken}`);

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.data.vms).toBeDefined();
        expect(response.body.data.resources).toBeDefined();
      });

      it('should reject non-admin access', async () => {
        const response = await request(app)
          .get('/api/v1/vms/stats')
          .set('Authorization', `Bearer ${userToken}`);

        expect(response.status).toBe(403);
        expect(response.body.success).toBe(false);
      });
    });

    describe('POST /api/v1/vms/:id/suspend - Suspend VM (Admin)', () => {
      it('should suspend a VM as admin', async () => {
        const response = await request(app)
          .post(`/api/v1/vms/${testVMId}/suspend`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            reason: 'Testing suspension functionality for integration tests',
          });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
      });

      it('should reject suspension without reason', async () => {
        const response = await request(app)
          .post(`/api/v1/vms/${testVMId}/suspend`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            reason: 'Short', // Too short
          });

        expect(response.status).toBe(400);
        expect(response.body.success).toBe(false);
      });

      it('should reject non-admin suspension', async () => {
        const response = await request(app)
          .post(`/api/v1/vms/${testVMId}/suspend`)
          .set('Authorization', `Bearer ${userToken}`)
          .send({
            reason: 'User trying to suspend their own VM',
          });

        expect(response.status).toBe(403);
        expect(response.body.success).toBe(false);
      });
    });

    describe('POST /api/v1/vms/:id/resume - Resume VM (Admin)', () => {
      it('should resume a suspended VM as admin', async () => {
        const response = await request(app)
          .post(`/api/v1/vms/${testVMId}/resume`)
          .set('Authorization', `Bearer ${adminToken}`);

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
      });

      it('should reject resuming non-suspended VM', async () => {
        const response = await request(app)
          .post(`/api/v1/vms/${testVMId}/resume`)
          .set('Authorization', `Bearer ${adminToken}`);

        expect(response.status).toBe(400);
        expect(response.body.success).toBe(false);
      });
    });
  });

  describe('DELETE /api/v1/vms/:id - Delete VM', () => {
    it('should not delete a running VM', async () => {
      // Start VM first
      await request(app)
        .post(`/api/v1/vms/${testVMId}/start`)
        .set('Authorization', `Bearer ${userToken}`);

      await new Promise((resolve) => setTimeout(resolve, 2500));

      const response = await request(app)
        .delete(`/api/v1/vms/${testVMId}`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Cannot delete running VM');
    });

    it('should delete a stopped VM', async () => {
      // Stop VM first
      await request(app)
        .post(`/api/v1/vms/${testVMId}/stop`)
        .set('Authorization', `Bearer ${userToken}`);

      await new Promise((resolve) => setTimeout(resolve, 2000));

      const response = await request(app)
        .delete(`/api/v1/vms/${testVMId}`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('should return 404 for deleted VM', async () => {
      const response = await request(app)
        .get(`/api/v1/vms/${testVMId}`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
    });
  });

  describe('Security Tests', () => {
    it('should sanitize XSS attempts in VM name', async () => {
      const response = await request(app)
        .post('/api/v1/vms')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          name: 'test-vm-xss',
          description: '<script>alert("xss")</script>Safe description',
          cpu: 1,
          ram: 1024,
          storage: 20,
        });

      if (response.status === 201) {
        expect(response.body.data.vm.description).not.toContain('<script>');
      }
    });

    it('should enforce rate limiting', async () => {
      // Make multiple rapid requests
      const requests = Array(15)
        .fill()
        .map(() =>
          request(app)
            .get('/api/v1/vms')
            .set('Authorization', `Bearer ${userToken}`)
        );

      const responses = await Promise.all(requests);
      const rateLimited = responses.some((res) => res.status === 429);

      // Rate limiting should kick in for excessive requests
      expect(rateLimited).toBe(true);
    });

    it('should require email verification for VM creation', async () => {
      // Create unverified user
      const unverifiedResult = await AuthService.register({
        email: 'unverified@test.com',
        password: 'TestPassword123!',
        firstName: 'Unverified',
        lastName: 'User',
      });

      const response = await request(app)
        .post('/api/v1/vms')
        .set('Authorization', `Bearer ${unverifiedResult.tokens.accessToken}`)
        .send({
          name: 'unverified-vm',
          cpu: 1,
          ram: 1024,
          storage: 20,
        });

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);

      // Cleanup
      await prisma.user.delete({
        where: { id: unverifiedResult.user.id },
      });
    });
  });

  describe('Health Check', () => {
    it('should return healthy status', async () => {
      const response = await request(app).get('/api/v1/vms/health');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('healthy');
    });
  });
});
