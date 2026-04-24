const express = require('express');
const AuthController = require('../controllers/authController');
const { validate } = require('../middlewares/validation');
const { authenticate, optionalAuth, requireEmailVerification } = require('../middlewares/auth');
const {
  authRateLimit,
  apiRateLimit,
  bruteForceProtection,
  sanitizeInput,
  xssProtection,
} = require('../middlewares/security');
const {
  registerSchema,
  loginSchema,
  updateProfileSchema,
  changePasswordSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  verifyEmailSchema,
  validateTokenSchema,
  impersonateUserSchema,
  deactivateAccountSchema,
  reactivateAccountSchema,
  activityQuerySchema,
} = require('../validations/user.validation');

const router = express.Router();

// Apply security middleware to all routes
router.use(sanitizeInput());
router.use(xssProtection());

/**
 * @swagger
 * /auth/register:
 *   post:
 *     tags: [Auth]
 *     summary: Register a new user
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RegisterRequest'
 *     responses:
 *       201:
 *         description: User registered successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthResponse'
 *       400:
 *         description: Validation error or email already registered
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/register', authRateLimit(), validate(registerSchema), AuthController.register);

/**
 * @swagger
 * /auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: Login and get tokens
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/LoginRequest'
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthResponse'
 *       401:
 *         description: Invalid credentials
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post(
  '/login',
  authRateLimit(),
  bruteForceProtection(),
  validate(loginSchema),
  AuthController.login
);

/**
 * @swagger
 * /auth/refresh:
 *   post:
 *     tags: [Auth]
 *     summary: Refresh access token
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [refreshToken]
 *             properties:
 *               refreshToken:
 *                 type: string
 *     responses:
 *       200:
 *         description: New access token issued
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthResponse'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.post('/refresh', apiRateLimit(), AuthController.refreshToken);

/**
 * @swagger
 * /auth/logout:
 *   post:
 *     tags: [Auth]
 *     summary: Logout current session
 *     responses:
 *       200:
 *         description: Logged out successfully
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.post('/logout', apiRateLimit(), authenticate, AuthController.logout);

/**
 * @route   POST /api/v1/auth/change-password
 * @desc    Change user password
 * @access  Private
 */
router.post(
  '/change-password',
  authRateLimit(),
  authenticate,
  requireEmailVerification,
  validate(changePasswordSchema),
  AuthController.changePassword
);

/**
 * @route   POST /api/v1/auth/forgot-password
 * @desc    Request password reset
 * @access  Public
 */
router.post(
  '/forgot-password',
  authRateLimit(),
  validate(forgotPasswordSchema),
  AuthController.forgotPassword
);

/**
 * @route   POST /api/v1/auth/reset-password
 * @desc    Reset password using token
 * @access  Public
 */
router.post(
  '/reset-password',
  authRateLimit(),
  validate(resetPasswordSchema),
  AuthController.resetPassword
);

/**
 * @route   POST /api/v1/auth/verify-email
 * @desc    Verify email address
 * @access  Public
 */
router.post(
  '/verify-email',
  apiRateLimit(),
  validate(verifyEmailSchema),
  AuthController.verifyEmail
);

/**
 * @route   POST /api/v1/auth/resend-verification
 * @desc    Resend email verification
 * @access  Public
 */
router.post(
  '/resend-verification',
  authRateLimit(),
  validate(forgotPasswordSchema), // Reuse email validation
  AuthController.resendVerification
);

/**
 * @swagger
 * /auth/profile:
 *   get:
 *     tags: [Auth]
 *     summary: Get current user profile
 *     responses:
 *       200:
 *         description: User profile
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 user:
 *                   $ref: '#/components/schemas/User'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.get('/profile', apiRateLimit(), authenticate, AuthController.getProfile);

/**
 * @route   PUT /api/v1/auth/profile
 * @desc    Update user profile
 * @access  Private
 */
router.put(
  '/profile',
  apiRateLimit(),
  authenticate,
  validate(updateProfileSchema),
  AuthController.updateProfile
);

/**
 * @route   GET /api/v1/auth/check
 * @desc    Check authentication status
 * @access  Private
 */
router.get('/check', apiRateLimit(), authenticate, AuthController.checkAuth);

/**
 * @route   GET /api/v1/auth/sessions
 * @desc    Get user sessions
 * @access  Private
 */
router.get('/sessions', apiRateLimit(), authenticate, AuthController.getSessions);

/**
 * @route   DELETE /api/v1/auth/sessions
 * @desc    Revoke all user sessions
 * @access  Private
 */
router.delete('/sessions', authRateLimit(), authenticate, AuthController.revokeAllSessions);

/**
 * @route   DELETE /api/v1/auth/sessions/:sessionId
 * @desc    Revoke specific session
 * @access  Private
 */
router.delete('/sessions/:sessionId', authRateLimit(), authenticate, AuthController.revokeSession);

/**
 * @route   POST /api/v1/auth/validate-token
 * @desc    Validate token without authentication
 * @access  Public
 */
router.post(
  '/validate-token',
  apiRateLimit(),
  validate(validateTokenSchema),
  AuthController.validateToken
);

/**
 * @route   GET /api/v1/auth/permissions
 * @desc    Get user permissions
 * @access  Private
 */
router.get('/permissions', apiRateLimit(), authenticate, AuthController.getUserPermissions);

/**
 * @route   POST /api/v1/auth/impersonate
 * @desc    Impersonate another user (Super Admin only)
 * @access  Private
 */
router.post(
  '/impersonate',
  authRateLimit(),
  authenticate,
  validate(impersonateUserSchema),
  AuthController.impersonateUser
);

/**
 * @route   POST /api/v1/auth/stop-impersonation
 * @desc    Stop impersonating user
 * @access  Private
 */
router.post('/stop-impersonation', apiRateLimit(), authenticate, AuthController.stopImpersonation);

/**
 * @route   GET /api/v1/auth/activity
 * @desc    Get user activity log
 * @access  Private
 */
router.get(
  '/activity',
  apiRateLimit(),
  authenticate,
  validate(activityQuerySchema),
  AuthController.getUserActivity
);

/**
 * @route   POST /api/v1/auth/deactivate
 * @desc    Deactivate user account
 * @access  Private
 */
router.post(
  '/deactivate',
  authRateLimit(),
  authenticate,
  requireEmailVerification,
  validate(deactivateAccountSchema),
  AuthController.deactivateAccount
);

/**
 * @route   POST /api/v1/auth/reactivate
 * @desc    Reactivate user account
 * @access  Public
 */
router.post(
  '/reactivate',
  authRateLimit(),
  validate(reactivateAccountSchema),
  AuthController.reactivateAccount
);

// Health check for auth routes
router.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Auth routes are healthy',
    timestamp: new Date().toISOString(),
  });
});

module.exports = router;
