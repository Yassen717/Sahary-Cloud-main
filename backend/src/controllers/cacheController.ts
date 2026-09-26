import type { NextFunction, Request, Response } from 'express';

const redisService = require('../services/redisService');
const cacheMonitorService = require('../services/cacheMonitorService');

type CacheControllerRequest = Request & {
  query: {
    pattern?: string;
    limit?: string | number;
  };
  body: {
    pattern?: string;
  };
};

type WarmupFunction = () => Promise<unknown>;

const getStats = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const stats = cacheMonitorService.getStats();

    res.status(200).json({
      success: true,
      data: stats,
    });
  } catch (error) {
    next(error);
  }
};

const getHealth = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const health = await cacheMonitorService.getHealthStatus();

    res.status(200).json({
      success: true,
      data: health,
    });
  } catch (error) {
    next(error);
  }
};

const getSize = async (req: CacheControllerRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { pattern = 'cache:*' } = req.query;
    const size = await cacheMonitorService.getCacheSize(pattern);

    res.status(200).json({
      success: true,
      data: size,
    });
  } catch (error) {
    next(error);
  }
};

const getTopKeys = async (req: CacheControllerRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { limit = 10 } = req.query;
    const parsedLimit = Number.parseInt(String(limit), 10);
    const keys = await cacheMonitorService.getTopKeys(parsedLimit);

    res.status(200).json({
      success: true,
      count: keys.length,
      data: keys,
    });
  } catch (error) {
    next(error);
  }
};

const analyzePatterns = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const analysis = await cacheMonitorService.analyzeCachePatterns();

    res.status(200).json({
      success: true,
      data: analysis,
    });
  } catch (error) {
    next(error);
  }
};

const clearCache = async (req: CacheControllerRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { pattern = 'cache:*' } = req.body;

    const deleted = await redisService.invalidate(pattern);

    res.status(200).json({
      success: true,
      message: `Cleared ${deleted} cache entries`,
      deleted,
    });
  } catch (error) {
    next(error);
  }
};

const optimizeCache = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await cacheMonitorService.optimizeCache();

    res.status(200).json({
      success: true,
      message: 'Cache optimized successfully',
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

const resetStats = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    cacheMonitorService.resetStats();

    res.status(200).json({
      success: true,
      message: 'Cache statistics reset successfully',
    });
  } catch (error) {
    next(error);
  }
};

const warmupCache = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const warmupFunctions: WarmupFunction[] = [];

    const result = await cacheMonitorService.warmupCache(warmupFunctions);

    res.status(200).json({
      success: true,
      message: 'Cache warmup completed',
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

const getRedisInfo = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const info = await redisService.getStats();

    res.status(200).json({
      success: true,
      data: info,
    });
  } catch (error) {
    next(error);
  }
};

export {
  getStats,
  getHealth,
  getSize,
  getTopKeys,
  analyzePatterns,
  clearCache,
  optimizeCache,
  resetStats,
  warmupCache,
  getRedisInfo,
};

export default {
  getStats,
  getHealth,
  getSize,
  getTopKeys,
  analyzePatterns,
  clearCache,
  optimizeCache,
  resetStats,
  warmupCache,
  getRedisInfo,
};
