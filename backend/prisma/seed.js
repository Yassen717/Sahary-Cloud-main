// Production-safe seed for the shared-hosting MVP.
//
//   node prisma/seed.js          — core data only (system settings + hosting
//                                  plans). Admin user only when SEED_ADMIN_EMAIL
//                                  and SEED_ADMIN_PASSWORD (>= 12 chars) are set.
//   SEED_DEMO_DATA=true          — additionally seed the legacy VM pricing plans,
//                                  a demo user and a demo VM. DEV ONLY.
//
// The module also exports the individual steps so tests can drive them with an
// explicit env object instead of mutating process.env.

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const MIN_ADMIN_PASSWORD_LENGTH = 12;
const BCRYPT_ROUNDS = 12;

const SYSTEM_SETTINGS = [
  {
    key: 'site_name',
    value: 'Sahary Cloud',
    description: 'Website name',
    category: 'general',
  },
  {
    key: 'site_description',
    value: 'Solar-powered shared web hosting platform',
    description: 'Website description',
    category: 'general',
  },
  {
    key: 'default_currency',
    value: 'USD',
    description: 'Default currency for billing',
    category: 'billing',
  },
  {
    key: 'tax_rate',
    value: '0.10',
    description: 'Default tax rate (10%)',
    category: 'billing',
  },
  {
    key: 'max_vms_per_user',
    value: '5',
    description: 'Maximum VMs per user (legacy VPS feature)',
    category: 'limits',
  },
  {
    key: 'solar_monitoring_enabled',
    value: 'true',
    description: 'Enable solar energy monitoring',
    category: 'features',
  },
];

const HOSTING_PLANS = [
  {
    name: 'Starter',
    description: 'Perfect for personal sites and small projects',
    diskGB: 1,
    bandwidthGB: 10,
    maxDomains: 1,
    maxDatabases: 1,
    maxFtpAccounts: 1,
    monthlyPrice: 3.00,
  },
  {
    name: 'Pro',
    description: 'For growing websites and small businesses',
    diskGB: 10,
    bandwidthGB: 100,
    maxDomains: 5,
    maxDatabases: 5,
    maxFtpAccounts: 5,
    monthlyPrice: 8.00,
  },
  {
    name: 'Business',
    description: 'High-performance hosting for demanding sites',
    diskGB: 30,
    bandwidthGB: 500,
    maxDomains: 20,
    maxDatabases: 20,
    maxFtpAccounts: 20,
    monthlyPrice: 18.00,
  },
];

// Legacy VPS pricing plans — only seeded with SEED_DEMO_DATA=true.
const VM_PRICING_PLANS = [
  {
    name: 'Starter',
    description: 'Perfect for small projects and testing',
    maxCpu: 1,
    maxRam: 1024,
    maxStorage: 20,
    maxBandwidth: 1000,
    maxVMs: 1,
    monthlyPrice: 5.00,
    hourlyPrice: 0.007,
    features: JSON.stringify({
      ssd_storage: true,
      backup_included: false,
      support_level: 'community',
      solar_powered: true,
    }),
  },
  {
    name: 'Professional',
    description: 'Ideal for growing businesses',
    maxCpu: 2,
    maxRam: 4096,
    maxStorage: 80,
    maxBandwidth: 4000,
    maxVMs: 3,
    monthlyPrice: 20.00,
    hourlyPrice: 0.028,
    features: JSON.stringify({
      ssd_storage: true,
      backup_included: true,
      support_level: 'email',
      solar_powered: true,
      load_balancer: true,
    }),
  },
  {
    name: 'Enterprise',
    description: 'For large-scale applications',
    maxCpu: 8,
    maxRam: 16384,
    maxStorage: 320,
    maxBandwidth: 16000,
    maxVMs: 10,
    monthlyPrice: 80.00,
    hourlyPrice: 0.111,
    features: JSON.stringify({
      ssd_storage: true,
      backup_included: true,
      support_level: 'priority',
      solar_powered: true,
      load_balancer: true,
      dedicated_support: true,
      custom_images: true,
    }),
  },
];

const DEMO_USER_EMAIL = 'demo@saharycloud.com';
const DEMO_USER_PASSWORD = 'demo123';

// ── (a) Core data — always seeded, safe for production ──────────────────────

async function seedSystemSettings(prisma) {
  await Promise.all(
    SYSTEM_SETTINGS.map((setting) => prisma.systemSetting.upsert({
      where: { key: setting.key },
      update: setting,
      create: setting,
    })),
  );
  return SYSTEM_SETTINGS.length;
}

async function seedHostingPlans(prisma) {
  await Promise.all(
    HOSTING_PLANS.map((plan) => prisma.hostingPlan.upsert({
      where: { name: plan.name },
      update: plan,
      create: plan,
    })),
  );
  return HOSTING_PLANS.length;
}

// ── (b) Admin bootstrap — only when BOTH env vars are set ────────────────────

async function seedAdminUser(prisma, env, log, warn) {
  const email = env.SEED_ADMIN_EMAIL;
  const password = env.SEED_ADMIN_PASSWORD;

  if (!email && !password) {
    log('👤 SEED_ADMIN_EMAIL/SEED_ADMIN_PASSWORD not set — skipping admin bootstrap');
    return null;
  }
  if (!email || !password) {
    warn('⚠️  Admin bootstrap skipped: SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD must BOTH be set');
    return null;
  }
  if (password.length < MIN_ADMIN_PASSWORD_LENGTH) {
    throw new Error(
      `SEED_ADMIN_PASSWORD must be at least ${MIN_ADMIN_PASSWORD_LENGTH} characters long`,
    );
  }

  const normalizedEmail = email.toLowerCase().trim();
  const hashedPassword = await bcrypt.hash(password, BCRYPT_ROUNDS);

  // update:{} — never overwrite an existing admin's (possibly rotated) password.
  const user = await prisma.user.upsert({
    where: { email: normalizedEmail },
    update: {},
    create: {
      email: normalizedEmail,
      password: hashedPassword,
      firstName: 'System',
      lastName: 'Administrator',
      role: 'SUPER_ADMIN',
      isActive: true,
      isVerified: true,
    },
  });

  log(`👤 Admin user ready (${normalizedEmail})`);
  return user;
}

// ── (c) Demo data — SEED_DEMO_DATA=true only, dev only ──────────────────────

// 24 hours of sample solar production/consumption points for the widget.
async function seedSolarSamples(prisma) {
  const now = new Date();
  const solarDataPoints = [];
  for (let i = 0; i < 24; i += 1) {
    const timestamp = new Date(now.getTime() - (i * 60 * 60 * 1000));
    const hour = timestamp.getHours();

    let production = 0;
    if (hour >= 6 && hour <= 18) {
      const dayProgress = (hour - 6) / 12;
      production = Math.sin(dayProgress * Math.PI) * 100 + Math.random() * 20;
    }

    const consumption = 50 + Math.random() * 30;
    const efficiency = production > 0 ? Math.min(95, 80 + Math.random() * 15) : 0;
    const co2Saved = (production / 1000) * 0.5;

    solarDataPoints.push({
      production: Math.max(0, production),
      consumption,
      efficiency,
      co2Saved,
      solarIrradiance: production > 0 ? 200 + Math.random() * 800 : 0,
      temperature: 20 + Math.random() * 15,
      cloudCover: Math.random() * 100,
      systemStatus: 'NORMAL',
      timestamp,
    });
  }
  await prisma.solarData.createMany({ data: solarDataPoints });
  return solarDataPoints.length;
}

async function seedDemoData(prisma, log, warn) {
  warn('⚠️⚠️  SEED_DEMO_DATA=true — creating DEVELOPMENT-ONLY demo data');
  warn('⚠️⚠️  Demo user credentials: demo@saharycloud.com / demo123 — NEVER use this flag in production');

  await Promise.all(
    VM_PRICING_PLANS.map((plan) => prisma.pricingPlan.upsert({
      where: { name: plan.name },
      update: plan,
      create: plan,
    })),
  );

  const demoPassword = await bcrypt.hash(DEMO_USER_PASSWORD, BCRYPT_ROUNDS);
  const demoUser = await prisma.user.upsert({
    where: { email: DEMO_USER_EMAIL },
    update: {},
    create: {
      email: DEMO_USER_EMAIL,
      password: demoPassword,
      firstName: 'Demo',
      lastName: 'User',
      role: 'USER',
      isActive: true,
      isVerified: true,
    },
  });

  // Insert-if-empty keeps the demo seed idempotent — there is no natural key
  // to upsert on, so a second run would otherwise append duplicates.
  let solarDataPoints = 0;
  if ((await prisma.solarData.count()) === 0) {
    solarDataPoints = await seedSolarSamples(prisma);
  }

  const existingVM = await prisma.virtualMachine.findFirst({
    where: { userId: demoUser.id, name: 'demo-web-server' },
  });
  if (!existingVM) {
    await prisma.virtualMachine.create({
      data: {
        name: 'demo-web-server',
        description: 'Demo web server for testing',
        status: 'RUNNING',
        cpu: 1,
        ram: 1024,
        storage: 20,
        bandwidth: 1000,
        hourlyRate: 0.007,
        userId: demoUser.id,
        ipAddress: '192.168.1.100',
        dockerImage: 'nginx:alpine',
      },
    });
  }

  return {
    pricingPlans: VM_PRICING_PLANS.length,
    solarDataPoints,
    demoUser,
  };
}

// ── Orchestrator ─────────────────────────────────────────────────────────────

async function run(prisma, env = process.env, logger = console) {
  const log = (...args) => logger.log(...args);
  const warn = (...args) => (logger.warn ? logger.warn(...args) : logger.log(...args));

  log('🌱 Starting database seeding...');

  const settingsCount = await seedSystemSettings(prisma);
  const hostingPlansCount = await seedHostingPlans(prisma);
  log(`📝 ${settingsCount} system settings, ${hostingPlansCount} hosting plans (Starter / Pro / Business)`);

  const adminUser = await seedAdminUser(prisma, env, log, warn);

  let demo = null;
  if (env.SEED_DEMO_DATA === 'true') {
    demo = await seedDemoData(prisma, log, warn);
    log(`💰 ${demo.pricingPlans} VM pricing plans, ${demo.solarDataPoints} solar data points, 1 demo VM`);
  }

  log('✅ Database seeding completed');
  return {
    settingsCount,
    hostingPlansCount,
    adminUser,
    demo,
  };
}

async function runCli() {
  const prisma = new PrismaClient();
  try {
    await run(prisma);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('❌ Seeding failed:', error);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  // eslint-disable-next-line no-void
  void runCli();
}

module.exports = {
  run,
  runCli,
  seedSystemSettings,
  seedHostingPlans,
  seedAdminUser,
  seedDemoData,
  MIN_ADMIN_PASSWORD_LENGTH,
};
