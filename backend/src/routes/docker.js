const express = require('express');
const { body, param, query } = require('express-validator');
const dockerController = require('../controllers/dockerController');
const authMiddleware = require('../middleware/auth');
const roleMiddleware = require('../middleware/role');
const rateLimitMiddleware = require('../middleware/rateLimit');

const router = express.Router();

// Apply authentication to all Docker routes
router.use(authMiddleware);

// Apply rate limiting
router.use(rateLimitMiddleware({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many Docker API requests, please try again later',
}));

/**
 * @route   POST /api/docker/containers
 * @desc    Create a new container
 * @access  Private (Admin only)
 */
router.post('/containers',
  roleMiddleware(['admin']),
  [
    body('vmId')
      .notEmpty()
      .withMessage('VM ID is required'),
    body('name')
      .isLength({ min: 1, max: 100 })
      .withMessage('Container name must be between 1 and 100 characters'),
    body('image')
      .optional()
      .isLength({ min: 1, max: 200 })
      .withMessage('Image name must be between 1 and 200 characters'),
    body('cpu')
      .isFloat({ min: 0.1, max: 32 })
      .withMessage('CPU must be between 0.1 and 32 cores'),
    body('ram')
      .isInt({ min: 128, max: 32768 })
      .withMessage('RAM must be between 128MB and 32GB'),
    body('storage')
      .isInt({ min: 1, max: 1000 })
      .withMessage('Storage must be between 1GB and 1TB'),
    body('ports')
      .optional()
      .isArray()
      .withMessage('Ports must be an array'),
    body('ports.*.containerPort')
      .optional()
      .isInt({ min: 1, max: 65535 })
      .withMessage('Container port must be between 1 and 65535'),
    body('ports.*.hostPort')
      .optional()
      .isInt({ min: 1, max: 65535 })
      .withMessage('Host port must be between 1 and 65535'),
    body('environment')
      .optional()
      .isArray()
      .withMessage('Environment variables must be an array'),
    body('volumes')
      .optional()
      .isArray()
      .withMessage('Volumes must be an array'),
  ],
  dockerController.createContainer
);

/**
 * @route   POST /api/docker/containers/:containerId/start
 * @desc    Start a container
 * @access  Private (Admin and User - own containers only)
 */
router.post('/containers/:containerId/start',
  [
    param('containerId')
      .isLength({ min: 12, max: 64 })
      .withMessage('Invalid container ID'),
  ],
  dockerController.startContainer
);

/**
 * @route   POST /api/docker/containers/:containerId/stop
 * @desc    Stop a container
 * @access  Private (Admin and User - own containers only)
 */
router.post('/containers/:containerId/stop',
  [
    param('containerId')
      .isLength({ min: 12, max: 64 })
      .withMessage('Invalid container ID'),
    body('timeout')
      .optional()
      .isInt({ min: 1, max: 300 })
      .withMessage('Timeout must be between 1 and 300 seconds'),
  ],
  dockerController.stopContainer
);

/**
 * @route   POST /api/docker/containers/:containerId/restart
 * @desc    Restart a container
 * @access  Private (Admin and User - own containers only)
 */
router.post('/containers/:containerId/restart',
  [
    param('containerId')
      .isLength({ min: 12, max: 64 })
      .withMessage('Invalid container ID'),
    body('timeout')
      .optional()
      .isInt({ min: 1, max: 300 })
      .withMessage('Timeout must be between 1 and 300 seconds'),
  ],
  dockerController.restartContainer
);

/**
 * @route   DELETE /api/docker/containers/:containerId
 * @desc    Remove a container
 * @access  Private (Admin only)
 */
router.delete('/containers/:containerId',
  roleMiddleware(['admin']),
  [
    param('containerId')
      .isLength({ min: 12, max: 64 })
      .withMessage('Invalid container ID'),
    body('force')
      .optional()
      .isBoolean()
      .withMessage('Force must be a boolean'),
  ],
  dockerController.removeContainer
);

/**
 * @route   GET /api/docker/containers/:containerId/status
 * @desc    Get container status and stats
 * @access  Private (Admin and User - own containers only)
 */
router.get('/containers/:containerId/status',
  [
    param('containerId')
      .isLength({ min: 12, max: 64 })
      .withMessage('Invalid container ID'),
  ],
  dockerController.getContainerStatus
);

/**
 * @route   GET /api/docker/containers/:containerId/stats
 * @desc    Get container resource usage stats
 * @access  Private (Admin and User - own containers only)
 */
router.get('/containers/:containerId/stats',
  [
    param('containerId')
      .isLength({ min: 12, max: 64 })
      .withMessage('Invalid container ID'),
  ],
  dockerController.getContainerStats
);

/**
 * @route   GET /api/docker/containers
 * @desc    List all containers
 * @access  Private (Admin sees all, User sees own only)
 */
router.get('/containers',
  [
    query('vmId')
      .optional()
      .isUUID()
      .withMessage('VM ID must be a valid UUID'),
    query('status')
      .optional()
      .isIn(['created', 'running', 'paused', 'restarting', 'removing', 'exited', 'dead'])
      .withMessage('Invalid status value'),
  ],
  dockerController.listContainers
);

/**
 * @route   POST /api/docker/images/pull
 * @desc    Pull Docker image
 * @access  Private (Admin only)
 */
router.post('/images/pull',
  roleMiddleware(['admin']),
  [
    body('imageName')
      .notEmpty()
      .isLength({ min: 1, max: 200 })
      .withMessage('Image name is required and must be between 1 and 200 characters'),
  ],
  dockerController.pullImage
);

/**
 * @route   GET /api/docker/system/info
 * @desc    Get Docker system information
 * @access  Private (Admin only)
 */
router.get('/system/info',
  roleMiddleware(['admin']),
  dockerController.getSystemInfo
);

/**
 * @route   POST /api/docker/networks
 * @desc    Create Docker network
 * @access  Private (Admin only)
 */
router.post('/networks',
  roleMiddleware(['admin']),
  [
    body('networkName')
      .optional()
      .isLength({ min: 1, max: 100 })
      .withMessage('Network name must be between 1 and 100 characters'),
  ],
  dockerController.createNetwork
);

/**
 * @route   GET /api/docker/containers/:containerId/health
 * @desc    Check container health
 * @access  Private (Admin and User - own containers only)
 */
router.get('/containers/:containerId/health',
  [
    param('containerId')
      .isLength({ min: 12, max: 64 })
      .withMessage('Invalid container ID'),
  ],
  dockerController.checkContainerHealth
);

/**
 * @route   GET /api/docker/containers/:containerId/logs
 * @desc    Get container logs
 * @access  Private (Admin and User - own containers only)
 */
router.get('/containers/:containerId/logs',
  [
    param('containerId')
      .isLength({ min: 12, max: 64 })
      .withMessage('Invalid container ID'),
    query('tail')
      .optional()
      .isInt({ min: 1, max: 10000 })
      .withMessage('Tail must be between 1 and 10000'),
    query('since')
      .optional()
      .isISO8601()
      .withMessage('Since must be a valid ISO 8601 date'),
    query('until')
      .optional()
      .isISO8601()
      .withMessage('Until must be a valid ISO 8601 date'),
    query('timestamps')
      .optional()
      .isBoolean()
      .withMessage('Timestamps must be a boolean'),
  ],
  dockerController.getContainerLogs
);

/**
 * @route   POST /api/docker/containers/:containerId/exec
 * @desc    Execute command in container
 * @access  Private (Admin and User - own containers only)
 */
router.post('/containers/:containerId/exec',
  [
    param('containerId')
      .isLength({ min: 12, max: 64 })
      .withMessage('Invalid container ID'),
    body('command')
      .isArray({ min: 1 })
      .withMessage('Command must be a non-empty array'),
    body('command.*')
      .isString()
      .isLength({ min: 1, max: 1000 })
      .withMessage('Each command part must be a string between 1 and 1000 characters'),
  ],
  dockerController.execInContainer
);

/**
 * @route   POST /api/docker/containers/:containerId/backup
 * @desc    Create container backup
 * @access  Private (Admin and User - own containers only)
 */
router.post('/containers/:containerId/backup',
  [
    param('containerId')
      .isLength({ min: 12, max: 64 })
      .withMessage('Invalid container ID'),
    body('backupName')
      .notEmpty()
      .isLength({ min: 1, max: 100 })
      .withMessage('Backup name is required and must be between 1 and 100 characters'),
  ],
  dockerController.createContainerBackup
);

/**
 * @route   POST /api/docker/backups/:backupId/restore
 * @desc    Restore container from backup
 * @access  Private (Admin and User - own backups only)
 */
router.post('/backups/:backupId/restore',
  [
    param('backupId')
      .isLength({ min: 12, max: 64 })
      .withMessage('Invalid backup ID'),
    body('vmId')
      .notEmpty()
      .withMessage('VM ID is required'),
    body('name')
      .isLength({ min: 1, max: 100 })
      .withMessage('Container name must be between 1 and 100 characters'),
    body('cpu')
      .isFloat({ min: 0.1, max: 32 })
      .withMessage('CPU must be between 0.1 and 32 cores'),
    body('ram')
      .isInt({ min: 128, max: 32768 })
      .withMessage('RAM must be between 128MB and 32GB'),
    body('storage')
      .isInt({ min: 1, max: 1000 })
      .withMessage('Storage must be between 1GB and 1TB'),
  ],
  dockerController.restoreFromBackup
);

/**
 * @route   POST /api/docker/cleanup
 * @desc    Clean up unused Docker resources
 * @access  Private (Admin only)
 */
router.post('/cleanup',
  roleMiddleware(['admin']),
  dockerController.cleanup
);

/**
 * @route   GET /api/docker/connection
 * @desc    Check Docker daemon connectivity
 * @access  Private (Admin only)
 */
router.get('/connection',
  roleMiddleware(['admin']),
  dockerController.checkConnection
);

module.exports = router;