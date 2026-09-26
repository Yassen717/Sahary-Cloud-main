import { Prisma, PrismaClient } from '@prisma/client';

type DatabaseHealth =
  | {
      status: 'healthy';
      responseTime: string;
      timestamp: string;
    }
  | {
      status: 'unhealthy';
      error: string;
      timestamp: string;
    };

const prismaConfig: Prisma.PrismaClientOptions = {
  log: process.env.NODE_ENV === 'development' ? ['query', 'info', 'warn', 'error'] : ['error'],
  errorFormat: 'pretty',
};

const prisma = new PrismaClient(prismaConfig);

const getErrorMessage = (error: unknown, fallback: string): string => {
  if (error instanceof Error) {
    return error.message;
  }

  return fallback;
};

const connectDatabase = async (): Promise<boolean> => {
  try {
    await prisma.$connect();
    console.log('✅ Database connected successfully');

    await prisma.$queryRaw`SELECT 1`;
    console.log('✅ Database connection test passed');

    return true;
  } catch (error) {
    console.error('❌ Database connection failed:', getErrorMessage(error, 'Unknown error'));
    // In production the database is required: propagate so startup fails hard.
    if (process.env.NODE_ENV === 'production') {
      throw error;
    }
    console.error('⚠️  DATABASE IS UNREACHABLE — starting server WITHOUT database connection (non-production only)');
    console.error('⚠️  Database-dependent endpoints will return 500 until PostgreSQL is running');
    console.error('⚠️  To start PostgreSQL: npm run db:start  OR  sudo systemctl start postgresql');
    return false;
  }
};

const disconnectDatabase = async (): Promise<void> => {
  try {
    await prisma.$disconnect();
    console.log('✅ Database disconnected successfully');
  } catch (error) {
    console.error('❌ Database disconnection failed:', error);
    throw error;
  }
};

const checkDatabaseHealth = async (): Promise<DatabaseHealth> => {
  try {
    const startTime = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    const responseTime = Date.now() - startTime;

    return {
      status: 'healthy',
      responseTime: `${responseTime}ms`,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      error: getErrorMessage(error, 'Unknown error'),
      timestamp: new Date().toISOString(),
    };
  }
};

const cleanupDatabase = async (): Promise<void> => {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('Database cleanup is only allowed in test environment');
  }

  const tablenames = await prisma.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename FROM pg_tables WHERE schemaname='public'
  `;

  for (const { tablename } of tablenames) {
    if (tablename !== '_prisma_migrations') {
      try {
        await prisma.$executeRawUnsafe(`TRUNCATE TABLE "public"."${tablename}" CASCADE;`);
      } catch (error) {
        console.log(`Could not truncate ${tablename}, probably doesn't exist yet.`);
      }
    }
  }
};

const gracefulShutdown = async (): Promise<void> => {
  console.log('Shutting down database connection...');
  await disconnectDatabase();
};

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);
process.on('beforeExit', gracefulShutdown);

export {
  prisma, connectDatabase, disconnectDatabase, checkDatabaseHealth, cleanupDatabase, gracefulShutdown,
};
export type { DatabaseHealth };

export default {
  prisma,
  connectDatabase,
  disconnectDatabase,
  checkDatabaseHealth,
  cleanupDatabase,
  gracefulShutdown,
};
