import type { NextFunction, Request, Response } from 'express';

const monitoringService = require('../services/monitoringService');
const errorTrackingService = require('../services/errorTrackingService');
const cacheMonitorService = require('../services/cacheMonitorService');

type MonitoringRequest = Request & {
  query: {
    period?: string;
    limit?: string | number;
  };
};

const getHealth = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const health = await monitoringService.getHealthStatus();
    const statusCode = health.status === 'healthy' ? 200 : 503;

    res.status(statusCode).json({
      success: health.status === 'healthy',
      data: health,
    });
  } catch (error) {
    next(error);
  }
};

const getDetailedHealth = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const report = await monitoringService.getDetailedHealthReport();

    res.status(200).json({
      success: true,
      data: report,
    });
  } catch (error) {
    next(error);
  }
};

const getSystemInfo = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const systemInfo = monitoringService.getSystemInfo();

    res.status(200).json({
      success: true,
      data: systemInfo,
    });
  } catch (error) {
    next(error);
  }
};

const getMetrics = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const metrics = monitoringService.getMetrics();

    res.status(200).json({
      success: true,
      data: metrics,
    });
  } catch (error) {
    next(error);
  }
};

const resetMetrics = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    monitoringService.resetMetrics();

    res.status(200).json({
      success: true,
      message: 'Metrics reset successfully',
    });
  } catch (error) {
    next(error);
  }
};

const getErrorStats = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const stats = await errorTrackingService.getErrorStats(req.query);

    res.status(200).json({
      success: true,
      data: stats,
    });
  } catch (error) {
    next(error);
  }
};

const getErrorTrends = async (req: MonitoringRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { period = 'day' } = req.query;
    const trends = await errorTrackingService.getErrorTrends(period);

    res.status(200).json({
      success: true,
      data: trends,
    });
  } catch (error) {
    next(error);
  }
};

const getCommonErrors = async (req: MonitoringRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { limit = 10 } = req.query;
    const errors = errorTrackingService.getMostCommonErrors(Number.parseInt(String(limit), 10));

    res.status(200).json({
      success: true,
      count: errors.length,
      data: errors,
    });
  } catch (error) {
    next(error);
  }
};

const getErrorHealth = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const health = errorTrackingService.getHealthStatus();

    res.status(200).json({
      success: true,
      data: health,
    });
  } catch (error) {
    next(error);
  }
};

const getCacheMonitoring = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const stats = cacheMonitorService.getStats();
    const health = await cacheMonitorService.getHealthStatus();

    res.status(200).json({
      success: true,
      data: {
        stats,
        health,
      },
    });
  } catch (error) {
    next(error);
  }
};

const getDashboard = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const [health, metrics, errorHealth, cacheStats] = await Promise.all([
      monitoringService.getHealthStatus(),
      Promise.resolve(monitoringService.getMetrics()),
      Promise.resolve(errorTrackingService.getHealthStatus()),
      cacheMonitorService.getHealthStatus(),
    ]);

    res.status(200).json({
      success: true,
      data: {
        health,
        metrics,
        errors: errorHealth,
        cache: cacheStats,
      },
    });
  } catch (error) {
    next(error);
  }
};

export {
  getHealth,
  getDetailedHealth,
  getSystemInfo,
  getMetrics,
  resetMetrics,
  getErrorStats,
  getErrorTrends,
  getCommonErrors,
  getErrorHealth,
  getCacheMonitoring,
  getDashboard,
};

export default {
  getHealth,
  getDetailedHealth,
  getSystemInfo,
  getMetrics,
  resetMetrics,
  getErrorStats,
  getErrorTrends,
  getCommonErrors,
  getErrorHealth,
  getCacheMonitoring,
  getDashboard,
};