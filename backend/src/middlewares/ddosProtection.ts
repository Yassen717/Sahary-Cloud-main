import type { NextFunction, Request, Response } from 'express';
import logger from '../utils/logger';
import { RateLimitError, ServiceUnavailableError } from '../utils/errors';

const redisService = require('../services/redisService');

type RequestLike = Request & {
  connection?: { remoteAddress?: string | null };
};

const getClientIp = (req: RequestLike): string => req.ip || req.connection?.remoteAddress || 'unknown';

class DDoSProtection {
  suspiciousIPs = new Set<string>();

  blockedIPs = new Set<string>();

  requestThreshold: number;

  timeWindow: number;

  blockDuration: number;

  constructor() {
    this.requestThreshold = Number.parseInt(process.env.DDOS_REQUEST_THRESHOLD || '100', 10);
    this.timeWindow = Number.parseInt(process.env.DDOS_TIME_WINDOW || '60000', 10);
    this.blockDuration = Number.parseInt(process.env.DDOS_BLOCK_DURATION || '3600000', 10);
  }

  async trackRequest(ip: string): Promise<{ allowed: boolean; count: number; threshold?: number }> {
    if (!redisService.isReady()) {
      return { allowed: true, count: 0 };
    }

    const key = `ddos:${ip}`;
    const now = Date.now();

    try {
      const client = redisService.getClient() as any;

      await client.zAdd(key, { score: now, value: `${now}` });
      await client.zRemRangeByScore(key, 0, now - this.timeWindow);
      const count = await client.zCard(key);
      await client.expire(key, Math.ceil(this.timeWindow / 1000));

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

  async isBlocked(ip: string): Promise<boolean> {
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

  async blockIP(ip: string, duration = this.blockDuration): Promise<void> {
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

  async unblockIP(ip: string): Promise<void> {
    this.blockedIPs.delete(ip);
    this.suspiciousIPs.delete(ip);

    if (redisService.isReady()) {
      const key = `ddos:blocked:${ip}`;
      await redisService.del(key);
    }

    logger.logSecurity('IP unblocked', { ip });
  }

  markSuspicious(ip: string): void {
    this.suspiciousIPs.add(ip);
    logger.logSecurity('IP marked as suspicious', { ip });
  }

  getBlockedIPs(): string[] {
    return Array.from(this.blockedIPs);
  }

  getSuspiciousIPs(): string[] {
    return Array.from(this.suspiciousIPs);
  }

  async clearAllBlocks(): Promise<void> {
    this.blockedIPs.clear();
    this.suspiciousIPs.clear();

    if (redisService.isReady()) {
      await redisService.delPattern('ddos:blocked:*');
    }

    logger.info('All DDoS blocks cleared');
  }
}

const ddosProtection = new DDoSProtection();

const ddosProtectionMiddleware = async (req: RequestLike, _res: Response, next: NextFunction): Promise<void> => {
  const ip = getClientIp(req);

  try {
    const isBlocked = await ddosProtection.isBlocked(ip);
    if (isBlocked) {
      logger.logSecurity('Blocked IP attempted access', { ip, path: req.path });
      throw new ServiceUnavailableError('Service', {
        reason: 'IP blocked due to suspicious activity',
      });
    }

    const tracking = await ddosProtection.trackRequest(ip);

    if (!tracking.allowed) {
      ddosProtection.markSuspicious(ip);

      if (tracking.count > tracking.threshold! * 1.5) {
        await ddosProtection.blockIP(ip);
        throw new ServiceUnavailableError('Service', {
          reason: 'Too many requests - IP blocked',
        });
      }

      throw new RateLimitError('Too many requests from this IP', 60);
    }

    next();
  } catch (error) {
    next(error as Error);
  }
};

const connectionLimitMiddleware = (() => {
  const connections = new Map<string, number>();
  const maxConnections = Number.parseInt(process.env.MAX_CONNECTIONS_PER_IP || '10', 10);

  return (req: RequestLike, res: Response, next: NextFunction): void => {
    const ip = getClientIp(req);
    const count = connections.get(ip) || 0;

    if (count >= maxConnections) {
      logger.logSecurity('Connection limit exceeded', { ip, count });
      next(new RateLimitError('Too many concurrent connections', 30));
      return;
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

export {
  ddosProtection, ddosProtectionMiddleware, connectionLimitMiddleware, DDoSProtection,
};

export default {
  ddosProtection,
  ddosProtectionMiddleware,
  connectionLimitMiddleware,
  DDoSProtection,
};
