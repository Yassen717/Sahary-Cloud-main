const express = require('express');
const rateLimit = require('express-rate-limit');
const AuthController = require('../controllers/authController');
const { validate } = require('../middlewares/validation');
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

// Rate limiting configurations
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per window
  message: {
    success: false,
    error: 'Too many authentication attempts',
    message: 'Please try again later',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // 20 requests per window
  message: {
    success: false,
    error: 'Too many requests',
    message: 'Please try again later',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Import auth middleware (will be created in next task)
// const { authenticate, optionalAuth } = require('../middlewares/auth');

/**
 * @route   POST /api/v1/auth/register
 * @desc    Register a new user
 * @access  Public
 */
router.post('/register', 
  authLimiter,
  validate(registerSchema),
  AuthController.register
);

/**
 * @route   POST /api/v1/auth/login
 * @desc    Login user
 * @access  Public
 */
router.post('/login',
  authLimiter,
  validate(loginSchema),
  AuthController.login
);

/**
 * @route   POST /api/v1/auth/refresh
 * @desc    Refresh access token
 * @access  Public
 */
router.post('/refresh',
  generalLimiter,
  AuthController.refreshToken
);

/**
 * @route   POST /api/v1/auth/logout
 * @desc    Logout user
 * @access  Private
 */
router.post('/logout',
  generalLimiter,
  // authenticate, // Will be uncommented when auth middleware is ready
  AuthController.logout
);

/**
 * @route   POST /api/v1/auth/change-password
 * @desc    Change user password
 * @access  Private
 */
router.post('/change-password',
  authLimiter,
  validate(changePasswordSchema),
  // authenticate, // Will be uncommented when auth middleware is ready
  AuthController.changePassword
);

/**
 * @route   POST /api/v1/auth/forgot-password
 * @desc    Request password reset
 * @access  Public
 */
router.post('/forgot-password',
  authLimiter,
  validate(forgotPasswordSchema),
  AuthController.forgotPassword
);

/**
 * @route   POST /api/v1/auth/reset-password
 * @desc    Reset password using token
 * @access  Public
 */
router.post('/reset-password',
  authLimiter,
  validate(resetPasswordSchema),
  AuthController.resetPassword
);

/**
 * @route   POST /api/v1/auth/verify-email
 * @desc    Verify email address
 * @access  Public
 */
router.post('/verify-email',
  generalLimiter,
  validate(verifyEmailSchema),
  AuthController.verifyEmail
);

/**
 * @route   POST /api/v1/auth/resend-verification
 * @desc    Resend email verification
 * @access  Public
 */
router.post('/resend-verification',
  authLimiter,
  validate(forgotPasswordSchema), // Reuse email validation
  AuthController.resendVerification
);

/**
 * @route   GET /api/v1/auth/profile
 * @desc    Get current user profile
 * @access  Private
 */
router.get('/profile',
  generalLimiter,
  // authenticate, // Will be uncommented when auth middleware is ready
  AuthController.getProfile
);

/**
 * @route   PUT /api/v1/auth/profile
 * @desc    Update user profile
 * @access  Private
 */
router.put('/profile',
  generalLimiter,
  validate(updateProfileSchema),
  // authenticate, // Will be uncommented when auth middleware is ready
  AuthController.updateProfile
);

/**
 * @route   GET /api/v1/auth/check
 * @desc    Check authentication status
 * @access  Private
 */
router.get('/check',
  generalLimiter,
  // authenticate, // Will be uncommented when auth middleware is ready
  AuthController.checkAuth
);

/**
 * @route   GET /api/v1/auth/sessions
 * @desc    Get user sessions
 * @access  Private
 */
router.get('/sessions',
  generalLimiter,
  // authenticate, // Will be uncommented when auth middleware is ready
  AuthController.getSessions
);

/**
 * @route   DELETE /api/v1/auth/sessions
 * @desc    Revoke all user sessions
 * @access  Private
 */
router.delete('/sessions',
  authLimiter,
  // authenticate, // Will be uncommented when auth middleware is ready
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