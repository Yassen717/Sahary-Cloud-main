const request = require('supertest');
const app = require('../src/index');
const { prisma } = require('../src/config/database');
const VMService = require('../src/services/vmService');
const AuthService = require('../src/services/authService');
const JWTUtils = require('../src/utils/jwt');

// Test data
const testUser = {
  email: 'vmtest@example.com',
  password: 'TestPassword123!',
  firstName: 'VM',
  lastName: 'Test',
};

const testAdmin = {
  email: 'vmadmin@example.com',
  password: 'AdminPassword123!',
  firstName: 'VM',
  lastName: 'Admin',
};

const testVM = {
  name: 'test-vm',
  description: 'Test virtual machine',
  cpu: 2,
  ram: 2048,
  storage: 40,
  bandwidth: 1000,
  dockerImage: 'ubuntu:latest',
};

describe('VM Service', () => {
  let userId;
  let adminId;
  let userToken;
  let adminToken;
  let vmId;

  beforeAll(async () => {
    // Clean up existing test data
    await prisma.usageRecord.deleteMany({});
    await prisma.virtualMachine.deleteMany({});
    await prisma.auditLog.deleteMany({});
    await prisma.user.deleteMany({
      where: {
        email: {
          in: [testUser.email, testAdmin.email]
        }
      }
    });

    // Create test user
    const userResult = await AuthService.register(testUser);
    userId = userResult.user.id;
    userToken = userResult.tokens.accessToken;

    // Create test admin
    const adminResult = await AuthService.register(testAdmin);
    adminId = adminResult.user.id;
    
    // Update admin role
    await prisma.user.update({
      where: { id: adminId },
      data: { role: 'ADMIN', isVerified: true }
    });

    // Generate admin token
    adminToken = JWTUtils.generateAccessToken({
      userId: adminId,
      email: testAdmin.email,
      role: 'ADMIN',
    });

    // Verify user email for testing
    await prisma.user.update({
      where: { id: userId },
      data: { isVerified: true }
    });
  });

  afterAll(async () => {
    // Clean up after all tests
    await prisma.usageRecord.deleteMany({});
    await prisma.virtualMachine.deleteMany({});
    await prisma.auditLog.deleteMany({});
    await prisma.user.deleteMany({
      where: {
        email: {
          in: [testUser.email, testAdmin.email]
        }
      }
    });
    await prisma.$disconnect();
  });

  describe('VM Creation', () => {
    test('should create VM successfully', async () => {
      const vm = await VMService.createVM(userId, testVM);

      expect(vm).toBeDefined();
      expect(vm.name).toBe(testVM.name);
      expect(vm.cpu).toBe(testVM.cpu);
      expect(vm.ram).toBe(testVM.ram);
      expect(vm.storage).toBe(testVM.storage);
      expect(vm.status).toBe('STOPPED');
      expect(vm.userId).toBe(userId);
      expect(vm.hourlyRate).toBeGreaterThan(0);

      vmId = vm.id;
    });

    test('should not create VM with duplicate name', async () => {
      await expect(VMService.createVM(userId, testVM)).rejects.toThrow('already exists');
    });

    test('should not create VM with invalid resources', async () => {
      const invalidVM = {
        ...testVM,
        name: 'invalid-vm',
        cpu: 0, // Invalid
        ram: 100, // Too low
      };

      await expect(VMService.createVM(userId, invalidVM)).rejects.toThrow('Resource validation failed');
    });
  });

  describe('VM Retrieval', () => {
    test('should get VM by ID', async () => {
      const vm = await VMService.getVMById(vmId, userId);

      expect(vm).toBeDefined();
      expect(vm.id).toBe(vmId);
      expect(vm.name).toBe(testVM.name);
      expect(vm.user).toBeDefined();
      expect(vm.user.id).toBe(userId);
    });

    test('should get user VMs', async () => {
      const result = await VMService.getUserVMs(userId);

      expect(result).toBeDefined();
      expect(result.data).toBeInstanceOf(Array);
      expect(result.data.length).toBeGreaterThan(0);
      expect(result.pagination).toBeDefined();
    });

    test('should filter VMs by status', async () => {
      const result = await VMService.getUserVMs(userId, { status: 'STOPPED' });

      expect(result.data).toBeInstanceOf(Array);
      result.data.forEach(vm => {
        expect(vm.status).toBe('STOPPED');
      });
    });

    test('should search VMs by name', async () => {
      const result = await VMService.getUserVMs(userId, { search: 'test' });

      expect(result.data).toBeInstanceOf(Array);
      result.data.forEach(vm => {
        expect(vm.name.toLowerCase()).toContain('test');
      });
    });
  });

  describe('VM Updates', () => {
    test('should update VM successfully', async () => {
      const updateData = {
        name: 'updated-test-vm',
        description: 'Updated test VM',
        cpu: 4,
        ram: 4096,
      };

      const updatedVM = await VMService.updateVM(vmId, userId, updateData);

      expect(updatedVM.name).toBe(updateData.name);
      expect(updatedVM.description).toBe(updateData.description);
      expect(updatedVM.cpu).toBe(updateData.cpu);
      expect(updatedVM.ram).toBe(updateData.ram);
      expect(updatedVM.hourlyRate).toBeGreaterThan(0);
    });

    test('should not update VM with invalid resources', async () => {
      const invalidUpdate = {
        cpu: 0, // Invalid
      };

      await expect(VMService.updateVM(vmId, userId, invalidUpdate)).rejects.toThrow('Resource validation failed');
    });

    test('should not update non-existent VM', async () => {
      await expect(VMService.updateVM('non-existent-id', userId, { name: 'test' })).rejects.toThrow();
    });
  });

  describe('VM State Management', () => {
    test('should start VM successfully', async () => {
      const vm = await VMService.startVM(vmId, userId);

      expect(vm.status).toBe('STARTING');
      
      // Wait for async status update
      await new Promise(resolve => setTimeout(resolve, 2500));
      
      const updatedVM = await VMService.getVMById(vmId, userId);
      expect(updatedVM.status).toBe('RUNNING');
      expect(updatedVM.ipAddress).toBeDefined();
    });

    test('should not start already running VM', async () => {
      await expect(VMService.startVM(vmId, userId)).rejects.toThrow('already running');
    });

    test('should restart running VM', async () => {
      const vm = await VMService.restartVM(vmId, userId);

      expect(vm.status).toBe('RESTARTING');
      
      // Wait for async status update
      await new Promise(resolve => setTimeout(resolve, 3500));
      
      const updatedVM = await VMService.getVMById(vmId, userId);
      expect(updatedVM.status).toBe('RUNNING');
    });

    test('should stop running VM', async () => {
      const vm = await VMService.stopVM(vmId, userId);

      expect(vm.status).toBe('STOPPING');
      
      // Wait for async status update
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const updatedVM = await VMService.getVMById(vmId, userId);
      expect(updatedVM.status).toBe('STOPPED');
    });

    test('should not stop already stopped VM', async () => {
      await expect(VMService.stopVM(vmId, userId)).rejects.toThrow('already stopped');
    });
  });

  describe('Resource Management', () => {
    test('should get user resource usage', async () => {
      const usage = await VMService.getUserResourceUsage(userId);

      expect(usage).toBeDefined();
      expect(typeof usage.cpu).toBe('number');
      expect(typeof usage.ram).toBe('number');
      expect(typeof usage.storage).toBe('number');
      expect(typeof usage.bandwidth).toBe('number');
      expect(usage.cpu).toBeGreaterThan(0);
    });

    test('should get user resource limits', async () => {
      const limits = await VMService.getUserResourceLimits(userId);

      expect(limits).toBeDefined();
      expect(typeof limits.cpu).toBe('number');
      expect(typeof limits.ram).toBe('number');
      expect(typeof limits.storage).toBe('number');
      expect(typeof limits.bandwidth).toBe('number');
      expect(limits.cpu).toBeGreaterThan(0);
    });
  });

  describe('VM Statistics', () => {
    test('should get VM statistics', async () => {
      const stats = await VMService.getVMStatistics(vmId, userId);

      expect(stats).toBeDefined();
      expect(typeof stats.totalRecords).toBe('number');
      expect(typeof stats.totalCost).toBe('number');
      expect(typeof stats.averageCPU).toBe('number');
      expect(typeof stats.averageRAM).toBe('number');
      expect(stats.records).toBeInstanceOf(Array);
    });

    test('should get VM statistics with date filter', async () => {
      const startDate = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours ago
      const endDate = new Date();

      const stats = await VMService.getVMStatistics(vmId, userId, {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      });

      expect(stats).toBeDefined();
      expect(stats.records).toBeInstanceOf(Array);
    });
  });

  describe('Admin Operations', () => {
    test('should get all VMs as admin', async () => {
      const result = await VMService.getAllVMs();

      expect(result).toBeDefined();
      expect(result.data).toBeInstanceOf(Array);
      expect(result.pagination).toBeDefined();
    });

    test('should get system resource stats', async () => {
      const stats = await VMService.getSystemResourceStats();

      expect(stats).toBeDefined();
      expect(stats.vms).toBeDefined();
      expect(stats.resources).toBeDefined();
      expect(typeof stats.vms.total).toBe('number');
      expect(typeof stats.resources.totalCPU).toBe('number');
      expect(stats.timestamp).toBeDefined();
    });
  });

  describe('VM Deletion', () => {
    test('should not delete running VM', async () => {
      // Start VM first
      await VMService.startVM(vmId, userId);
      await new Promise(resolve => setTimeout(resolve, 2500));

      await expect(VMService.deleteVM(vmId, userId)).rejects.toThrow('Cannot delete running VM');
    });

    test('should delete stopped VM', async () => {
      // Stop VM first
      await VMService.stopVM(vmId, userId);
      await new Promise(resolve => setTimeout(resolve, 2000));

      await expect(VMService.deleteVM(vmId, userId)).resolves.not.toThrow();

      // Verify VM is deleted
      const deletedVM = await VMService.getVMById(vmId, userId);
      expect(deletedVM).toBeNull();
    });
  });
});

describe('VM API Integration Tests', () => {
  let userId;
  let userToken;
  let vmId;

  beforeAll(async () => {
    // Create test user
    const userResult = await AuthService.register({
      email: 'vmapi@example.com',
      password: 'TestPassword123!',
      firstName: 'VM',
      lastName: 'API',
    });
    
    userId = userResult.user.id;
    userToken = userResult.tokens.accessToken;

    // Verify user email
    await prisma.user.update({
      where: { id: userId },
      data: { isVerified: true }
    });
  });

  afterAll(async () => {
    // Clean up
    await prisma.usageRecord.deleteMany({});
    await prisma.virtualMachine.deleteMany({});
    await prisma.user.deleteMany({
      where: { email: 'vmapi@example.com' }
    });
  });

  describe('VM CRUD Operations', () => {
    test('should create VM via API', async () => {
      const response = await request(app)
        .post('/api/v1/vms')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          name: 'api-test-vm',
          description: 'VM created via API',
          cpu: 1,
          ram: 1024,
          storage: 20,
          bandwidth: 500,
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.vm.name).toBe('api-test-vm');

      vmId = response.body.data.vm.id;
    });

    test('should get user VMs via API', async () => {
      const response = await request(app)
        .get('/api/v1/vms')
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeInstanceOf(Array);
      expect(response.body.pagination).toBeDefined();
    });

    test('should get VM by ID via API', async () => {
      const response = await request(app)
        .get(`/api/v1/vms/${vmId}`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.vm.id).toBe(vmId);
    });

    test('should update VM via API', async () => {
      const response = await request(app)
        .put(`/api/v1/vms/${vmId}`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          name: 'updated-api-vm',
          cpu: 2,
          ram: 2048,
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.vm.name).toBe('updated-api-vm');
      expect(response.body.data.vm.cpu).toBe(2);
    });

    test('should get resource usage via API', async () => {
      const response = await request(app)
        .get('/api/v1/vms/resources')
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.usage).toBeDefined();
      expect(response.body.data.limits).toBeDefined();
    });

    test('should get pricing estimate via API', async () => {
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
          duration: 24, // 24 hours
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.estimates).toBeDefined();
      expect(response.body.data.estimates.hourly).toBeGreaterThan(0);
    });
  });

  describe('VM State Management via API', () => {
    test('should start VM via API', async () => {
      const response = await request(app)
        .post(`/api/v1/vms/${vmId}/start`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.vm.status).toBe('STARTING');
    });

    test('should stop VM via API', async () => {
      // Wait for VM to start
      await new Promise(resolve => setTimeout(resolve, 2500));

      const response = await request(app)
        .post(`/api/v1/vms/${vmId}/stop`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.vm.status).toBe('STOPPING');
    });

    test('should delete VM via API', async () => {
      // Wait for VM to stop
      await new Promise(resolve => setTimeout(resolve, 2000));

      const response = await request(app)
        .delete(`/api/v1/vms/${vmId}`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });

  describe('API Security', () => {
    test('should require authentication', async () => {
      const response = await request(app)
        .get('/api/v1/vms');

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });

    test('should validate input', async () => {
      const response = await request(app)
        .post('/api/v1/vms')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          name: '', // Invalid
          cpu: 0, // Invalid
          ram: 100, // Too low
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Validation failed');
    });

    test('should sanitize malicious input', async () => {
      const response = await request(app)
        .post('/api/v1/vms')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          name: 'test-vm',
          description: '<script>alert("xss")</script>Safe description',
          cpu: 1,
          ram: 1024,
          storage: 20,
        });

      if (response.status === 201) {
        expect(response.body.data.vm.description).not.toContain('<script>');
      }
    });
  });
});