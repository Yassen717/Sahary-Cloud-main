const express = require('express');
const router = express.Router();
const cacheController = require('../controllers/cacheController');
const { authenticate, requireRole } = require('../middlewares/auth');

/**
 * Cache Management Routes
 * All routes require admin authentication
 */

router.use(authenticate);
router.use(requireRole('ADMIN', 'SUPER_ADMIN'));

// Cache statistics and monitoring
router.get('/stats', cacheController.getStats);
router.get('/health', cacheController.getHealth);
router.get('/size', cacheController.getSize);
router.get('/top-keys', cacheController.getTopKeys);
router.get('/patterns', cacheController.analyzePatterns);
router.get('/redis-info', cacheController.getRedisInfo);

// Cache management
router.delete('/clear', cacheController.clearCache);
router.post('/optimize', cacheController.optimizeCache);
router.post('/reset-stats', cacheController.resetStats);
router.post('/warmup', cacheController.warmupCache);

module.exports = router;
