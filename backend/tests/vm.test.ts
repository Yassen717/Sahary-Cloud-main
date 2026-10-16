const request = require('supertest');
const app = require('../src/index');
const { prisma } = require('../src/config/database');
const VMService = require('../src/services/vmService').default;
const AuthService = require('../src/services/authService').default;
const JWTUtils = require('../src/utils/jwt').default;

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

// Docker-dependent tests skip cleanly when no daemon is reachable or in CI
// (tests/setup.ts). DB-only tests always run.
const itDocker = (global as any).dockerTestsEnabled ? it : it.skip;

describe('VM Service', () => {
  let userId;
  let adminId;
  let userToken;
  let adminToken;
  let vmId;

  beforeAll(async () => {
    // Clean up leftover data owned by this suite's users only — other test
    // files run in parallel against the same database.
    await (global as any).cleanupTestUsers(prisma, [testUser.email, testAdmin.email]);
    await (global as any).ensureDockerConnected();

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
    // Clean up after all tests — scoped to this suite's users only.
    await (global as any).cleanupTestUsers(prisma, [testUser.email, testAdmin.email]);
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
      // `hourlyRate` is a Prisma Decimal — unwrap before numeric matchers.
      expect(Number(vm.hourlyRate)).toBeGreaterThan(0);

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
      expect(Number(updatedVM.hourlyRate)).toBeGreaterThan(0);
    });

    test('should not update VM with invalid resources', async () => {
      // updateVM treats falsy resource fields as "not provided" — an invalid
      // value must be truthy to reach validateVMResources.
      const invalidUpdate = {
        cpu: 999, // Above the 32-core limit
      };

      await expect(VMService.updateVM(vmId, userId, invalidUpdate)).rejects.toThrow('Resource validation failed');
    });

    test('should not update non-existent VM', async () => {
      await expect(VMService.updateVM('non-existent-id', userId, { name: 'test' })).rejects.toThrow();
    });
  });

  describe('VM State Management', () => {
    // start/stop/restart drive real Docker containers — skipped when no
    // daemon is reachable. The whole sequence must run or skip together.
    itDocker('should start VM successfully', async () => {
      const vm = await (global as any).startVMSafely(vmId, userId);

      // startVM awaits the Docker start and re-fetches the VM, so the
      // returned record is already RUNNING (STARTING is never returned).
      expect(vm.status).toBe('RUNNING');

      const updatedVM = await VMService.getVMById(vmId, userId);
      expect(updatedVM.status).toBe('RUNNING');
      expect(updatedVM.ipAddress).toBeDefined();
    });

    itDocker('should not start already running VM', async () => {
      await expect((global as any).startVMSafely(vmId, userId)).rejects.toThrow('already running');
    });

    itDocker('should restart running VM', async () => {
      const vm = await VMService.restartVM(vmId, userId);

      // restartVM awaits the Docker restart and re-fetches the VM, so the
      // returned record is already RUNNING (RESTARTING is never returned).
      expect(vm.status).toBe('RUNNING');

      const updatedVM = await VMService.getVMById(vmId, userId);
      expect(updatedVM.status).toBe('RUNNING');
    });

    itDocker('should stop running VM', async () => {
      const vm = await VMService.stopVM(vmId, userId);

      // stopVM awaits the Docker stop and re-fetches the VM, so the
      // returned record is already STOPPED (STOPPING is never returned).
      expect(vm.status).toBe('STOPPED');

      const updatedVM = await VMService.getVMById(vmId, userId);
      expect(updatedVM.status).toBe('STOPPED');
    });

    itDocker('should not stop already stopped VM', async () => {
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
      expect(typeof stats.totalVMs).toBe('number');
      expect(typeof stats.runningVMs).toBe('number');
      expect(typeof stats.stoppedVMs).toBe('number');
      expect(stats.totalResources).toBeDefined();
      expect(typeof stats.totalResources.cpu).toBe('number');
      expect(Number(stats.totalCost)).toBeGreaterThanOrEqual(0);
    });
  });

  describe('VM Deletion', () => {
    // Same Docker dependency — the pair must run or skip together.
    itDocker('should not delete running VM', async () => {
      // Start VM first
      await (global as any).startVMSafely(vmId, userId);
      await new Promise(resolve => setTimeout(resolve, 2500));

      await expect(VMService.deleteVM(vmId, userId)).rejects.toThrow('Cannot delete running VM');
    });

    itDocker('should delete stopped VM', async () => {
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
    await (global as any).cleanupTestUsers(prisma, ['vmapi@example.com']);
    await (global as any).ensureDockerConnected();

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
    // Clean up — scoped to this suite's user only.
    await (global as any).cleanupTestUsers(prisma, ['vmapi@example.com']);
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
          cpu: 2,
          ram: 2048,
          storage: 40,
          bandwidth: 1000,
          duration: 24, // 24 hours
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.estimates).toBeDefined();
      expect(response.body.data.estimates.hourly).toBeGreaterThan(0);
    });
  });

  describe('VM State Management via API', () => {
    // start/stop drive real Docker containers — the chain runs or skips
    // together (a skipped start leaves nothing to stop or delete).
    itDocker('should start VM via API', async () => {
      const response = await (global as any).postStartVMSafely(app, vmId, userToken);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      // The start endpoint returns the VM after the awaited Docker start —
      // status is already RUNNING, never the transitional STARTING.
      expect(response.body.data.vm.status).toBe('RUNNING');
    });

    itDocker('should stop VM via API', async () => {
      // Wait for VM to start
      await new Promise(resolve => setTimeout(resolve, 2500));

      const response = await request(app)
        .post(`/api/v1/vms/${vmId}/stop`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      // The stop endpoint returns the VM after the awaited Docker stop —
      // status is already STOPPED, never the transitional STOPPING.
      expect(response.body.data.vm.status).toBe('STOPPED');
    });

    itDocker('should delete VM via API', async () => {
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

    test('should reject XSS in structured fields and preserve free-text fields', async () => {
      // checkXSS runs globally before the route sanitizer — a complete
      // <script>…</script> block in the structured `name` field is rejected.
      const badName = await request(app)
        .post('/api/v1/vms')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          name: 'test-xss<script>alert("x")</script>',
          description: 'xss probe',
          cpu: 1,
          ram: 1024,
          storage: 20,
        });
      expect(badName.status).toBe(400);
      expect(badName.body.success).toBe(false);

      // `description` is a PRESERVED_TEXT_FIELDS free-text field — checkXSS
      // skips it and it is stored verbatim; XSS is neutralized at render,
      // not at the API boundary.
      const response = await request(app)
        .post('/api/v1/vms')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          name: 'test-xss-desc',
          description: '<script>alert("xss")</script>Safe description',
          cpu: 1,
          ram: 1024,
          storage: 20,
        });

      // Assert the precondition instead of silently skipping: VM creation
      // is a DB-only operation and should succeed without Docker.
      expect(response.status).toBe(201);
      expect(response.body.data.vm.description).toBe('<script>alert("xss")</script>Safe description');

      // Cleanup the extra VM row (the suite's afterAll covers the shared one).
      await prisma.virtualMachine.delete({ where: { id: response.body.data.vm.id } });
    });
  });
});