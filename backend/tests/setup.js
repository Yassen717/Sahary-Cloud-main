// Test setup file
const { PrismaClient } = require('@prisma/client');

// Mock environment variables for testing
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/sahary_cloud_test';

// Global test setup
beforeAll(async () => {
  // Setup test database connection
  console.log('Setting up test environment...');
});

afterAll(async () => {
  // Cleanup after all tests
  console.log('Cleaning up test environment...');
});

// Global test utilities
global.testUtils = {
  // Add common test utilities here
  generateTestUser: () => ({
    email: `test${Date.now()}@example.com`,
    password: 'testPassword123',
    firstName: 'Test',
    lastName: 'User'
  }),
  
  generateTestVM: () => ({
    name: `test-vm-${Date.now()}`,
    cpu: 2,
    ram: 2048,
    storage: 20
  })
};