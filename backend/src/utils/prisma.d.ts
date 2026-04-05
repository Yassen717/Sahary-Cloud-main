export const prisma: any;

export function getPagination(options?: {
  page?: number | string;
  limit?: number | string;
}): {
  skip: number;
  take: number;
};

export function getPaginatedResults<T = Record<string, unknown>>(
  model: any,
  options?: {
    page?: number | string;
    limit?: number | string;
    where?: Record<string, unknown>;
    orderBy?: Record<string, unknown>;
    include?: Record<string, unknown>;
  },
): Promise<{
  data: T[];
  pagination: Record<string, unknown>;
}>;

export function softDelete(model: any, id: string): Promise<Record<string, unknown>>;
export function bulkCreate(model: any, data: Array<Record<string, unknown>>): Promise<Record<string, unknown>>;
export function searchRecords(
  model: any,
  searchTerm: string,
  searchFields: string[],
  options?: Record<string, unknown>,
): Promise<{
  data: Array<Record<string, unknown>>;
  pagination: Record<string, unknown>;
}>;
export function executeTransaction<T = unknown>(callback: (tx: any) => Promise<T>): Promise<T>;
export function checkHealth(): Promise<Record<string, unknown>>;
export function getDatabaseStats(): Promise<Record<string, unknown>>;
export function cleanExpiredSessions(): Promise<number>;
export function archiveOldData(daysOld?: number): Promise<Record<string, unknown>>;