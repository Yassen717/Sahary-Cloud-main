import type { NextFunction, Request, Response } from 'express';

const securityMonitorService = require('../services/securityMonitorService');
const { ddosProtection } = require('../services/ddosProtection');

type SecurityRequest = Request & {
  query: Record<string, unknown>;
  body: {
    ip?: string;
    duration?: number | string;
  };
};

const getSecurityEvents = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const events = securityMonitorService.getSecurityEvents(req.query);

    res.status(200).json({
      success: true,
      count: events.length,
      data: events,
    });
  } catch (error) {
    next(error);
  }
};

const getSecurityStats = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const stats = securityMonitorService.getSecurityStats();

    res.status(200).json({
      success: true,
      data: stats,
    });
  } catch (error) {
    next(error);
  }
};

const getSuspiciousActivities = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const activities = securityMonitorService.getSuspiciousActivities();

    res.status(200).json({
      success: true,
      count: activities.length,
      data: activities,
    });
  } catch (error) {
    next(error);
  }
};

const getSecurityHealth = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const health = securityMonitorService.getSecurityHealth();

    res.status(200).json({
      success: true,
      data: health,
    });
  } catch (error) {
    next(error);
  }
};

const generateReport = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const report = securityMonitorService.generateSecurityReport(req.query);

    res.status(200).json({
      success: true,
      data: report,
    });
  } catch (error) {
    next(error);
  }
};

const getBlockedIPs = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const blockedIPs = ddosProtection.getBlockedIPs();

    res.status(200).json({
      success: true,
      count: blockedIPs.length,
      data: blockedIPs,
    });
  } catch (error) {
    next(error);
  }
};

const unblockIP = async (req: SecurityRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { ip } = req.body;

    if (!ip) {
      res.status(400).json({
        success: false,
        error: 'IP address is required',
      });
      return;
    }

    await ddosProtection.unblockIP(ip);

    res.status(200).json({
      success: true,
      message: `IP ${ip} has been unblocked`,
    });
  } catch (error) {
    next(error);
  }
};

const blockIP = async (req: SecurityRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { ip, duration } = req.body;

    if (!ip) {
      res.status(400).json({
        success: false,
        error: 'IP address is required',
      });
      return;
    }

    await ddosProtection.blockIP(ip, duration);

    res.status(200).json({
      success: true,
      message: `IP ${ip} has been blocked`,
    });
  } catch (error) {
    next(error);
  }
};

const clearAllBlocks = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    await ddosProtection.clearAllBlocks();

    res.status(200).json({
      success: true,
      message: 'All IP blocks have been cleared',
    });
  } catch (error) {
    next(error);
  }
};

const logSecurityEvent = async (req: SecurityRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const event = await securityMonitorService.logSecurityEvent(req.body);

    res.status(201).json({
      success: true,
      message: 'Security event logged',
      data: event,
    });
  } catch (error) {
    next(error);
  }
};

export {
  getSecurityEvents,
  getSecurityStats,
  getSuspiciousActivities,
  getSecurityHealth,
  generateReport,
  getBlockedIPs,
  unblockIP,
  blockIP,
  clearAllBlocks,
  logSecurityEvent,
};

export default {
  getSecurityEvents,
  getSecurityStats,
  getSuspiciousActivities,
  getSecurityHealth,
  generateReport,
  getBlockedIPs,
  unblockIP,
  blockIP,
  clearAllBlocks,
  logSecurityEvent,
};
