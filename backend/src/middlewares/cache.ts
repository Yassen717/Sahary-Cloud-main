// @ts-nocheck
const crypto = require('crypto');
const redisService = require('../services/redisService');

const MAX_KEY_LENGTH = 250;

/**
 * Serialize query params with sorted keys so the cache key is stable
 * regardless of the client’s parameter ordering.
 */
const serializeQuery = (query = {}) => {
  const sorted = Object.keys(query)
    .sort()
    .reduce((acc, key) => {
      acc[key] = query[key];
      return acc;
    }, {});

  return JSON.stringify(sorted);
};

/**
 * Cap cache key length — hash overly long keys while keeping the
 * `cache:user:{id}` prefix so pattern invalidation still works.
 */
const capKeyLength = (key) => {
  if (key.length <= MAX_KEY_LENGTH) {
    return key;
  }

  const hash = crypto.createHash('sha256').update(key).digest('hex');
  // Keep the `cache:user:{id}` / `cache:public` prefix so pattern-based
  // invalidation still matches hashed keys.
  const prefix = key.match(/^cache:(?:user:[^:]+|public)/)?.[0] || 'cache';

  return `${prefix}:h:${hash}`;
};

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
    condition = null,
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
        // Signal cache hits via header only — injecting extra fields into the
        // body would change the response schema.
        res.setHeader('X-Cache', 'HIT');
        const payload = cachedResponse && cachedResponse.__cacheEntry
          ? cachedResponse.payload
          : cachedResponse;
        return res.status(200).json(payload);
      }

      console.log(`❌ Cache MISS: ${cacheKey}`);

      // Store original res.json function
      const originalJson = res.json.bind(res);

      // Override res.json to cache the response
      res.json = function (data) {
        // Check condition if provided
        const shouldCache = condition ? condition(req, res, data) : true;

        if (shouldCache && res.statusCode === 200) {
          // Cache the response in an envelope so cached payloads round-trip
          // without schema changes
          const cacheData = {
            __cacheEntry: true,
            payload: data,
            timestamp: new Date().toISOString(),
          };

          redisService.set(cacheKey, cacheData, ttl)
            .then(() => console.log(`💾 Cached: ${cacheKey}`))
            .catch((err) => console.error(`Cache error: ${err.message}`));
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
  const { path } = req;
  const query = serializeQuery(req.query);

  return capKeyLength(`cache:user:${userId}:${path}:${query}`);
};

/**
 * Invalidate cache by pattern
 * @param {string} pattern - Cache key pattern
 * @returns {Function} Express middleware
 */
const invalidateCache = (pattern) => async (req, res, next) => {
  // Invalidate only after the mutation succeeds — running it before the
  // handler races with the write and can leave stale entries behind.
  res.on('finish', () => {
    if (res.statusCode >= 200 && res.statusCode < 300 && redisService.isReady()) {
      redisService.invalidate(pattern)
        .then((count) => console.log(`🗑️  Invalidated ${count} cache entries matching: ${pattern}`))
        .catch((error) => console.error('Cache invalidation error:', error));
    }
  });

  next();
};

/**
 * Invalidate user-specific cache
 * @returns {Function} Express middleware
 */
const invalidateUserCache = () => async (req, res, next) => {
  // Deferred to 'finish' for the same stale-write race as invalidateCache.
  res.on('finish', () => {
    if (
      res.statusCode >= 200
        && res.statusCode < 300
        && redisService.isReady()
        && req.user?.id
    ) {
      const pattern = `cache:user:${req.user.id}:*`;

      redisService.invalidate(pattern)
        .then((count) => console.log(`🗑️  Invalidated ${count} cache entries for user ${req.user.id}`))
        .catch((error) => console.error('User cache invalidation error:', error));
    }
  });

  next();
};

/**
 * Cache statistics middleware
 * @returns {Function} Express middleware
 */
const cacheStats = () => async (req, res) => {
  try {
    if (!redisService.isReady()) {
      return res.status(503).json({
        success: false,
        error: 'Redis is not connected',
      });
    }

    const stats = await redisService.getStats();

    res.status(200).json({
      success: true,
      data: stats,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
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
    keyGenerator: (req) => capKeyLength(`cache:user:${req.user?.id || 'anonymous'}:${req.path}:${serializeQuery(req.query)}`),
  }),

  // Public cache (10 minutes) - for public data
  public: cacheMiddleware({
    ttl: 600,
    keyGenerator: (req) => capKeyLength(`cache:public:${req.path}:${serializeQuery(req.query)}`),
  }),
};

module.exports = {
  cacheMiddleware,
  invalidateCache,
  invalidateUserCache,
  cacheStats,
  cacheConfigs,
  generateCacheKey,
};
