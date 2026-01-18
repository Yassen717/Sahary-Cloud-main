const express = require('express');
const router = express.Router();
const solarController = require('../controllers/solarController');
const { authenticate, requireRole } = require('../middlewares/auth');
const { cacheConfigs } = require('../middlewares/cache');

/**
 * Solar Energy Monitoring Routes
 * All routes require authentication
 */

// Public routes (authenticated users)
router.use(authenticate);

router.get('/status', cacheConfigs.short, solarController.getStatus);
router.get('/production', cacheConfigs.short, solarController.getProduction);
router.get('/consumption', cacheConfigs.short, solarController.getConsumption);
router.get('/environmental-impact', cacheConfigs.medium, solarController.getEnvironmentalImpact);
router.get('/statistics', cacheConfigs.medium, solarController.getStatistics);
router.get('/history', cacheConfigs.long, solarController.getHistory);

// Admin only routes
router.get('/battery', requireRole('ADMIN', 'SUPER_ADMIN'), solarController.getBatteryLevel);
router.post('/collect', requireRole('ADMIN', 'SUPER_ADMIN'), solarController.collectData);

// Alert and emergency routes (Admin only)
router.get('/alerts', requireRole('ADMIN', 'SUPER_ADMIN'), solarController.getActiveAlerts);
router.put('/alerts/:id/resolve', requireRole('ADMIN', 'SUPER_ADMIN'), solarController.resolveAlert);
router.get('/emergency-logs', requireRole('ADMIN', 'SUPER_ADMIN'), solarController.getEmergencyLogs);
router.get('/system-state', requireRole('ADMIN', 'SUPER_ADMIN'), solarController.getSystemState);
router.post('/reset-state', requireRole('ADMIN', 'SUPER_ADMIN'), solarController.resetSystemState);
router.post('/emergency/:severity', requireRole('ADMIN', 'SUPER_ADMIN'), solarController.triggerEmergencyPlan);

module.exports = router;
