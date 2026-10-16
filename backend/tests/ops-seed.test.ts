// Runs the real seed logic against the worker's private test database with
// each env combination: core-only, admin bootstrap, weak/partial admin env,
// and SEED_DEMO_DATA — including idempotency on a second run.

const bcrypt = require('bcryptjs');
const { prisma } = require('../src/config/database');
const seed = require('../prisma/seed');

const ADMIN_EMAIL = 'wp08-seed-admin@example.test';
const ADMIN_PASSWORD = 'Str0ng!Passw0rd';
const DEMO_EMAIL = 'demo@saharycloud.com';
const VM_PLAN_NAMES = ['Starter', 'Professional', 'Enterprise'];
const HOSTING_PLAN_NAMES = ['Starter', 'Pro', 'Business'];

const silentLogger = () => ({ log: jest.fn(), warn: jest.fn() });

const { cleanupTestUsers } = global as any;

// Solar rows created by the demo seeder have no marker — track ids inserted
// during this suite so cleanup removes only our own rows.
const seededSolarIds = new Set<string>();

const trackSolarDelta = async (fn: () => Promise<unknown>) => {
  const before = new Set(
    (await prisma.solarData.findMany({ select: { id: true } })).map((r: { id: string }) => r.id),
  );
  await fn();
  const inserted = (await prisma.solarData.findMany({ select: { id: true } }))
    .map((r: { id: string }) => r.id)
    .filter((id: string) => !before.has(id));
  inserted.forEach((id: string) => seededSolarIds.add(id));
  return inserted.length;
};

const cleanup = async () => {
  await cleanupTestUsers(prisma, [ADMIN_EMAIL, DEMO_EMAIL]);
  await prisma.pricingPlan.deleteMany({ where: { name: { in: VM_PLAN_NAMES } } });
  if (seededSolarIds.size > 0) {
    await prisma.solarData.deleteMany({ where: { id: { in: [...seededSolarIds] } } });
    seededSolarIds.clear();
  }
};

beforeEach(cleanup);

afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

describe('seed: core (always runs)', () => {
  test('seeds system settings and the three hosting plans, no admin, no demo data', async () => {
    const pricingBefore = await prisma.pricingPlan.count();
    const solarBefore = await prisma.solarData.count();
    const logger = silentLogger();

    await seed.run(prisma, {}, logger);

    for (const name of HOSTING_PLAN_NAMES) {
      // eslint-disable-next-line no-await-in-loop
      const plan = await prisma.hostingPlan.findUnique({ where: { name } });
      expect(plan).not.toBeNull();
      expect(plan.isActive).toBe(true);
    }

    const settingKeys = (
      await prisma.systemSetting.findMany({ select: { key: true } })
    ).map((s: { key: string }) => s.key);
    expect(settingKeys).toEqual(
      expect.arrayContaining(['site_name', 'default_currency', 'solar_monitoring_enabled']),
    );

    // No admin or demo artifacts without the env vars.
    expect(await prisma.user.findUnique({ where: { email: ADMIN_EMAIL } })).toBeNull();
    expect(await prisma.user.findUnique({ where: { email: DEMO_EMAIL } })).toBeNull();
    expect(await prisma.pricingPlan.count()).toBe(pricingBefore);
    expect(await prisma.solarData.count()).toBe(solarBefore);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  test('core seed is idempotent across consecutive runs', async () => {
    const logger = silentLogger();
    await seed.run(prisma, {}, logger);
    await seed.run(prisma, {}, logger);

    expect(
      await prisma.hostingPlan.count({ where: { name: { in: HOSTING_PLAN_NAMES } } }),
    ).toBe(3);
  });
});

describe('seed: admin bootstrap', () => {
  test('creates a verified SUPER_ADMIN only when both env vars are set', async () => {
    const logger = silentLogger();
    await seed.run(
      prisma,
      { SEED_ADMIN_EMAIL: 'WP08-Seed-Admin@Example.Test', SEED_ADMIN_PASSWORD: ADMIN_PASSWORD },
      logger,
    );

    const admin = await prisma.user.findUnique({ where: { email: ADMIN_EMAIL } });
    expect(admin).not.toBeNull();
    expect(admin.role).toBe('SUPER_ADMIN');
    expect(admin.isVerified).toBe(true);
    expect(admin.isActive).toBe(true);
    // Password is stored hashed and matches — never the literal env value.
    expect(admin.password).not.toBe(ADMIN_PASSWORD);
    expect(await bcrypt.compare(ADMIN_PASSWORD, admin.password)).toBe(true);
  });

  test('is idempotent and does not rotate an existing password', async () => {
    const logger = silentLogger();
    const env = { SEED_ADMIN_EMAIL: ADMIN_EMAIL, SEED_ADMIN_PASSWORD: ADMIN_PASSWORD };
    await seed.run(prisma, env, logger);
    const first = await prisma.user.findUnique({ where: { email: ADMIN_EMAIL } });

    await seed.run(prisma, { ...env, SEED_ADMIN_PASSWORD: 'DifferentPassw0rd!' }, logger);

    const second = await prisma.user.findUnique({ where: { email: ADMIN_EMAIL } });
    expect(second.id).toBe(first.id);
    // upsert update:{} — the second seed run must not overwrite the password.
    expect(await bcrypt.compare(ADMIN_PASSWORD, second.password)).toBe(true);
  });

  test('warns and skips when only one of the two vars is set', async () => {
    const logger = silentLogger();
    await seed.run(prisma, { SEED_ADMIN_EMAIL: ADMIN_EMAIL }, logger);

    expect(await prisma.user.findUnique({ where: { email: ADMIN_EMAIL } })).toBeNull();
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('must BOTH be set'));
  });

  test('rejects an admin password shorter than 12 characters', async () => {
    const logger = silentLogger();
    await expect(
      seed.run(prisma, { SEED_ADMIN_EMAIL: ADMIN_EMAIL, SEED_ADMIN_PASSWORD: 'short' }, logger),
    ).rejects.toThrow('at least 12 characters');
    expect(await prisma.user.findUnique({ where: { email: ADMIN_EMAIL } })).toBeNull();
  });
});

describe('seed: demo data', () => {
  test('SEED_DEMO_DATA=true seeds VM plans, demo user, solar samples and demo VM', async () => {
    const logger = silentLogger();
    const pricingBefore = await prisma.pricingPlan.count();

    const solarInserted = await trackSolarDelta(async () => {
      await seed.run(prisma, { SEED_DEMO_DATA: 'true' }, logger);
    });

    // Loud dev-only warning is emitted.
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('DEVELOPMENT-ONLY'));

    for (const name of VM_PLAN_NAMES) {
      // eslint-disable-next-line no-await-in-loop
      expect(await prisma.pricingPlan.findUnique({ where: { name } })).not.toBeNull();
    }
    expect(await prisma.pricingPlan.count()).toBe(pricingBefore + VM_PLAN_NAMES.length);

    const demo = await prisma.user.findUnique({ where: { email: DEMO_EMAIL } });
    expect(demo).not.toBeNull();
    expect(demo.role).toBe('USER');
    expect(await bcrypt.compare('demo123', demo.password)).toBe(true);

    const vm = await prisma.virtualMachine.findFirst({
      where: { userId: demo.id, name: 'demo-web-server' },
    });
    expect(vm).not.toBeNull();

    // Up to 24 solar points (only when the table was empty before this run).
    expect(solarInserted).toBeLessThanOrEqual(24);
  });

  test('demo seed is idempotent on a second run', async () => {
    const logger = silentLogger();
    const env = { SEED_DEMO_DATA: 'true' };
    await trackSolarDelta(() => seed.run(prisma, env, logger));
    const insertedSecondRun = await trackSolarDelta(() => seed.run(prisma, env, logger));

    expect(insertedSecondRun).toBe(0);

    const demo = await prisma.user.findUnique({ where: { email: DEMO_EMAIL } });
    const vms = await prisma.virtualMachine.findMany({
      where: { userId: demo.id, name: 'demo-web-server' },
    });
    expect(vms).toHaveLength(1);
  });
});
