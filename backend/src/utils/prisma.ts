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
    select?: Record<string, unknown>;
    skip?: number;
    take?: number;
  }): Promise<unknown[]>;
  count(args?: { where?: Record<string, unknown> }): Promise<number>;
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

const MAX_PAGE_LIMIT = 100;

const normalizePagination = (
  page: number | string | undefined,
  limit: number | string | undefined,
  maxLimit = MAX_PAGE_LIMIT,
): { page: number; limit: number } => {
  const normalizedPage = Math.max(1, Number.parseInt(String(page ?? 1), 10) || 1);
  const normalizedLimit = Math.min(
    maxLimit,
    Math.max(1, Number.parseInt(String(limit ?? 10), 10) || 10),
  );

  return { page: normalizedPage, limit: normalizedLimit };
};

const getPagination = ({ page = 1, limit = 10 }: PaginationOptions): { skip: number; take: number } => {
  const normalized = normalizePagination(page, limit);

  return {
    skip: (normalized.page - 1) * normalized.limit,
    take: normalized.limit,
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
    select?: Record<string, unknown>;
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
    where = {}, orderBy = {}, include, select,
  } = options;

  const { page: normalizedPage, limit: normalizedLimit } = normalizePagination(
    options.page,
    options.limit,
  );
  const pagination = getPagination({ page: normalizedPage, limit: normalizedLimit });

  // Prisma rejects queries that pass both `select` and `include` — `select`
  // wins when the caller supplies both.
  const projection = select ? { select } : { include };

  const [data, total] = await Promise.all([
    model.findMany({
      where,
      orderBy,
      ...projection,
      ...pagination,
    }),
    model.count({ where }),
  ]);

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

// NB: a generic `softDelete` helper was removed — it wrote `deletedAt`, which
// does not exist anywhere in the Prisma schema, so every call would throw.
// Set `isActive: false` directly on models that have that field instead.

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

  // Merge with a caller-supplied OR/AND instead of overwriting it: both the
  // caller's clauses and the search OR must hold → wrap them in AND.
  const { OR: existingOr, AND: existingAnd, ...restWhere } = where;

  let searchWhere: Record<string, unknown>;
  if (existingOr === undefined && existingAnd === undefined) {
    searchWhere = { ...restWhere, OR: searchConditions };
  } else {
    const andClauses: unknown[] = [
      ...(Array.isArray(existingAnd) ? existingAnd : existingAnd ? [existingAnd] : []),
      ...(existingOr ? [{ OR: existingOr }] : []),
      { OR: searchConditions },
    ];
    searchWhere = { ...restWhere, AND: andClauses };
  }

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
  bulkCreate,
  searchRecords,
  executeTransaction,
  checkHealth,
  getDatabaseStats,
  cleanExpiredSessions,
  archiveOldData,
};
