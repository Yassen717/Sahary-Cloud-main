const redisService = require('../services/redisService');
const cacheMonitorService = require('../services/cacheMonitorService');

/**
 * Cache Management Controller
 * Handles cache administration and monitoring
 */

/**
 * Get cache statistics
 * @route GET /api/admin/cache/stats
 * @access Private/Admin
 */
exports.getStats = async (req, res, next) => {
  try {
    const stats = cacheMonitorService.getStats();
    
    res.status(200).json({
      success: true,
      data: stats
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get cache health status
 * @route GET /api/admin/cache/health
 * @access Private/Admin
 */
exports.getHealth = async (req, res, next) => {
  try {
    const health = await cacheMonitorService.getHealthStatus();
    
    res.status(200).json({
      success: true,
      data: health
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get cache size information
 * @route GET /api/admin/cache/size
 * @access Private/Admin
 */
exports.getSize = async (req, res, next) => {
  try {
    const { pattern = 'cache:*' } = req.query;
    const size = await cacheMonitorService.getCacheSize(pattern);
    
    res.status(200).json({
      success: true,
      data: size
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get top cached keys
 * @route GET /api/admin/cache/top-keys
 * @access Private/Admin
 */
exports.getTopKeys = async (req, res, next) => {
  try {
    const { limit = 10 } = req.query;
    const keys = await cacheMonitorService.getTopKeys(parseInt(limit));
    
    res.status(200).json({
      success: true,
      count: keys.length,
      data: keys
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Analyze cache patterns
 * @route GET /api/admin/cache/patterns
 * @access Private/Admin
 */
exports.analyzePatterns = async (req, res, next) => {
  try {
    const analysis = await cacheMonitorService.analyzeCachePatterns();
    
    res.status(200).json({
      success: true,
      data: analysis
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Clear cache by pattern
 * @route DELETE /api/admin/cache/clear
 * @access Private/Admin
 */
exports.clearCache = async (req, res, next) => {
  try {
    const { pattern = 'cache:*' } = req.body;
    
    const deleted = await redisService.invalidate(pattern);
    
    res.status(200).json({
      success: true,
      message: `Cleared ${deleted} cache entries`,
      deleted
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Optimize cache
 * @route POST /api/admin/cache/optimize
 * @access Private/Admin
 */
exports.optimizeCache = async (req, res, next) => {
  try {
    const result = await cacheMonitorService.optimizeCache();
    
    res.status(200).json({
      success: true,
      message: 'Cache optimized successfully',
      data: result
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Reset cache statistics
 * @route POST /api/admin/cache/reset-stats
 * @access Private/Admin
 */
exports.resetStats = async (req, res, next) => {
  try {
    cacheMonitorService.resetStats();
    
    res.status(200).json({
      success: true,
      message: 'Cache statistics reset successfully'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Warm up cache
 * @route POST /api/admin/cache/warmup
 * @access Private/Admin
 */
exports.warmupCache = async (req, res, next) => {
  try {
    // Define warmup functions for frequently accessed data
    const warmupFunctions = [
      // Add your warmup functions here
      // Example: async () => await someService.getFrequentData()
    ];

    const result = await cacheMonitorService.warmupCache(warmupFunctions);
    
    res.status(200).json({
      success: true,
      message: 'Cache warmup completed',
      data: result
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get Redis info
 * @route GET /api/admin/cache/redis-info
 * @access Private/Admin
 */
exports.getRedisInfo = async (req, res, next) => {
  try {
    const info = await redisService.getStats();
    
    res.status(200).json({
      success: true,
      data: info
    });
  } catch (error) {
    next(error);
  }
};
