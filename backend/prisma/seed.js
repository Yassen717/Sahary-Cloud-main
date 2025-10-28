const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seeding...');

  // Create system settings
  console.log('📝 Creating system settings...');
  const systemSettings = [
    {
      key: 'site_name',
      value: 'Sahary Cloud',
      description: 'Website name',
      category: 'general'
    },
    {
      key: 'site_description',
      value: 'Solar-powered VPS and hosting platform',
      description: 'Website description',
      category: 'general'
    },
    {
      key: 'default_currency',
      value: 'USD',
      description: 'Default currency for billing',
      category: 'billing'
    },
    {
      key: 'tax_rate',
      value: '0.10',
      description: 'Default tax rate (10%)',
      category: 'billing'
    },
    {
      key: 'max_vms_per_user',
      value: '5',
      description: 'Maximum VMs per user',
      category: 'limits'
    },
    {
      key: 'solar_monitoring_enabled',
      value: 'true',
      description: 'Enable solar energy monitoring',
      category: 'features'
    }
  ];

  for (const setting of systemSettings) {
    await prisma.systemSetting.upsert({
      where: { key: setting.key },
      update: setting,
      create: setting
    });
  }

  // Create pricing plans
  console.log('💰 Creating pricing plans...');
  const pricingPlans = [
    {
      name: 'Starter',
      description: 'Perfect for small projects and testing',
      maxCpu: 1,
      maxRam: 1024, // 1GB
      maxStorage: 20, // 20GB
      maxBandwidth: 1000, // 1TB
      maxVMs: 1,
      monthlyPrice: 5.00,
      hourlyPrice: 0.007,
      features: {
        ssd_storage: true,
        backup_included: false,
        support_level: 'community',
        solar_powered: true
      }
    },
    {
      name: 'Professional',
      description: 'Ideal for growing businesses',
      maxCpu: 2,
      maxRam: 4096, // 4GB
      maxStorage: 80, // 80GB
      maxBandwidth: 4000, // 4TB
      maxVMs: 3,
      monthlyPrice: 20.00,
      hourlyPrice: 0.028,
      features: {
        ssd_storage: true,
        backup_included: true,
        support_level: 'email',
        solar_powered: true,
        load_balancer: true
      }
    },
    {
      name: 'Enterprise',
      description: 'For large-scale applications',
      maxCpu: 8,
      maxRam: 16384, // 16GB
      maxStorage: 320, // 320GB
      maxBandwidth: 16000, // 16TB
      maxVMs: 10,
      monthlyPrice: 80.00,
      hourlyPrice: 0.111,
      features: {
        ssd_storage: true,
        backup_included: true,
        support_level: 'priority',
        solar_powered: true,
        load_balancer: true,
        dedicated_support: true,
        custom_images: true
      }
    }
  ];

  for (const plan of pricingPlans) {
    await prisma.pricingPlan.upsert({
      where: { name: plan.name },
      update: plan,
      create: plan
    });
  }

  // Create admin user
  console.log('👤 Creating admin user...');
  const hashedPassword = await bcrypt.hash('admin123!@#', 12);
  
  const adminUser = await prisma.user.upsert({
    where: { email: 'admin@saharycloud.com' },
    update: {},
    create: {
      email: 'admin@saharycloud.com',
      password: hashedPassword,
      firstName: 'System',
      lastName: 'Administrator',
      role: 'SUPER_ADMIN',
      isActive: true,
      isVerified: true
    }
  });

  // Create demo user
  console.log('👤 Creating demo user...');
  const demoPassword = await bcrypt.hash('demo123', 12);
  
  const demoUser = await prisma.user.upsert({
    where: { email: 'demo@saharycloud.com' },
    update: {},
    create: {
      email: 'demo@saharycloud.com',
      password: demoPassword,
      firstName: 'Demo',
      lastName: 'User',
      role: 'USER',
      isActive: true,
      isVerified: true
    }
  });

  // Create sample solar data
  console.log('☀️ Creating sample solar data...');
  const now = new Date();
  const solarDataPoints = [];

  // Generate 24 hours of sample data
  for (let i = 0; i < 24; i++) {
    const timestamp = new Date(now.getTime() - (i * 60 * 60 * 1000)); // i hours ago
    const hour = timestamp.getHours();
    
    // Simulate solar production based on time of day
    let production = 0;
    if (hour >= 6 && hour <= 18) {
      // Daylight hours - simulate solar curve
      const dayProgress = (hour - 6) / 12;
      production = Math.sin(dayProgress * Math.PI) * 100 + Math.random() * 20;
    }
    
    const consumption = 50 + Math.random() * 30; // Base consumption + variation
    const efficiency = production > 0 ? Math.min(95, 80 + Math.random() * 15) : 0;
    const co2Saved = (production / 1000) * 0.5; // Rough calculation
    
    solarDataPoints.push({
      production: Math.max(0, production),
      consumption,
      efficiency,
      co2Saved,
      solarIrradiance: production > 0 ? 200 + Math.random() * 800 : 0,
      temperature: 20 + Math.random() * 15,
      cloudCover: Math.random() * 100,
      systemStatus: 'NORMAL',
      timestamp
    });
  }

  await prisma.solarData.createMany({
    data: solarDataPoints,
    skipDuplicates: true
  });

  // Create sample VM for demo user
  console.log('🖥️ Creating sample VM...');
  await prisma.virtualMachine.upsert({
    where: { 
      userId_name: {
        userId: demoUser.id,
        name: 'demo-web-server'
      }
    },
    update: {},
    create: {
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
      dockerImage: 'nginx:alpine'
    }
  });

  console.log('✅ Database seeding completed successfully!');
  console.log(`
📊 Created:
- ${systemSettings.length} system settings
- ${pricingPlans.length} pricing plans
- 1 admin user (admin@saharycloud.com / admin123!@#)
- 1 demo user (demo@saharycloud.com / demo123)
- ${solarDataPoints.length} solar data points
- 1 sample VM
  `);
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });