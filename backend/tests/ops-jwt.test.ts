// Regression coverage for the jti hardening: two tokens minted for the same
// user inside one iat second must differ, and blacklisting the consumed
// refresh token must not revoke the rotated one (previously the tokens were
// byte-identical, so rotation locked the fresh token out too).

const JWTUtils = require('../src/utils/jwt').default;
const AuthService = require('../src/services/authService').default;
const { prisma } = require('../src/config/database');
const redisService = require('../src/services/redisService');

const TEST_USER = {
  email: 'wp08-jti@example.test',
  password: 'TestPassword123!',
  firstName: 'Jti',
  lastName: 'Test',
};

const { cleanupTestUsers } = global as any;

const inMemoryRedis = () => {
  const store = new Map<string, string>();
  return {
    setEx: async (key: string, _ttl: number, value: string) => {
      store.set(key, value);
      return 'OK';
    },
    get: async (key: string) => store.get(key) ?? null,
  };
};

describe('JWT jti hardening', () => {
  test('two token pairs minted in the same second carry distinct jti claims', () => {
    const payload = { userId: 'user-1', email: 'a@b.c', role: 'USER' };
    const first = JWTUtils.generateTokenPair(payload);
    const second = JWTUtils.generateTokenPair(payload);

    expect(first.accessToken).not.toBe(second.accessToken);
    expect(first.refreshToken).not.toBe(second.refreshToken);

    const firstAccess = JWTUtils.decodeToken(first.accessToken).payload;
    const secondAccess = JWTUtils.decodeToken(second.accessToken).payload;
    const firstRefresh = JWTUtils.decodeToken(first.refreshToken).payload;
    const secondRefresh = JWTUtils.decodeToken(second.refreshToken).payload;

    for (const decoded of [firstAccess, secondAccess, firstRefresh, secondRefresh]) {
      expect(typeof decoded.jti).toBe('string');
      expect(decoded.jti.length).toBeGreaterThan(0);
    }
    expect(firstAccess.jti).not.toBe(secondAccess.jti);
    expect(firstRefresh.jti).not.toBe(secondRefresh.jti);
    expect(firstAccess.userId).toBe(secondAccess.userId);
  });

  test('blacklisting a refresh token does not revoke a distinct token minted the same second', async () => {
    const redis = inMemoryRedis();
    const payload = { userId: 'user-2', email: 'c@d.e', role: 'USER' };
    const first = JWTUtils.generateTokenPair(payload);
    const second = JWTUtils.generateTokenPair(payload);

    await JWTUtils.blacklistToken(first.refreshToken, redis);

    await expect(
      JWTUtils.verifyRefreshToken(first.refreshToken, { redis }),
    ).rejects.toThrow('revoked');
    await expect(
      JWTUtils.verifyRefreshToken(second.refreshToken, { redis }),
    ).resolves.toMatchObject({ userId: 'user-2', type: 'refresh' });
  });
});

describe('AuthService refresh rotation', () => {
  beforeAll(async () => {
    await cleanupTestUsers(prisma, [TEST_USER.email]);
    try {
      await redisService.connect();
    } catch {
      // Redis unavailable — rotation assertions that need a store are skipped.
    }
  });

  afterAll(async () => {
    await cleanupTestUsers(prisma, [TEST_USER.email]);
    await redisService.disconnect();
    await prisma.$disconnect();
  });

  test('login + immediate refresh produce different tokens; consumed token is revoked, new one is not', async () => {
    await AuthService.register(TEST_USER);
    const login = await AuthService.login({
      email: TEST_USER.email,
      password: TEST_USER.password,
    });
    const first = login.tokens;

    const second = await AuthService.refreshToken(first.refreshToken);

    expect(second.accessToken).not.toBe(first.accessToken);
    expect(second.refreshToken).not.toBe(first.refreshToken);

    if (redisService.isReady()) {
      // The consumed refresh token is blacklisted and cannot be replayed.
      await expect(
        AuthService.refreshToken(first.refreshToken),
      ).rejects.toThrow('Token refresh failed');

      // ...while the rotated token stays valid — the pre-jti bug revoked it too.
      const client = redisService.getClient();
      await expect(
        JWTUtils.verifyRefreshToken(second.refreshToken, { redis: client }),
      ).resolves.toMatchObject({ type: 'refresh' });

      // Clean up the blacklist rows written into the test Redis DB.
      const crypto = require('crypto');
      const keyOf = (token: string) =>
        `blacklist:${crypto.createHash('sha256').update(token).digest('hex')}`;
      await client.del([keyOf(first.refreshToken), keyOf(second.refreshToken)]);
    }
  });
});
