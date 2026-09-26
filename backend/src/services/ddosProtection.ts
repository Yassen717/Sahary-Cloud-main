type BlockedIPEntry = {
    blockedUntil: number;
    reason: string;
    blockedAt: string;
};

type BlockedIPInfo = {
    ip: string;
    blockedUntil: string;
    reason: string;
    remainingTime: number;
};

type BlockIPResult = {
    success: boolean;
    ip: string;
    blockedUntil: string;
    reason: string;
};

type UnblockIPResult = {
    success: boolean;
    ip: string;
    wasBlocked: boolean;
};

type ClearAllBlocksResult = {
    success: boolean;
    cleared: number;
};

type BlockStatistics = {
    totalBlocked: number;
    activeBlocks: number;
    expiredBlocks: number;
};

/**
 * DDoS Protection Service
 * Handles IP blocking and rate limiting for DDoS protection
 */
class DDoSProtectionService {
  blockedIPs = new Map<string, BlockedIPEntry>(); // Map of IP -> { blockedUntil, reason }

  /**
     * Get list of currently blocked IPs
     * @returns List of blocked IPs with expiration times
     */
  getBlockedIPs(): BlockedIPInfo[] {
    const now = Date.now();
    const blocked: BlockedIPInfo[] = [];

    // Clean up expired blocks
    for (const [ip, data] of this.blockedIPs.entries()) {
      if (data.blockedUntil < now) {
        this.blockedIPs.delete(ip);
      } else {
        blocked.push({
          ip,
          blockedUntil: new Date(data.blockedUntil).toISOString(),
          reason: data.reason || 'DDoS protection',
          remainingTime: Math.ceil((data.blockedUntil - now) / 1000), // seconds
        });
      }
    }

    return blocked;
  }

  /**
     * Check if an IP is blocked
     * @param ip - IP address to check
     * @returns True if IP is blocked
     */
  isBlocked(ip: string): boolean {
    const data = this.blockedIPs.get(ip);
    if (!data) return false;

    const now = Date.now();
    if (data.blockedUntil < now) {
      this.blockedIPs.delete(ip);
      return false;
    }

    return true;
  }

  /**
     * Block an IP address
     * @param ip - IP address to block
     * @param duration - Duration in milliseconds (default: 1 hour)
     * @param reason - Reason for blocking
     */
  async blockIP(ip: string, duration = 60 * 60 * 1000, reason = 'Manual block'): Promise<BlockIPResult> {
    const blockedUntil = Date.now() + duration;

    this.blockedIPs.set(ip, {
      blockedUntil,
      reason,
      blockedAt: new Date().toISOString(),
    });

    console.log(`IP ${ip} blocked until ${new Date(blockedUntil).toISOString()}: ${reason}`);

    return {
      success: true,
      ip,
      blockedUntil: new Date(blockedUntil).toISOString(),
      reason,
    };
  }

  /**
     * Unblock an IP address
     * @param ip - IP address to unblock
     */
  async unblockIP(ip: string): Promise<UnblockIPResult> {
    const existed = this.blockedIPs.has(ip);
    this.blockedIPs.delete(ip);

    console.log(`IP ${ip} ${existed ? 'unblocked' : 'was not blocked'}`);

    return {
      success: true,
      ip,
      wasBlocked: existed,
    };
  }

  /**
     * Clear all IP blocks
     */
  async clearAllBlocks(): Promise<ClearAllBlocksResult> {
    const count = this.blockedIPs.size;
    this.blockedIPs.clear();

    console.log(`Cleared ${count} IP blocks`);

    return {
      success: true,
      cleared: count,
    };
  }

  /**
     * Get statistics about blocked IPs
     * @returns Statistics
     */
  getStatistics(): BlockStatistics {
    const now = Date.now();
    let active = 0;
    let expired = 0;

    for (const [, data] of this.blockedIPs.entries()) {
      if (data.blockedUntil < now) {
        expired++;
      } else {
        active++;
      }
    }

    return {
      totalBlocked: this.blockedIPs.size,
      activeBlocks: active,
      expiredBlocks: expired,
    };
  }
}

// Create singleton instance
const ddosProtection = new DDoSProtectionService();

export { ddosProtection, DDoSProtectionService };

export default {
  ddosProtection,
  DDoSProtectionService,
};
