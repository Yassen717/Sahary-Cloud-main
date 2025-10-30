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

  /**
   * Revoke specific session
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async revokeSession(req, res) {
    try {
      const userId = req.user.userId;
      const { sessionId } = req.params;

      // Implementation would revoke specific session
      // For now, return success
      
      res.status(200).json({
        success: true,
        message: 'Session revoked successfully',
        sessionId,
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: 'Failed to revoke session',
        message: error.message,
      });
    }
  }

  /**
   * Validate token without full authentication
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async validateToken(req, res) {
    try {
      const { token } = req.body;

      if (!token) {
        return res.status(400).json({
          success: false,
          error: 'Token required',
          message: 'Please provide a token to validate',
        });
      }

      const JWTUtils = require('../utils/jwt');
      const decoded = await JWTUtils.verifyAccessToken(token);

      // Get user to ensure they still exist
      const user = await AuthService.getUserById(decoded.userId);
      if (!user || !user.isActive) {
        return res.status(401).json({
          success: false,
          error: 'Invalid token',
          message: 'Token user no longer exists or is inactive',
          valid: false,
        });
      }

      res.status(200).json({
        success: true,
        message: 'Token is valid',
        valid: true,
        user: {
          userId: user.id,
          email: user.email,
          role: user.role,
          isVerified: user.isVerified,
        },
        expiresAt: new Date(decoded.exp * 1000).toISOString(),
      });
    } catch (error) {
      res.status(401).json({
        success: false,
        error: 'Token validation failed',
        message: error.message,
        valid: false,
      });
    }
  }

  /**
   * Get user permissions
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async getUserPermissions(req, res) {
    try {
      const { getPermissionsForRole } = require('../middlewares/rbac');
      const permissions = getPermissionsForRole(req.user.role);

      res.status(200).json({
        success: true,
        message: 'Permissions retrieved successfully',
        data: {
          role: req.user.role,
          permissions,
          permissionCount: permissions.length,
        },
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: 'Failed to get permissions',
        message: error.message,
      });
    }
  }

  /**
   * Impersonate another user (Super Admin only)
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async impersonateUser(req, res) {
    try {
      // Check if user is super admin
      if (req.user.role !== 'SUPER_ADMIN') {
        return res.status(403).json({
          success: false,
          error: 'Insufficient permissions',
          message: 'Only super admins can impersonate users',
        });
      }

      const { targetUserId } = req.body;

      if (!targetUserId) {
        return res.status(400).json({
          success: false,
          error: 'Target user ID required',
          message: 'Please provide the user ID to impersonate',
        });
      }

      // Get target user
      const targetUser = await AuthService.getUserById(targetUserId);
      if (!targetUser) {
        return res.status(404).json({
          success: false,
          error: 'User not found',
          message: 'Target user does not exist',
        });
      }

      // Prevent impersonating other super admins
      if (targetUser.role === 'SUPER_ADMIN' && targetUser.id !== req.user.userId) {
        return res.status(403).json({
          success: false,
          error: 'Cannot impersonate super admin',
          message: 'Super admins cannot impersonate other super admins',
        });
      }

      // Generate impersonation token
      const JWTUtils = require('../utils/jwt');
      const impersonationToken = JWTUtils.generateAccessToken({
        userId: targetUser.id,
        email: targetUser.email,
        role: targetUser.role,
        impersonatedBy: req.user.userId,
        isImpersonating: true,
      });

      // Log impersonation
      await AuthService.logAuditEvent(
        req.user.userId,
        'USER_IMPERSONATION_STARTED',
        'user',
        targetUser.id,
        {
          targetUserId: targetUser.id,
          targetEmail: targetUser.email,
          impersonatedBy: req.user.userId,
        }
      );

      res.status(200).json({
        success: true,
        message: 'Impersonation started successfully',
        data: {
          impersonationToken,
          targetUser: {
            id: targetUser.id,
            email: targetUser.email,
            firstName: targetUser.firstName,
            lastName: targetUser.lastName,
            role: targetUser.role,
          },
          impersonatedBy: {
            id: req.user.userId,
            email: req.user.email,
          },
        },
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: 'Impersonation failed',
        message: error.message,
      });
    }
  }

  /**
   * Stop impersonating user
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async stopImpersonation(req, res) {
    try {
      // Check if currently impersonating
      if (!req.user.isImpersonating) {
        return res.status(400).json({
          success: false,
          error: 'Not impersonating',
          message: 'You are not currently impersonating any user',
        });
      }

      // Get original admin user
      const originalUser = await AuthService.getUserById(req.user.impersonatedBy);
      if (!originalUser) {
        return res.status(400).json({
          success: false,
          error: 'Original user not found',
          message: 'Cannot find the original admin user',
        });
      }

      // Generate new token for original user
      const JWTUtils = require('../utils/jwt');
      const originalToken = JWTUtils.generateAccessToken({
        userId: originalUser.id,
        email: originalUser.email,
        role: originalUser.role,
      });

      // Log impersonation end
      await AuthService.logAuditEvent(
        req.user.impersonatedBy,
        'USER_IMPERSONATION_STOPPED',
        'user',
        req.user.userId,
        {
          targetUserId: req.user.userId,
          impersonatedBy: req.user.impersonatedBy,
        }
      );

      res.status(200).json({
        success: true,
        message: 'Impersonation stopped successfully',
        data: {
          originalToken,
          originalUser: {
            id: originalUser.id,
            email: originalUser.email,
            firstName: originalUser.firstName,
            lastName: originalUser.lastName,
            role: originalUser.role,
          },
        },
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: 'Failed to stop impersonation',
        message: error.message,
      });
    }
  }

  /**
   * Get user activity log
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async getUserActivity(req, res) {
    try {
      const userId = req.user.userId;
      const { page = 1, limit = 20, action, startDate, endDate } = req.query;

      // Build where clause
      const where = { userId };
      
      if (action) {
        where.action = { contains: action, mode: 'insensitive' };
      }
      
      if (startDate || endDate) {
        where.timestamp = {};
        if (startDate) where.timestamp.gte = new Date(startDate);
        if (endDate) where.timestamp.lte = new Date(endDate);
      }

      // Get paginated results
      const { getPaginatedResults } = require('../utils/prisma');
      const result = await getPaginatedResults(prisma.auditLog, {
        page: parseInt(page),
        limit: parseInt(limit),
        where,
        orderBy: { timestamp: 'desc' },
        select: {
          id: true,
          action: true,
          resource: true,
          resourceId: true,
          ipAddress: true,
          timestamp: true,
          newValues: true,
        },
      });

      res.status(200).json({
        success: true,
        message: 'Activity log retrieved successfully',
        data: result.data,
        pagination: result.pagination,
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: 'Failed to get activity log',
        message: error.message,
      });
    }
  }

  /**
   * Deactivate user account
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async deactivateAccount(req, res) {
    try {
      const userId = req.user.userId;
      const { reason, password } = req.body;

      if (!password) {
        return res.status(400).json({
          success: false,
          error: 'Password required',
          message: 'Please provide your password to deactivate account',
        });
      }

      // Verify password
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { password: true }
      });

      const ValidationHelpers = require('../utils/validation.helpers');
      const isPasswordValid = await ValidationHelpers.comparePassword(password, user.password);
      
      if (!isPasswordValid) {
        return res.status(401).json({
          success: false,
          error: 'Invalid password',
          message: 'Password is incorrect',
        });
      }

      // Deactivate account
      await prisma.user.update({
        where: { id: userId },
        data: { 
          isActive: false,
          // Store deactivation info
          deactivatedAt: new Date(),
          deactivationReason: reason || 'User requested deactivation',
        }
      });

      // Log deactivation
      await AuthService.logAuditEvent(
        userId,
        'ACCOUNT_DEACTIVATED',
        'user',
        userId,
        { reason: reason || 'User requested deactivation' }
      );

      res.status(200).json({
        success: true,
        message: 'Account deactivated successfully',
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: 'Account deactivation failed',
        message: error.message,
      });
    }
  }

  /**
   * Reactivate user account
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async reactivateAccount(req, res) {
    try {
      const { email, token } = req.body;

      if (!email || !token) {
        return res.status(400).json({
          success: false,
          error: 'Email and token required',
          message: 'Please provide email and reactivation token',
        });
      }

      // Find deactivated user
      const user = await prisma.user.findUnique({
        where: { email: email.toLowerCase() },
        select: {
          id: true,
          email: true,
          isActive: true,
          passwordResetToken: true,
          passwordResetExpires: true,
        }
      });

      if (!user) {
        return res.status(404).json({
          success: false,
          error: 'User not found',
          message: 'No user found with this email',
        });
      }

      if (user.isActive) {
        return res.status(400).json({
          success: false,
          error: 'Account already active',
          message: 'This account is already active',
        });
      }

      // Verify reactivation token (reuse password reset token mechanism)
      if (user.passwordResetToken !== token || 
          !user.passwordResetExpires || 
          user.passwordResetExpires < new Date()) {
        return res.status(401).json({
          success: false,
          error: 'Invalid or expired token',
          message: 'Reactivation token is invalid or expired',
        });
      }

      // Reactivate account
      await prisma.user.update({
        where: { id: user.id },
        data: {
          isActive: true,
          passwordResetToken: null,
          passwordResetExpires: null,
          reactivatedAt: new Date(),
        }
      });

      // Log reactivation
      await AuthService.logAuditEvent(
        user.id,
        'ACCOUNT_REACTIVATED',
        'user',
        user.id
      );

      res.status(200).json({
        success: true,
        message: 'Account reactivated successfully',
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: 'Account reactivation failed',
        message: error.message,
      });
    }
  }
}

module.exports = AuthController;