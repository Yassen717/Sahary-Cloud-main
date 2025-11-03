const express = require('express');
const AdminController = require('../controllers/adminController');
const { authenticate } = require('../middlewares/auth');
const { requirePermission } = require('../middlewares/rbac');
const { apiRateLimit, sanitizeInput, xssProtection } = require('../middlewares/security');

const router = express.Router();

// Apply security middleware
router.use(sanitizeInput());
router.use(xssProtection());
router.use(authenticate);

// All admin routes require admin permission
router.use(requirePermission('admin:access'));

// ==================== Dashboard ====================

/**
 * @route   GET /api/v1/admin/dashboard/stats
 * @desc    Get dashboard statistics
 * @access  Private (Admin+)
 */
router.get('/dashboard/stats', apiRateLimit(), AdminController.getDashboardStats);

/**
 * @route   GET /api/v1/admin/system/health
 * @desc    Get system health
 * @access  Private (Admin+)
 */
router.get('/system/health', apiRateLimit(), AdminController.getSystemHealth);

/**
 * @route   GET /api/v1/admin/system/resources
 * @desc    Get system resource usage
 * @access  Private (Admin+)
 */
router.get('/system/resources', apiRateLimit(), AdminController.getSystemResourceUsage);

// ==================== User Management ====================

/**
 * @route   GET /api/v1/admin/users
 * @desc    Get all users
 * @access  Private (Admin+)
 */
router.get('/users', apiRateLimit(), AdminController.getAllUsers);

/**
 * @route   GET /api/v1/admin/users/:id
 * @desc    Get user by ID
 * @access  Private (Admin+)
 */
router.get('/users/:id', apiRateLimit(), AdminController.getUserById);

/**
 * @route   PUT /api/v1/admin/users/:id/status
 * @desc    Update user status (activate/deactivate)
 * @access  Private (Admin+)
 */
router.put('/users/:id/status', apiRateLimit(), AdminController.updateUserStatus);

/**
 * @route   PUT /api/v1/admin/users/:id/role
 * @desc    Update user role
 * @access  Private (Super Admin)
 */
router.put('/users/:id/role', requirePermission('admin:super'), AdminController.updateUserRole);

// ==================== Analytics ====================

/**
 * @route   GET /api/v1/admin/analytics/revenue
 * @desc    Get revenue analytics
 * @access  Private (Admin+)
 */
router.get('/analytics/revenue', apiRateLimit(), AdminController.getRevenueAnalytics);

/**
 * @route   GET /api/v1/admin/analytics/users
 * @desc    Get user growth analytics
 * @access  Private (Admin+)
 */
router.get('/analytics/users', apiRateLimit(), AdminController.getUserGrowthAnalytics);

// ==================== Audit Logs ====================

/**
 * @route   GET /api/v1/admin/audit-logs
 * @desc    Get audit logs
 * @access  Private (Admin+)
 */
router.get('/audit-logs', apiRateLimit(), AdminController.getAuditLogs);

// Health check
router.get('/health', (req, res) => {
    res.status(200).json({
        success: true,
        message: 'Admin routes are healthy',
        timestamp: new Date().toISOString(),
    });
});

module.exports = router;
