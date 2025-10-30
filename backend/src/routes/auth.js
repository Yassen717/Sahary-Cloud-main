const express = require('express');
const AuthController = require('../controllers/authController');
const { validate } = require('../middlewares/validation');
const { authenticate, optionalAuth, requireEmailVerification } = require('../middlewares/auth');
const { authRateLimit, apiRateLimit, bruteForceProtection, sanitizeInput, xssProtection } = require('../middlewares/security');
const { 
  registerSchema,
  loginSchema,
  updateProfileSchema,
  changePasswordSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  verifyEmailSchema,
} = require('../validations/user.validation');

const router = express.Router();

// Apply security middleware to all routes
router.use(sanitizeInput());
router.use(xssProtection());

/**
 * @route   POST /api/v1/auth/register
 * @desc    Register a new user
 * @access  Public
 */
router.post('/register', 
  authRateLimit(),
  validate(registerSchema),
  AuthController.register
);

/**
 * @route   POST /api/v1/auth/login
 * @desc    Login user
 * @access  Public
 */
router.post('/login',
  authRateLimit(),
  bruteForceProtection(),
  validate(loginSchema),
  AuthController.login
);

/**
 * @route   POST /api/v1/auth/refresh
 * @desc    Refresh access token
 * @access  Public
 */
router.post('/refresh',
  apiRateLimit(),
  AuthController.refreshToken
);

/**
 * @route   POST /api/v1/auth/logout
 * @desc    Logout user
 * @access  Private
 */
router.post('/logout',
  apiRateLimit(),
  authenticate,
  AuthController.logout
);

/**
 * @route   POST /api/v1/auth/change-password
 * @desc    Change user password
 * @access  Private
 */
router.post('/change-password',
  authRateLimit(),
  validate(changePasswordSchema),
  authenticate,
  requireEmailVerification,
  AuthController.changePassword
);

/**
 * @route   POST /api/v1/auth/forgot-password
 * @desc    Request password reset
 * @access  Public
 */
router.post('/forgot-password',
  authRateLimit(),
  validate(forgotPasswordSchema),
  AuthController.forgotPassword
);

/**
 * @route   POST /api/v1/auth/reset-password
 * @desc    Reset password using token
 * @access  Public
 */
router.post('/reset-password',
  authRateLimit(),
  validate(resetPasswordSchema),
  AuthController.resetPassword
);

/**
 * @route   POST /api/v1/auth/verify-email
 * @desc    Verify email address
 * @access  Public
 */
router.post('/verify-email',
  apiRateLimit(),
  validate(verifyEmailSchema),
  AuthController.verifyEmail
);

/**
 * @route   POST /api/v1/auth/resend-verification
 * @desc    Resend email verification
 * @access  Public
 */
router.post('/resend-verification',
  authRateLimit(),
  validate(forgotPasswordSchema), // Reuse email validation
  AuthController.resendVerification
);

/**
 * @route   GET /api/v1/auth/profile
 * @desc    Get current user profile
 * @access  Private
 */
router.get('/profile',
  apiRateLimit(),
  authenticate,
  AuthController.getProfile
);

/**
 * @route   PUT /api/v1/auth/profile
 * @desc    Update user profile
 * @access  Private
 */
router.put('/profile',
  apiRateLimit(),
  validate(updateProfileSchema),
  authenticate,
  AuthController.updateProfile
);

/**
 * @route   GET /api/v1/auth/check
 * @desc    Check authentication status
 * @access  Private
 */
router.get('/check',
  apiRateLimit(),
  authenticate,
  AuthController.checkAuth
);

/**
 * @route   GET /api/v1/auth/sessions
 * @desc    Get user sessions
 * @access  Private
 */
router.get('/sessions',
  apiRateLimit(),
  authenticate,
  AuthController.getSessions
);

/**
 * @route   DELETE /api/v1/auth/sessions
 * @desc    Revoke all user sessions
 * @access  Private
 */
router.delete('/sessions',
  authRateLimit(),
  authenticate,
  AuthController.revokeAllSessions
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