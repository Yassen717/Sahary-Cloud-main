// @ts-nocheck
const { prisma } = require('../config/database');
const emailService = require('./emailService');

/**
 * Solar Alert and Emergency Management Service
 * Handles monitoring, alerts, and emergency procedures for solar energy system
 */
class SolarAlertService {
  constructor() {
    // Alert thresholds (configurable via environment)
    this.thresholds = {
      lowProduction: parseFloat(process.env.LOW_PRODUCTION_THRESHOLD) || 20, // %
      criticalProduction: parseFloat(process.env.CRITICAL_PRODUCTION_THRESHOLD) || 10, // %
      lowBattery: parseFloat(process.env.LOW_BATTERY_THRESHOLD) || 30, // %
      criticalBattery: parseFloat(process.env.CRITICAL_BATTERY_THRESHOLD) || 15, // %
      highConsumption: parseFloat(process.env.HIGH_CONSUMPTION_THRESHOLD) || 90, // %
    };

    // Emergency states
    this.emergencyStates = {
      NORMAL: 'NORMAL',
      WARNING: 'WARNING',
      CRITICAL: 'CRITICAL',
      EMERGENCY: 'EMERGENCY',
    };

    this.currentState = this.emergencyStates.NORMAL;
    this.activeAlerts = new Map();

    // Repopulate the in-memory dedupe map from persisted unresolved alerts so
    // a restart doesn't pile up duplicate rows per breach
    this.loadUnresolvedAlerts();
  }

  /**
   * Whether solar production is expected right now. Mirrors the day/night
   * window in solarService.getSimulatedProduction (sun up 06:00-18:00).
   * @returns {boolean} True when production should be monitored
   */
  isSunExpected() {
    const hour = new Date().getHours();
    return hour >= 6 && hour <= 18;
  }

  /**
   * Load unresolved alerts from the database into the in-memory map
   */
  async loadUnresolvedAlerts() {
    try {
      const unresolved = await prisma.solarAlert.findMany({
        where: { resolved: false },
        orderBy: { createdAt: 'desc' },
      });

      for (const alert of unresolved) {
        // Keep the most recent alert per type
        if (!this.activeAlerts.has(alert.type)) {
          this.activeAlerts.set(alert.type, alert);
        }
      }

      if (unresolved.length > 0) {
        console.log(`Loaded ${unresolved.length} unresolved solar alert(s) into memory`);
      }
    } catch (error) {
      console.error('Failed to load unresolved alerts:', error);
    }
  }

  /**
   * Monitor energy levels and trigger alerts if needed
   * @param {Object} energyData - Current energy data
   * @returns {Promise<Object>} Monitoring result with alerts
   */
  async monitorEnergyLevels(energyData) {
    const {
      production, consumption, batteryLevel, capacity,
    } = energyData;

    const alerts = [];
    // capacity is the rated per-interval yield in kWh (the expected production
    // of a sunny interval), NOT total storage capacity — the percentage is the
    // share of expected yield actually produced this tick.
    const productionPercentage = capacity ? (production / capacity) * 100 : null;
    const consumptionPercentage = capacity ? (consumption / capacity) * 100 : null;

    // Check production levels — only while the sun is expected (06:00-18:00,
    // mirroring getSimulatedProduction) and a rated yield is configured.
    // Zero production at night is by design and must not alert; any stale
    // production alerts are resolved when the check doesn't apply or passes.
    if (capacity && this.isSunExpected()) {
      if (productionPercentage < this.thresholds.criticalProduction) {
        alerts.push(await this.createAlert({
          type: 'CRITICAL_LOW_PRODUCTION',
          severity: 'CRITICAL',
          message: `إنتاج الطاقة الشمسية منخفض جداً: ${productionPercentage.toFixed(1)}%`,
          data: { production, productionPercentage },
        }));
        await this.resolveAlertByType('LOW_PRODUCTION');
      } else if (productionPercentage < this.thresholds.lowProduction) {
        alerts.push(await this.createAlert({
          type: 'LOW_PRODUCTION',
          severity: 'WARNING',
          message: `إنتاج الطاقة الشمسية منخفض: ${productionPercentage.toFixed(1)}%`,
          data: { production, productionPercentage },
        }));
        await this.resolveAlertByType('CRITICAL_LOW_PRODUCTION');
      } else {
        await this.resolveAlertByType('CRITICAL_LOW_PRODUCTION');
        await this.resolveAlertByType('LOW_PRODUCTION');
      }
    } else {
      await this.resolveAlertByType('CRITICAL_LOW_PRODUCTION');
      await this.resolveAlertByType('LOW_PRODUCTION');
    }

    // Check battery levels
    if (batteryLevel < this.thresholds.criticalBattery) {
      alerts.push(await this.createAlert({
        type: 'CRITICAL_LOW_BATTERY',
        severity: 'CRITICAL',
        message: `مستوى البطارية منخفض جداً: ${batteryLevel}%`,
        data: { batteryLevel },
      }));
      await this.resolveAlertByType('LOW_BATTERY');
    } else if (batteryLevel < this.thresholds.lowBattery) {
      alerts.push(await this.createAlert({
        type: 'LOW_BATTERY',
        severity: 'WARNING',
        message: `مستوى البطارية منخفض: ${batteryLevel}%`,
        data: { batteryLevel },
      }));
      await this.resolveAlertByType('CRITICAL_LOW_BATTERY');
    } else {
      await this.resolveAlertByType('CRITICAL_LOW_BATTERY');
      await this.resolveAlertByType('LOW_BATTERY');
    }

    // Check consumption levels (skipped when no rated yield is configured)
    if (consumptionPercentage !== null && consumptionPercentage > this.thresholds.highConsumption) {
      alerts.push(await this.createAlert({
        type: 'HIGH_CONSUMPTION',
        severity: 'WARNING',
        message: `استهلاك الطاقة مرتفع: ${consumptionPercentage.toFixed(1)}%`,
        data: { consumption, consumptionPercentage },
      }));
    } else {
      await this.resolveAlertByType('HIGH_CONSUMPTION');
    }

    // Update system state based on alerts
    await this.updateSystemState(alerts);

    return {
      state: this.currentState,
      alerts,
      timestamp: new Date(),
    };
  }

  /**
   * Create and store an alert
   * @param {Object} alertData - Alert information
   * @returns {Promise<Object>} Created alert
   */
  async createAlert(alertData) {
    const {
      type, severity, message, data,
    } = alertData;

    // Check if similar alert already exists and is active
    const existingAlert = this.activeAlerts.get(type);
    if (existingAlert && !existingAlert.resolved) {
      return existingAlert;
    }

    // Fallback dedupe against the DB in case the in-memory map missed an
    // unresolved row (e.g. the startup load failed or it was created elsewhere)
    try {
      const persisted = await prisma.solarAlert.findFirst({
        where: { type, resolved: false },
        orderBy: { createdAt: 'desc' },
      });
      if (persisted) {
        this.activeAlerts.set(type, persisted);
        return persisted;
      }
    } catch (error) {
      console.error('Error checking for existing alert:', error);
    }

    let alert;
    try {
      alert = await prisma.solarAlert.create({
        data: {
          type,
          severity,
          message,
          data: JSON.stringify(data),
          resolved: false,
          createdAt: new Date(),
        },
      });

      this.activeAlerts.set(type, alert);
      console.log(`⚠️  Solar Alert Created: ${type} - ${message}`);
    } catch (error) {
      console.error('Error creating alert:', error);
      // Return in-memory alert if database fails
      alert = {
        id: `temp-${Date.now()}`,
        type,
        severity,
        message,
        data,
        resolved: false,
        createdAt: new Date(),
      };
      this.activeAlerts.set(type, alert);
    }

    // Notify for critical alerts regardless of persistence outcome — a DB
    // outage must not silently swallow a CRITICAL alert
    if (severity === 'CRITICAL') {
      await this.sendCriticalAlertNotifications(alert);
    }

    return alert;
  }

  /**
   * Resolve an active alert by type when its condition has cleared
   * @param {string} type - Alert type to resolve
   * @returns {Promise<Object|null>} Resolved alert or null if none was active
   */
  async resolveAlertByType(type) {
    const activeAlert = this.activeAlerts.get(type);
    if (!activeAlert || activeAlert.resolved) {
      return null;
    }

    // Remove from the map first so a later tick doesn't double-resolve
    this.activeAlerts.delete(type);

    // In-memory-only alerts (DB was down) have no row to update
    if (typeof activeAlert.id === 'string' && activeAlert.id.startsWith('temp-')) {
      console.log(`✅ Solar Alert Resolved (in-memory): ${type}`);
      return activeAlert;
    }

    try {
      const alert = await prisma.solarAlert.update({
        where: { id: activeAlert.id },
        data: {
          resolved: true,
          resolvedAt: new Date(),
        },
      });
      console.log(`✅ Solar Alert Resolved: ${type}`);
      return alert;
    } catch (error) {
      console.error(`Error auto-resolving alert ${type}:`, error);
      return null;
    }
  }

  /**
   * Resolve an alert
   * @param {string} alertId - Alert ID
   * @returns {Promise<Object>} Updated alert
   */
  async resolveAlert(alertId) {
    try {
      const alert = await prisma.solarAlert.update({
        where: { id: alertId },
        data: {
          resolved: true,
          resolvedAt: new Date(),
        },
      });

      // Remove from active alerts
      for (const [type, activeAlert] of this.activeAlerts.entries()) {
        if (activeAlert.id === alertId) {
          this.activeAlerts.delete(type);
          break;
        }
      }

      console.log(`✅ Solar Alert Resolved: ${alert.type}`);
      return alert;
    } catch (error) {
      console.error('Error resolving alert:', error);
      // Prisma "record not found" — surface a 404 to the API layer
      if (error.code === 'P2025') {
        const notFound = new Error('Alert not found');
        notFound.statusCode = 404;
        throw notFound;
      }
      throw new Error('Failed to resolve alert');
    }
  }

  /**
   * Get all active alerts
   * @returns {Promise<Array>} Active alerts
   */
  async getActiveAlerts() {
    try {
      const alerts = await prisma.solarAlert.findMany({
        where: { resolved: false },
        orderBy: { createdAt: 'desc' },
      });

      return alerts;
    } catch (error) {
      console.error('Error fetching active alerts:', error);
      return Array.from(this.activeAlerts.values());
    }
  }

  /**
   * Update system state based on alerts
   * @param {Array} alerts - Current alerts
   */
  async updateSystemState(alerts) {
    const criticalAlerts = alerts.filter((a) => a.severity === 'CRITICAL');
    const warningAlerts = alerts.filter((a) => a.severity === 'WARNING');

    let newState = this.emergencyStates.NORMAL;

    if (criticalAlerts.length > 0) {
      newState = this.emergencyStates.CRITICAL;
    } else if (warningAlerts.length > 0) {
      newState = this.emergencyStates.WARNING;
    }

    // Only run the emergency plan on an actual state transition — unresolved
    // alerts persist across ticks and must not re-trigger it every cycle
    if (this.currentState !== newState) {
      console.log(`🔄 System state changed: ${this.currentState} → ${newState}`);
      this.currentState = newState;
      await this.notifyStateChange(newState);

      if (newState === this.emergencyStates.CRITICAL || newState === this.emergencyStates.WARNING) {
        await this.activateEmergencyPlan(newState);
      }
    }
  }

  /**
   * Activate emergency plan based on severity
   * @param {string} severity - Emergency severity level
   */
  async activateEmergencyPlan(severity) {
    console.log(`🚨 Activating emergency plan: ${severity}`);

    try {
      if (severity === 'CRITICAL') {
        // Critical emergency actions
        await this.switchToBackupPower();
        await this.reduceNonEssentialLoad();
        await this.notifyAllAdmins('CRITICAL');
      } else if (severity === 'WARNING') {
        // Warning level actions
        await this.prepareBackupPower();
        await this.notifyAllAdmins('WARNING');
      }

      // Log emergency plan activation
      await prisma.emergencyLog.create({
        data: {
          severity,
          action: `Emergency plan activated: ${severity}`,
          timestamp: new Date(),
        },
      }).catch((err) => console.error('Failed to log emergency:', err));
    } catch (error) {
      console.error('Error activating emergency plan:', error);
    }
  }

  /**
   * Switch to backup power source
   * @returns {Promise<Object>} Switch result
   */
  async switchToBackupPower() {
    console.log('🔌 Switching to backup power...');

    try {
      // In production, this would trigger actual power switching
      // For now, we'll log the action and update system status

      await prisma.systemStatus.create({
        data: {
          status: 'BACKUP_POWER',
          message: 'Switched to backup power due to low solar production',
          timestamp: new Date(),
        },
      }).catch((err) => console.error('Failed to log status:', err));

      return {
        success: true,
        message: 'Successfully switched to backup power',
        timestamp: new Date(),
      };
    } catch (error) {
      console.error('Error switching to backup power:', error);
      throw new Error('Failed to switch to backup power');
    }
  }

  /**
   * Prepare backup power system
   * @returns {Promise<Object>} Preparation result
   */
  async prepareBackupPower() {
    console.log('⚡ Preparing backup power system...');

    try {
      await prisma.systemStatus.create({
        data: {
          status: 'BACKUP_READY',
          message: 'Backup power system prepared and on standby',
          timestamp: new Date(),
        },
      }).catch((err) => console.error('Failed to log status:', err));

      return {
        success: true,
        message: 'Backup power system ready',
        timestamp: new Date(),
      };
    } catch (error) {
      console.error('Error preparing backup power:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Reduce non-essential load to conserve power
   * @returns {Promise<Object>} Load reduction result
   */
  async reduceNonEssentialLoad() {
    console.log('📉 Reducing non-essential load...');

    try {
      // Get all VMs and identify non-essential ones
      const vms = await prisma.virtualMachine.findMany({
        where: { status: 'RUNNING' },
        include: { user: true },
      });

      // The schema has no VM priority field, so all running VMs are treated
      // as load-reduction candidates — this only logs, it doesn't suspend
      const nonEssentialVMs = vms;

      console.log(`Found ${nonEssentialVMs.length} non-essential VMs to potentially suspend`);

      // Log the action
      await prisma.emergencyLog.create({
        data: {
          severity: 'CRITICAL',
          action: `Identified ${nonEssentialVMs.length} non-essential VMs for load reduction`,
          data: JSON.stringify({ vmIds: nonEssentialVMs.map((vm) => vm.id) }),
          timestamp: new Date(),
        },
      }).catch((err) => console.error('Failed to log emergency:', err));

      return {
        success: true,
        message: `Identified ${nonEssentialVMs.length} VMs for load reduction`,
        vmCount: nonEssentialVMs.length,
      };
    } catch (error) {
      console.error('Error reducing load:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send critical alert notifications to admins
   * @param {Object} alert - Alert object
   */
  async sendCriticalAlertNotifications(alert) {
    try {
      // Get all admin users
      const admins = await prisma.user.findMany({
        where: {
          role: { in: ['ADMIN', 'SUPER_ADMIN'] },
          isActive: true,
        },
      });

      // Send email to each admin in parallel; log per-recipient failures
      const results = await Promise.allSettled(admins.map((admin) => emailService.sendEmail({
        to: admin.email,
        subject: `🚨 تنبيه حرج: ${alert.type}`,
        html: `
          <div dir="rtl">
            <h2>تنبيه طاقة شمسية حرج</h2>
            <p><strong>النوع:</strong> ${alert.type}</p>
            <p><strong>الرسالة:</strong> ${alert.message}</p>
            <p><strong>الوقت:</strong> ${alert.createdAt}</p>
            <p>يرجى اتخاذ الإجراءات اللازمة فوراً.</p>
          </div>
        `,
      })));

      results.forEach((result, index) => {
        if (result.status === 'rejected') {
          console.error(`Failed to send email to ${admins[index].email}:`, result.reason);
        }
      });

      console.log(`📧 Critical alert notifications sent to ${admins.length} admins`);
    } catch (error) {
      console.error('Error sending critical alert notifications:', error);
    }
  }

  /**
   * Notify admins about system state change
   * @param {string} newState - New system state
   */
  async notifyStateChange(newState) {
    try {
      const admins = await prisma.user.findMany({
        where: {
          role: { in: ['ADMIN', 'SUPER_ADMIN'] },
          isActive: true,
        },
      });

      const stateMessages = {
        NORMAL: 'النظام يعمل بشكل طبيعي',
        WARNING: 'النظام في حالة تحذير',
        CRITICAL: 'النظام في حالة حرجة',
        EMERGENCY: 'النظام في حالة طوارئ',
      };

      const results = await Promise.allSettled(admins.map((admin) => emailService.sendEmail({
        to: admin.email,
        subject: `تغيير حالة النظام: ${newState}`,
        html: `
          <div dir="rtl">
            <h2>تغيير حالة نظام الطاقة الشمسية</h2>
            <p><strong>الحالة الجديدة:</strong> ${newState}</p>
            <p><strong>الوصف:</strong> ${stateMessages[newState]}</p>
            <p><strong>الوقت:</strong> ${new Date().toLocaleString('ar-EG')}</p>
          </div>
        `,
      })));

      results.forEach((result, index) => {
        if (result.status === 'rejected') {
          console.error(`Failed to send email to ${admins[index].email}:`, result.reason);
        }
      });
    } catch (error) {
      console.error('Error notifying state change:', error);
    }
  }

  /**
   * Notify all admins about emergency
   * @param {string} severity - Emergency severity
   */
  async notifyAllAdmins(severity) {
    try {
      const admins = await prisma.user.findMany({
        where: {
          role: { in: ['ADMIN', 'SUPER_ADMIN'] },
          isActive: true,
        },
      });

      const severityMessages = {
        WARNING: 'تحذير: مستويات الطاقة منخفضة',
        CRITICAL: 'حرج: مستويات الطاقة حرجة - تم تفعيل خطة الطوارئ',
      };

      const results = await Promise.allSettled(admins.map((admin) => emailService.sendEmail({
        to: admin.email,
        subject: `🚨 ${severityMessages[severity]}`,
        html: `
          <div dir="rtl">
            <h2>إشعار طوارئ - نظام الطاقة الشمسية</h2>
            <p><strong>المستوى:</strong> ${severity}</p>
            <p><strong>الرسالة:</strong> ${severityMessages[severity]}</p>
            <p><strong>الوقت:</strong> ${new Date().toLocaleString('ar-EG')}</p>
            <p>يرجى مراجعة لوحة التحكم للحصول على مزيد من التفاصيل.</p>
          </div>
        `,
      })));

      results.forEach((result, index) => {
        if (result.status === 'rejected') {
          console.error(`Failed to send email to ${admins[index].email}:`, result.reason);
        }
      });

      console.log(`📧 Emergency notifications sent to ${admins.length} admins`);
    } catch (error) {
      console.error('Error notifying admins:', error);
    }
  }

  /**
   * Get emergency logs
   * @param {Object} options - Query options
   * @returns {Promise<Array>} Emergency logs
   */
  async getEmergencyLogs(options = {}) {
    const { limit = 50, severity } = options;

    try {
      const logs = await prisma.emergencyLog.findMany({
        where: severity ? { severity } : {},
        orderBy: { timestamp: 'desc' },
        take: limit,
      });

      return logs;
    } catch (error) {
      console.error('Error fetching emergency logs:', error);
      return [];
    }
  }

  /**
   * Get current system state
   * @returns {string} Current state
   */
  getCurrentState() {
    return this.currentState;
  }

  /**
   * Reset system to normal state (manual override)
   * @returns {Promise<Object>} Reset result
   */
  async resetToNormalState() {
    console.log('🔄 Resetting system to normal state...');

    this.currentState = this.emergencyStates.NORMAL;
    this.activeAlerts.clear();

    try {
      // Resolve all active alerts
      await prisma.solarAlert.updateMany({
        where: { resolved: false },
        data: {
          resolved: true,
          resolvedAt: new Date(),
        },
      });

      await prisma.systemStatus.create({
        data: {
          status: 'NORMAL',
          message: 'System manually reset to normal state',
          timestamp: new Date(),
        },
      }).catch((err) => console.error('Failed to log status:', err));

      return {
        success: true,
        message: 'System reset to normal state',
        timestamp: new Date(),
      };
    } catch (error) {
      console.error('Error resetting system state:', error);
      throw new Error('Failed to reset system state');
    }
  }
}

module.exports = new SolarAlertService();
