const solarService = require('../services/solarService');
const solarAlertService = require('../services/solarAlertService');

/**
 * Solar Energy Monitoring Controller
 * Handles HTTP requests for solar energy monitoring
 */

/**
 * Get current solar system status
 * @route GET /api/solar/status
 * @access Private
 */
exports.getStatus = async (req, res, next) => {
  try {
    const status = await solarService.getSystemStatus();
    
    res.status(200).json({
      success: true,
      data: status
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get current solar production
 * @route GET /api/solar/production
 * @access Private
 */
exports.getProduction = async (req, res, next) => {
  try {
    const production = await solarService.getCurrentProduction();
    
    res.status(200).json({
      success: true,
      data: production
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get current energy consumption
 * @route GET /api/solar/consumption
 * @access Private
 */
exports.getConsumption = async (req, res, next) => {
  try {
    const consumption = await solarService.getCurrentConsumption();
    
    res.status(200).json({
      success: true,
      data: consumption
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get environmental impact report
 * @route GET /api/solar/environmental-impact
 * @access Private
 */
exports.getEnvironmentalImpact = async (req, res, next) => {
  try {
    const { period = 'day' } = req.query;
    
    const statistics = await solarService.getSolarStatistics(period);
    
    res.status(200).json({
      success: true,
      data: {
        period,
        environmentalImpact: statistics.environmentalImpact,
        totalProduction: statistics.totalProduction,
        totalConsumption: statistics.totalConsumption
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get solar statistics for a period
 * @route GET /api/solar/statistics
 * @access Private
 */
exports.getStatistics = async (req, res, next) => {
  try {
    const { period = 'day' } = req.query;
    
    // Validate period
    if (!['day', 'week', 'month'].includes(period)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid period. Must be day, week, or month'
      });
    }
    
    const statistics = await solarService.getSolarStatistics(period);
    
    res.status(200).json({
      success: true,
      data: statistics
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get solar data history
 * @route GET /api/solar/history
 * @access Private
 */
exports.getHistory = async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;
    
    // Default to last 24 hours if no dates provided
    const start = startDate ? new Date(startDate) : new Date(Date.now() - 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate) : new Date();
    
    // Validate dates
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({
        success: false,
        error: 'Invalid date format'
      });
    }
    
    if (start > end) {
      return res.status(400).json({
        success: false,
        error: 'Start date must be before end date'
      });
    }
    
    const history = await solarService.getSolarDataByPeriod(start, end);
    
    res.status(200).json({
      success: true,
      count: history.length,
      data: history
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get battery level
 * @route GET /api/solar/battery
 * @access Private/Admin
 */
exports.getBatteryLevel = async (req, res, next) => {
  try {
    const batteryLevel = await solarService.getBatteryLevel();
    
    res.status(200).json({
      success: true,
      data: {
        level: batteryLevel,
        timestamp: new Date()
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Manually trigger data collection (Admin only)
 * @route POST /api/solar/collect
 * @access Private/Admin
 */
exports.collectData = async (req, res, next) => {
  try {
    const data = await solarService.collectAndRecordData();
    
    res.status(200).json({
      success: true,
      message: 'Solar data collected successfully',
      data
    });
  } catch (error) {
    next(error);
  }
};


/**
 * Get active alerts
 * @route GET /api/solar/alerts
 * @access Private/Admin
 */
exports.getActiveAlerts = async (req, res, next) => {
  try {
    const alerts = await solarAlertService.getActiveAlerts();
    
    res.status(200).json({
      success: true,
      count: alerts.length,
      data: alerts
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Resolve an alert
 * @route PUT /api/solar/alerts/:id/resolve
 * @access Private/Admin
 */
exports.resolveAlert = async (req, res, next) => {
  try {
    const { id } = req.params;
    const alert = await solarAlertService.resolveAlert(id);
    
    res.status(200).json({
      success: true,
      message: 'Alert resolved successfully',
      data: alert
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get emergency logs
 * @route GET /api/solar/emergency-logs
 * @access Private/Admin
 */
exports.getEmergencyLogs = async (req, res, next) => {
  try {
    const { limit, severity } = req.query;
    
    const logs = await solarAlertService.getEmergencyLogs({
      limit: limit ? parseInt(limit) : 50,
      severity
    });
    
    res.status(200).json({
      success: true,
      count: logs.length,
      data: logs
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get current system state
 * @route GET /api/solar/system-state
 * @access Private/Admin
 */
exports.getSystemState = async (req, res, next) => {
  try {
    const state = solarAlertService.getCurrentState();
    
    res.status(200).json({
      success: true,
      data: {
        state,
        timestamp: new Date()
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Reset system to normal state
 * @route POST /api/solar/reset-state
 * @access Private/Admin
 */
exports.resetSystemState = async (req, res, next) => {
  try {
    const result = await solarAlertService.resetToNormalState();
    
    res.status(200).json({
      success: true,
      message: 'System state reset successfully',
      data: result
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Manually trigger emergency plan
 * @route POST /api/solar/emergency/:severity
 * @access Private/Admin
 */
exports.triggerEmergencyPlan = async (req, res, next) => {
  try {
    const { severity } = req.params;
    
    if (!['WARNING', 'CRITICAL'].includes(severity)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid severity. Must be WARNING or CRITICAL'
      });
    }
    
    await solarAlertService.activateEmergencyPlan(severity);
    
    res.status(200).json({
      success: true,
      message: `Emergency plan activated: ${severity}`,
      timestamp: new Date()
    });
  } catch (error) {
    next(error);
  }
};
