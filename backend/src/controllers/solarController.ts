import type { NextFunction, Request, Response } from 'express';

const solarService = require('../services/solarService');
const solarAlertService = require('../services/solarAlertService');

type SolarRequest = Request & {
  query: {
    period?: string;
    startDate?: string;
    endDate?: string;
    limit?: string | number;
    severity?: string;
  };
  params: {
    id?: string;
    severity?: string;
  };
};

const getStatus = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const status = await solarService.getSystemStatus();

    res.status(200).json({
      success: true,
      data: status,
    });
  } catch (error) {
    next(error);
  }
};

const getProduction = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const production = await solarService.getCurrentProduction();

    res.status(200).json({
      success: true,
      data: production,
    });
  } catch (error) {
    next(error);
  }
};

const getConsumption = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const consumption = await solarService.getCurrentConsumption();

    res.status(200).json({
      success: true,
      data: consumption,
    });
  } catch (error) {
    next(error);
  }
};

const getEnvironmentalImpact = async (req: SolarRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { period = 'day' } = req.query;

    if (!['day', 'week', 'month'].includes(period)) {
      res.status(400).json({
        success: false,
        error: 'Invalid period. Must be day, week, or month',
      });
      return;
    }

    const statistics = await solarService.getSolarStatistics(period);

    res.status(200).json({
      success: true,
      data: {
        period,
        environmentalImpact: statistics.environmentalImpact,
        totalProduction: statistics.totalProduction,
        totalConsumption: statistics.totalConsumption,
      },
    });
  } catch (error) {
    next(error);
  }
};

const getStatistics = async (req: SolarRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { period = 'day' } = req.query;

    if (!['day', 'week', 'month'].includes(period)) {
      res.status(400).json({
        success: false,
        error: 'Invalid period. Must be day, week, or month',
      });
      return;
    }

    const statistics = await solarService.getSolarStatistics(period);

    res.status(200).json({
      success: true,
      data: statistics,
    });
  } catch (error) {
    next(error);
  }
};

const getHistory = async (req: SolarRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { startDate, endDate, limit } = req.query;

    // Cap the number of returned rows (default 500, max 500)
    const parsedLimit = Number.parseInt(String(limit ?? ''), 10);
    const take = Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 500) : 500;

    const start = startDate ? new Date(startDate) : new Date(Date.now() - 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate) : new Date();

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      res.status(400).json({
        success: false,
        error: 'Invalid date format',
      });
      return;
    }

    if (start > end) {
      res.status(400).json({
        success: false,
        error: 'Start date must be before end date',
      });
      return;
    }

    const history = await solarService.getSolarDataByPeriod(start, end, take);

    res.status(200).json({
      success: true,
      count: history.length,
      data: history,
    });
  } catch (error) {
    next(error);
  }
};

const getBatteryLevel = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const batteryLevel = await solarService.getBatteryLevel();

    res.status(200).json({
      success: true,
      data: {
        level: batteryLevel,
        timestamp: new Date(),
      },
    });
  } catch (error) {
    next(error);
  }
};

const collectData = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = await solarService.collectAndRecordData();

    res.status(200).json({
      success: true,
      message: 'Solar data collected successfully',
      data,
    });
  } catch (error) {
    next(error);
  }
};

const getActiveAlerts = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const alerts = await solarAlertService.getActiveAlerts();

    res.status(200).json({
      success: true,
      count: alerts.length,
      data: alerts,
    });
  } catch (error) {
    next(error);
  }
};

const resolveAlert = async (req: SolarRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;

    const alert = await solarAlertService.resolveAlert(id);

    res.status(200).json({
      success: true,
      message: 'Alert resolved successfully',
      data: alert,
    });
  } catch (error) {
    next(error);
  }
};

const getEmergencyLogs = async (req: SolarRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { limit, severity } = req.query;

    // Validate limit: must be a finite integer, clamped to 1-500 (default 50)
    const parsedLimit = Number.parseInt(String(limit ?? ''), 10);
    const take = Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 500) : 50;

    const logs = await solarAlertService.getEmergencyLogs({
      limit: take,
      severity,
    });

    res.status(200).json({
      success: true,
      count: logs.length,
      data: logs,
    });
  } catch (error) {
    next(error);
  }
};

const getSystemState = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const state = solarAlertService.getCurrentState();

    res.status(200).json({
      success: true,
      data: {
        state,
        timestamp: new Date(),
      },
    });
  } catch (error) {
    next(error);
  }
};

const resetSystemState = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await solarAlertService.resetToNormalState();

    res.status(200).json({
      success: true,
      message: 'System state reset successfully',
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

const triggerEmergencyPlan = async (req: SolarRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { severity } = req.params;

    if (!['WARNING', 'CRITICAL'].includes(severity || '')) {
      res.status(400).json({
        success: false,
        error: 'Invalid severity. Must be WARNING or CRITICAL',
      });
      return;
    }

    await solarAlertService.activateEmergencyPlan(severity as 'WARNING' | 'CRITICAL');

    res.status(200).json({
      success: true,
      message: `Emergency plan activated: ${severity}`,
      timestamp: new Date(),
    });
  } catch (error) {
    next(error);
  }
};

export {
  getStatus,
  getProduction,
  getConsumption,
  getEnvironmentalImpact,
  getStatistics,
  getHistory,
  getBatteryLevel,
  collectData,
  getActiveAlerts,
  resolveAlert,
  getEmergencyLogs,
  getSystemState,
  resetSystemState,
  triggerEmergencyPlan,
};

export default {
  getStatus,
  getProduction,
  getConsumption,
  getEnvironmentalImpact,
  getStatistics,
  getHistory,
  getBatteryLevel,
  collectData,
  getActiveAlerts,
  resolveAlert,
  getEmergencyLogs,
  getSystemState,
  resetSystemState,
  triggerEmergencyPlan,
};
