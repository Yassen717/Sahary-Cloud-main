const securityMonitorService = require('../services/securityMonitorService');
const { ddosProtection } = require('../services/ddosProtection');

/**
 * Security Controller
 * Handles security monitoring and management endpoints
 */

/**
 * Get security events
 * @route GET /api/security/events
 * @access Private/Admin
 */
exports.getSecurityEvents = async (req, res, next) => {
  try {
    const events = securityMonitorService.getSecurityEvents(req.query);
    
    res.status(200).json({
      success: true,
      count: events.length,
      data: events
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get security statistics
 * @route GET /api/security/stats
 * @access Private/Admin
 */
exports.getSecurityStats = async (req, res, next) => {
  try {
    const stats = securityMonitorService.getSecurityStats();
    
    res.status(200).json({
      success: true,
      data: stats
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get suspicious activities
 * @route GET /api/security/suspicious
 * @access Private/Admin
 */
exports.getSuspiciousActivities = async (req, res, next) => {
  try {
    const activities = securityMonitorService.getSuspiciousActivities();
    
    res.status(200).json({
      success: true,
      count: activities.length,
      data: activities
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get security health status
 * @route GET /api/security/health
 * @access Private/Admin
 */
exports.getSecurityHealth = async (req, res, next) => {
  try {
    const health = securityMonitorService.getSecurityHealth();
    
    res.status(200).json({
      success: true,
      data: health
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Generate security report
 * @route GET /api/security/report
 * @access Private/Admin
 */
exports.generateReport = async (req, res, next) => {
  try {
    const report = securityMonitorService.generateSecurityReport(req.query);
    
    res.status(200).json({
      success: true,
      data: report
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get blocked IPs
 * @route GET /api/security/blocked-ips
 * @access Private/Admin
 */
exports.getBlockedIPs = async (req, res, next) => {
  try {
    const blockedIPs = ddosProtection.getBlockedIPs();
    
    res.status(200).json({
      success: true,
      count: blockedIPs.length,
      data: blockedIPs
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Unblock IP
 * @route POST /api/security/unblock-ip
 * @access Private/Admin
 */
exports.unblockIP = async (req, res, next) => {
  try {
    const { ip } = req.body;
    
    if (!ip) {
      return res.status(400).json({
        success: false,
        error: 'IP address is required'
      });
    }
    
    await ddosProtection.unblockIP(ip);
    
    res.status(200).json({
      success: true,
      message: `IP ${ip} has been unblocked`
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Block IP manually
 * @route POST /api/security/block-ip
 * @access Private/Admin
 */
exports.blockIP = async (req, res, next) => {
  try {
    const { ip, duration } = req.body;
    
    if (!ip) {
      return res.status(400).json({
        success: false,
        error: 'IP address is required'
      });
    }
    
    await ddosProtection.blockIP(ip, duration);
    
    res.status(200).json({
      success: true,
      message: `IP ${ip} has been blocked`
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Clear all blocks
 * @route POST /api/security/clear-blocks
 * @access Private/Admin
 */
exports.clearAllBlocks = async (req, res, next) => {
  try {
    await ddosProtection.clearAllBlocks();
    
    res.status(200).json({
      success: true,
      message: 'All IP blocks have been cleared'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Log security event manually
 * @route POST /api/security/log-event
 * @access Private/Admin
 */
exports.logSecurityEvent = async (req, res, next) => {
  try {
    const event = await securityMonitorService.logSecurityEvent(req.body);
    
    res.status(201).json({
      success: true,
      message: 'Security event logged',
      data: event
    });
  } catch (error) {
    next(error);
  }
};
