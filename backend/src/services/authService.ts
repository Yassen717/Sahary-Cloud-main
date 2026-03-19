import crypto from 'crypto';
import config from '../config';
import { prisma } from '../config/database';
import JWTUtils from '../utils/jwt';
import ValidationHelpers from '../utils/validation.helpers';
import type {
  AuthActionMetadata,
  AuthResult,
  AuthTokenPayload,
  AuthTokens,
  LoginInput,
  LoginMetadata,
  PasswordResetResult,
  ProfileUpdateInput,
  PublicUser,
  RegisterInput,
  VerificationResult,
} from '../types/auth';

type PrismaUserRecord = {
  id: string;
  email: string;
  password?: string;
  firstName: string;
  lastName: string;
  phone?: string | null;
  avatar?: string | null;
  role: string;
  isActive: boolean;
  isVerified: boolean;
  lastLoginAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
};

type SessionRecord = {
  id: string;
  data: string | null;
};

/**
 * Authentication Service
 * Handles user registration, login, password management, and token operations
 */
class AuthService {
  static async register(userData: RegisterInput): Promise<AuthResult> {
    const { email, password, firstName, lastName, phone } = userData;

    try {
      const existingUser = await prisma.user.findUnique({
        where: { email: email.toLowerCase() },
      });

      if (existingUser) {
        throw new Error('User with this email already exists');
      }

      const passwordValidation = ValidationHelpers.validatePasswordStrength(password);
      if (!passwordValidation.isValid) {
        throw new Error(`Password validation failed: ${passwordValidation.feedback.join(', ')}`);
      }

      const hashedPassword = await ValidationHelpers.hashPassword(password, config.security.bcryptRounds);

      const tempUserId = crypto.randomUUID();
      const emailVerificationToken = JWTUtils.generateEmailVerificationToken(tempUserId, email);
      const emailVerificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);

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
        },
      }) as PublicUser;

      const tokenPayload: AuthTokenPayload = {
        userId: user.id,
        email: user.email,
        role: user.role,
      };

      const tokens = JWTUtils.generateTokenPair(tokenPayload) as AuthTokens;

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
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Registration failed: ${message}`);
    }
  }

  static async login(credentials: LoginInput, metadata: LoginMetadata = {}): Promise<AuthResult> {
    const { email, password } = credentials;
    const { ipAddress, userAgent } = metadata;

    try {
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
        },
      }) as PrismaUserRecord | null;

      if (!user) {
        throw new Error('Invalid email or password');
      }

      if (!user.isActive) {
        throw new Error('Account is deactivated. Please contact support.');
      }

      const isPasswordValid = await ValidationHelpers.comparePassword(password, user.password || '');
      if (!isPasswordValid) {
        await this.logAuditEvent(user.id, 'LOGIN_FAILED', 'user', user.id, {
          reason: 'Invalid password',
          ipAddress,
          userAgent,
        });
        throw new Error('Invalid email or password');
      }

      const tokenPayload: AuthTokenPayload = {
        userId: user.id,
        email: user.email,
        role: user.role,
      };

      const tokens = JWTUtils.generateTokenPair(tokenPayload) as AuthTokens;

      await prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      });

      await this.createSession(user.id, tokens.accessToken, {
        ipAddress,
        userAgent,
      });

      await this.logAuditEvent(user.id, 'USER_LOGIN', 'user', user.id, {
        ipAddress,
        userAgent,
      });

      const { password: _password, ...userWithoutPassword } = user;

      return {
        user: userWithoutPassword as PublicUser,
        tokens,
        emailVerificationRequired: !user.isVerified,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Login failed: ${message}`);
    }
  }

  static async refreshToken(refreshToken: string): Promise<AuthTokens> {
    try {
      const decoded = await JWTUtils.verifyRefreshToken(refreshToken) as AuthTokenPayload;

      const user = await prisma.user.findUnique({
        where: { id: decoded.userId },
        select: {
          id: true,
          email: true,
          role: true,
          isActive: true,
        },
      }) as { id: string; email: string; role: string; isActive: boolean } | null;

      if (!user || !user.isActive) {
        throw new Error('User not found or inactive');
      }

      const tokenPayload: AuthTokenPayload = {
        userId: user.id,
        email: user.email,
        role: user.role,
      };

      const tokens = JWTUtils.generateTokenPair(tokenPayload) as AuthTokens;

      await this.logAuditEvent(user.id, 'TOKEN_REFRESHED', 'user', user.id);

      return tokens;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Token refresh failed: ${message}`);
    }
  }

  static async logout(accessToken: string | null | undefined, redis: any = null): Promise<void> {
    try {
      if (!accessToken) {
        throw new Error('Access token is required');
      }

      const decoded = JWTUtils.decodeToken(accessToken) as { payload?: { userId?: string } } | null;
      const userId = decoded?.payload?.userId;

      if (redis) {
        await JWTUtils.blacklistToken(accessToken, redis);
      }

      await this.removeSession(accessToken);

      if (userId) {
        await this.logAuditEvent(userId, 'USER_LOGOUT', 'user', userId);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Logout failed: ${message}`);
    }
  }

  static async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, password: true, email: true },
      }) as { id: string; password: string; email: string } | null;

      if (!user) {
        throw new Error('User not found');
      }

      const isCurrentPasswordValid = await ValidationHelpers.comparePassword(currentPassword, user.password);
      if (!isCurrentPasswordValid) {
        throw new Error('Current password is incorrect');
      }

      const passwordValidation = ValidationHelpers.validatePasswordStrength(newPassword);
      if (!passwordValidation.isValid) {
        throw new Error(`New password validation failed: ${passwordValidation.feedback.join(', ')}`);
      }

      const hashedNewPassword = await ValidationHelpers.hashPassword(newPassword, config.security.bcryptRounds);

      await prisma.user.update({
        where: { id: userId },
        data: { password: hashedNewPassword },
      });

      await this.logAuditEvent(userId, 'PASSWORD_CHANGED', 'user', userId);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Password change failed: ${message}`);
    }
  }

  static async requestPasswordReset(email: string): Promise<PasswordResetResult> {
    try {
      const user = await prisma.user.findUnique({
        where: { email: email.toLowerCase() },
        select: { id: true, email: true, firstName: true, isActive: true },
      }) as { id: string; email: string; firstName: string; isActive: boolean } | null;

      if (!user || !user.isActive) {
        return { message: 'If the email exists, a reset link has been sent' };
      }

      const resetToken = JWTUtils.generatePasswordResetToken(user.id, user.email);
      const resetExpires = new Date(Date.now() + 60 * 60 * 1000);

      await prisma.user.update({
        where: { id: user.id },
        data: {
          passwordResetToken: resetToken,
          passwordResetExpires: resetExpires,
        },
      });

      await this.logAuditEvent(user.id, 'PASSWORD_RESET_REQUESTED', 'user', user.id);

      return {
        message: 'Password reset link has been sent to your email',
        resetToken,
        expiresAt: resetExpires,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Password reset request failed: ${message}`);
    }
  }

  static async resetPassword(resetToken: string, newPassword: string): Promise<void> {
    try {
      const decoded = await JWTUtils.verifyPasswordResetToken(resetToken) as AuthTokenPayload;

      const user = await prisma.user.findFirst({
        where: {
          id: decoded.userId,
          passwordResetToken: resetToken,
          passwordResetExpires: {
            gt: new Date(),
          },
        },
      }) as { id: string } | null;

      if (!user) {
        throw new Error('Invalid or expired reset token');
      }

      const passwordValidation = ValidationHelpers.validatePasswordStrength(newPassword);
      if (!passwordValidation.isValid) {
        throw new Error(`Password validation failed: ${passwordValidation.feedback.join(', ')}`);
      }

      const hashedPassword = await ValidationHelpers.hashPassword(newPassword, config.security.bcryptRounds);

      await prisma.user.update({
        where: { id: user.id },
        data: {
          password: hashedPassword,
          passwordResetToken: null,
          passwordResetExpires: null,
        },
      });

      await this.logAuditEvent(user.id, 'PASSWORD_RESET_COMPLETED', 'user', user.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Password reset failed: ${message}`);
    }
  }

  static async verifyEmail(verificationToken: string): Promise<VerificationResult> {
    try {
      const decoded = await JWTUtils.verifyEmailVerificationToken(verificationToken) as AuthTokenPayload;

      const user = await prisma.user.findFirst({
        where: {
          emailVerificationToken: verificationToken,
          emailVerificationExpires: {
            gt: new Date(),
          },
        },
      }) as { id: string } | null;

      if (!user) {
        throw new Error('Invalid or expired verification token');
      }

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
        },
      }) as PublicUser;

      await this.logAuditEvent(user.id, 'EMAIL_VERIFIED', 'user', user.id);

      return {
        user: updatedUser,
        message: 'Email verified successfully',
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Email verification failed: ${message}`);
    }
  }

  static async resendEmailVerification(email: string): Promise<PasswordResetResult> {
    try {
      const user = await prisma.user.findUnique({
        where: { email: email.toLowerCase() },
        select: { id: true, email: true, isVerified: true, isActive: true },
      }) as { id: string; email: string; isVerified: boolean; isActive: boolean } | null;

      if (!user || !user.isActive) {
        throw new Error('User not found or inactive');
      }

      if (user.isVerified) {
        throw new Error('Email is already verified');
      }

      const verificationToken = JWTUtils.generateEmailVerificationToken(user.id, user.email);
      const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);

      await prisma.user.update({
        where: { id: user.id },
        data: {
          emailVerificationToken: verificationToken,
          emailVerificationExpires: verificationExpires,
        },
      });

      await this.logAuditEvent(user.id, 'EMAIL_VERIFICATION_RESENT', 'user', user.id);

      return {
        message: 'Verification email has been resent',
        resetToken: verificationToken,
        expiresAt: verificationExpires,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Resend verification failed: ${message}`);
    }
  }

  static async createSession(userId: string, accessToken: string, metadata: LoginMetadata = {}): Promise<SessionRecord | null> {
    try {
      const sessionId = crypto.randomUUID();
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      const data = JSON.stringify({ accessToken, ...metadata });

      return await prisma.session.create({
        data: {
          sessionId,
          userId,
          data,
          ipAddress: metadata.ipAddress || null,
          userAgent: metadata.userAgent || null,
          expiresAt,
        },
      }) as SessionRecord;
    } catch (error) {
      console.error('Failed to create session:', error);
      return null;
    }
  }

  static async removeSession(accessToken: string): Promise<void> {
    try {
      const sessions = await prisma.session.findMany({
        where: {
          userId: { not: null },
        },
      }) as SessionRecord[];

      const sessionsToDelete = sessions.filter((session) => {
        try {
          const data = typeof session.data === 'string' ? JSON.parse(session.data) : session.data;
          return data.accessToken === accessToken;
        } catch {
          return false;
        }
      });

      if (sessionsToDelete.length > 0) {
        await prisma.session.deleteMany({
          where: {
            id: {
              in: sessionsToDelete.map((session) => session.id),
            },
          },
        });
      }
    } catch (error) {
      console.error('Failed to remove session:', error);
    }
  }

  static async logAuditEvent(
    userId: string,
    action: string,
    resource: string,
    resourceId: string,
    metadata: AuthActionMetadata = {},
  ): Promise<void> {
    try {
      await prisma.auditLog.create({
        data: {
          userId,
          action,
          resource,
          resourceId,
          ipAddress: metadata.ipAddress || null,
          userAgent: metadata.userAgent || null,
          newValues: Object.keys(metadata).length > 0 ? JSON.stringify(metadata) : null,
        },
      });
    } catch (error) {
      console.error('Failed to log audit event:', error);
    }
  }

  static async getUserById(userId: string): Promise<PublicUser | null> {
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
        },
      }) as PublicUser | null;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to get user: ${message}`);
    }
  }

  static async updateProfile(userId: string, updateData: ProfileUpdateInput): Promise<PublicUser> {
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
        },
      }) as PublicUser;

      await this.logAuditEvent(userId, 'PROFILE_UPDATED', 'user', userId, updateData as AuthActionMetadata);

      return updatedUser;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Profile update failed: ${message}`);
    }
  }
}

export default AuthService;
