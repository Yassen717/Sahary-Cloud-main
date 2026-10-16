const mockQuery = jest.fn();
const mockRelease = jest.fn();
const mockGetConnection = jest.fn(async () => ({ query: mockQuery, release: mockRelease }));
const mockPoolEnd = jest.fn(async () => undefined);
const mockCreatePool = jest.fn(() => ({ getConnection: mockGetConnection, end: mockPoolEnd }));

jest.mock('mysql2/promise', () => ({
  createPool: (...args: unknown[]) => mockCreatePool(...args),
}));

const mockLoggerError = jest.fn();
const mockLoggerWarn = jest.fn();

jest.mock('../../src/utils/logger', () => ({
  __esModule: true,
  default: {
    error: (...args: unknown[]) => mockLoggerError(...args),
    warn: (...args: unknown[]) => mockLoggerWarn(...args),
    info: jest.fn(),
    debug: jest.fn(),
  },
}));

import * as svc from '../../src/services/mysqlProvisionService';

const ADMIN_URL = 'mysql://root:test@127.0.0.1:3306/mysql';

const enableMysql = (): void => {
  process.env.HOSTING_MYSQL_ENABLED = 'true';
  process.env.HOSTING_MYSQL_ADMIN_URL = ADMIN_URL;
  process.env.HOSTING_MYSQL_USER_HOST = '%';
};

const callsOf = (mock: jest.Mock): string =>
  mock.mock.calls.map((c) => JSON.stringify(c)).join('\n');

describe('mysqlProvisionService', () => {
  beforeEach(async () => {
    await svc.closeMysqlPool();
    mockQuery.mockReset();
    mockRelease.mockReset();
    mockGetConnection.mockReset();
    mockCreatePool.mockReset();
    mockPoolEnd.mockReset();
    mockLoggerError.mockClear();
    mockLoggerWarn.mockClear();
    // resetMocks wipes declaration-time implementations — reinstall them here.
    mockQuery.mockResolvedValue([[{ ok: 1 }], []]);
    mockGetConnection.mockResolvedValue({ query: mockQuery, release: mockRelease });
    mockPoolEnd.mockResolvedValue(undefined);
    mockCreatePool.mockReturnValue({ getConnection: mockGetConnection, end: mockPoolEnd });
    enableMysql();
  });

  afterEach(async () => {
    await svc.closeMysqlPool();
    delete process.env.HOSTING_MYSQL_ENABLED;
    delete process.env.HOSTING_MYSQL_ADMIN_URL;
    delete process.env.HOSTING_MYSQL_USER_HOST;
  });

  describe('isMysqlEnabled', () => {
    test('false when disabled or url missing, true when both set', () => {
      process.env.HOSTING_MYSQL_ENABLED = 'false';
      expect(svc.isMysqlEnabled()).toBe(false);
      process.env.HOSTING_MYSQL_ENABLED = 'true';
      process.env.HOSTING_MYSQL_ADMIN_URL = '';
      expect(svc.isMysqlEnabled()).toBe(false);
      process.env.HOSTING_MYSQL_ADMIN_URL = ADMIN_URL;
      expect(svc.isMysqlEnabled()).toBe(true);
    });
  });

  describe('disabled behavior', () => {
    test('operations reject with 503 when not enabled', async () => {
      process.env.HOSTING_MYSQL_ENABLED = 'false';
      await expect(svc.ensureAccountUser('sc1', 'pw')).rejects.toMatchObject({ status: 503 });
      await expect(svc.dropDatabase('sc1_main')).rejects.toMatchObject({ status: 503 });
      expect(mockCreatePool).not.toHaveBeenCalled();
    });

    test('healthCheck reports disabled without connecting', async () => {
      process.env.HOSTING_MYSQL_ENABLED = 'false';
      await expect(svc.healthCheck()).resolves.toEqual({ ok: true, message: 'disabled' });
      expect(mockCreatePool).not.toHaveBeenCalled();
    });
  });

  describe('pool management', () => {
    test('lazily creates a pool from adminUrl with connectionLimit 2 and releases connections', async () => {
      await svc.dropDatabase('db1');
      expect(mockCreatePool).toHaveBeenCalledTimes(1);
      expect(mockCreatePool).toHaveBeenCalledWith({ uri: ADMIN_URL, connectionLimit: 2 });
      expect(mockGetConnection).toHaveBeenCalledTimes(1);
      expect(mockRelease).toHaveBeenCalledTimes(1);

      await svc.dropDatabase('db2');
      // Same URL reuses the pool.
      expect(mockCreatePool).toHaveBeenCalledTimes(1);
      expect(mockGetConnection).toHaveBeenCalledTimes(2);
    });

    test('closeMysqlPool ends the pool and the next op rebuilds it', async () => {
      await svc.dropDatabase('db1');
      await svc.closeMysqlPool();
      expect(mockPoolEnd).toHaveBeenCalledTimes(1);
      await svc.dropDatabase('db2');
      expect(mockCreatePool).toHaveBeenCalledTimes(2);
    });
  });

  describe('ensureAccountUser', () => {
    test('creates user if missing then always sets the password (retry-safe)', async () => {
      await svc.ensureAccountUser('scabc123', 's3cret!');
      expect(mockQuery).toHaveBeenNthCalledWith(
        1,
        'CREATE USER IF NOT EXISTS `scabc123`@? IDENTIFIED BY ?',
        ['%', 's3cret!'],
      );
      expect(mockQuery).toHaveBeenNthCalledWith(
        2,
        'ALTER USER `scabc123`@? IDENTIFIED BY ?',
        ['%', 's3cret!'],
      );
      expect(mockRelease).toHaveBeenCalledTimes(1);
    });

    test('honors a configured userHost', async () => {
      process.env.HOSTING_MYSQL_USER_HOST = '10.%';
      await svc.ensureAccountUser('scabc123', 'pw');
      expect(mockQuery).toHaveBeenNthCalledWith(
        1,
        'CREATE USER IF NOT EXISTS `scabc123`@? IDENTIFIED BY ?',
        ['10.%', 'pw'],
      );
    });
  });

  describe('ensureDatabase', () => {
    test('creates utf8mb4 database and grants ALL on that database only', async () => {
      await svc.ensureDatabase('scabc_shop', 'scabc');
      expect(mockQuery).toHaveBeenNthCalledWith(
        1,
        'CREATE DATABASE IF NOT EXISTS `scabc_shop` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci',
      );
      expect(mockQuery).toHaveBeenNthCalledWith(
        2,
        'GRANT ALL PRIVILEGES ON `scabc\\_shop`.* TO `scabc`@?',
        ['%'],
      );
    });
  });

  describe('drop and password operations', () => {
    test('dropDatabase uses IF EXISTS', async () => {
      await svc.dropDatabase('scabc_old');
      expect(mockQuery).toHaveBeenCalledWith('DROP DATABASE IF EXISTS `scabc_old`');
    });

    test('dropAccountUser uses IF EXISTS', async () => {
      await svc.dropAccountUser('scabc');
      expect(mockQuery).toHaveBeenCalledWith('DROP USER IF EXISTS `scabc`@?', ['%']);
    });

    test('setAccountUserPassword alters the user', async () => {
      await svc.setAccountUserPassword('scabc', 'newpw');
      expect(mockQuery).toHaveBeenCalledWith(
        'ALTER USER `scabc`@? IDENTIFIED BY ?',
        ['%', 'newpw'],
      );
    });

    test('setAccountUserLocked(false) issues ACCOUNT UNLOCK without kills', async () => {
      await svc.setAccountUserLocked('scabc', false);
      expect(mockQuery).toHaveBeenCalledTimes(1);
      expect(mockQuery).toHaveBeenCalledWith('ALTER USER `scabc`@? ACCOUNT UNLOCK', ['%']);
    });
  });

  describe('setAccountUserLocked(true)', () => {
    test('locks then kills every live session for that user', async () => {
      mockQuery.mockImplementation(async (sql: string) => {
        if (sql.startsWith('SELECT ID FROM information_schema.PROCESSLIST')) {
          return [[{ ID: 11 }, { ID: 22 }], []];
        }
        return [[], []];
      });

      await svc.setAccountUserLocked('scabc', true);

      expect(mockQuery).toHaveBeenNthCalledWith(1, 'ALTER USER `scabc`@? ACCOUNT LOCK', ['%']);
      expect(mockQuery).toHaveBeenNthCalledWith(
        2,
        'SELECT ID FROM information_schema.PROCESSLIST WHERE USER = ?',
        ['scabc'],
      );
      expect(mockQuery).toHaveBeenNthCalledWith(3, 'KILL ?', [11]);
      expect(mockQuery).toHaveBeenNthCalledWith(4, 'KILL ?', [22]);
    });

    test('KILL failures are best-effort and do not fail the lock', async () => {
      mockQuery.mockImplementation(async (sql: string, values?: unknown[]) => {
        if (sql.startsWith('SELECT ID FROM information_schema.PROCESSLIST')) {
          return [[{ ID: 11 }, { ID: 22 }], []];
        }
        if (sql === 'KILL ?' && values?.[0] === 11) {
          throw { code: 'ER_NO_SUCH_THREAD', errno: 1094 };
        }
        return [[], []];
      });

      await expect(svc.setAccountUserLocked('scabc', true)).resolves.toBeUndefined();
      expect(mockLoggerWarn).toHaveBeenCalledTimes(1);
      expect(mockQuery).toHaveBeenCalledWith('KILL ?', [22]);
    });
  });

  describe('identifier validation', () => {
    const hostile = [
      'a`; DROP DATABASE x; --',
      'a`;DROP DATABASE x;--',
      'UPPERCASE',
      'has space',
      'dash-name',
      'dot.name',
      "quote'name",
      '',
      'x'.repeat(65),
    ];

    test.each(hostile)('rejects bad database name %j with 400 and runs no SQL', async (name) => {
      await expect(svc.ensureDatabase(name, 'scabc')).rejects.toMatchObject({ status: 400 });
      await expect(svc.dropDatabase(name)).rejects.toMatchObject({ status: 400 });
      expect(mockQuery).not.toHaveBeenCalled();
      expect(mockCreatePool).not.toHaveBeenCalled();
    });

    test('usernames are additionally limited to 32 chars', async () => {
      await expect(
        svc.ensureAccountUser('u'.repeat(33), 'pw'),
      ).rejects.toMatchObject({ status: 400 });
      await expect(
        svc.ensureAccountUser('u'.repeat(32), 'pw'),
      ).resolves.toBeUndefined();
      await expect(
        svc.dropAccountUser('bad user'),
      ).rejects.toMatchObject({ status: 400 });
    });
  });

  describe('error mapping', () => {
    test('driver failures become httpError(502) and never log secrets', async () => {
      mockQuery.mockRejectedValueOnce({
        code: 'ER_ACCESS_DENIED_ERROR',
        errno: 1045,
        sqlState: '28000',
        sqlMessage: "Access denied near 'IDENTIFIED BY s3cret!'",
        sql: "ALTER USER `scabc`@'%' IDENTIFIED BY 's3cret!'",
      });

      await expect(svc.setAccountUserPassword('scabc', 's3cret!')).rejects.toMatchObject({
        status: 502,
        message: 'Database server error',
      });

      expect(mockLoggerError).toHaveBeenCalledTimes(1);
      const [msg, meta] = mockLoggerError.mock.calls[0];
      expect(msg).toBe('mysql admin operation failed');
      expect(meta).toMatchObject({
        op: 'setAccountUserPassword',
        identifier: 'scabc',
        code: 'ER_ACCESS_DENIED_ERROR',
        errno: 1045,
        sqlState: '28000',
      });
      expect(callsOf(mockLoggerError)).not.toContain('s3cret!');
      expect(callsOf(mockLoggerWarn)).not.toContain('s3cret!');
      // Connection is still released on failure.
      expect(mockRelease).toHaveBeenCalledTimes(1);
    });

    test('getConnection failures map to 502', async () => {
      mockGetConnection.mockRejectedValueOnce({ code: 'ECONNREFUSED' });
      await expect(svc.dropDatabase('db1')).rejects.toMatchObject({
        status: 502,
        message: 'Database server error',
      });
    });
  });

  describe('healthCheck', () => {
    test('runs SELECT 1 when enabled', async () => {
      await expect(svc.healthCheck()).resolves.toEqual({ ok: true });
      expect(mockQuery).toHaveBeenCalledWith('SELECT 1');
      expect(mockRelease).toHaveBeenCalledTimes(1);
    });

    test('returns not-ok instead of throwing when unreachable', async () => {
      mockQuery.mockRejectedValueOnce({ code: 'PROTOCOL_CONNECTION_LOST' });
      await expect(svc.healthCheck()).resolves.toEqual({
        ok: false,
        message: 'Database server error',
      });
      expect(mockLoggerError).toHaveBeenCalledTimes(1);
    });
  });
});
