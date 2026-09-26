// Test setup file
import { PrismaClient } from '@prisma/client';

// Mock environment variables for testing
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/sahary_cloud_test';

// Docker Desktop on Windows exposes the daemon over a named pipe rather than
// the default Unix socket. Honor an explicit DOCKER_HOST if one is set.
if (!process.env.DOCKER_HOST && process.platform === 'win32') {
  process.env.DOCKER_HOST = 'npipe:////./pipe/docker_engine';
}

// The app mounts a global 100 req/15min limiter on /api/ keyed by client IP.
// Every test request shares the same IP, so entire suites would blow through
// that budget and fail with spurious 429s. Raise it for tests — the
// per-route apiRateLimit (60/min) still exercises rate-limit assertions.
process.env.RATE_LIMIT_MAX_REQUESTS = process.env.RATE_LIMIT_MAX_REQUESTS || '100000';

// Reset rate-limit counters before each test. The limiter keys off the
// client IP, which is identical for every test request and shared across
// all suites running in parallel, so counters must not leak between tests.
beforeEach(async () => {
  try {
    const redisService = require('../src/services/redisService');
    if (redisService.isReady()) {
      const client = redisService.getClient();
      const keys = await client.keys('rl:*');
      if (keys.length > 0) {
        await client.del(keys);
      }
    }
  } catch {
    // Redis unavailable — the limiter falls back to an in-memory store
    // scoped per route, so nothing needs resetting.
  }
});

// Global test setup
beforeAll(async () => {
  // Setup test database connection
  console.log('Setting up test environment...');
});

afterAll(async () => {
  // Cleanup after all tests
  console.log('Cleaning up test environment...');
});

// Removes all data owned by the given users. Test files run in parallel
// against a shared database, so cleanup must be scoped to each suite's
// own users (user deletion cascades to VMs, usage, invoices, payments,
// sessions and backups).
(global as any).cleanupTestUsers = async (
  prisma: PrismaClient,
  emails: string[]
): Promise<void> => {
  const stale = await prisma.user.findMany({
    where: { email: { in: emails } },
    select: { id: true },
  });
  const ids = stale.map(u => u.id);
  if (ids.length === 0) return;
  // Audit logs are SetNull on user delete, so remove them explicitly.
  await prisma.auditLog.deleteMany({ where: { userId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
};

// Global test utilities
(global as any).testUtils = {
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
