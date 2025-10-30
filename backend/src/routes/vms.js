const express = require('express');
const VMController = require('../controllers/vmController');
const { validate } = require('../middlewares/validation');
const { authenticate, requireEmailVerification } = require('../middlewares/auth');
const { requirePermission, requireAnyPermission } = require('../middlewares/rbac');
const { apiRateLimit, sanitizeInput, xssProtection } = require('../middlewares/security');
const { 
  createVMSchema,
  updateVMSchema,
  vmActionSchema,
  vmQuerySchema,
  createBackupSchema,
} = require('../validations/vm.validation');
const { calculatePricingSchema } = require('../validations/billing.validation');

const router = express.Router();

// Apply security middleware to all routes
router.use(sanitizeInput());
router.use(xssProtection());

/**
 * @route   POST /api/v1/vms
 * @desc    Create a new VM
 * @access  Private (User+)
 */
router.post('/',
  apiRateLimit(),
  validate(createVMSchema),
  authenticate,
  requireEmailVerification,
  requirePermission('vm:create'),
  VMController.createVM
);

/**
 * @route   GET /api/v1/vms
 * @desc    Get user's VMs
 * @access  Private (User+)
 */
router.get('/',
  apiRateLimit(),
  validate(vmQuerySchema),
  authenticate,
  requirePermission('vm:read:own'),
  VMController.getUserVMs
);

/**
 * @route   GET /api/v1/vms/all
 * @desc    Get all VMs (Admin only)
 * @access  Private (Admin+)
 */
router.get('/all',
  apiRateLimit(),
  validate(vmQuerySchema),
  authenticate,
  requirePermission('vm:read:all'),
  VMController.getAllVMs
);

/**
 * @route   GET /api/v1/vms/stats
 * @desc    Get system resource statistics (Admin only)
 * @access  Private (Admin+)
 */
router.get('/stats',
  apiRateLimit(),
  authenticate,
  requirePermission('vm:read:all'),
  VMController.getSystemStats
);

/**
 * @route   GET /api/v1/vms/resources
 * @desc    Get user resource usage
 * @access  Private (User+)
 */
router.get('/resources',
  apiRateLimit(),
  authenticate,
  requirePermission('vm:read:own'),
  VMController.getUserResourceUsage
);

/**
 * @route   POST /api/v1/vms/pricing
 * @desc    Get VM pricing estimate
 * @access  Private (User+)
 */
router.post('/pricing',
  apiRateLimit(),
  validate(calculatePricingSchema),
  authenticate,
  VMController.getVMPricingEstimate
);

/**
 * @route   GET /api/v1/vms/:id
 * @desc    Get VM by ID
 * @access  Private (Owner or Admin)
 */
router.get('/:id',
  apiRateLimit(),
  validate(vmActionSchema),
  authenticate,
  requireAnyPermission('vm:read:own', 'vm:read:all'),
  VMController.getVMById
);

/**
 * @route   PUT /api/v1/vms/:id
 * @desc    Update VM
 * @access  Private (Owner or Admin)
 */
router.put('/:id',
  apiRateLimit(),
  validate(updateVMSchema),
  authenticate,
  requireEmailVerification,
  requireAnyPermission('vm:update:own', 'vm:update:all'),
  VMController.updateVM
);

/**
 * @route   DELETE /api/v1/vms/:id
 * @desc    Delete VM
 * @access  Private (Owner or Admin)
 */
router.delete('/:id',
  apiRateLimit(),
  validate(vmActionSchema),
  authenticate,
  requireEmailVerification,
  requireAnyPermission('vm:delete:own', 'vm:delete:all'),
  VMController.deleteVM
);

/**
 * @route   POST /api/v1/vms/:id/start
 * @desc    Start VM
 * @access  Private (Owner or Admin)
 */
router.post('/:id/start',
  apiRateLimit(),
  validate(vmActionSchema),
  authenticate,
  requireAnyPermission('vm:start:own', 'vm:start:all'),
  VMController.startVM
);

/**
 * @route   POST /api/v1/vms/:id/stop
 * @desc    Stop VM
 * @access  Private (Owner or Admin)
 */
router.post('/:id/stop',
  apiRateLimit(),
  validate(vmActionSchema),
  authenticate,
  requireAnyPermission('vm:stop:own', 'vm:stop:all'),
  VMController.stopVM
);

/**
 * @route   POST /api/v1/vms/:id/restart
 * @desc    Restart VM
 * @access  Private (Owner or Admin)
 */
router.post('/:id/restart',
  apiRateLimit(),
  validate(vmActionSchema),
  authenticate,
  requireAnyPermission('vm:restart:own', 'vm:restart:all'),
  VMController.restartVM
);

/**
 * @route   POST /api/v1/vms/:id/suspend
 * @desc    Suspend VM (Admin only)
 * @access  Private (Admin+)
 */
router.post('/:id/suspend',
  apiRateLimit(),
  validate(vmActionSchema),
  authenticate,
  requirePermission('vm:suspend:all'),
  VMController.suspendVM
);

/**
 * @route   POST /api/v1/vms/:id/resume
 * @desc    Resume suspended VM (Admin only)
 * @access  Private (Admin+)
 */
router.post('/:id/resume',
  apiRateLimit(),
  validate(vmActionSchema),
  authenticate,
  requirePermission('vm:suspend:all'),
  VMController.resumeVM
);

/**
 * @route   GET /api/v1/vms/:id/stats
 * @desc    Get VM statistics
 * @access  Private (Owner or Admin)
 */
router.get('/:id/stats',
  apiRateLimit(),
  validate(vmActionSchema),
  authenticate,
  requireAnyPermission('vm:read:own', 'vm:read:all'),
  VMController.getVMStatistics
);

// Health check for VM routes
router.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'VM routes are healthy',
    timestamp: new Date().toISOString(),
  });
});

module.exports = router;