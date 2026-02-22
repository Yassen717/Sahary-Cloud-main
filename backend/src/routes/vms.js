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
  execContainerSchema,
  containerLogsSchema,
  restoreBackupSchema,
  vmStatsQuerySchema,
  adminVMQuerySchema,
  vmSuspendSchema,
} = require('../validations/vm.validation');
const { calculatePricingSchema } = require('../validations/billing.validation');

const router = express.Router();

// Apply security middleware to all routes
router.use(sanitizeInput());
router.use(xssProtection());

/**
 * @swagger
 * /vms:
 *   post:
 *     tags: [VMs]
 *     summary: Create a new virtual machine
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateVMRequest'
 *     responses:
 *       201:
 *         description: VM created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   $ref: '#/components/schemas/VirtualMachine'
 *       400:
 *         description: Validation error or resource limit exceeded
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
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
 * @swagger
 * /vms:
 *   get:
 *     tags: [VMs]
 *     summary: Get all VMs for the current user
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [RUNNING, STOPPED, PAUSED, ERROR]
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200:
 *         description: List of VMs
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/VirtualMachine'
 *                 pagination:
 *                   $ref: '#/components/schemas/Pagination'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
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
  validate(adminVMQuerySchema),
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
 * @swagger
 * /vms/{id}/start:
 *   post:
 *     tags: [VMs]
 *     summary: Start a VM
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: VM started
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       503:
 *         $ref: '#/components/responses/ServiceUnavailable'
 */
router.post('/:id/start',
  apiRateLimit(),
  validate(vmActionSchema),
  authenticate,
  requireAnyPermission('vm:start:own', 'vm:start:all'),
  VMController.startVM
);

/**
 * @swagger
 * /vms/{id}/stop:
 *   post:
 *     tags: [VMs]
 *     summary: Stop a running VM
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: VM stopped
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       503:
 *         $ref: '#/components/responses/ServiceUnavailable'
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
  validate(vmSuspendSchema),
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
  validate(vmStatsQuerySchema),
  authenticate,
  requireAnyPermission('vm:read:own', 'vm:read:all'),
  VMController.getVMStatistics
);

/**
 * @route   GET /api/v1/vms/:id/container/status
 * @desc    Get VM container status
 * @access  Private (Owner or Admin)
 */
router.get('/:id/container/status',
  apiRateLimit(),
  validate(vmActionSchema),
  authenticate,
  requireAnyPermission('vm:read:own', 'vm:read:all'),
  VMController.getVMContainerStatus
);

/**
 * @route   GET /api/v1/vms/:id/container/logs
 * @desc    Get VM container logs
 * @access  Private (Owner or Admin)
 */
router.get('/:id/container/logs',
  apiRateLimit(),
  validate(containerLogsSchema),
  authenticate,
  requireAnyPermission('vm:read:own', 'vm:read:all'),
  VMController.getVMContainerLogs
);

/**
 * @route   POST /api/v1/vms/:id/container/exec
 * @desc    Execute command in VM container
 * @access  Private (Owner or Admin)
 */
router.post('/:id/container/exec',
  apiRateLimit(),
  validate(execContainerSchema),
  authenticate,
  requireAnyPermission('vm:manage:own', 'vm:manage:all'),
  VMController.execInVMContainer
);

/**
 * @route   POST /api/v1/vms/:id/backup
 * @desc    Create VM backup
 * @access  Private (Owner or Admin)
 */
router.post('/:id/backup',
  apiRateLimit(),
  validate(createBackupSchema),
  authenticate,
  requireAnyPermission('vm:manage:own', 'vm:manage:all'),
  VMController.createVMBackup
);

/**
 * @route   POST /api/v1/vms/restore/:backupId
 * @desc    Restore VM from backup
 * @access  Private (Owner or Admin)
 */
router.post('/restore/:backupId',
  apiRateLimit(),
  validate(restoreBackupSchema),
  authenticate,
  requireAnyPermission('vm:create:own', 'vm:create:all'),
  VMController.restoreVMFromBackup
);

/**
 * @route   GET /api/v1/vms/:id/resources
 * @desc    Get VM resource usage stats
 * @access  Private (Owner or Admin)
 */
router.get('/:id/resources',
  apiRateLimit(),
  validate(vmActionSchema),
  authenticate,
  requireAnyPermission('vm:read:own', 'vm:read:all'),
  VMController.getVMResourceStats
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