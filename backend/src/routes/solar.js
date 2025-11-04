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

module.exports = router;
