import type { EmergencyLog, SolarAlert, VirtualMachine } from '@prisma/client';
import { prisma } from '../config/database';

const emailService = require('./emailService');

type EmergencyState = 'NORMAL' | 'WARNING' | 'CRITICAL' | 'EMERGENCY';

type EmergencySeverity = 'WARNING' | 'CRITICAL';

type AlertThresholds = {
  lowProduction: number;
  criticalProduction: number;
  lowBattery: number;
  criticalBattery: number;
  highConsumption: number;
};

type EnergyData = {
  production: number;
  consumption: number;
  batteryLevel: number;
  capacity: number;
};

type AlertInput = {
  type: string;
  severity: string;
  message: string;
  data?: unknown;
};

// In-memory fallback alert used when the database write fails
type InMemoryAlert = {
  id: string;
  type: string;
  severity: string;
  message: string;
  data: unknown;
  resolved: boolean;
  createdAt: Date;
};

type ActiveAlert = SolarAlert | InMemoryAlert;

type MonitoringResult = {
  state: string;
  alerts: ActiveAlert[];
  timestamp: Date;
};

type ActionResult = {
  success: boolean;
  message?: string;
  timestamp?: Date;
  vmCount?: number;
  error?: string;
};

type EmergencyLogOptions = {
  limit?: number;
  severity?: string;
};

const getErrorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/**
 * Solar Alert and Emergency Management Service
 * Handles monitoring, alerts, and emergency procedures for solar energy system
 */
class SolarAlertService {
  thresholds: AlertThresholds;

  emergencyStates: Record<EmergencyState, EmergencyState>;

  currentState: EmergencyState;

  activeAlerts: Map<string, ActiveAlert>;

  constructor() {
    // Alert thresholds (configurable via environment)
    this.thresholds = {
      lowProduction: parseFloat(process.env.LOW_PRODUCTION_THRESHOLD || '') || 20, // %
      criticalProduction: parseFloat(process.env.CRITICAL_PRODUCTION_THRESHOLD || '') || 10, // %
      lowBattery: parseFloat(process.env.LOW_BATTERY_THRESHOLD || '') || 30, // %
      criticalBattery: parseFloat(process.env.CRITICAL_BATTERY_THRESHOLD || '') || 15, // %
      highConsumption: parseFloat(process.env.HIGH_CONSUMPTION_THRESHOLD || '') || 90, // %
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
  }

  /**
   * Monitor energy levels and trigger alerts if needed
   * @param {Object} energyData - Current energy data
   * @returns {Promise<Object>} Monitoring result with alerts
   */
  async monitorEnergyLevels(energyData: EnergyData): Promise<MonitoringResult> {
    const {
      production, consumption, batteryLevel, capacity,
    } = energyData;

    const alerts: ActiveAlert[] = [];
    const productionPercentage = capacity ? (production / capacity) * 100 : 0;
    const consumptionPercentage = capacity ? (consumption / capacity) * 100 : 0;

    // Check production levels
    if (productionPercentage < this.thresholds.criticalProduction) {
      alerts.push(await this.createAlert({
        type: 'CRITICAL_LOW_PRODUCTION',
        severity: 'CRITICAL',
        message: `إنتاج الطاقة الشمسية منخفض جداً: ${productionPercentage.toFixed(1)}%`,
        data: { production, productionPercentage },
      }));
    } else if (productionPercentage < this.thresholds.lowProduction) {
      alerts.push(await this.createAlert({
        type: 'LOW_PRODUCTION',
        severity: 'WARNING',
        message: `إنتاج الطاقة الشمسية منخفض: ${productionPercentage.toFixed(1)}%`,
        data: { production, productionPercentage },
      }));
    }

    // Check battery levels
    if (batteryLevel < this.thresholds.criticalBattery) {
      alerts.push(await this.createAlert({
        type: 'CRITICAL_LOW_BATTERY',
        severity: 'CRITICAL',
        message: `مستوى البطارية منخفض جداً: ${batteryLevel}%`,
        data: { batteryLevel },
      }));
    } else if (batteryLevel < this.thresholds.lowBattery) {
      alerts.push(await this.createAlert({
        type: 'LOW_BATTERY',
        severity: 'WARNING',
        message: `مستوى البطارية منخفض: ${batteryLevel}%`,
        data: { batteryLevel },
      }));
    }

    // Check consumption levels
    if (consumptionPercentage > this.thresholds.highConsumption) {
      alerts.push(await this.createAlert({
        type: 'HIGH_CONSUMPTION',
        severity: 'WARNING',
        message: `استهلاك الطاقة مرتفع: ${consumptionPercentage.toFixed(1)}%`,
        data: { consumption, consumptionPercentage },
      }));
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
  async createAlert(alertData: AlertInput): Promise<ActiveAlert> {
    const {
      type, severity, message, data,
    } = alertData;

    // Check if similar alert already exists and is active
    const existingAlert = this.activeAlerts.get(type);
    if (existingAlert && !existingAlert.resolved) {
      return existingAlert;
    }

    try {
      const alert = await prisma.solarAlert.create({
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

      // Send notifications for critical alerts
      if (severity === 'CRITICAL') {
        await this.sendCriticalAlertNotifications(alert);
      }

      console.log(`⚠️  Solar Alert Created: ${type} - ${message}`);
      return alert;
    } catch (error) {
      console.error('Error creating alert:', error);
      // Return in-memory alert if database fails
      const alert: InMemoryAlert = {
        id: `temp-${Date.now()}`,
        type,
        severity,
        message,
        data,
        resolved: false,
        createdAt: new Date(),
      };
      this.activeAlerts.set(type, alert);
      return alert;
    }
  }

  /**
   * Resolve an alert
   * @param {string} alertId - Alert ID
   * @returns {Promise<Object>} Updated alert
   */
  async resolveAlert(alertId: string): Promise<SolarAlert> {
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
      throw new Error('Failed to resolve alert');
    }
  }

  /**
   * Get all active alerts
   * @returns {Promise<Array>} Active alerts
   */
  async getActiveAlerts(): Promise<ActiveAlert[]> {
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
  async updateSystemState(alerts: ActiveAlert[]): Promise<void> {
    const criticalAlerts = alerts.filter((a) => a.severity === 'CRITICAL');
    const warningAlerts = alerts.filter((a) => a.severity === 'WARNING');

    let newState = this.emergencyStates.NORMAL;

    if (criticalAlerts.length > 0) {
      newState = this.emergencyStates.CRITICAL;
      await this.activateEmergencyPlan('CRITICAL');
    } else if (warningAlerts.length > 0) {
      newState = this.emergencyStates.WARNING;
      await this.activateEmergencyPlan('WARNING');
    }

    if (this.currentState !== newState) {
      console.log(`🔄 System state changed: ${this.currentState} → ${newState}`);
      this.currentState = newState;
      await this.notifyStateChange(newState);
    }
  }

  /**
   * Activate emergency plan based on severity
   * @param {string} severity - Emergency severity level
   */
  async activateEmergencyPlan(severity: EmergencySeverity): Promise<void> {
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
  async switchToBackupPower(): Promise<ActionResult> {
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
  async prepareBackupPower(): Promise<ActionResult> {
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
      return { success: false, error: getErrorMessage(error) };
    }
  }

  /**
   * Reduce non-essential load to conserve power
   * @returns {Promise<Object>} Load reduction result
   */
  async reduceNonEssentialLoad(): Promise<ActionResult> {
    console.log('📉 Reducing non-essential load...');

    try {
      // Get all VMs and identify non-essential ones
      const vms = await prisma.virtualMachine.findMany({
        where: { status: 'RUNNING' },
        include: { user: true },
      });

      // In a real system, you'd have priority levels
      // For now, we'll just log the action
      const nonEssentialVMs = (vms as Array<VirtualMachine & { priority?: string | null }>)
        .filter((vm) => !vm.priority || vm.priority === 'LOW');

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
      return { success: false, error: getErrorMessage(error) };
    }
  }

  /**
   * Send critical alert notifications to admins
   * @param {Object} alert - Alert object
   */
  async sendCriticalAlertNotifications(alert: SolarAlert): Promise<void> {
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
        }).catch((err: unknown) => console.error(`Failed to send email to ${admin.email}:`, err));
      }

      console.log(`📧 Critical alert notifications sent to ${admins.length} admins`);
    } catch (error) {
      console.error('Error sending critical alert notifications:', error);
    }
  }

  /**
   * Notify admins about system state change
   * @param {string} newState - New system state
   */
  async notifyStateChange(newState: string): Promise<void> {
    try {
      const admins = await prisma.user.findMany({
        where: {
          role: { in: ['ADMIN', 'SUPER_ADMIN'] },
          isActive: true,
        },
      });

      const stateMessages: Record<string, string> = {
        NORMAL: 'النظام يعمل بشكل طبيعي',
        WARNING: 'النظام في حالة تحذير',
        CRITICAL: 'النظام في حالة حرجة',
        EMERGENCY: 'النظام في حالة طوارئ',
      };

      for (const admin of admins) {
        await emailService.sendEmail({
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
        }).catch((err: unknown) => console.error(`Failed to send email to ${admin.email}:`, err));
      }
    } catch (error) {
      console.error('Error notifying state change:', error);
    }
  }

  /**
   * Notify all admins about emergency
   * @param {string} severity - Emergency severity
   */
  async notifyAllAdmins(severity: EmergencySeverity): Promise<void> {
    try {
      const admins = await prisma.user.findMany({
        where: {
          role: { in: ['ADMIN', 'SUPER_ADMIN'] },
          isActive: true,
        },
      });

      const severityMessages: Record<string, string> = {
        WARNING: 'تحذير: مستويات الطاقة منخفضة',
        CRITICAL: 'حرج: مستويات الطاقة حرجة - تم تفعيل خطة الطوارئ',
      };

      for (const admin of admins) {
        await emailService.sendEmail({
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
        }).catch((err: unknown) => console.error(`Failed to send email to ${admin.email}:`, err));
      }

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
  async getEmergencyLogs(options: EmergencyLogOptions = {}): Promise<EmergencyLog[]> {
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
  getCurrentState(): string {
    return this.currentState;
  }

  /**
   * Reset system to normal state (manual override)
   * @returns {Promise<Object>} Reset result
   */
  async resetToNormalState(): Promise<ActionResult> {
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

const solarAlertService = new SolarAlertService();

export = solarAlertService;
