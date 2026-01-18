/**
 * DDoS Protection Service
 * Handles IP blocking and rate limiting for DDoS protection
 */
class DDoSProtectionService {
    constructor() {
        this.blockedIPs = new Map(); // Map of IP -> { blockedUntil, reason }
    }

    /**
     * Get list of currently blocked IPs
     * @returns {Array} List of blocked IPs with expiration times
     */
    getBlockedIPs() {
        const now = Date.now();
        const blocked = [];

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
     * @param {string} ip - IP address to check
     * @returns {boolean} True if IP is blocked
     */
    isBlocked(ip) {
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
     * @param {string} ip - IP address to block
     * @param {number} duration - Duration in milliseconds (default: 1 hour)
     * @param {string} reason - Reason for blocking
     */
    async blockIP(ip, duration = 60 * 60 * 1000, reason = 'Manual block') {
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
     * @param {string} ip - IP address to unblock
     */
    async unblockIP(ip) {
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
    async clearAllBlocks() {
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
     * @returns {Object} Statistics
     */
    getStatistics() {
        const now = Date.now();
        let active = 0;
        let expired = 0;

        for (const [ip, data] of this.blockedIPs.entries()) {
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

module.exports = {
    ddosProtection,
    DDoSProtectionService,
};
