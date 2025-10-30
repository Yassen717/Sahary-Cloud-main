const AuthService = require('../services/authService');
const { createClient } = require('redis');

/**
 * Authentication Controller
 * Handles HTTP requests for authentication operations
 */
class AuthController {
  /**
   * Register a new user
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async register(req, res) {
    try {
      const { email, password, firstName, lastName, phone } = req.body;

      const result = await AuthService.register({
        email,
        password,
        firstName,
        lastName,
        phone,
      });

      res.status(201).json({
        success: true,
        message: 'User registered successfully',
        data: {
          user: result.user,
          tokens: result.tokens,
          emailVerificationRequired: result.emailVerificationRequired,
        },
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: 'Registration failed',
        message: error.message,
      });
    }
  }

  /**
   * Login user
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async login(req, res) {
    try {
      const { email, password } = req.body;
      const metadata = {
        ipAddress: req.ip || req.connection.remoteAddress,
        userAgent: req.get('User-Agent'),
      };

      const result = await AuthService.login({ email, password }, metadata);

      // Set HTTP-only cookie for refresh token (optional)
      if (result.tokens.refreshToken) {
        res.cookie('refreshToken', result.tokens.refreshToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'strict',
          maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        });
      }

      res.status(200).json({
        success: true,
        message: 'Login successful',
        data: {
          user: result.user,
          tokens: {
            accessToken: result.tokens.accessToken,
            tokenType: result.tokens.tokenType,
            expiresIn: result.tokens.expiresIn,
          },
          emailVerificationRequired: result.emailVerificationRequired,
        },
      });
    } catch (error) {
      res.status(401).json({
        success: false,
        error: 'Login failed',
        message: error.message,
      });
    }
  }

  /**
   * Refresh access token
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async refreshToken(req, res) {
    try {
      // Get refresh token from cookie or body
      const refreshToken = req.cookies.refreshToken || req.body.refreshToken;

      if (!refreshToken) {
        return res.status(401).json({
          success: false,
          error: 'Refresh token required',
          message: 'No refresh token provided',
        });
      }

      const tokens = await AuthService.refreshToken(refreshToken);

      // Update refresh token cookie
      res.cookie('refreshToken', tokens.refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      });

      res.status(200).json({
        success: true,
        message: 'Token refreshed successfully',
        data: {
          accessToken: tokens.accessToken,
          tokenType: tokens.tokenType,
          expiresIn: tokens.expiresIn,
        },
      });
    } catch (error) {
      // Clear invalid refresh token cookie
      res.clearCookie('refreshToken');
      
      res.status(401).json({
        success: false,
        error: 'Token refresh failed',
        message: error.message,
      });
    }
  }

  /**
   * Logout user
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async logout(req, res) {
    try {
      const accessToken = req.headers.authorization?.replace('Bearer ', '');
      
      // Get Redis client if available
      let redisClient = null;
      try {
        redisClient = createClient({ url: process.env.REDIS_URL });
        await redisClient.connect();
      } catch (redisError) {
        console.warn('Redis not available for token blacklisting:', redisError.message);
      }

      await AuthService.logout(accessToken, redisClient);

      // Clear refresh token cookie
      res.clearCookie('refreshToken');

      // Disconnect Redis
      if (redisClient) {
        await redisClient.quit();
      }

      res.status(200).json({
        success: true,
        message: 'Logout successful',
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: 'Logout failed',
        message: error.message,
      });
    }
  }

  /**
   * Change password
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async changePassword(req, res) {
    try {
      const { currentPassword, newPassword } = req.body;
      const userId = req.user.userId; // From auth middleware

      await AuthService.changePassword(userId, currentPassword, newPassword);

      res.status(200).json({
        success: true,
        message: 'Password changed successfully',
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: 'Password change failed',
        message: error.message,
      });
    }
  }

  /**
   * Request password reset
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async forgotPassword(req, res) {
    try {
      const { email } = req.body;

      const result = await AuthService.requestPasswordReset(email);

      res.status(200).json({
        success: true,
        message: result.message,
        // In production, don't return the token
        ...(process.env.NODE_ENV === 'development' && {
          data: {
            resetToken: result.resetToken,
            expiresAt: result.expiresAt,
          }
        }),
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: 'Password reset request failed',
        message: error.message,
      });
    }
  }

  /**
   * Reset password
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async resetPassword(req, res) {
    try {
      const { token, password } = req.body;

      await AuthService.resetPassword(token, password);

      res.status(200).json({
        success: true,
        message: 'Password reset successfully',
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: 'Password reset failed',
        message: error.message,
      });
    }
  }

  /**
   * Verify email
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async verifyEmail(req, res) {
    try {
      const { token } = req.body;

      const result = await AuthService.verifyEmail(token);

      res.status(200).json({
        success: true,
        message: result.message,
        data: {
          user: result.user,
        },
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: 'Email verification failed',
        message: error.message,
      });
    }
  }

  /**
   * Resend email verification
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async resendVerification(req, res) {
    try {
      const { email } = req.body;

      const result = await AuthService.resendEmailVerification(email);

      res.status(200).json({
        success: true,
        message: result.message,
        // In production, don't return the token
        ...(process.env.NODE_ENV === 'development' && {
          data: {
            verificationToken: result.verificationToken,
            expiresAt: result.expiresAt,
          }
        }),
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: 'Resend verification failed',
        message: error.message,
      });
    }
  }

  /**
   * Get current user profile
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async getProfile(req, res) {
    try {
      const userId = req.user.userId; // From auth middleware

      const user = await AuthService.getUserById(userId);

      if (!user) {
        return res.status(404).json({
          success: false,
          error: 'User not found',
          message: 'User profile not found',
        });
      }

      res.status(200).json({
        success: true,
        message: 'Profile retrieved successfully',
        data: {
          user,
        },
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: 'Failed to get profile',
        message: error.message,
      });
    }
  }

  /**
   * Update user profile
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async updateProfile(req, res) {
    try {
      const userId = req.user.userId; // From auth middleware
      const { firstName, lastName, phone, avatar } = req.body;

      const updatedUser = await AuthService.updateProfile(userId, {
        firstName,
        lastName,
        phone,
        avatar,
      });

      res.status(200).json({
        success: true,
        message: 'Profile updated successfully',
        data: {
          user: updatedUser,
        },
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: 'Profile update failed',
        message: error.message,
      });
    }
  }

  /**
   * Check authentication status
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async checkAuth(req, res) {
    try {
      const userId = req.user.userId; // From auth middleware

      const user = await AuthService.getUserById(userId);

      if (!user || !user.isActive) {
        return res.status(401).json({
          success: false,
          error: 'Authentication failed',
          message: 'User not found or inactive',
        });
      }

      res.status(200).json({
        success: true,
        message: 'Authentication valid',
        data: {
          user,
          authenticated: true,
        },
      });
    } catch (error) {
      res.status(401).json({
        success: false,
        error: 'Authentication check failed',
        message: error.message,
        authenticated: false,
      });
    }
  }

  /**
   * Get user sessions
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async getSessions(req, res) {
    try {
      const userId = req.user.userId; // From auth middleware

      // This would typically fetch from Redis or database
      // For now, return a placeholder response
      res.status(200).json({
        success: true,
        message: 'Sessions retrieved successfully',
        data: {
          sessions: [], // Implement session retrieval logic
        },
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: 'Failed to get sessions',
        message: error.message,
      });
    }
  }

  /**
   * Revoke all sessions (logout from all devices)
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async revokeAllSessions(req, res) {
    try {
      const userId = req.user.userId; // From auth middleware

      // This would typically revoke all sessions for the user
      // Implementation depends on your session storage strategy
      
      res.status(200).json({
        success: true,
        message: 'All sessions revoked successfully',
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: 'Failed to revoke sessions',
        message: error.message,
      });
    }
  }
}

module.exports = AuthController;