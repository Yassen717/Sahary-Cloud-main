import { randomBytes } from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import { AuthenticationError } from '../utils/errors';

const redisService = require('../services/redisService');

/**
 * CSRF Protection Middleware
 * Protects against Cross-Site Request Forgery attacks
 */

type SessionRequest = Request & {
  session?: { id?: string } | null;
  sessionID?: string;
};

/**
 * Generate CSRF token
 * @param sessionId - Session ID
 * @returns CSRF token
 */
const generateCSRFToken = async (sessionId: string): Promise<string> => {
  const token = randomBytes(32).toString('hex');
  const key = `csrf:${sessionId}`;

  // Store token in Redis with 1 hour expiry
  await redisService.set(key, token, 3600);

  return token;
};

/**
 * Verify CSRF token
 * @param sessionId - Session ID
 * @param token - CSRF token to verify
 * @returns Verification result
 */
const verifyCSRFToken = async (sessionId: string, token: string): Promise<boolean> => {
  const key = `csrf:${sessionId}`;
  const storedToken = await redisService.get(key);

  return storedToken === token;
};

/**
 * CSRF protection middleware
 */
const csrfProtection = async (req: SessionRequest, _res: Response, next: NextFunction): Promise<void> => {
  // Skip CSRF check for safe methods
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }

  // Skip CSRF check for API endpoints with Bearer token
  if (req.headers.authorization?.startsWith('Bearer ')) {
    return next();
  }

  try {
    const sessionId = req.session?.id || req.sessionID;
    const token: string | string[] | undefined = req.headers['x-csrf-token'] || req.body?._csrf;

    if (!sessionId) {
      throw new AuthenticationError('No session found');
    }

    if (!token || typeof token !== 'string') {
      throw new AuthenticationError('CSRF token missing');
    }

    const isValid = await verifyCSRFToken(sessionId, token);

    if (!isValid) {
      throw new AuthenticationError('Invalid CSRF token');
    }

    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Middleware to attach CSRF token to response
 */
const attachCSRFToken = async (req: SessionRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const sessionId = req.session?.id || req.sessionID;

    if (sessionId) {
      const token = await generateCSRFToken(sessionId);
      res.locals.csrfToken = token;

      // Also send in header for API clients
      res.setHeader('X-CSRF-Token', token);
    }

    next();
  } catch (error) {
    next(error);
  }
};

export {
  generateCSRFToken,
  verifyCSRFToken,
  csrfProtection,
  attachCSRFToken,
};

export default {
  generateCSRFToken,
  verifyCSRFToken,
  csrfProtection,
  attachCSRFToken,
};
