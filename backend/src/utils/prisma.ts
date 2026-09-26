import { Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import type { DatabaseHealth } from '../config/database';

type PaginationOptions = {
  page?: number | string;
  limit?: number | string;
};

type QueryModel = {
  findMany(args: {
    where?: Record<string, unknown>;
    orderBy?: Record<string, unknown>;
    include?: Record<string, unknown>;
    skip?: number;
    take?: number;
  }): Promise<unknown[]>;
  count(args?: { where?: Record<string, unknown> }): Promise<number>;
};

type UpdateModel<T = Record<string, unknown>> = {
  update(args: {
    where: { id: string };
    data: Record<string, unknown>;
  }): Promise<T>;
};

type CreateManyModel = {
  createMany(args: {
    data: Array<Record<string, unknown>>;
    skipDuplicates?: boolean;
  }): Promise<Record<string, unknown>>;
};

type TransactionCallback<T> = (tx: Prisma.TransactionClient) => Promise<T>;

type DatabaseStats = {
  users: number;
  virtualMachines: number;
  invoices: number;
  activeVMs: number;
  totalRevenue: number | string | Prisma.Decimal;
  timestamp: string;
};

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }

  return 'Unknown error';
};

const getPagination = ({ page = 1, limit = 10 }: PaginationOptions): { skip: number; take: number } => {
  const normalizedPage = Number.parseInt(String(page), 10) || 1;
  const normalizedLimit = Number.parseInt(String(limit), 10) || 10;

  return {
    skip: (normalizedPage - 1) * normalizedLimit,
    take: normalizedLimit,
  };
};

const getPaginatedResults = async <T = Record<string, unknown>>(
  model: QueryModel,
  options: {
    page?: number | string;
    limit?: number | string;
    where?: Record<string, unknown>;
    orderBy?: Record<string, unknown>;
    include?: Record<string, unknown>;
  } = {},
): Promise<{
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
}> => {
  const {
    page = 1, limit = 10, where = {}, orderBy = {}, include = {},
  } = options;

  const pagination = getPagination({ page, limit });

  const [data, total] = await Promise.all([
    model.findMany({
      where,
      orderBy,
      include,
      ...pagination,
    }),
    model.count({ where }),
  ]);

  const normalizedPage = Number.parseInt(String(page), 10) || 1;
  const normalizedLimit = Number.parseInt(String(limit), 10) || 10;
  const totalPages = Math.ceil(total / normalizedLimit);

  return {
    data: data as T[],
    pagination: {
      page: normalizedPage,
      limit: normalizedLimit,
      total,
      totalPages,
      hasNextPage: normalizedPage < totalPages,
      hasPrevPage: normalizedPage > 1,
    },
  };
};

const softDelete = async <T = Record<string, unknown>>(model: UpdateModel<T>, id: string): Promise<T> => model.update({
  where: { id },
  data: {
    deletedAt: new Date(),
    isActive: false,
  },
});

const bulkCreate = async (model: CreateManyModel, data: Array<Record<string, unknown>>): Promise<Record<string, unknown>> => model.createMany({
  data,
  skipDuplicates: true,
});

const searchRecords = async <T = Record<string, unknown>>(
  model: QueryModel,
  searchTerm: string,
  searchFields: string[],
  options: {
    page?: number | string;
    limit?: number | string;
    where?: Record<string, unknown>;
    orderBy?: Record<string, unknown>;
  } = {},
): Promise<{
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
}> => {
  const {
    page = 1, limit = 10, where = {}, orderBy = {},
  } = options;

  const searchConditions = searchFields.map((field) => ({
    [field]: {
      contains: searchTerm,
      mode: 'insensitive',
    },
  }));

  const searchWhere = {
    ...where,
    OR: searchConditions,
  };

  return getPaginatedResults(model, {
    page,
    limit,
    where: searchWhere,
    orderBy,
  });
};

const executeTransaction = async <T>(callback: TransactionCallback<T>): Promise<T> => prisma.$transaction(callback);

const checkHealth = async (): Promise<DatabaseHealth> => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { status: 'healthy', timestamp: new Date().toISOString(), responseTime: '0ms' };
  } catch (error) {
    return {
      status: 'unhealthy',
      error: getErrorMessage(error),
      timestamp: new Date().toISOString(),
    };
  }
};

const getDatabaseStats = async (): Promise<DatabaseStats> => {
  try {
    const [
      userCount,
      vmCount,
      invoiceCount,
      activeVMs,
      totalRevenue,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.virtualMachine.count(),
      prisma.invoice.count(),
      prisma.virtualMachine.count({ where: { status: 'RUNNING' } }),
      prisma.invoice.aggregate({
        where: { status: 'PAID' },
        _sum: { amount: true },
      }),
    ]);

    return {
      users: userCount,
      virtualMachines: vmCount,
      invoices: invoiceCount,
      activeVMs,
      totalRevenue: totalRevenue._sum.amount || 0,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    throw new Error(`Failed to get database stats: ${getErrorMessage(error)}`);
  }
};

const cleanExpiredSessions = async (): Promise<number> => {
  const result = await prisma.session.deleteMany({
    where: {
      expiresAt: {
        lt: new Date(),
      },
    },
  });

  return result.count;
};

const archiveOldData = async (daysOld = 90): Promise<{ auditLogs: number; usageRecords: number; cutoffDate: Date }> => {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysOld);

  const [auditLogs, usageRecords] = await Promise.all([
    prisma.auditLog.deleteMany({
      where: {
        timestamp: { lt: cutoffDate },
      },
    }),
    prisma.usageRecord.deleteMany({
      where: {
        timestamp: { lt: cutoffDate },
      },
    }),
  ]);

  return {
    auditLogs: auditLogs.count,
    usageRecords: usageRecords.count,
    cutoffDate,
  };
};

export {
  prisma,
  getPagination,
  getPaginatedResults,
  softDelete,
  bulkCreate,
  searchRecords,
  executeTransaction,
  checkHealth,
  getDatabaseStats,
  cleanExpiredSessions,
  archiveOldData,
};

export type { DatabaseStats };

export default {
  prisma,
  getPagination,
  getPaginatedResults,
  softDelete,
  bulkCreate,
  searchRecords,
  executeTransaction,
  checkHealth,
  getDatabaseStats,
  cleanExpiredSessions,
  archiveOldData,
};
