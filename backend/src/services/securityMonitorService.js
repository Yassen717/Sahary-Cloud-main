const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const logger = require('../utils/logger');
const emailService = require('./emailService');

/**
 * Security Monitoring Service
 * Monitors and tracks security events
 */
class SecurityMonitorService {
  constructor() {
    this.securityEvents = [];
    this.suspiciousActivities = new Map();
    this.maxEventsInMemory = 1000;
  }

  /**
   * Log security event
   * @param {Object} event - Security event
   * @returns {Promise<Object>} Logged event
   */
  async logSecurityEvent(event) {
    const securityEvent = {
      type: event.type,
      severity: event.severity || 'INFO',
      description: event.description,
      ip: event.ip,
      userId: event.userId,
      userAgent: event.userAgent,
      metadata: event.metadata || {},
      timestamp: new Date(),
    };

    // Store in memory
    this.securityEvents.push(securityEvent);
    if (this.securityEvents.length > this.maxEventsInMemory) {
      this.securityEvents.shift();
    }

    // Log to file
    logger.logSecurity(event.type, securityEvent);

    // Store in database (if SecurityEvent model exists)
    // await prisma.securityEvent.create({ data: securityEvent });

    // Check if action is needed
    await this.analyzeEvent(securityEvent);

    return securityEvent;
  }

  /**
   * Analyze security event
   * @param {Object} event - Security event
   */
  async analyzeEvent(event) {
    // Track suspicious activities by IP
    if (event.severity === 'HIGH' || event.severity === 'CRITICAL') {
      const key = event.ip || event.userId;
      if (key) {
        const activities = this.suspiciousActivities.get(key) || [];
        activities.push(event);
        this.suspiciousActivities.set(key, activities);

        // Alert if too many suspicious activities
        if (activities.length >= 5) {
          await this.alertAdmins('Multiple suspicious activities detected', {
            key,
            count: activities.length,
            events: activities.slice(-5),
          });
        }
      }
    }
  }

  /**
   * Log failed login attempt
   * @param {Object} data - Login attempt data
   */
  async logFailedLogin(data) {
    await this.logSecurityEvent({
      type: 'FAILED_LOGIN',
      severity: 'MEDIUM',
      description: 'Failed login attempt',
      ip: data.ip,
      userAgent: data.userAgent,
      metadata: {
        email: data.email,
        reason: data.reason,
      },
    });
  }

  /**
   * Log successful login
   * @param {Object} data - Login data
   */
  async logSuccessfulLogin(data) {
    await this.logSecurityEvent({
      type: 'SUCCESSFUL_LOGIN',
      severity: 'INFO',
      description: 'Successful login',
      ip: data.ip,
      userId: data.userId,
      userAgent: data.userAgent,
    });
  }

  /**
   * Log unauthorized access attempt
   * @param {Object} data - Access attempt data
   */
  async logUnauthorizedAccess(data) {
    await this.logSecurityEvent({
      type: 'UNAUTHORIZED_ACCESS',
      severity: 'HIGH',
      description: 'Unauthorized access attempt',
      ip: data.ip,
      userId: data.userId,
      userAgent: data.userAgent,
      metadata: {
        resource: data.resource,
        action: data.action,
      },
    });
  }

  /**
   * Log suspicious activity
   * @param {Object} data - Activity data
   */
  async logSuspiciousActivity(data) {
    await this.logSecurityEvent({
      type: 'SUSPICIOUS_ACTIVITY',
      severity: 'HIGH',
      description: data.description || 'Suspicious activity detected',
      ip: data.ip,
      userId: data.userId,
      userAgent: data.userAgent,
      metadata: data.metadata || {},
    });
  }

  /**
   * Log data breach attempt
   * @param {Object} data - Breach attempt data
   */
  async logDataBreachAttempt(data) {
    await this.logSecurityEvent({
      type: 'DATA_BREACH_ATTEMPT',
      severity: 'CRITICAL',
      description: 'Potential data breach attempt',
      ip: data.ip,
      userId: data.userId,
      userAgent: data.userAgent,
      metadata: data.metadata || {},
    });

    // Immediate alert for critical events
    await this.alertAdmins('CRITICAL: Data breach attempt detected', data);
  }

  /**
   * Log privilege escalation attempt
   * @param {Object} data - Escalation attempt data
   */
  async logPrivilegeEscalation(data) {
    await this.logSecurityEvent({
      type: 'PRIVILEGE_ESCALATION',
      severity: 'CRITICAL',
      description: 'Privilege escalation attempt',
      ip: data.ip,
      userId: data.userId,
      userAgent: data.userAgent,
      metadata: {
        currentRole: data.currentRole,
        attemptedRole: data.attemptedRole,
      },
    });
  }

  /**
   * Get security events
   * @param {Object} options - Query options
   * @returns {Array} Security events
   */
  getSecurityEvents(options = {}) {
    const { type, severity, limit = 100, startDate, endDate } = options;

    let events = [...this.securityEvents];

    // Filter by type
    if (type) {
      events = events.filter(e => e.type === type);
    }

    // Filter by severity
    if (severity) {
      events = events.filter(e => e.severity === severity);
    }

    // Filter by date range
    if (startDate) {
      events = events.filter(e => e.timestamp >= new Date(startDate));
    }
    if (endDate) {
      events = events.filter(e => e.timestamp <= new Date(endDate));
    }

    // Sort by timestamp (newest first)
    events.sort((a, b) => b.timestamp - a.timestamp);

    // Limit results
    return events.slice(0, limit);
  }

  /**
   * Get security statistics
   * @returns {Object} Security statistics
   */
  getSecurityStats() {
    const stats = {
      total: this.securityEvents.length,
      bySeverity: {},
      byType: {},
      recentEvents: this.securityEvents.slice(-10),
    };

    // Count by severity
    this.securityEvents.forEach(event => {
      stats.bySeverity[event.severity] = (stats.bySeverity[event.severity] || 0) + 1;
      stats.byType[event.type] = (stats.byType[event.type] || 0) + 1;
    });

    return stats;
  }

  /**
   * Get suspicious activities
   * @returns {Array} Suspicious activities
   */
  getSuspiciousActivities() {
    const activities = [];

    for (const [key, events] of this.suspiciousActivities.entries()) {
      activities.push({
        identifier: key,
        eventCount: events.length,
        latestEvent: events[events.length - 1],
        events: events.slice(-5),
      });
    }

    return activities.sort((a, b) => b.eventCount - a.eventCount);
  }

  /**
   * Get security health status
   * @returns {Object} Security health
   */
  getSecurityHealth() {
    const recentEvents = this.securityEvents.filter(
      e => Date.now() - e.timestamp.getTime() < 3600000 // Last hour
    );

    const criticalCount = recentEvents.filter(e => e.severity === 'CRITICAL').length;
    const highCount = recentEvents.filter(e => e.severity === 'HIGH').length;

    let status = 'healthy';
    const issues = [];

    if (criticalCount > 0) {
      status = 'critical';
      issues.push(`${criticalCount} critical security events in last hour`);
    } else if (highCount > 5) {
      status = 'warning';
      issues.push(`${highCount} high severity events in last hour`);
    }

    return {
      status,
      issues,
      recentEvents: recentEvents.length,
      criticalEvents: criticalCount,
      highSeverityEvents: highCount,
      suspiciousActivities: this.suspiciousActivities.size,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Alert administrators
   * @param {string} subject - Alert subject
   * @param {Object} data - Alert data
   */
  async alertAdmins(subject, data) {
    try {
      // Get all admin users
      const admins = await prisma.user.findMany({
        where: {
          role: { in: ['ADMIN', 'SUPER_ADMIN'] },
          isActive: true,
        },
      });

      // Send email to each admin
      for (const admin of admins) {
        await emailService.sendEmail({
          to: admin.email,
          subject: `🚨 Security Alert: ${subject}`,
          html: `
            <div dir="rtl">
              <h2>تنبيه أمني</h2>
              <p><strong>الموضوع:</strong> ${subject}</p>
              <p><strong>التفاصيل:</strong></p>
              <pre>${JSON.stringify(data, null, 2)}</pre>
              <p><strong>الوقت:</strong> ${new Date().toLocaleString('ar-EG')}</p>
              <p>يرجى مراجعة لوحة التحكم للحصول على مزيد من التفاصيل.</p>
            </div>
          `,
        }).catch(err => logger.error(`Failed to send alert to ${admin.email}:`, err));
      }

      logger.info(`Security alert sent to ${admins.length} admins`);
    } catch (error) {
      logger.error('Error sending security alerts:', error);
    }
  }

  /**
   * Clear old events
   * @param {number} olderThan - Clear events older than (ms)
   */
  clearOldEvents(olderThan = 86400000) {
    // 24 hours
    const cutoff = Date.now() - olderThan;
    this.securityEvents = this.securityEvents.filter(
      e => e.timestamp.getTime() > cutoff
    );

    logger.info(`Cleared old security events (older than ${olderThan}ms)`);
  }

  /**
   * Generate security report
   * @param {Object} options - Report options
   * @returns {Object} Security report
   */
  generateSecurityReport(options = {}) {
    const { period = 'day' } = options;

    const periodMs = {
      hour: 3600000,
      day: 86400000,
      week: 604800000,
      month: 2592000000,
    };

    const cutoff = Date.now() - (periodMs[period] || periodMs.day);
    const events = this.securityEvents.filter(
      e => e.timestamp.getTime() > cutoff
    );

    const report = {
      period,
      totalEvents: events.length,
      bySeverity: {},
      byType: {},
      topIPs: {},
      timeline: [],
    };

    // Analyze events
    events.forEach(event => {
      // Count by severity
      report.bySeverity[event.severity] = (report.bySeverity[event.severity] || 0) + 1;

      // Count by type
      report.byType[event.type] = (report.byType[event.type] || 0) + 1;

      // Count by IP
      if (event.ip) {
        report.topIPs[event.ip] = (report.topIPs[event.ip] || 0) + 1;
      }
    });

    // Sort top IPs
    report.topIPs = Object.entries(report.topIPs)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .reduce((obj, [ip, count]) => {
        obj[ip] = count;
        return obj;
      }, {});

    return report;
  }
}

module.exports = new SecurityMonitorService();
