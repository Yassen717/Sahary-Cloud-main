const jwt = require('jsonwebtoken');
const { promisify } = require('util');
const config = require('../config');

/**
 * JWT utility functions
 */
class JWTUtils {
  /**
   * Generate access token
   * @param {Object} payload - Token payload
   * @param {Object} options - Token options
   * @returns {string} JWT token
   */
  static generateAccessToken(payload, options = {}) {
    const {
      expiresIn = config.jwt.expiresIn,
      issuer = 'sahary-cloud',
      audience = 'sahary-cloud-users',
    } = options;

    return jwt.sign(
      {
        ...payload,
        type: 'access',
        iat: Math.floor(Date.now() / 1000),
      },
      config.jwt.secret,
      {
        expiresIn,
        issuer,
        audience,
        algorithm: 'HS256',
      }
    );
  }

  /**
   * Generate refresh token
   * @param {Object} payload - Token payload
   * @param {Object} options - Token options
   * @returns {string} JWT refresh token
   */
  static generateRefreshToken(payload, options = {}) {
    const {
      expiresIn = config.jwt.refreshExpiresIn,
      issuer = 'sahary-cloud',
      audience = 'sahary-cloud-users',
    } = options;

    return jwt.sign(
      {
        ...payload,
        type: 'refresh',
        iat: Math.floor(Date.now() / 1000),
      },
      config.jwt.refreshSecret,
      {
        expiresIn,
        issuer,
        audience,
        algorithm: 'HS256',
      }
    );
  }

  /**
   * Generate token pair (access + refresh)
   * @param {Object} payload - Token payload
   * @param {Object} options - Token options
   * @returns {Object} Token pair
   */
  static generateTokenPair(payload, options = {}) {
    const accessToken = this.generateAccessToken(payload, options);
    const refreshToken = this.generateRefreshToken(payload, options);

    return {
      accessToken,
      refreshToken,
      tokenType: 'Bearer',
      expiresIn: this.getTokenExpiration(accessToken),
    };
  }

  /**
   * Verify access token
   * @param {string} token - JWT token
   * @param {Object} options - Verification options
   * @returns {Promise<Object>} Decoded token
   */
  static async verifyAccessToken(token, options = {}) {
    const {
      issuer = 'sahary-cloud',
      audience = 'sahary-cloud-users',
    } = options;

    try {
      const decoded = await promisify(jwt.verify)(token, config.jwt.secret, {
        issuer,
        audience,
        algorithms: ['HS256'],
      });

      // Check token type
      if (decoded.type !== 'access') {
        throw new Error('Invalid token type');
      }

      return decoded;
    } catch (error) {
      throw new Error(`Token verification failed: ${error.message}`);
    }
  }

  /**
   * Verify refresh token
   * @param {string} token - JWT refresh token
   * @param {Object} options - Verification options
   * @returns {Promise<Object>} Decoded token
   */
  static async verifyRefreshToken(token, options = {}) {
    const {
      issuer = 'sahary-cloud',
      audience = 'sahary-cloud-users',
    } = options;

    try {
      const decoded = await promisify(jwt.verify)(token, config.jwt.refreshSecret, {
        issuer,
        audience,
        algorithms: ['HS256'],
      });

      // Check token type
      if (decoded.type !== 'refresh') {
        throw new Error('Invalid token type');
      }

      return decoded;
    } catch (error) {
      throw new Error(`Refresh token verification failed: ${error.message}`);
    }
  }

  /**
   * Decode token without verification (for debugging)
   * @param {string} token - JWT token
   * @returns {Object} Decoded token
   */
  static decodeToken(token) {
    try {
      return jwt.decode(token, { complete: true });
    } catch (error) {
      throw new Error(`Token decode failed: ${error.message}`);
    }
  }

  /**
   * Get token expiration time
   * @param {string} token - JWT token
   * @returns {number} Expiration timestamp
   */
  static getTokenExpiration(token) {
    try {
      const decoded = jwt.decode(token);
      return decoded.exp;
    } catch (error) {
      return null;
    }
  }

  /**
   * Check if token is expired
   * @param {string} token - JWT token
   * @returns {boolean} Is token expired
   */
  static isTokenExpired(token) {
    try {
      const exp = this.getTokenExpiration(token);
      if (!exp) return true;
      
      return Date.now() >= exp * 1000;
    } catch (error) {
      return true;
    }
  }

  /**
   * Get time until token expires
   * @param {string} token - JWT token
   * @returns {number} Seconds until expiration
   */
  static getTimeUntilExpiration(token) {
    try {
      const exp = this.getTokenExpiration(token);
      if (!exp) return 0;
      
      const now = Math.floor(Date.now() / 1000);
      return Math.max(0, exp - now);
    } catch (error) {
      return 0;
    }
  }

  /**
   * Extract user ID from token
   * @param {string} token - JWT token
   * @returns {string|null} User ID
   */
  static extractUserId(token) {
    try {
      const decoded = jwt.decode(token);
      return decoded.userId || decoded.sub || null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Create email verification token
   * @param {string} userId - User ID
   * @param {string} email - User email
   * @returns {string} Verification token
   */
  static generateEmailVerificationToken(userId, email) {
    return jwt.sign(
      {
        userId,
        email,
        type: 'email_verification',
        iat: Math.floor(Date.now() / 1000),
      },
      config.jwt.secret,
      {
        expiresIn: '24h', // 24 hours for email verification
        issuer: 'sahary-cloud',
        audience: 'sahary-cloud-users',
      }
    );
  }

  /**
   * Verify email verification token
   * @param {string} token - Verification token
   * @returns {Promise<Object>} Decoded token
   */
  static async verifyEmailVerificationToken(token) {
    try {
      const decoded = await promisify(jwt.verify)(token, config.jwt.secret, {
        issuer: 'sahary-cloud',
        audience: 'sahary-cloud-users',
      });

      if (decoded.type !== 'email_verification') {
        throw new Error('Invalid token type');
      }

      return decoded;
    } catch (error) {
      throw new Error(`Email verification token invalid: ${error.message}`);
    }
  }

  /**
   * Create password reset token
   * @param {string} userId - User ID
   * @param {string} email - User email
   * @returns {string} Reset token
   */
  static generatePasswordResetToken(userId, email) {
    return jwt.sign(
      {
        userId,
        email,
        type: 'password_reset',
        iat: Math.floor(Date.now() / 1000),
      },
      config.jwt.secret,
      {
        expiresIn: '1h', // 1 hour for password reset
        issuer: 'sahary-cloud',
        audience: 'sahary-cloud-users',
      }
    );
  }

  /**
   * Verify password reset token
   * @param {string} token - Reset token
   * @returns {Promise<Object>} Decoded token
   */
  static async verifyPasswordResetToken(token) {
    try {
      const decoded = await promisify(jwt.verify)(token, config.jwt.secret, {
        issuer: 'sahary-cloud',
        audience: 'sahary-cloud-users',
      });

      if (decoded.type !== 'password_reset') {
        throw new Error('Invalid token type');
      }

      return decoded;
    } catch (error) {
      throw new Error(`Password reset token invalid: ${error.message}`);
    }
  }

  /**
   * Blacklist token (for logout)
   * Note: In production, you'd want to store blacklisted tokens in Redis
   * @param {string} token - Token to blacklist
   * @param {Object} redis - Redis client
   * @returns {Promise<void>}
   */
  static async blacklistToken(token, redis) {
    if (!redis) return;

    try {
      const decoded = jwt.decode(token);
      if (!decoded || !decoded.exp) return;

      const ttl = decoded.exp - Math.floor(Date.now() / 1000);
      if (ttl > 0) {
        await redis.setex(`blacklist:${token}`, ttl, '1');
      }
    } catch (error) {
      console.error('Failed to blacklist token:', error);
    }
  }

  /**
   * Check if token is blacklisted
   * @param {string} token - Token to check
   * @param {Object} redis - Redis client
   * @returns {Promise<boolean>} Is token blacklisted
   */
  static async isTokenBlacklisted(token, redis) {
    if (!redis) return false;

    try {
      const result = await redis.get(`blacklist:${token}`);
      return result === '1';
    } catch (error) {
      console.error('Failed to check token blacklist:', error);
      return false;
    }
  }
}

module.exports = JWTUtils;