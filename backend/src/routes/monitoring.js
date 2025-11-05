const express = require('express');
const router = express.Router();
const monitoringController = require('../controllers/monitoringController');
const { protect, authorize } = require('../middlewares/auth');

/**
 * Monitoring Routes
 * All routes require admin authentication
 */

router.use(protect);
router.use(authorize('ADMIN', 'SUPER_ADMIN'));

// Health checks
router.get('/health', monitoringController.getHealth);
router.get('/health/detailed', monitoringController.getDetailedHealth);

// System information
router.get('/system', monitoringController.getSystemInfo);

// Metrics
router.get('/metrics', monitoringController.getMetrics);
router.post('/metrics/reset', monitoringController.resetMetrics);

// Error monitoring
router.get('/errors/stats', monitoringController.getErrorStats);
router.get('/errors/trends', monitoringController.getErrorTrends);
router.get('/errors/common', monitoringController.getCommonErrors);
router.get('/errors/health', monitoringController.getErrorHealth);

// Cache monitoring
router.get('/cache', monitoringController.getCacheMonitoring);

// Dashboard
router.get('/dashboard', monitoringController.getDashboard);

module.exports = router;
