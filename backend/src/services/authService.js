const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { prisma } = require('../config/database');
const JWTUtils = require('../utils/jwt');
const ValidationHelpers = require('../utils/validation.helpers');
const config = require('../config');

/**
 * Authentication Service
 * Handles user registration, login, password management, and token operations
 */
class AuthService {
  /**
   * Register a new user
   * @param {Object} userData - User registration data
   * @returns {Promise<Object>} Created user and tokens
   */
  static async register(userData) {
    const { email, password, firstName, lastName, phone } = userData;

    try {
      // Check if user already exists
      const existingUser = await prisma.user.findUnique({
        where: { email: email.toLowerCase() }
      });

      if (existingUser) {
        throw new Error('User with this email already exists');
      }

      // Validate password strength
      const passwordValidation = ValidationHelpers.validatePasswordStrength(password);
      if (!passwordValidation.isValid) {
        throw new Error(`Password validation failed: ${passwordValidation.feedback.join(', ')}`);
      }

      // Hash password
      const hashedPassword = await ValidationHelpers.hashPassword(password);

      // Generate email verification token
      const tempUserId = crypto.randomUUID();
      const emailVerificationToken = JWTUtils.generateEmailVerificationToken(tempUserId, email);
      const emailVerificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

      // Create user
      const user = await prisma.user.create({
        data: {
          email: email.toLowerCase(),
          password: hashedPassword,
          firstName,
          lastName,
          phone: phone || null,
          emailVerificationToken,
          emailVerificationExpires,
          isVerified: false,
          isActive: true,
        },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          phone: true,
          role: true,
          isActive: true,
          isVerified: true,
          createdAt: true,
        }
      });

      // Generate tokens
      const tokenPayload = {
        userId: user.id,
        email: user.email,
        role: user.role,
      };

      const tokens = JWTUtils.generateTokenPair(tokenPayload);

      // Log registration
      await this.logAuditEvent(user.id, 'USER_REGISTERED', 'user', user.id, {
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
      });

      return {
        user,
        tokens,
        emailVerificationRequired: true,
      };
    } catch (error) {
      throw new Error(`Registration failed: ${error.message}`);
    }
  }

  /**
   * Login user
   * @param {Object} credentials - Login credentials
   * @param {Object} metadata - Login metadata (IP, user agent, etc.)
   * @returns {Promise<Object>} User and tokens
   */
  static async login(credentials, metadata = {}) {
    const { email, password } = credentials;
    const { ipAddress, userAgent } = metadata;

    try {
      // Find user by email
      const user = await prisma.user.findUnique({
        where: { email: email.toLowerCase() },
        select: {
          id: true,
          email: true,
          password: true,
          firstName: true,
          lastName: true,
          phone: true,
          role: true,
          isActive: true,
          isVerified: true,
          lastLoginAt: true,
          createdAt: true,
        }
      });

      if (!user) {
        throw new Error('Invalid email or password');
      }

      // Check if user is active
      if (!user.isActive) {
        throw new Error('Account is deactivated. Please contact support.');
      }

      // Verify password
      const isPasswordValid = await ValidationHelpers.comparePassword(password, user.password);
      if (!isPasswordValid) {
        // Log failed login attempt
        await this.logAuditEvent(user.id, 'LOGIN_FAILED', 'user', user.id, {
          reason: 'Invalid password',
          ipAddress,
          userAgent,
        });
        throw new Error('Invalid email or password');
      }

      // Generate tokens
      const tokenPayload = {
        userId: user.id,
        email: user.email,
        role: user.role,
      };

      const tokens = JWTUtils.generateTokenPair(tokenPayload);

      // Update last login time
      await prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() }
      });

      // Create session record
      await this.createSession(user.id, tokens.accessToken, {
        ipAddress,
        userAgent,
      });

      // Log successful login
      await this.logAuditEvent(user.id, 'USER_LOGIN', 'user', user.id, {
        ipAddress,
        userAgent,
      });

      // Remove password from response
      const { password: _, ...userWithoutPassword } = user;

      return {
        user: userWithoutPassword,
        tokens,
        emailVerificationRequired: !user.isVerified,
      };
    } catch (error) {
      throw new Error(`Login failed: ${error.message}`);
    }
  }

  /**
   * Refresh access token
   * @param {string} refreshToken - Refresh token
   * @returns {Promise<Object>} New tokens
   */
  static async refreshToken(refreshToken) {
    try {
      // Verify refresh token
      const decoded = await JWTUtils.verifyRefreshToken(refreshToken);

      // Find user
      const user = await prisma.user.findUnique({
        where: { id: decoded.userId },
        select: {
          id: true,
          email: true,
          role: true,
          isActive: true,
        }
      });

      if (!user || !user.isActive) {
        throw new Error('User not found or inactive');
      }

      // Generate new tokens
      const tokenPayload = {
        userId: user.id,
        email: user.email,
        role: user.role,
      };

      const tokens = JWTUtils.generateTokenPair(tokenPayload);

      // Log token refresh
      await this.logAuditEvent(user.id, 'TOKEN_REFRESHED', 'user', user.id);

      return tokens;
    } catch (error) {
      throw new Error(`Token refresh failed: ${error.message}`);
    }
  }

  /**
   * Logout user
   * @param {string} accessToken - Access token to invalidate
   * @param {Object} redis - Redis client for token blacklisting
   * @returns {Promise<void>}
   */
  static async logout(accessToken, redis = null) {
    try {
      // Decode token to get user info
      const decoded = JWTUtils.decodeToken(accessToken);
      const userId = decoded?.payload?.userId;

      // Blacklist the token
      if (redis) {
        await JWTUtils.blacklistToken(accessToken, redis);
      }

      // Remove session
      await this.removeSession(accessToken);

      // Log logout
      if (userId) {
        await this.logAuditEvent(userId, 'USER_LOGOUT', 'user', userId);
      }
    } catch (error) {
      throw new Error(`Logout failed: ${error.message}`);
    }
  }

  /**
   * Change user password
   * @param {string} userId - User ID
   * @param {string} currentPassword - Current password
   * @param {string} newPassword - New password
   * @returns {Promise<void>}
   */
  static async changePassword(userId, currentPassword, newPassword) {
    try {
      // Find user
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, password: true, email: true }
      });

      if (!user) {
        throw new Error('User not found');
      }

      // Verify current password
      const isCurrentPasswordValid = await ValidationHelpers.comparePassword(currentPassword, user.password);
      if (!isCurrentPasswordValid) {
        throw new Error('Current password is incorrect');
      }

      // Validate new password
      const passwordValidation = ValidationHelpers.validatePasswordStrength(newPassword);
      if (!passwordValidation.isValid) {
        throw new Error(`New password validation failed: ${passwordValidation.feedback.join(', ')}`);
      }

      // Hash new password
      const hashedNewPassword = await ValidationHelpers.hashPassword(newPassword);

      // Update password
      await prisma.user.update({
        where: { id: userId },
        data: { password: hashedNewPassword }
      });

      // Log password change
      await this.logAuditEvent(userId, 'PASSWORD_CHANGED', 'user', userId);

    } catch (error) {
      throw new Error(`Password change failed: ${error.message}`);
    }
  }

  /**
   * Request password reset
   * @param {string} email - User email
   * @returns {Promise<Object>} Reset token info
   */
  static async requestPasswordReset(email) {
    try {
      // Find user
      const user = await prisma.user.findUnique({
        where: { email: email.toLowerCase() },
        select: { id: true, email: true, firstName: true, isActive: true }
      });

      if (!user || !user.isActive) {
        // Don't reveal if user exists for security
        return { message: 'If the email exists, a reset link has been sent' };
      }

      // Generate reset token
      const resetToken = JWTUtils.generatePasswordResetToken(user.id, user.email);
      const resetExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

      // Save reset token
      await prisma.user.update({
        where: { id: user.id },
        data: {
          passwordResetToken: resetToken,
          passwordResetExpires: resetExpires,
        }
      });

      // Log password reset request
      await this.logAuditEvent(user.id, 'PASSWORD_RESET_REQUESTED', 'user', user.id);

      return {
        message: 'Password reset link has been sent to your email',
        resetToken, // In production, this should be sent via email, not returned
        expiresAt: resetExpires,
      };
    } catch (error) {
      throw new Error(`Password reset request failed: ${error.message}`);
    }
  }

  /**
   * Reset password using token
   * @param {string} resetToken - Password reset token
   * @param {string} newPassword - New password
   * @returns {Promise<void>}
   */
  static async resetPassword(resetToken, newPassword) {
    try {
      // Verify reset token
      const decoded = await JWTUtils.verifyPasswordResetToken(resetToken);

      // Find user with valid reset token
      const user = await prisma.user.findFirst({
        where: {
          id: decoded.userId,
          passwordResetToken: resetToken,
          passwordResetExpires: {
            gt: new Date()
          }
        }
      });

      if (!user) {
        throw new Error('Invalid or expired reset token');
      }

      // Validate new password
      const passwordValidation = ValidationHelpers.validatePasswordStrength(newPassword);
      if (!passwordValidation.isValid) {
        throw new Error(`Password validation failed: ${passwordValidation.feedback.join(', ')}`);
      }

      // Hash new password
      const hashedPassword = await ValidationHelpers.hashPassword(newPassword);

      // Update password and clear reset token
      await prisma.user.update({
        where: { id: user.id },
        data: {
          password: hashedPassword,
          passwordResetToken: null,
          passwordResetExpires: null,
        }
      });

      // Log password reset
      await this.logAuditEvent(user.id, 'PASSWORD_RESET_COMPLETED', 'user', user.id);

    } catch (error) {
      throw new Error(`Password reset failed: ${error.message}`);
    }
  }

  /**
   * Verify email address
   * @param {string} verificationToken - Email verification token
   * @returns {Promise<Object>} Verification result
   */
  static async verifyEmail(verificationToken) {
    try {
      // Verify token
      const decoded = await JWTUtils.verifyEmailVerificationToken(verificationToken);

      // Find user with valid verification token
      const user = await prisma.user.findFirst({
        where: {
          emailVerificationToken: verificationToken,
          emailVerificationExpires: {
            gt: new Date()
          }
        }
      });

      if (!user) {
        throw new Error('Invalid or expired verification token');
      }

      // Update user as verified
      const updatedUser = await prisma.user.update({
        where: { id: user.id },
        data: {
          isVerified: true,
          emailVerificationToken: null,
          emailVerificationExpires: null,
        },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          isVerified: true,
        }
      });

      // Log email verification
      await this.logAuditEvent(user.id, 'EMAIL_VERIFIED', 'user', user.id);

      return {
        user: updatedUser,
        message: 'Email verified successfully',
      };
    } catch (error) {
      throw new Error(`Email verification failed: ${error.message}`);
    }
  }

  /**
   * Resend email verification
   * @param {string} email - User email
   * @returns {Promise<Object>} New verification token
   */
  static async resendEmailVerification(email) {
    try {
      // Find unverified user
      const user = await prisma.user.findUnique({
        where: { email: email.toLowerCase() },
        select: { id: true, email: true, isVerified: true, isActive: true }
      });

      if (!user || !user.isActive) {
        throw new Error('User not found or inactive');
      }

      if (user.isVerified) {
        throw new Error('Email is already verified');
      }

      // Generate new verification token
      const verificationToken = JWTUtils.generateEmailVerificationToken(user.id, user.email);
      const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

      // Update user with new token
      await prisma.user.update({
        where: { id: user.id },
        data: {
          emailVerificationToken: verificationToken,
          emailVerificationExpires: verificationExpires,
        }
      });

      // Log verification resend
      await this.logAuditEvent(user.id, 'EMAIL_VERIFICATION_RESENT', 'user', user.id);

      return {
        message: 'Verification email has been resent',
        verificationToken, // In production, send via email
        expiresAt: verificationExpires,
      };
    } catch (error) {
      throw new Error(`Resend verification failed: ${error.message}`);
    }
  }

  /**
   * Create user session
   * @param {string} userId - User ID
   * @param {string} accessToken - Access token
   * @param {Object} metadata - Session metadata
   * @returns {Promise<Object>} Created session
   */
  static async createSession(userId, accessToken, metadata = {}) {
    try {
      const sessionId = crypto.randomUUID();
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

      return await prisma.session.create({
        data: {
          sessionId,
          userId,
          data: { accessToken, ...metadata },
          ipAddress: metadata.ipAddress,
          userAgent: metadata.userAgent,
          expiresAt,
        }
      });
    } catch (error) {
      console.error('Failed to create session:', error);
      return null;
    }
  }

  /**
   * Remove user session
   * @param {string} accessToken - Access token
   * @returns {Promise<void>}
   */
  static async removeSession(accessToken) {
    try {
      await prisma.session.deleteMany({
        where: {
          data: {
            path: ['accessToken'],
            equals: accessToken
          }
        }
      });
    } catch (error) {
      console.error('Failed to remove session:', error);
    }
  }

  /**
   * Log audit event
   * @param {string} userId - User ID
   * @param {string} action - Action performed
   * @param {string} resource - Resource affected
   * @param {string} resourceId - Resource ID
   * @param {Object} metadata - Additional metadata
   * @returns {Promise<void>}
   */
  static async logAuditEvent(userId, action, resource, resourceId, metadata = {}) {
    try {
      await prisma.auditLog.create({
        data: {
          userId,
          action,
          resource,
          resourceId,
          ipAddress: metadata.ipAddress,
          userAgent: metadata.userAgent,
          newValues: metadata,
        }
      });
    } catch (error) {
      console.error('Failed to log audit event:', error);
    }
  }

  /**
   * Get user by ID
   * @param {string} userId - User ID
   * @returns {Promise<Object|null>} User data
   */
  static async getUserById(userId) {
    try {
      return await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          phone: true,
          role: true,
          isActive: true,
          isVerified: true,
          lastLoginAt: true,
          createdAt: true,
        }
      });
    } catch (error) {
      throw new Error(`Failed to get user: ${error.message}`);
    }
  }

  /**
   * Update user profile
   * @param {string} userId - User ID
   * @param {Object} updateData - Data to update
   * @returns {Promise<Object>} Updated user
   */
  static async updateProfile(userId, updateData) {
    try {
      const { firstName, lastName, phone, avatar } = updateData;

      const updatedUser = await prisma.user.update({
        where: { id: userId },
        data: {
          ...(firstName && { firstName }),
          ...(lastName && { lastName }),
          ...(phone !== undefined && { phone }),
          ...(avatar && { avatar }),
        },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          phone: true,
          avatar: true,
          role: true,
          isActive: true,
          isVerified: true,
          updatedAt: true,
        }
      });

      // Log profile update
      await this.logAuditEvent(userId, 'PROFILE_UPDATED', 'user', userId, updateData);

      return updatedUser;
    } catch (error) {
      throw new Error(`Profile update failed: ${error.message}`);
    }
  }
}

module.exports = AuthService;