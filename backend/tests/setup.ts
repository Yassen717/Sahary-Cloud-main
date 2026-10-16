// Test setup file
// Load the worktree .env first so TEST_DATABASE_URL / TEST_REDIS_URL are set
// before the fallbacks below are evaluated (dotenv never overrides vars that
// are already set).
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

// Mock environment variables for testing
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL
  || 'postgresql://test:test@localhost:5432/sahary_cloud_test';
if (process.env.TEST_REDIS_URL) {
  process.env.REDIS_URL = process.env.TEST_REDIS_URL;
}
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-session-secret';
process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder';

// Docker Desktop on Windows exposes the daemon over a named pipe rather than
// the default Unix socket. The worktree .env ships a unix:///var/run/docker.sock
// DOCKER_HOST (Linux-style), which is unreachable here — on Windows, normalize
// unset or unix-socket DOCKER_HOST values to the named pipe. An explicit
// npipe:// or tcp:// DOCKER_HOST is honored as-is.
if (
  process.platform === 'win32' &&
  (!process.env.DOCKER_HOST || process.env.DOCKER_HOST.startsWith('unix://'))
) {
  process.env.DOCKER_HOST = 'npipe:////./pipe/docker_engine';
}

// --- Docker-dependent test gating ------------------------------------------
// Tests that drive real Docker operations (VM start/stop/restart) must skip
// when no daemon is reachable, and they never run in CI (CI=true is set by
// GitHub Actions; SKIP_DOCKER_TESTS forces the same locally).
// Detection is synchronous so it can be evaluated at collection time next to
// `describe`/`it`: npipe:// hosts are probed by opening the named pipe
// (fs.existsSync does not see pipes), unix:// hosts by socket path, tcp://
// hosts are assumed reachable (connect() below remains the real check).
const detectDockerSync = (): boolean => {
  if (process.env.CI === 'true' || process.env.SKIP_DOCKER_TESTS === 'true') {
    return false;
  }
  try {
    const fs = require('fs');
    const host = process.env.DOCKER_HOST || 'unix:///var/run/docker.sock';
    if (host.startsWith('npipe://')) {
      const fd = fs.openSync(host.replace(/^npipe:\/\//, ''), 'r');
      fs.closeSync(fd);
      return true;
    }
    if (/^(?:tcp|https?):\/\//.test(host)) {
      return true;
    }
    return fs.existsSync(host.replace(/^unix:\/\//, '') || '/var/run/docker.sock');
  } catch {
    return false;
  }
};

(global as any).dockerTestsEnabled = detectDockerSync();

// The app's entrypoint only calls dockerService.connect() outside
// NODE_ENV=test, so suites must connect the singleton themselves. Memoized so
// every suite in a worker shares one ping/info round-trip.
let dockerConnectPromise: Promise<boolean> | null = null;
(global as any).ensureDockerConnected = (): Promise<boolean> => {
  if (!(global as any).dockerTestsEnabled) {
    return Promise.resolve(false);
  }
  if (!dockerConnectPromise) {
    const dockerService = require('../src/services/dockerService').default;
    dockerConnectPromise = dockerService.connect().catch(() => false);
  }
  return dockerConnectPromise;
};

// Lazily-built dockerode client for artifact cleanup (volumes are not exposed
// through dockerService). Mirrors the service's DOCKER_HOST parsing.
let dockerClient: any = null;
const getDockerClient = (): any => {
  if (!dockerClient) {
    const Docker = require('dockerode');
    const host = process.env.DOCKER_HOST || 'unix:///var/run/docker.sock';
    const opts: Record<string, unknown> = { timeout: 15000 };
    const tcpMatch = host.match(/^(?:tcp|http|https):\/\/([^:/]+)(?::(\d+))?/);
    if (host.startsWith('npipe://')) {
      opts.socketPath = host.replace(/^npipe:\/\//, '') || '//./pipe/docker_engine';
    } else if (tcpMatch) {
      opts.host = tcpMatch[1];
      opts.port = tcpMatch[2] ? Number.parseInt(tcpMatch[2], 10) : 2375;
      opts.protocol = 'http';
    } else {
      opts.socketPath = host.replace(/^unix:\/\//, '') || '/var/run/docker.sock';
    }
    dockerClient = new Docker(opts);
  }
  return dockerClient;
};

// Removes the Docker container and named data volume that VMService.startVM
// leaves behind for the given VM ids (`sahary-vm-<id>` / `sahary-vm-<id>-data`).
// Best-effort: every failure is swallowed so cleanup never masks a result.
(global as any).cleanupVmDockerArtifacts = async (vmIds: string[]): Promise<void> => {
  if (!(global as any).dockerTestsEnabled || vmIds.length === 0) {
    return;
  }
  if (!(await (global as any).ensureDockerConnected())) {
    return;
  }
  const docker = getDockerClient();
  for (const vmId of vmIds) {
    try {
      const container = docker.getContainer(`sahary-vm-${vmId}`);
      try {
        const info = await container.inspect();
        if (info?.State?.Running) {
          await container.stop({ t: 5 });
        }
      } catch {
        // Already gone or unreachable — removal below may still work.
      }
      await container.remove({ force: true, v: true }).catch(() => {});
    } catch {
      // No such container — nothing to remove.
    }
    try {
      await docker.getVolume(`sahary-vm-${vmId}-data`).remove({ force: true });
    } catch {
      // No such volume — nothing to remove.
    }
  }
};

// Docker frees a stopped container's bridge IP back to the pool, but the VM
// row keeps the stale value — and VirtualMachine.ipAddress is UNIQUE. When a
// later container start (often in a parallel suite sharing the daemon) is
// assigned a recycled IP, the startVM update crashes with a unique
// constraint. Reconcile: a row whose container no longer exists loses both
// references; one whose container is stopped loses ipAddress only (the ref
// stays valid for restarts). Rows backed by a running container are untouched.
(global as any).reconcileVmDockerRefs = async (
  prisma: PrismaClient
): Promise<void> => {
  if (!(global as any).dockerTestsEnabled || !(await (global as any).ensureDockerConnected())) {
    return;
  }
  const docker = getDockerClient();
  const vms = await prisma.virtualMachine.findMany({
    where: {
      OR: [
        { dockerContainerId: { not: null } },
        { ipAddress: { not: null } },
      ],
    },
    select: { id: true, dockerContainerId: true },
  });
  for (const vm of vms) {
    let running = false;
    if (vm.dockerContainerId) {
      try {
        const info = await docker.getContainer(vm.dockerContainerId).inspect();
        running = Boolean(info?.State?.Running);
      } catch {
        // Container gone — the row's references are both stale.
        await prisma.virtualMachine
          .update({
            where: { id: vm.id },
            data: { dockerContainerId: null, ipAddress: null },
          })
          .catch(() => {});
        continue;
      }
    }
    if (!running) {
      await prisma.virtualMachine
        .update({ where: { id: vm.id }, data: { ipAddress: null } })
        .catch(() => {});
    }
  }
};

// startVM writes the fresh container's bridge IP into the UNIQUE ipAddress
// column; another suite's stale row can still hold the recycled IP when the
// update lands. On that specific failure, reconcile stale refs and retry
// once — a genuine second collision is reported, not swallowed.
(global as any).startVMSafely = async (vmId: string, userId: string) => {
  const VMService = require('../src/services/vmService').default;
  try {
    return await VMService.startVM(vmId, userId);
  } catch (error) {
    if (!String((error as Error)?.message || '').includes('Unique constraint')) {
      throw error;
    }
    const { prisma } = require('../src/config/database');
    await (global as any).reconcileVmDockerRefs(prisma);
    return VMService.startVM(vmId, userId);
  }
};

// Same race, through the API: POST /api/v1/vms/:id/start surfaces the unique
// constraint as a 400. Retry once after reconciling stale refs.
(global as any).postStartVMSafely = async (
  app: unknown,
  vmId: string,
  token: string
) => {
  const request = require('supertest');
  const { prisma } = require('../src/config/database');
  const doStart = () => request(app)
    .post(`/api/v1/vms/${vmId}/start`)
    .set('Authorization', `Bearer ${token}`);
  let response = await doStart();
  if (response.status === 400 && JSON.stringify(response.body).includes('Unique constraint')) {
    await (global as any).reconcileVmDockerRefs(prisma);
    response = await doStart();
  }
  return response;
};

// The app mounts a global limiter on /api/ keyed by client IP — and the
// worktree .env sets RATE_LIMIT_MAX_REQUESTS=100. Every test request shares
// the same IP, so a suite's cumulative traffic exhausts that budget mid-run
// and late tests die with spurious 429s. Force it high for tests — the
// per-route apiRateLimit (60/min) still exercises rate-limit assertions.
process.env.RATE_LIMIT_MAX_REQUESTS = '100000';

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
// sessions and backups). Docker artifacts of those users' VMs
// (`sahary-vm-<id>` containers and `-data` volumes) are removed first —
// a cascade delete would orphan them.
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
  const vms = await prisma.virtualMachine.findMany({
    where: { userId: { in: ids } },
    select: { id: true },
  });
  await (global as any).cleanupVmDockerArtifacts(vms.map(v => v.id));
  // Audit logs are SetNull on user delete, so remove them explicitly.
  await prisma.auditLog.deleteMany({ where: { userId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
  // Sweep stale container/IP references left by other suites' stopped or
  // removed containers — every suite's beforeAll doubles as a reconcile pass.
  await (global as any).reconcileVmDockerRefs(prisma);
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
