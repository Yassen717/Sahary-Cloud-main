import jwt from 'jsonwebtoken';
import config from '../config';
import type { AuthTokenPayload, AuthTokens } from '../types/auth';

type JwtPayloadRecord = Record<string, unknown> & {
  userId?: string;
  email?: string;
  role?: string;
  type?: string;
  iat?: number;
  exp?: number;
  sub?: string;
};

type JwtTokenOptions = {
  expiresIn?: string | number;
  issuer?: string;
  audience?: string;
};

type RedisLike = {
  setEx?: (key: string, ttl: number, value: string) => Promise<unknown>;
  get?: (key: string) => Promise<string | null>;
};

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }

  return 'Unknown error';
};

const getSecret = (secret: string | undefined, name: string): string => {
  if (!secret) {
    throw new Error(`${name} is not configured`);
  }

  return secret;
};

const decodeTokenPayload = (token: string): JwtPayloadRecord | null => {
  const decoded = jwt.decode(token);

  if (!decoded || typeof decoded !== 'object') {
    return null;
  }

  return decoded as JwtPayloadRecord;
};

class JWTUtils {
  static generateAccessToken(payload: AuthTokenPayload, options: JwtTokenOptions = {}): string {
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
      getSecret(config.jwt.secret, 'JWT secret'),
      {
        expiresIn,
        issuer,
        audience,
        algorithm: 'HS256',
      },
    );
  }

  static generateRefreshToken(payload: AuthTokenPayload, options: JwtTokenOptions = {}): string {
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
      getSecret(config.jwt.refreshSecret, 'JWT refresh secret'),
      {
        expiresIn,
        issuer,
        audience,
        algorithm: 'HS256',
      },
    );
  }

  static generateTokenPair(payload: AuthTokenPayload, options: JwtTokenOptions = {}): AuthTokens {
    const accessToken = this.generateAccessToken(payload, options);
    const refreshToken = this.generateRefreshToken(payload, options);

    const exp = this.getTokenExpiration(accessToken);
    const now = Math.floor(Date.now() / 1000);

    return {
      accessToken,
      refreshToken,
      tokenType: 'Bearer',
      expiresIn: exp ? Math.max(0, exp - now) : null,
      expiresAt: exp ? new Date(exp * 1000).toISOString() : null,
    };
  }

  static async verifyAccessToken(token: string, options: JwtTokenOptions = {}): Promise<JwtPayloadRecord> {
    const { issuer = 'sahary-cloud', audience = 'sahary-cloud-users' } = options;

    try {
      const decoded = jwt.verify(token, getSecret(config.jwt.secret, 'JWT secret'), {
        issuer,
        audience,
        algorithms: ['HS256'],
      });

      if (!decoded || typeof decoded !== 'object') {
        throw new Error('Invalid token payload');
      }

      const typedDecoded = decoded as JwtPayloadRecord;

      if (typedDecoded.type !== 'access') {
        throw new Error('Invalid token type');
      }

      return typedDecoded;
    } catch (error) {
      throw new Error(`Token verification failed: ${getErrorMessage(error)}`);
    }
  }

  static async verifyRefreshToken(token: string, options: JwtTokenOptions = {}): Promise<JwtPayloadRecord> {
    const { issuer = 'sahary-cloud', audience = 'sahary-cloud-users' } = options;

    try {
      const decoded = jwt.verify(token, getSecret(config.jwt.refreshSecret, 'JWT refresh secret'), {
        issuer,
        audience,
        algorithms: ['HS256'],
      });

      if (!decoded || typeof decoded !== 'object') {
        throw new Error('Invalid token payload');
      }

      const typedDecoded = decoded as JwtPayloadRecord;

      if (typedDecoded.type !== 'refresh') {
        throw new Error('Invalid token type');
      }

      return typedDecoded;
    } catch (error) {
      throw new Error(`Refresh token verification failed: ${getErrorMessage(error)}`);
    }
  }

  static decodeToken(token: string): unknown {
    try {
      return jwt.decode(token, { complete: true });
    } catch (error) {
      throw new Error(`Token decode failed: ${getErrorMessage(error)}`);
    }
  }

  static getTokenExpiration(token: string): number | null {
    try {
      const decoded = decodeTokenPayload(token);
      return decoded?.exp ?? null;
    } catch {
      return null;
    }
  }

  static isTokenExpired(token: string): boolean {
    try {
      const exp = this.getTokenExpiration(token);
      if (!exp) {
        return true;
      }

      return Date.now() >= exp * 1000;
    } catch {
      return true;
    }
  }

  static getTimeUntilExpiration(token: string): number {
    try {
      const exp = this.getTokenExpiration(token);
      if (!exp) {
        return 0;
      }

      const now = Math.floor(Date.now() / 1000);
      return Math.max(0, exp - now);
    } catch {
      return 0;
    }
  }

  static extractUserId(token: string): string | null {
    try {
      const decoded = decodeTokenPayload(token);
      return decoded?.userId || decoded?.sub || null;
    } catch {
      return null;
    }
  }

  static generateEmailVerificationToken(userId: string, email: string): string {
    return jwt.sign(
      {
        userId,
        email,
        type: 'email_verification',
        iat: Math.floor(Date.now() / 1000),
      },
      getSecret(config.jwt.secret, 'JWT secret'),
      {
        expiresIn: '24h',
        issuer: 'sahary-cloud',
        audience: 'sahary-cloud-users',
      },
    );
  }

  static async verifyEmailVerificationToken(token: string): Promise<JwtPayloadRecord> {
    try {
      const decoded = jwt.verify(token, getSecret(config.jwt.secret, 'JWT secret'), {
        issuer: 'sahary-cloud',
        audience: 'sahary-cloud-users',
      });

      if (!decoded || typeof decoded !== 'object') {
        throw new Error('Invalid token payload');
      }

      const typedDecoded = decoded as JwtPayloadRecord;

      if (typedDecoded.type !== 'email_verification') {
        throw new Error('Invalid token type');
      }

      return typedDecoded;
    } catch (error) {
      throw new Error(`Email verification token invalid: ${getErrorMessage(error)}`);
    }
  }

  static generatePasswordResetToken(userId: string, email: string): string {
    return jwt.sign(
      {
        userId,
        email,
        type: 'password_reset',
        iat: Math.floor(Date.now() / 1000),
      },
      getSecret(config.jwt.secret, 'JWT secret'),
      {
        expiresIn: '1h',
        issuer: 'sahary-cloud',
        audience: 'sahary-cloud-users',
      },
    );
  }

  static async verifyPasswordResetToken(token: string): Promise<JwtPayloadRecord> {
    try {
      const decoded = jwt.verify(token, getSecret(config.jwt.secret, 'JWT secret'), {
        issuer: 'sahary-cloud',
        audience: 'sahary-cloud-users',
      });

      if (!decoded || typeof decoded !== 'object') {
        throw new Error('Invalid token payload');
      }

      const typedDecoded = decoded as JwtPayloadRecord;

      if (typedDecoded.type !== 'password_reset') {
        throw new Error('Invalid token type');
      }

      return typedDecoded;
    } catch (error) {
      throw new Error(`Password reset token invalid: ${getErrorMessage(error)}`);
    }
  }

  static async blacklistToken(token: string, redis: RedisLike | null): Promise<void> {
    if (!redis || typeof redis.setEx !== 'function') {
      console.log('Redis not available for token blacklisting:');
      return;
    }

    try {
      const decoded = decodeTokenPayload(token);
      if (!decoded?.exp) {
        return;
      }

      const ttl = decoded.exp - Math.floor(Date.now() / 1000);
      if (ttl > 0) {
        await redis.setEx(`blacklist:${token}`, ttl, '1');
      }
    } catch (error) {
      console.error('Failed to blacklist token:', error);
    }
  }

  static async isTokenBlacklisted(token: string, redis: RedisLike | null): Promise<boolean> {
    if (!redis || typeof redis.get !== 'function') {
      console.log('Redis not available for token blacklist check:');
      return false;
    }

    try {
      const result = await redis.get(`blacklist:${token}`);
      return result === '1';
    } catch (error) {
      console.error('Failed to check token blacklist:', error);
      return false;
    }
  }
}

export default JWTUtils;