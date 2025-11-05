const express = require('express');
const router = express.Router();
const securityController = require('../controllers/securityController');
const { protect, authorize } = require('../middlewares/auth');

/**
 * Security Routes
 * All routes require admin authentication
 */

router.use(protect);
router.use(authorize('ADMIN', 'SUPER_ADMIN'));

// Security monitoring
router.get('/events', securityController.getSecurityEvents);
router.get('/stats', securityController.getSecurityStats);
router.get('/suspicious', securityController.getSuspiciousActivities);
router.get('/health', securityController.getSecurityHealth);
router.get('/report', securityController.generateReport);

// IP management
router.get('/blocked-ips', securityController.getBlockedIPs);
router.post('/block-ip', securityController.blockIP);
router.post('/unblock-ip', securityController.unblockIP);
router.post('/clear-blocks', securityController.clearAllBlocks);

// Event logging
router.post('/log-event', securityController.logSecurityEvent);

module.exports = router;
