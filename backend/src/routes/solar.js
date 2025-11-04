const express = require('express');
const router = express.Router();
const solarController = require('../controllers/solarController');
const { protect, authorize } = require('../middlewares/auth');

/**
 * Solar Energy Monitoring Routes
 * All routes require authentication
 */

// Public routes (authenticated users)
router.use(protect);

router.get('/status', solarController.getStatus);
router.get('/production', solarController.getProduction);
router.get('/consumption', solarController.getConsumption);
router.get('/environmental-impact', solarController.getEnvironmentalImpact);
router.get('/statistics', solarController.getStatistics);
router.get('/history', solarController.getHistory);

// Admin only routes
router.get('/battery', authorize('ADMIN', 'SUPER_ADMIN'), solarController.getBatteryLevel);
router.post('/collect', authorize('ADMIN', 'SUPER_ADMIN'), solarController.collectData);

// Alert and emergency routes (Admin only)
router.get('/alerts', authorize('ADMIN', 'SUPER_ADMIN'), solarController.getActiveAlerts);
router.put('/alerts/:id/resolve', authorize('ADMIN', 'SUPER_ADMIN'), solarController.resolveAlert);
router.get('/emergency-logs', authorize('ADMIN', 'SUPER_ADMIN'), solarController.getEmergencyLogs);
router.get('/system-state', authorize('ADMIN', 'SUPER_ADMIN'), solarController.getSystemState);
router.post('/reset-state', authorize('ADMIN', 'SUPER_ADMIN'), solarController.resetSystemState);
router.post('/emergency/:severity', authorize('ADMIN', 'SUPER_ADMIN'), solarController.triggerEmergencyPlan);

module.exports = router;
