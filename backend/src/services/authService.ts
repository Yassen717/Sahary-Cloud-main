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

const emailService = require('./emailService');
const redisService = require('./redisService');

// Compared against the supplied password when no account exists so login
// response timing does not reveal whether the email is registered.
const DUMMY_PASSWORD_HASH = '$2a$12$R7.HeZ6s8yK.De9M4CxjueIULWtGaEAbbCAY7A1gHC9K.FVp7NgjK';

const getRedisClient = (): any => {
  try {
    return redisService.isReady() ? redisService.getClient() : null;
  } catch {
    return null;
  }
};

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
    const {
      email, password, firstName, lastName, phone,
    } = userData;

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

      const user = await prisma.user.create({
        data: {
          email: email.toLowerCase(),
          password: hashedPassword,
          firstName,
          lastName,
          phone: phone || null,
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

      const emailVerificationToken = JWTUtils.generateEmailVerificationToken(user.id, user.email);
      const emailVerificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);

      await prisma.user.update({
        where: { id: user.id },
        data: {
          emailVerificationToken,
          emailVerificationExpires,
        },
      });

      // Fire-and-forget: a failed email must not fail the registration.
      void emailService
        .sendVerificationEmail(user.email, emailVerificationToken, user.firstName)
        .catch((error: unknown) => console.error('Failed to send verification email:', error));

      const tokenPayload: AuthTokenPayload = {
        userId: user.id,
        email: user.email,
        role: user.role,
      };

      const tokens = JWTUtils.generateTokenPair(tokenPayload) as AuthTokens;

      await this.createSession(user.id, tokens.accessToken, {});

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
      // Concurrent registrations can pass the existence check and then hit the
      // unique constraint (P2002) — surface it as a conflict, not a 500.
      const prismaCode = (error as { code?: string }).code;
      if (prismaCode === 'P2002' || message.includes('Unique constraint')) {
        throw new Error('Registration failed: User with this email already exists');
      }
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

      // Always run a bcrypt comparison — against the real hash or a dummy —
      // so response timing does not reveal whether the account exists.
      const isPasswordValid = await ValidationHelpers.comparePassword(
        password,
        user?.password || DUMMY_PASSWORD_HASH,
      );

      if (!user || !isPasswordValid) {
        if (user) {
          await this.logAuditEvent(user.id, 'LOGIN_FAILED', 'user', user.id, {
            reason: 'Invalid password',
            ipAddress,
            userAgent,
          });
        }
        throw new Error('Invalid email or password');
      }

      // Generic message on purpose — distinct errors would allow enumeration
      // of deactivated accounts. The real reason is recorded server-side.
      if (!user.isActive) {
        await this.logAuditEvent(user.id, 'LOGIN_FAILED', 'user', user.id, {
          reason: 'Account deactivated',
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
      const redis = getRedisClient();
      // Passing the client makes verifyRefreshToken reject blacklisted tokens.
      const decoded = await JWTUtils.verifyRefreshToken(refreshToken, { redis }) as AuthTokenPayload;

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

      // Rotate: revoke the consumed refresh token so it cannot be replayed.
      await JWTUtils.blacklistToken(refreshToken, redis);

      await this.logAuditEvent(user.id, 'TOKEN_REFRESHED', 'user', user.id);

      return tokens;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Token refresh failed: ${message}`);
    }
  }

  static async logout(
    accessToken: string | null | undefined,
    redis: any = null,
    refreshToken: string | null = null,
  ): Promise<void> {
    try {
      if (!accessToken) {
        throw new Error('Access token is required');
      }

      const decoded = JWTUtils.decodeToken(accessToken) as { payload?: { userId?: string } } | null;
      const userId = decoded?.payload?.userId;

      if (redis) {
        await JWTUtils.blacklistToken(accessToken, redis);
        if (refreshToken) {
          await JWTUtils.blacklistToken(refreshToken, redis);
        }
      }

      await this.removeSession(accessToken, userId);

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
        select: {
          id: true, email: true, firstName: true, isActive: true,
        },
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

      // Fire-and-forget: a failed email must not fail the response.
      void emailService
        .sendPasswordResetEmail(user.email, resetToken, user.firstName)
        .catch((error: unknown) => console.error('Failed to send password reset email:', error));

      await this.logAuditEvent(user.id, 'PASSWORD_RESET_REQUESTED', 'user', user.id);

      // Same message whether or not the account exists (no enumeration),
      // and the token is never returned — it is only delivered by email.
      return { message: 'If the email exists, a reset link has been sent' };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Password reset request failed: ${message}`);
    }
  }

  static async resetPassword(resetToken: string, newPassword: string): Promise<void> {
    try {
      const decoded = await JWTUtils.verifyPasswordResetToken(resetToken) as AuthTokenPayload;

      const passwordValidation = ValidationHelpers.validatePasswordStrength(newPassword);
      if (!passwordValidation.isValid) {
        throw new Error(`Password validation failed: ${passwordValidation.feedback.join(', ')}`);
      }

      const hashedPassword = await ValidationHelpers.hashPassword(newPassword, config.security.bcryptRounds);

      // Atomic verify-and-consume: a single conditional update guarantees the
      // token cannot be replayed even under concurrent requests.
      const consumed = await prisma.user.updateMany({
        where: {
          id: decoded.userId,
          passwordResetToken: resetToken,
          passwordResetExpires: {
            gt: new Date(),
          },
        },
        data: {
          password: hashedPassword,
          passwordResetToken: null,
          passwordResetExpires: null,
        },
      });

      if (consumed.count !== 1) {
        throw new Error('Invalid or expired reset token');
      }

      // Belt-and-braces revocation of the consumed token plus every stored
      // session, so existing sessions die with the old password.
      const redis = getRedisClient();
      await JWTUtils.blacklistToken(resetToken, redis);
      try {
        await prisma.session.deleteMany({ where: { userId: decoded.userId } });
      } catch (sessionError) {
        console.error('Failed to clear sessions after password reset:', sessionError);
      }

      await this.logAuditEvent(decoded.userId, 'PASSWORD_RESET_COMPLETED', 'user', decoded.userId);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Password reset failed: ${message}`);
    }
  }

  static async verifyEmail(verificationToken: string): Promise<VerificationResult> {
    try {
      // Verify signature/expiry first, then bind the token to a user via the
      // stored emailVerificationToken — the DB lookup is the authoritative check.
      await JWTUtils.verifyEmailVerificationToken(verificationToken);

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
    const uniformMessage = 'If the email exists and is unverified, a verification link has been sent';

    try {
      const user = await prisma.user.findUnique({
        where: { email: email.toLowerCase() },
        select: {
          id: true, email: true, firstName: true, isVerified: true, isActive: true,
        },
      }) as { id: string; email: string; firstName: string; isVerified: boolean; isActive: boolean } | null;

      // Uniform response whether the account is missing, inactive or already
      // verified — distinct outcomes would allow email enumeration.
      if (!user || !user.isActive || user.isVerified) {
        return { message: uniformMessage } as PasswordResetResult;
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

      // Fire-and-forget: a failed email must not fail the response.
      void emailService
        .sendVerificationEmail(user.email, verificationToken, user.firstName)
        .catch((error: unknown) => console.error('Failed to send verification email:', error));

      await this.logAuditEvent(user.id, 'EMAIL_VERIFICATION_RESENT', 'user', user.id);

      // Token is only delivered by email, never in the response.
      return { message: uniformMessage } as PasswordResetResult;
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

  static async removeSession(accessToken: string, userId: string | null = null): Promise<void> {
    try {
      // Bound the query: scope to the owning user (when known) and let the
      // database filter on the token embedded in the JSON data blob rather
      // than scanning the whole sessions table.
      const sessions = await prisma.session.findMany({
        where: {
          userId: userId || { not: null },
          data: {
            contains: accessToken,
          },
        },
        select: { id: true },
      });

      if (sessions.length > 0) {
        await prisma.session.deleteMany({
          where: {
            id: {
              in: sessions.map((session: { id: string }) => session.id),
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
      const {
        firstName, lastName, phone, avatar,
      } = updateData;

      const updatedUser = await prisma.user.update({
        where: { id: userId },
        data: {
          ...(firstName && { firstName }),
          ...(lastName && { lastName }),
          ...(phone !== undefined && { phone }),
          // !== undefined so an explicit null/'' clears the avatar.
          ...(avatar !== undefined && { avatar: avatar || null }),
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
