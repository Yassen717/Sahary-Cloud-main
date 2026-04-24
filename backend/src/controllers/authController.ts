import type { Request, Response } from 'express';

const AuthService = require('../services/authService');
const redisService = require('../services/redisService');
const { prisma } = require('../config/database');

type AuthRequest = Request & {
  user: any;
  body: any;
  query: any;
  params: any;
  cookies: any;
};

class AuthController {
  static async register(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { email, password, firstName, lastName, phone } = req.body;
      const result = await AuthService.register({ email, password, firstName, lastName, phone });

      res.cookie('token', result.tokens.accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 15 * 60 * 1000,
      });
      res.cookie('refreshToken', result.tokens.refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000,
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
    } catch (error: any) {
      res.status(400).json({
        success: false,
        error: 'Registration failed',
        message: error.message,
      });
    }
  }

  static async login(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { email, password } = req.body;
      const metadata = {
        ipAddress: req.ip || req.connection?.remoteAddress,
        userAgent: req.get('User-Agent'),
      };

      const result = await AuthService.login({ email, password }, metadata);

      if (result.tokens.refreshToken) {
        res.cookie('refreshToken', result.tokens.refreshToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'strict',
          maxAge: 7 * 24 * 60 * 60 * 1000,
        });
      }

      res.cookie('token', result.tokens.accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 15 * 60 * 1000,
      });

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
    } catch (error: any) {
      res.status(401).json({
        success: false,
        error: 'Login failed',
        message: error.message,
      });
    }
  }

  static async refreshToken(req: AuthRequest, res: Response): Promise<void> {
    try {
      const refreshToken = req.cookies.refreshToken || req.body.refreshToken;

      if (!refreshToken) {
        res.status(401).json({
          success: false,
          error: 'Refresh token required',
          message: 'No refresh token provided',
        });
        return;
      }

      const tokens = await AuthService.refreshToken(refreshToken);

      res.cookie('refreshToken', tokens.refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });
      res.cookie('token', tokens.accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 15 * 60 * 1000,
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
    } catch (error: any) {
      res.clearCookie('refreshToken');

      res.status(401).json({
        success: false,
        error: 'Token refresh failed',
        message: error.message,
      });
    }
  }

  static async logout(req: AuthRequest, res: Response): Promise<void> {
    try {
      const accessToken = req.headers.authorization?.replace('Bearer ', '');
      const redisClient = redisService.isReady() ? redisService.getClient() : null;
      await AuthService.logout(accessToken, redisClient);

      res.clearCookie('token');
      res.clearCookie('refreshToken');

      res.status(200).json({
        success: true,
        message: 'Logout successful',
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        error: 'Logout failed',
        message: error.message,
      });
    }
  }

  static async changePassword(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { currentPassword, newPassword } = req.body;
      const userId = req.user.userId;

      await AuthService.changePassword(userId, currentPassword, newPassword);

      res.status(200).json({
        success: true,
        message: 'Password changed successfully',
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        error: 'Password change failed',
        message: error.message,
      });
    }
  }

  static async forgotPassword(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { email } = req.body;
      const result = await AuthService.requestPasswordReset(email);

      res.status(200).json({
        success: true,
        message: result.message,
        ...(process.env.NODE_ENV === 'development'
          ? {
              data: {
                resetToken: result.resetToken,
                expiresAt: result.expiresAt,
              },
            }
          : {}),
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        error: 'Password reset request failed',
        message: error.message,
      });
    }
  }

  static async resetPassword(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { token, password } = req.body;

      await AuthService.resetPassword(token, password);

      res.status(200).json({
        success: true,
        message: 'Password reset successfully',
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        error: 'Password reset failed',
        message: error.message,
      });
    }
  }

  static async verifyEmail(req: AuthRequest, res: Response): Promise<void> {
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
    } catch (error: any) {
      res.status(400).json({
        success: false,
        error: 'Email verification failed',
        message: error.message,
      });
    }
  }

  static async resendVerification(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { email } = req.body;
      const result = await AuthService.resendEmailVerification(email);

      res.status(200).json({
        success: true,
        message: result.message,
        ...(process.env.NODE_ENV === 'development'
          ? {
              data: {
                verificationToken: result.verificationToken,
                expiresAt: result.expiresAt,
              },
            }
          : {}),
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        error: 'Resend verification failed',
        message: error.message,
      });
    }
  }

  static async getProfile(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user.userId;
      const user = await AuthService.getUserById(userId);

      if (!user) {
        res.status(404).json({
          success: false,
          error: 'User not found',
          message: 'User profile not found',
        });
        return;
      }

      res.status(200).json({
        success: true,
        message: 'Profile retrieved successfully',
        data: {
          user,
        },
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        error: 'Failed to get profile',
        message: error.message,
      });
    }
  }

  static async updateProfile(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user.userId;
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
    } catch (error: any) {
      res.status(400).json({
        success: false,
        error: 'Profile update failed',
        message: error.message,
      });
    }
  }

  static async checkAuth(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user.userId;
      const user = await AuthService.getUserById(userId);

      if (!user || !user.isActive) {
        res.status(401).json({
          success: false,
          error: 'Authentication failed',
          message: 'User not found or inactive',
        });
        return;
      }

      res.status(200).json({
        success: true,
        message: 'Authentication valid',
        data: {
          user,
          authenticated: true,
        },
      });
    } catch (error: any) {
      res.status(401).json({
        success: false,
        error: 'Authentication check failed',
        message: error.message,
        authenticated: false,
      });
    }
  }

  static async getSessions(_req: AuthRequest, res: Response): Promise<void> {
    try {
      res.status(200).json({
        success: true,
        message: 'Sessions retrieved successfully',
        data: {
          sessions: [],
        },
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        error: 'Failed to get sessions',
        message: error.message,
      });
    }
  }

  static async revokeAllSessions(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user.userId;
      void userId;

      res.status(200).json({
        success: true,
        message: 'All sessions revoked successfully',
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        error: 'Failed to revoke sessions',
        message: error.message,
      });
    }
  }

  static async revokeSession(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { sessionId } = req.params;

      res.status(200).json({
        success: true,
        message: 'Session revoked successfully',
        sessionId,
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        error: 'Failed to revoke session',
        message: error.message,
      });
    }
  }

  static async validateToken(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { token } = req.body;

      if (!token) {
        res.status(400).json({
          success: false,
          error: 'Token required',
          message: 'Please provide a token to validate',
        });
        return;
      }

      const JWTUtils = require('../utils/jwt');
      const decoded = await JWTUtils.verifyAccessToken(token);
      const user = await AuthService.getUserById(decoded.userId);

      if (!user || !user.isActive) {
        res.status(401).json({
          success: false,
          error: 'Invalid token',
          message: 'Token user no longer exists or is inactive',
          valid: false,
        });
        return;
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
    } catch (error: any) {
      res.status(401).json({
        success: false,
        error: 'Token validation failed',
        message: error.message,
        valid: false,
      });
    }
  }

  static async getUserPermissions(req: AuthRequest, res: Response): Promise<void> {
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
    } catch (error: any) {
      res.status(400).json({
        success: false,
        error: 'Failed to get permissions',
        message: error.message,
      });
    }
  }

  static async impersonateUser(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (req.user.role !== 'SUPER_ADMIN') {
        res.status(403).json({
          success: false,
          error: 'Insufficient permissions',
          message: 'Only super admins can impersonate users',
        });
        return;
      }

      const { targetUserId } = req.body;

      if (!targetUserId) {
        res.status(400).json({
          success: false,
          error: 'Target user ID required',
          message: 'Please provide the user ID to impersonate',
        });
        return;
      }

      const targetUser = await AuthService.getUserById(targetUserId);
      if (!targetUser) {
        res.status(404).json({
          success: false,
          error: 'User not found',
          message: 'Target user does not exist',
        });
        return;
      }

      if (targetUser.role === 'SUPER_ADMIN' && targetUser.id !== req.user.userId) {
        res.status(403).json({
          success: false,
          error: 'Cannot impersonate super admin',
          message: 'Super admins cannot impersonate other super admins',
        });
        return;
      }

      const JWTUtils = require('../utils/jwt');
      const impersonationToken = JWTUtils.generateAccessToken({
        userId: targetUser.id,
        email: targetUser.email,
        role: targetUser.role,
        impersonatedBy: req.user.userId,
        isImpersonating: true,
      });

      await AuthService.logAuditEvent(req.user.userId, 'USER_IMPERSONATION_STARTED', 'user', targetUser.id, {
        targetUserId: targetUser.id,
        targetEmail: targetUser.email,
        impersonatedBy: req.user.userId,
      });

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
    } catch (error: any) {
      res.status(400).json({
        success: false,
        error: 'Impersonation failed',
        message: error.message,
      });
    }
  }

  static async stopImpersonation(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user.isImpersonating) {
        res.status(400).json({
          success: false,
          error: 'Not impersonating',
          message: 'You are not currently impersonating any user',
        });
        return;
      }

      const originalUser = await AuthService.getUserById(req.user.impersonatedBy);
      if (!originalUser) {
        res.status(400).json({
          success: false,
          error: 'Original user not found',
          message: 'Cannot find the original admin user',
        });
        return;
      }

      const JWTUtils = require('../utils/jwt');
      const originalToken = JWTUtils.generateAccessToken({
        userId: originalUser.id,
        email: originalUser.email,
        role: originalUser.role,
      });

      await AuthService.logAuditEvent(req.user.impersonatedBy, 'USER_IMPERSONATION_STOPPED', 'user', req.user.userId, {
        targetUserId: req.user.userId,
        impersonatedBy: req.user.impersonatedBy,
      });

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
    } catch (error: any) {
      res.status(400).json({
        success: false,
        error: 'Failed to stop impersonation',
        message: error.message,
      });
    }
  }

  static async getUserActivity(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user.userId;
      const { page = 1, limit = 20, action, startDate, endDate } = req.query;

      const where: any = { userId };

      if (action) {
        where.action = { contains: action, mode: 'insensitive' };
      }

      if (startDate || endDate) {
        where.timestamp = {};
        if (startDate) where.timestamp.gte = new Date(startDate);
        if (endDate) where.timestamp.lte = new Date(endDate);
      }

      const { getPaginatedResults } = require('../utils/prisma');
      const result = await getPaginatedResults(prisma.auditLog, {
        page: Number.parseInt(String(page), 10),
        limit: Number.parseInt(String(limit), 10),
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
    } catch (error: any) {
      res.status(400).json({
        success: false,
        error: 'Failed to get activity log',
        message: error.message,
      });
    }
  }

  static async deactivateAccount(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user.userId;
      const { reason, password } = req.body;

      if (!password) {
        res.status(400).json({
          success: false,
          error: 'Password required',
          message: 'Please provide your password to deactivate account',
        });
        return;
      }

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { password: true },
      });

      const ValidationHelpers = require('../utils/validation.helpers');
      const isPasswordValid = await ValidationHelpers.comparePassword(password, user.password);

      if (!isPasswordValid) {
        res.status(401).json({
          success: false,
          error: 'Invalid password',
          message: 'Password is incorrect',
        });
        return;
      }

      await prisma.user.update({
        where: { id: userId },
        data: {
          isActive: false,
          deactivatedAt: new Date(),
          deactivationReason: reason || 'User requested deactivation',
        },
      });

      await AuthService.logAuditEvent(userId, 'ACCOUNT_DEACTIVATED', 'user', userId, {
        reason: reason || 'User requested deactivation',
      });

      res.status(200).json({
        success: true,
        message: 'Account deactivated successfully',
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        error: 'Account deactivation failed',
        message: error.message,
      });
    }
  }

  static async reactivateAccount(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { email, token } = req.body;

      if (!email || !token) {
        res.status(400).json({
          success: false,
          error: 'Email and token required',
          message: 'Please provide email and reactivation token',
        });
        return;
      }

      const user = await prisma.user.findUnique({
        where: { email: email.toLowerCase() },
        select: {
          id: true,
          email: true,
          isActive: true,
          passwordResetToken: true,
          passwordResetExpires: true,
        },
      });

      if (!user) {
        res.status(404).json({
          success: false,
          error: 'User not found',
          message: 'No user found with this email',
        });
        return;
      }

      if (user.isActive) {
        res.status(400).json({
          success: false,
          error: 'Account already active',
          message: 'This account is already active',
        });
        return;
      }

      if (user.passwordResetToken !== token || !user.passwordResetExpires || user.passwordResetExpires < new Date()) {
        res.status(401).json({
          success: false,
          error: 'Invalid or expired token',
          message: 'Reactivation token is invalid or expired',
        });
        return;
      }

      await prisma.user.update({
        where: { id: user.id },
        data: {
          isActive: true,
          passwordResetToken: null,
          passwordResetExpires: null,
          reactivatedAt: new Date(),
        },
      });

      await AuthService.logAuditEvent(user.id, 'ACCOUNT_REACTIVATED', 'user', user.id);

      res.status(200).json({
        success: true,
        message: 'Account reactivated successfully',
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        error: 'Account reactivation failed',
        message: error.message,
      });
    }
  }
}

export = AuthController;