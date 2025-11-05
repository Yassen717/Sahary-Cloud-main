const crypto = require('crypto');
const { AuthenticationError } = require('../utils/errors');
const redisService = require('../services/redisService');

/**
 * CSRF Protection Middleware
 * Protects against Cross-Site Request Forgery attacks
 */

/**
 * Generate CSRF token
 * @param {string} sessionId - Session ID
 * @returns {Promise<string>} CSRF token
 */
const generateCSRFToken = async (sessionId) => {
  const token = crypto.randomBytes(32).toString('hex');
  const key = `csrf:${sessionId}`;
  
  // Store token in Redis with 1 hour expiry
  await redisService.set(key, token, 3600);
  
  return token;
};

/**
 * Verify CSRF token
 * @param {string} sessionId - Session ID
 * @param {string} token - CSRF token to verify
 * @returns {Promise<boolean>} Verification result
 */
const verifyCSRFToken = async (sessionId, token) => {
  const key = `csrf:${sessionId}`;
  const storedToken = await redisService.get(key);
  
  return storedToken === token;
};

/**
 * CSRF protection middleware
 */
const csrfProtection = async (req, res, next) => {
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
    const token = req.headers['x-csrf-token'] || req.body?._csrf;

    if (!sessionId) {
      throw new AuthenticationError('No session found');
    }

    if (!token) {
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
const attachCSRFToken = async (req, res, next) => {
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

module.exports = {
  generateCSRFToken,
  verifyCSRFToken,
  csrfProtection,
  attachCSRFToken,
};
