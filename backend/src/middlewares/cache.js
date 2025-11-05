const redisService = require('../services/redisService');

/**
 * Cache Middleware
 * Caches API responses in Redis
 */

/**
 * Create cache middleware
 * @param {Object} options - Cache options
 * @param {number} options.ttl - Time to live in seconds (default: 300)
 * @param {Function} options.keyGenerator - Custom key generator function
 * @param {Function} options.condition - Condition function to determine if response should be cached
 * @returns {Function} Express middleware
 */
const cacheMiddleware = (options = {}) => {
  const {
    ttl = 300, // 5 minutes default
    keyGenerator = null,
    condition = null
  } = options;

  return async (req, res, next) => {
    // Skip caching if Redis is not connected
    if (!redisService.isReady()) {
      return next();
    }

    // Skip caching for non-GET requests
    if (req.method !== 'GET') {
      return next();
    }

    // Generate cache key
    const cacheKey = keyGenerator 
      ? keyGenerator(req)
      : generateCacheKey(req);

    try {
      // Try to get cached response
      const cachedResponse = await redisService.get(cacheKey);

      if (cachedResponse) {
        console.log(`✅ Cache HIT: ${cacheKey}`);
        return res.status(200).json({
          ...cachedResponse,
          cached: true,
          cachedAt: cachedResponse.timestamp
        });
      }

      console.log(`❌ Cache MISS: ${cacheKey}`);

      // Store original res.json function
      const originalJson = res.json.bind(res);

      // Override res.json to cache the response
      res.json = function(data) {
        // Check condition if provided
        const shouldCache = condition ? condition(req, res, data) : true;

        if (shouldCache && res.statusCode === 200) {
          // Cache the response
          const cacheData = {
            ...data,
            timestamp: new Date().toISOString()
          };

          redisService.set(cacheKey, cacheData, ttl)
            .then(() => console.log(`💾 Cached: ${cacheKey}`))
            .catch(err => console.error(`Cache error: ${err.message}`));
        }

        // Call original json function
        return originalJson(data);
      };

      next();
    } catch (error) {
      console.error('Cache middleware error:', error);
      next();
    }
  };
};

/**
 * Generate cache key from request
 * @param {Object} req - Express request object
 * @returns {string} Cache key
 */
const generateCacheKey = (req) => {
  const userId = req.user?.id || 'anonymous';
  const path = req.path;
  const query = JSON.stringify(req.query);
  
  return `cache:${userId}:${path}:${query}`;
};

/**
 * Invalidate cache by pattern
 * @param {string} pattern - Cache key pattern
 * @returns {Function} Express middleware
 */
const invalidateCache = (pattern) => {
  return async (req, res, next) => {
    try {
      if (redisService.isReady()) {
        const count = await redisService.invalidate(pattern);
        console.log(`🗑️  Invalidated ${count} cache entries matching: ${pattern}`);
      }
      next();
    } catch (error) {
      console.error('Cache invalidation error:', error);
      next();
    }
  };
};

/**
 * Invalidate user-specific cache
 * @returns {Function} Express middleware
 */
const invalidateUserCache = () => {
  return async (req, res, next) => {
    try {
      if (redisService.isReady() && req.user?.id) {
        const pattern = `cache:${req.user.id}:*`;
        const count = await redisService.invalidate(pattern);
        console.log(`🗑️  Invalidated ${count} cache entries for user ${req.user.id}`);
      }
      next();
    } catch (error) {
      console.error('User cache invalidation error:', error);
      next();
    }
  };
};

/**
 * Cache statistics middleware
 * @returns {Function} Express middleware
 */
const cacheStats = () => {
  return async (req, res) => {
    try {
      if (!redisService.isReady()) {
        return res.status(503).json({
          success: false,
          error: 'Redis is not connected'
        });
      }

      const stats = await redisService.getStats();

      res.status(200).json({
        success: true,
        data: stats
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  };
};

/**
 * Predefined cache configurations
 */
const cacheConfigs = {
  // Short cache (1 minute) - for frequently changing data
  short: cacheMiddleware({ ttl: 60 }),
  
  // Medium cache (5 minutes) - default
  medium: cacheMiddleware({ ttl: 300 }),
  
  // Long cache (1 hour) - for rarely changing data
  long: cacheMiddleware({ ttl: 3600 }),
  
  // Very long cache (24 hours) - for static data
  veryLong: cacheMiddleware({ ttl: 86400 }),
  
  // User-specific cache (5 minutes)
  user: cacheMiddleware({
    ttl: 300,
    keyGenerator: (req) => `cache:user:${req.user?.id}:${req.path}:${JSON.stringify(req.query)}`
  }),
  
  // Public cache (10 minutes) - for public data
  public: cacheMiddleware({
    ttl: 600,
    keyGenerator: (req) => `cache:public:${req.path}:${JSON.stringify(req.query)}`
  })
};

module.exports = {
  cacheMiddleware,
  invalidateCache,
  invalidateUserCache,
  cacheStats,
  cacheConfigs,
  generateCacheKey
};
