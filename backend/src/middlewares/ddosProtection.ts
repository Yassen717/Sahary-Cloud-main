import type { NextFunction, Request, Response } from 'express';
import logger from '../utils/logger';
import { RateLimitError, ServiceUnavailableError } from '../utils/errors';

const redisService = require('../services/redisService');

type RequestLike = Request & {
  connection?: { remoteAddress?: string | null };
};

const BLOCKED_KEY_PREFIX = 'ddos:blocked:';
const MAX_BLOCK_DURATION = 30 * 24 * 60 * 60 * 1000; // 30 days

const getClientIp = (req: RequestLike): string => req.ip || req.connection?.remoteAddress || 'unknown';

// SCAN is preferred over KEYS on shared keyspaces; falls back to KEYS when
// the client does not expose a scan iterator.
const scanKeys = async (pattern: string): Promise<string[]> => {
  const client = redisService.getClient() as any;

  if (typeof client.scanIterator === 'function') {
    const keys: string[] = [];
    for await (const batch of client.scanIterator({ MATCH: pattern, COUNT: 100 })) {
      if (Array.isArray(batch)) {
        keys.push(...batch);
      } else {
        keys.push(batch);
      }
    }
    return keys;
  }

  return client.keys(pattern);
};

class DDoSProtection {
  suspiciousIPs = new Set<string>();

  // In-memory mirror of the Redis block store: ip -> blockedUntil (epoch ms).
  // Entries are checked against Date.now() so blocks expire instead of
  // being stuck in the set forever.
  blockedIPs = new Map<string, number>();

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
    const blockedUntil = this.blockedIPs.get(ip);
    if (blockedUntil !== undefined) {
      if (blockedUntil > Date.now()) {
        return true;
      }
      this.blockedIPs.delete(ip);
    }

    if (!redisService.isReady()) {
      return false;
    }

    const key = `${BLOCKED_KEY_PREFIX}${ip}`;
    const blocked = await redisService.exists(key);

    if (blocked) {
      const ttl = await redisService.ttl(key);
      this.blockedIPs.set(ip, Date.now() + (ttl > 0 ? ttl * 1000 : this.blockDuration));
    }

    return blocked;
  }

  async blockIP(ip: string, duration = this.blockDuration): Promise<void> {
    const durationMs = Number.isFinite(Number(duration)) && Number(duration) > 0
      ? Math.min(Number(duration), MAX_BLOCK_DURATION)
      : this.blockDuration;
    const blockedUntil = Date.now() + durationMs;

    this.blockedIPs.set(ip, blockedUntil);

    if (redisService.isReady()) {
      const key = `${BLOCKED_KEY_PREFIX}${ip}`;
      await redisService.set(key, { blockedAt: Date.now(), blockedUntil }, Math.ceil(durationMs / 1000));
    }

    logger.logSecurity('IP blocked for DDoS', {
      ip,
      duration: `${durationMs}ms`,
    });
  }

  async unblockIP(ip: string): Promise<void> {
    this.blockedIPs.delete(ip);
    this.suspiciousIPs.delete(ip);

    if (redisService.isReady()) {
      const key = `${BLOCKED_KEY_PREFIX}${ip}`;
      await redisService.del(key);
    }

    logger.logSecurity('IP unblocked', { ip });
  }

  markSuspicious(ip: string): void {
    this.suspiciousIPs.add(ip);
    logger.logSecurity('IP marked as suspicious', { ip });
  }

  // Lists every active block. The Redis `ddos:blocked:*` keys are the real
  // block store consulted by the request path; the in-memory map is only a
  // mirror, so both are merged here.
  async getBlockedIPs(): Promise<Array<{ ip: string; blockedUntil: string; reason: string; remainingTime: number }>> {
    const now = Date.now();
    const blocked = new Map<string, number>();

    for (const [ip, blockedUntil] of this.blockedIPs.entries()) {
      if (blockedUntil <= now) {
        this.blockedIPs.delete(ip);
        continue;
      }
      blocked.set(ip, blockedUntil);
    }

    if (redisService.isReady()) {
      try {
        const keys = await scanKeys(`${BLOCKED_KEY_PREFIX}*`);
        for (const key of keys) {
          const ip = key.slice(BLOCKED_KEY_PREFIX.length);
          if (blocked.has(ip)) {
            continue;
          }
          const ttl = await redisService.ttl(key);
          const blockedUntil = ttl > 0 ? now + ttl * 1000 : now + this.blockDuration;
          blocked.set(ip, blockedUntil);
          this.blockedIPs.set(ip, blockedUntil);
        }
      } catch (error) {
        logger.error('Failed to read blocked IPs from Redis:', error);
      }
    }

    return Array.from(blocked.entries()).map(([ip, blockedUntil]) => ({
      ip,
      blockedUntil: new Date(blockedUntil).toISOString(),
      reason: 'DDoS protection',
      remainingTime: Math.max(0, Math.ceil((blockedUntil - now) / 1000)),
    }));
  }

  getSuspiciousIPs(): string[] {
    return Array.from(this.suspiciousIPs);
  }

  async clearAllBlocks(): Promise<void> {
    this.blockedIPs.clear();
    this.suspiciousIPs.clear();

    if (redisService.isReady()) {
      await redisService.delPattern(`${BLOCKED_KEY_PREFIX}*`);
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

    // Decrement exactly once: 'finish' covers normal completions while
    // 'close' also fires for aborted/errored sockets that never finish.
    let released = false;
    const release = (): void => {
      if (released) {
        return;
      }
      released = true;
      const current = connections.get(ip) || 0;
      if (current <= 1) {
        connections.delete(ip);
      } else {
        connections.set(ip, current - 1);
      }
    };

    res.on('finish', release);
    res.on('close', release);

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
