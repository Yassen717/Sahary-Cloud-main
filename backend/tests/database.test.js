const { prisma, checkHealth, getDatabaseStats } = require('../src/utils/prisma');
const { connectDatabase, disconnectDatabase } = require('../src/config/database');

describe('Database Connection', () => {
  beforeAll(async () => {
    await connectDatabase();
  });

  afterAll(async () => {
    await disconnectDatabase();
  });

  test('should connect to database successfully', async () => {
    const health = await checkHealth();
    expect(health.status).toBe('healthy');
  });

  test('should perform basic database operations', async () => {
    // Test creating a user
    const testUser = await prisma.user.create({
      data: {
        email: `test-${Date.now()}@example.com`,
        password: 'hashedpassword',
        firstName: 'Test',
        lastName: 'User'
      }
    });

    expect(testUser).toBeDefined();
    expect(testUser.email).toContain('test-');
    expect(testUser.firstName).toBe('Test');

    // Test finding the user
    const foundUser = await prisma.user.findUnique({
      where: { id: testUser.id }
    });

    expect(foundUser).toBeDefined();
    expect(foundUser.id).toBe(testUser.id);

    // Test updating the user
    const updatedUser = await prisma.user.update({
      where: { id: testUser.id },
      data: { firstName: 'Updated' }
    });

    expect(updatedUser.firstName).toBe('Updated');

    // Test deleting the user
    await prisma.user.delete({
      where: { id: testUser.id }
    });

    const deletedUser = await prisma.user.findUnique({
      where: { id: testUser.id }
    });

    expect(deletedUser).toBeNull();
  });

  test('should get database statistics', async () => {
    const stats = await getDatabaseStats();
    
    expect(stats).toBeDefined();
    expect(typeof stats.users).toBe('number');
    expect(typeof stats.virtualMachines).toBe('number');
    expect(typeof stats.invoices).toBe('number');
    expect(stats.timestamp).toBeDefined();
  });

  test('should handle database constraints', async () => {
    // Test unique constraint
    const email = `unique-test-${Date.now()}@example.com`;
    
    await prisma.user.create({
      data: {
        email,
        password: 'hashedpassword',
        firstName: 'First',
        lastName: 'User'
      }
    });

    // Try to create another user with the same email
    await expect(
      prisma.user.create({
        data: {
          email,
          password: 'hashedpassword',
          firstName: 'Second',
          lastName: 'User'
        }
      })
    ).rejects.toThrow();

    // Cleanup
    await prisma.user.delete({
      where: { email }
    });
  });

  test('should handle relationships correctly', async () => {
    // Create a user
    const user = await prisma.user.create({
      data: {
        email: `relationship-test-${Date.now()}@example.com`,
        password: 'hashedpassword',
        firstName: 'Relationship',
        lastName: 'Test'
      }
    });

    // Create a VM for the user
    const vm = await prisma.virtualMachine.create({
      data: {
        name: 'test-vm',
        cpu: 1,
        ram: 1024,
        storage: 20,
        userId: user.id
      }
    });

    // Fetch user with VMs
    const userWithVMs = await prisma.user.findUnique({
      where: { id: user.id },
      include: { virtualMachines: true }
    });

    expect(userWithVMs.virtualMachines).toHaveLength(1);
    expect(userWithVMs.virtualMachines[0].name).toBe('test-vm');

    // Cleanup
    await prisma.virtualMachine.delete({ where: { id: vm.id } });
    await prisma.user.delete({ where: { id: user.id } });
  });
});