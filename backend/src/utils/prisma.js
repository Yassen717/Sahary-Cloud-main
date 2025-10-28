const { prisma } = require('../config/database');

/**
 * Pagination helper for Prisma queries
 * @param {Object} options - Pagination options
 * @param {number} options.page - Page number (1-based)
 * @param {number} options.limit - Items per page
 * @returns {Object} Prisma pagination object
 */
const getPagination = ({ page = 1, limit = 10 }) => {
  const skip = (page - 1) * limit;
  const take = parseInt(limit);
  
  return { skip, take };
};

/**
 * Get paginated results with metadata
 * @param {Object} model - Prisma model
 * @param {Object} options - Query options
 * @returns {Object} Paginated results with metadata
 */
const getPaginatedResults = async (model, options = {}) => {
  const { page = 1, limit = 10, where = {}, orderBy = {}, include = {} } = options;
  
  const pagination = getPagination({ page, limit });
  
  const [data, total] = await Promise.all([
    model.findMany({
      where,
      orderBy,
      include,
      ...pagination
    }),
    model.count({ where })
  ]);
  
  const totalPages = Math.ceil(total / limit);
  const hasNextPage = page < totalPages;
  const hasPrevPage = page > 1;
  
  return {
    data,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      totalPages,
      hasNextPage,
      hasPrevPage
    }
  };
};

/**
 * Soft delete helper (if implementing soft deletes)
 * @param {Object} model - Prisma model
 * @param {string} id - Record ID
 * @returns {Object} Updated record
 */
const softDelete = async (model, id) => {
  return model.update({
    where: { id },
    data: { 
      deletedAt: new Date(),
      isActive: false 
    }
  });
};

/**
 * Bulk operations helper
 * @param {Object} model - Prisma model
 * @param {Array} data - Array of data to create
 * @returns {Object} Bulk create result
 */
const bulkCreate = async (model, data) => {
  return model.createMany({
    data,
    skipDuplicates: true
  });
};

/**
 * Search helper with full-text search
 * @param {Object} model - Prisma model
 * @param {string} searchTerm - Search term
 * @param {Array} searchFields - Fields to search in
 * @param {Object} options - Additional options
 * @returns {Array} Search results
 */
const searchRecords = async (model, searchTerm, searchFields, options = {}) => {
  const { page = 1, limit = 10, where = {}, orderBy = {} } = options;
  
  const searchConditions = searchFields.map(field => ({
    [field]: {
      contains: searchTerm,
      mode: 'insensitive'
    }
  }));
  
  const searchWhere = {
    ...where,
    OR: searchConditions
  };
  
  return getPaginatedResults(model, {
    page,
    limit,
    where: searchWhere,
    orderBy
  });
};

/**
 * Transaction helper
 * @param {Function} callback - Transaction callback
 * @returns {*} Transaction result
 */
const executeTransaction = async (callback) => {
  return prisma.$transaction(callback);
};

/**
 * Database health check
 * @returns {Object} Health status
 */
const checkHealth = async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { status: 'healthy', timestamp: new Date().toISOString() };
  } catch (error) {
    return { 
      status: 'unhealthy', 
      error: error.message, 
      timestamp: new Date().toISOString() 
    };
  }
};

/**
 * Get database statistics
 * @returns {Object} Database statistics
 */
const getDatabaseStats = async () => {
  try {
    const [
      userCount,
      vmCount,
      invoiceCount,
      activeVMs,
      totalRevenue
    ] = await Promise.all([
      prisma.user.count(),
      prisma.virtualMachine.count(),
      prisma.invoice.count(),
      prisma.virtualMachine.count({ where: { status: 'RUNNING' } }),
      prisma.invoice.aggregate({
        where: { status: 'PAID' },
        _sum: { amount: true }
      })
    ]);
    
    return {
      users: userCount,
      virtualMachines: vmCount,
      invoices: invoiceCount,
      activeVMs,
      totalRevenue: totalRevenue._sum.amount || 0,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    throw new Error(`Failed to get database stats: ${error.message}`);
  }
};

/**
 * Clean expired sessions
 * @returns {number} Number of cleaned sessions
 */
const cleanExpiredSessions = async () => {
  const result = await prisma.session.deleteMany({
    where: {
      expiresAt: {
        lt: new Date()
      }
    }
  });
  
  return result.count;
};

/**
 * Archive old data
 * @param {number} daysOld - Days old threshold
 * @returns {Object} Archive results
 */
const archiveOldData = async (daysOld = 90) => {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysOld);
  
  const [auditLogs, usageRecords] = await Promise.all([
    prisma.auditLog.deleteMany({
      where: {
        timestamp: { lt: cutoffDate }
      }
    }),
    prisma.usageRecord.deleteMany({
      where: {
        timestamp: { lt: cutoffDate }
      }
    })
  ]);
  
  return {
    auditLogs: auditLogs.count,
    usageRecords: usageRecords.count,
    cutoffDate
  };
};

module.exports = {
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
  archiveOldData
};