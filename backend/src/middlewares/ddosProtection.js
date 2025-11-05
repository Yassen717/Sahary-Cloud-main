const redisService = require('../services/redisService');
const logger = require('../utils/logger');
const { RateLimitError, ServiceUnavailableError } = require('../utils/errors');

/**
 * DDoS Protection Middleware
 * Protects against Distributed Denial of Service attacks
 */

class DDoSProtection {
  constructor() {
    this.suspiciousIPs = new Set();
    this.blockedIPs = new Set();
    
    // Thresholds
    this.requestThreshold = parseInt(process.env.DDOS_REQUEST_THRESHOLD) || 100;
    this.timeWindow = parseInt(process.env.DDOS_TIME_WINDOW) || 60000; // 1 minute
    this.blockDuration = parseInt(process.env.DDOS_BLOCK_DURATION) || 3600000; // 1 hour
  }

  /**
   * Track request from IP
   * @param {string} ip - IP address
   * @returns {Promise<Object>} Tracking result
   */
  async trackRequest(ip) {
    if (!redisService.isReady()) {
      return { allowed: true, count: 0 };
    }

    const key = `ddos:${ip}`;
    const now = Date.now();

    try {
      // Increment request count
      await redisService.getClient().zAdd(key, { score: now, value: `${now}` });

      // Remove old entries
      await redisService.getClient().zRemRangeByScore(key, 0, now - this.timeWindow);

      // Count requests in window
      const count = await redisService.getClient().zCard(key);

      // Set expiry
      await redisService.getClient().expire(key, Math.ceil(this.timeWindow / 1000));

      return {
        allowed: count <= this.requestThreshold,
        count,
        threshold: this.requestThreshold,
      };
    } catch (error) {
      logger.error('DDoS tracking error:', error);
      return { allowed: true, count: 0 };
    }
  }

  /**
   * Check if IP is blocked
   * @param {string} ip - IP address
   * @returns {Promise<boolean>} Is blocked
   */
  async isBlocked(ip) {
    if (this.blockedIPs.has(ip)) {
      return true;
    }

    if (!redisService.isReady()) {
      return false;
    }

    const key = `ddos:blocked:${ip}`;
    const blocked = await redisService.exists(key);

    if (blocked) {
      this.blockedIPs.add(ip);
    }

    return blocked;
  }

  /**
   * Block IP address
   * @param {string} ip - IP address
   * @param {number} duration - Block duration in ms
   * @returns {Promise<void>}
   */
  async blockIP(ip, duration = this.blockDuration) {
    this.blockedIPs.add(ip);

    if (redisService.isReady()) {
      const key = `ddos:blocked:${ip}`;
      await redisService.set(key, { blockedAt: Date.now() }, Math.ceil(duration / 1000));
    }

    logger.logSecurity('IP blocked for DDoS', {
      ip,
      duration: `${duration}ms`,
    });
  }

  /**
   * Unblock IP address
   * @param {string} ip - IP address
   * @returns {Promise<void>}
   */
  async unblockIP(ip) {
    this.blockedIPs.delete(ip);
    this.suspiciousIPs.delete(ip);

    if (redisService.isReady()) {
      const key = `ddos:blocked:${ip}`;
      await redisService.del(key);
    }

    logger.logSecurity('IP unblocked', { ip });
  }

  /**
   * Mark IP as suspicious
   * @param {string} ip - IP address
   */
  markSuspicious(ip) {
    this.suspiciousIPs.add(ip);
    logger.logSecurity('IP marked as suspicious', { ip });
  }

  /**
   * Get blocked IPs list
   * @returns {Array} Blocked IPs
   */
  getBlockedIPs() {
    return Array.from(this.blockedIPs);
  }

  /**
   * Get suspicious IPs list
   * @returns {Array} Suspicious IPs
   */
  getSuspiciousIPs() {
    return Array.from(this.suspiciousIPs);
  }

  /**
   * Clear all blocks
   */
  async clearAllBlocks() {
    this.blockedIPs.clear();
    this.suspiciousIPs.clear();

    if (redisService.isReady()) {
      await redisService.delPattern('ddos:blocked:*');
    }

    logger.info('All DDoS blocks cleared');
  }
}

const ddosProtection = new DDoSProtection();

/**
 * DDoS protection middleware
 */
const ddosProtectionMiddleware = async (req, res, next) => {
  const ip = req.ip || req.connection.remoteAddress;

  try {
    // Check if IP is blocked
    const isBlocked = await ddosProtection.isBlocked(ip);
    if (isBlocked) {
      logger.logSecurity('Blocked IP attempted access', { ip, path: req.path });
      throw new ServiceUnavailableError('Service', {
        reason: 'IP blocked due to suspicious activity',
      });
    }

    // Track request
    const tracking = await ddosProtection.trackRequest(ip);

    if (!tracking.allowed) {
      // Mark as suspicious
      ddosProtection.markSuspicious(ip);

      // Block if threshold exceeded significantly
      if (tracking.count > tracking.threshold * 1.5) {
        await ddosProtection.blockIP(ip);
        throw new ServiceUnavailableError('Service', {
          reason: 'Too many requests - IP blocked',
        });
      }

      throw new RateLimitError('Too many requests from this IP', 60);
    }

    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Connection limit middleware
 * Limits concurrent connections per IP
 */
const connectionLimitMiddleware = (() => {
  const connections = new Map();
  const maxConnections = parseInt(process.env.MAX_CONNECTIONS_PER_IP) || 10;

  return (req, res, next) => {
    const ip = req.ip || req.connection.remoteAddress;
    const count = connections.get(ip) || 0;

    if (count >= maxConnections) {
      logger.logSecurity('Connection limit exceeded', { ip, count });
      return next(new RateLimitError('Too many concurrent connections', 30));
    }

    connections.set(ip, count + 1);

    res.on('finish', () => {
      const current = connections.get(ip) || 0;
      if (current <= 1) {
        connections.delete(ip);
      } else {
        connections.set(ip, current - 1);
      }
    });

    next();
  };
})();

module.exports = {
  ddosProtection,
  ddosProtectionMiddleware,
  connectionLimitMiddleware,
};
