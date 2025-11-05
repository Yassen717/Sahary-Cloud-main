const monitoringService = require('../services/monitoringService');
const errorTrackingService = require('../services/errorTrackingService');
const cacheMonitorService = require('../services/cacheMonitorService');

/**
 * Monitoring Controller
 * Handles monitoring and health check endpoints
 */

/**
 * Get health status
 * @route GET /api/monitoring/health
 * @access Private/Admin
 */
exports.getHealth = async (req, res, next) => {
  try {
    const health = await monitoringService.getHealthStatus();
    
    const statusCode = health.status === 'healthy' ? 200 : 503;
    
    res.status(statusCode).json({
      success: health.status === 'healthy',
      data: health
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get detailed health report
 * @route GET /api/monitoring/health/detailed
 * @access Private/Admin
 */
exports.getDetailedHealth = async (req, res, next) => {
  try {
    const report = await monitoringService.getDetailedHealthReport();
    
    res.status(200).json({
      success: true,
      data: report
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get system information
 * @route GET /api/monitoring/system
 * @access Private/Admin
 */
exports.getSystemInfo = async (req, res, next) => {
  try {
    const systemInfo = monitoringService.getSystemInfo();
    
    res.status(200).json({
      success: true,
      data: systemInfo
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get application metrics
 * @route GET /api/monitoring/metrics
 * @access Private/Admin
 */
exports.getMetrics = async (req, res, next) => {
  try {
    const metrics = monitoringService.getMetrics();
    
    res.status(200).json({
      success: true,
      data: metrics
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Reset metrics
 * @route POST /api/monitoring/metrics/reset
 * @access Private/Admin
 */
exports.resetMetrics = async (req, res, next) => {
  try {
    monitoringService.resetMetrics();
    
    res.status(200).json({
      success: true,
      message: 'Metrics reset successfully'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get error statistics
 * @route GET /api/monitoring/errors/stats
 * @access Private/Admin
 */
exports.getErrorStats = async (req, res, next) => {
  try {
    const stats = await errorTrackingService.getErrorStats(req.query);
    
    res.status(200).json({
      success: true,
      data: stats
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get error trends
 * @route GET /api/monitoring/errors/trends
 * @access Private/Admin
 */
exports.getErrorTrends = async (req, res, next) => {
  try {
    const { period = 'day' } = req.query;
    const trends = await errorTrackingService.getErrorTrends(period);
    
    res.status(200).json({
      success: true,
      data: trends
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get most common errors
 * @route GET /api/monitoring/errors/common
 * @access Private/Admin
 */
exports.getCommonErrors = async (req, res, next) => {
  try {
    const { limit = 10 } = req.query;
    const errors = errorTrackingService.getMostCommonErrors(parseInt(limit));
    
    res.status(200).json({
      success: true,
      count: errors.length,
      data: errors
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get error health status
 * @route GET /api/monitoring/errors/health
 * @access Private/Admin
 */
exports.getErrorHealth = async (req, res, next) => {
  try {
    const health = errorTrackingService.getHealthStatus();
    
    res.status(200).json({
      success: true,
      data: health
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get cache monitoring data
 * @route GET /api/monitoring/cache
 * @access Private/Admin
 */
exports.getCacheMonitoring = async (req, res, next) => {
  try {
    const stats = cacheMonitorService.getStats();
    const health = await cacheMonitorService.getHealthStatus();
    
    res.status(200).json({
      success: true,
      data: {
        stats,
        health
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get comprehensive monitoring dashboard data
 * @route GET /api/monitoring/dashboard
 * @access Private/Admin
 */
exports.getDashboard = async (req, res, next) => {
  try {
    const [health, metrics, errorHealth, cacheStats] = await Promise.all([
      monitoringService.getHealthStatus(),
      Promise.resolve(monitoringService.getMetrics()),
      Promise.resolve(errorTrackingService.getHealthStatus()),
      cacheMonitorService.getHealthStatus()
    ]);
    
    res.status(200).json({
      success: true,
      data: {
        health,
        metrics,
        errors: errorHealth,
        cache: cacheStats
      }
    });
  } catch (error) {
    next(error);
  }
};
