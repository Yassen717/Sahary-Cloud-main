import type { NextFunction, Request, Response } from 'express';
import JWTUtils from '../utils/jwt';
import AuthService from '../services/authService';
import redisService from '../services/redisService';
import { prisma } from '../config/database';
import { isFeatureEnabled } from '../config/auth';

const rateLimit = require('express-rate-limit');

export interface AuthenticatedUser {
  id: string;
  userId: string;
  email: string;
  role: string;
  isVerified: boolean;
  firstName?: string;
  lastName?: string;
}

export interface AuthRequest extends Request {
  user?: AuthenticatedUser | null;
  token?: string;
  apiKey?: string;
  isApiRequest?: boolean;
  isOwner?: boolean;
  isSelf?: boolean;
  isAdmin?: boolean;
}

type Middleware = (req: AuthRequest, res: Response, next: NextFunction) => unknown;

type RateLimitOptions = {
  windowMs?: number;
  max?: number;
  message?: string;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
};

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }

  return 'Unknown error';
};

const getHeaderValue = (value: string | string[] | undefined): string | undefined => {
  if (typeof value === 'string') {
    return value;
  }

  if (Array.isArray(value) && value.length > 0) {
    return value[0];
  }

  return undefined;
};

class AuthMiddleware {
  static async authenticate(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const authHeader = getHeaderValue(req.headers.authorization);
      const cookieToken = req.cookies?.token;
      const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7) : cookieToken;

      if (!token) {
        res.status(401).json({
          success: false,
          error: 'Authentication required',
          message: 'No valid authorization header or session cookie provided',
        });
        return;
      }

      if (redisService.isReady()) {
        try {
          const isBlacklisted = await JWTUtils.isTokenBlacklisted(token, redisService.getClient());
          if (isBlacklisted) {
            res.status(401).json({
              success: false,
              error: 'Token invalid',
              message: 'Token has been revoked',
            });
            return;
          }
        } catch (redisError) {
          console.warn('Redis blacklist check failed:', getErrorMessage(redisError));
        }
      }

      const decoded = await JWTUtils.verifyAccessToken(token);
      if (!decoded.userId) {
        res.status(401).json({
          success: false,
          error: 'Authentication failed',
          message: 'Invalid access token payload',
        });
        return;
      }

      const user = await AuthService.getUserById(decoded.userId);

      if (!user) {
        res.status(401).json({
          success: false,
          error: 'User not found',
          message: 'Token user no longer exists',
        });
        return;
      }

      if (!user.isActive) {
        res.status(401).json({
          success: false,
          error: 'Account deactivated',
          message: 'User account has been deactivated',
        });
        return;
      }

      req.user = {
        id: user.id,
        userId: user.id,
        email: user.email,
        role: user.role,
        isVerified: user.isVerified,
        firstName: user.firstName,
        lastName: user.lastName,
      };

      req.token = token;
      next();
    } catch (error) {
      res.status(401).json({
        success: false,
        error: 'Authentication failed',
        message: getErrorMessage(error),
      });
    }
  }

  static async optionalAuth(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const authHeader = getHeaderValue(req.headers.authorization);
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        req.user = null;
        next();
        return;
      }

      await AuthMiddleware.authenticate(req, res, (error?: unknown) => {
        if (error) {
          req.user = null;
        }
        next();
      });
    } catch {
      req.user = null;
      next();
    }
  }

  static requireRole(...roles: string[]): Middleware {
    return (req, res, next) => {
      if (!req.user) {
        res.status(401).json({
          success: false,
          error: 'Authentication required',
          message: 'Please authenticate to access this resource',
        });
        return;
      }

      if (!roles.includes(req.user.role)) {
        res.status(403).json({
          success: false,
          error: 'Insufficient permissions',
          message: `This action requires one of the following roles: ${roles.join(', ')}`,
          requiredRoles: roles,
          userRole: req.user.role,
        });
        return;
      }

      next();
    };
  }

  static requireAdmin(req: AuthRequest, res: Response, next: NextFunction): void {
    AuthMiddleware.requireRole('ADMIN', 'SUPER_ADMIN')(req, res, next);
  }

  static requireSuperAdmin(req: AuthRequest, res: Response, next: NextFunction): void {
    AuthMiddleware.requireRole('SUPER_ADMIN')(req, res, next);
  }

  static requireEmailVerification(req: AuthRequest, res: Response, next: NextFunction): void {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Authentication required',
        message: 'Please authenticate to access this resource',
      });
      return;
    }

    if (!req.user.isVerified) {
      res.status(403).json({
        success: false,
        error: 'Email verification required',
        message: 'Please verify your email address to access this resource',
        emailVerificationRequired: true,
      });
      return;
    }

    next();
  }

  static requireOwnershipOrAdmin(userIdParam = 'userId'): Middleware {
    return (req, res, next) => {
      if (!req.user) {
        res.status(401).json({
          success: false,
          error: 'Authentication required',
          message: 'Please authenticate to access this resource',
        });
        return;
      }

      const resourceUserId = req.params[userIdParam] || (req.body as Record<string, unknown>)?.[userIdParam];
      const isOwner = req.user.userId === resourceUserId;
      const isAdmin = ['ADMIN', 'SUPER_ADMIN'].includes(req.user.role);

      if (!isOwner && !isAdmin) {
        res.status(403).json({
          success: false,
          error: 'Access denied',
          message: 'You can only access your own resources or need admin privileges',
        });
        return;
      }

      req.isOwner = isOwner;
      req.isAdmin = isAdmin;
      next();
    };
  }

  static createRateLimit(options: RateLimitOptions = {}): Middleware {
    const {
      windowMs = 15 * 60 * 1000,
      max = 100,
      message = 'Too many requests from this IP, please try again later',
      skipSuccessfulRequests = false,
      skipFailedRequests = false,
    } = options;

    return rateLimit({
      windowMs,
      max,
      message: {
        success: false,
        error: 'Rate limit exceeded',
        message,
      },
      standardHeaders: true,
      legacyHeaders: false,
      skipSuccessfulRequests,
      skipFailedRequests,
    });
  }

  static async authenticateApiKey(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const apiKey = getHeaderValue(req.headers['x-api-key'] as string | string[] | undefined) || getHeaderValue(req.query.apiKey as string | string[] | undefined);

      if (!apiKey) {
        res.status(401).json({
          success: false,
          error: 'API key required',
          message: 'Please provide a valid API key',
        });
        return;
      }

      const validApiKeys = (process.env.VALID_API_KEYS || '').split(',');

      if (!validApiKeys.includes(apiKey)) {
        res.status(401).json({
          success: false,
          error: 'Invalid API key',
          message: 'The provided API key is not valid',
        });
        return;
      }

      req.apiKey = apiKey;
      req.isApiRequest = true;
      next();
    } catch (error) {
      res.status(401).json({
        success: false,
        error: 'API key authentication failed',
        message: getErrorMessage(error),
      });
    }
  }

  static requireSelfOrAdmin(req: AuthRequest, res: Response, next: NextFunction): void {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Authentication required',
        message: 'Please authenticate to access this resource',
      });
      return;
    }

    const targetUserId = req.params.userId || req.params.id;
    const isSelf = req.user.userId === targetUserId;
    const isAdmin = ['ADMIN', 'SUPER_ADMIN'].includes(req.user.role);

    if (!isSelf && !isAdmin) {
      res.status(403).json({
        success: false,
        error: 'Access denied',
        message: 'You can only access your own profile or need admin privileges',
      });
      return;
    }

    req.isSelf = isSelf;
    req.isAdmin = isAdmin;
    next();
  }

  static conditional(condition: (req: AuthRequest) => boolean, middleware: Middleware): Middleware {
    return (req, res, next) => {
      if (condition(req)) {
        return middleware(req, res, next);
      }

      next();
    };
  }

  static logAuthEvent(req: AuthRequest, _res: Response, next: NextFunction): void {
    if (req.user) {
      console.log(`Auth Event: ${req.method} ${req.path} - User: ${req.user.email} (${req.user.role})`);
    }

    next();
  }

  static async validateSession(req: AuthRequest, _res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user || !req.token) {
        next();
        return;
      }

      const session = await prisma.session.findFirst({
        where: {
          userId: req.user.userId,
          data: {
            path: ['accessToken'],
            equals: req.token,
          } as any,
          expiresAt: {
            gt: new Date(),
          },
        },
      });

      if (!session) {
        _res.status(401).json({
          success: false,
          error: 'Session expired',
          message: 'Your session has expired, please login again',
        });
        return;
      }

      next();
    } catch (error) {
      console.error('Session validation error:', error);
      next();
    }
  }

  static requireFeature(feature: string): Middleware {
    return (req, res, next) => {
      if (!isFeatureEnabled(feature)) {
        res.status(403).json({
          success: false,
          error: 'Feature not available',
          message: `The ${feature} feature is currently disabled`,
        });
        return;
      }

      next();
    };
  }

  static combine(...middlewares: Middleware[]): Middleware {
    return (req, res, next) => {
      let index = 0;

      const runNext = (error?: unknown): void => {
        if (error) {
          next(error as Error);
          return;
        }

        if (index >= middlewares.length) {
          next();
          return;
        }

        const middleware = middlewares[index++];
        middleware(req, res, runNext);
      };

      runNext();
    };
  }
}

export {
  AuthMiddleware,
  AuthMiddleware as AuthMiddlewareClass,
  AuthMiddleware as defaultAuthMiddleware,
  AuthMiddleware as MiddlewareClass,
};

export const authenticate = AuthMiddleware.authenticate;
export const optionalAuth = AuthMiddleware.optionalAuth;
export const requireRole = AuthMiddleware.requireRole;
export const requireAdmin = AuthMiddleware.requireAdmin;
export const requireSuperAdmin = AuthMiddleware.requireSuperAdmin;
export const requireEmailVerification = AuthMiddleware.requireEmailVerification;
export const requireOwnershipOrAdmin = AuthMiddleware.requireOwnershipOrAdmin;
export const requireSelfOrAdmin = AuthMiddleware.requireSelfOrAdmin;
export const createRateLimit = AuthMiddleware.createRateLimit;
export const authenticateApiKey = AuthMiddleware.authenticateApiKey;
export const conditional = AuthMiddleware.conditional;
export const logAuthEvent = AuthMiddleware.logAuthEvent;
export const validateSession = AuthMiddleware.validateSession;
export const requireFeature = AuthMiddleware.requireFeature;
export const combine = AuthMiddleware.combine;

export default {
  AuthMiddleware,
  authenticate,
  optionalAuth,
  requireRole,
  requireAdmin,
  requireSuperAdmin,
  requireEmailVerification,
  requireOwnershipOrAdmin,
  requireSelfOrAdmin,
  createRateLimit,
  authenticateApiKey,
  conditional,
  logAuthEvent,
  validateSession,
  requireFeature,
  combine,
};