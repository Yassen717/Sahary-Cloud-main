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

// Cache management must stay inside the `cache:*` namespace — an arbitrary
// pattern like `*` would let an admin delete session/blacklist/ddos keys.
const resolveCachePattern = (pattern: unknown): string | null => {
  if (pattern === undefined || pattern === null || pattern === '' || pattern === '*') {
    return 'cache:*';
  }
  if (typeof pattern !== 'string' || !pattern.startsWith('cache:')) {
    return null;
  }
  return pattern;
};

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
    const pattern = resolveCachePattern(req.query.pattern);
    if (pattern === null) {
      res.status(400).json({
        success: false,
        error: "Invalid pattern: must target the 'cache:*' namespace",
      });
      return;
    }
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
    const parsedLimit = Math.min(100, Math.max(1, Number.parseInt(String(limit), 10) || 10));
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
    const pattern = resolveCachePattern(req.body.pattern);
    if (pattern === null) {
      res.status(400).json({
        success: false,
        error: "Invalid pattern: must target the 'cache:*' namespace",
      });
      return;
    }

    // delPattern propagates Redis errors — invalidate() would swallow them as 0.
    const deleted = await redisService.delPattern(pattern);

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
