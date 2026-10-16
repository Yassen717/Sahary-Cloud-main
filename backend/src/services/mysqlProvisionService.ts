// MySQL account/database provisioning for shared-hosting accounts.
// One MySQL user per hosting account; every database gets its own explicit
// GRANT so users can never reach databases that are not theirs.
//
// Safety rules enforced here:
//  - identifiers (user / db names) must match ^[a-z0-9_]{1,64}$ (users <= 32)
//    and are only ever interpolated backtick-quoted after validation;
//  - string VALUES (password, host) are always bound as `?` placeholders so
//    mysql2 escapes them — nothing is concatenated raw;
//  - in GRANT statements `_` and `%` are wildcards, so they are backslash-
//    escaped inside the quoted database name;
//  - driver failures are logged without the SQL text or error message (both
//    can echo credential literals) and surface as httpError(502).

import * as mysql from 'mysql2/promise';
import { getHostingConfig } from '../config/hosting';
import { httpError } from '../utils/httpError';
import logger from '../utils/logger';

const IDENTIFIER_PATTERN = /^[a-z0-9_]{1,64}$/;
const MAX_USERNAME_LENGTH = 32;

let pool: mysql.Pool | null = null;
let poolUrl = '';

export function isMysqlEnabled(): boolean {
  const { mysql: cfg } = getHostingConfig();
  return cfg.enabled && cfg.adminUrl.length > 0;
}

function getPool(): mysql.Pool {
  const cfg = getHostingConfig().mysql;
  if (!cfg.enabled || !cfg.adminUrl) {
    throw httpError(503, 'MySQL is not configured on this server');
  }
  if (pool && poolUrl !== cfg.adminUrl) {
    const stale = pool;
    pool = null;
    // Replaced pools only happen in tests / config reloads — drain quietly.
    void stale.end().catch(() => undefined);
  }
  if (!pool) {
    pool = mysql.createPool({ uri: cfg.adminUrl, connectionLimit: 2 });
    poolUrl = cfg.adminUrl;
  }
  return pool;
}

/** Releases the shared admin pool — used by tests and process shutdown. */
export async function closeMysqlPool(): Promise<void> {
  const current = pool;
  pool = null;
  poolUrl = '';
  if (current) {
    await current.end();
  }
}

const quoteIdentifier = (name: string): string => `\`${name}\``;

function assertDatabaseName(dbName: string): string {
  if (typeof dbName !== 'string' || !IDENTIFIER_PATTERN.test(dbName)) {
    throw httpError(400, 'Invalid database name');
  }
  return quoteIdentifier(dbName);
}

function assertUserName(username: string): string {
  if (
    typeof username !== 'string'
    || !IDENTIFIER_PATTERN.test(username)
    || username.length > MAX_USERNAME_LENGTH
  ) {
    throw httpError(400, 'Invalid database username');
  }
  return quoteIdentifier(username);
}

// `_` and `%` inside a GRANT's database pattern are wildcards. Escaping them
// makes the privilege literal: a grant on `sc1_main` must never match
// `sc1Xmain`. Identifiers are already validated to [a-z0-9_], but escape both
// wildcard characters so this stays correct if the rule ever widens.
const grantTarget = (dbName: string): string =>
  `\`${dbName.replace(/[%_]/g, (c) => `\\${c}`)}\`.*`;

const mysqlErrorFields = (error: unknown): Record<string, unknown> => {
  const e = error as { code?: string; errno?: number; sqlState?: string } | null;
  return { code: e?.code, errno: e?.errno, sqlState: e?.sqlState };
};

// Logs only safe driver metadata. The error message and SQL text are dropped
// deliberately: MySQL may echo the offending statement fragment, which for
// credential statements would leak the password into the log.
function driverError(op: string, identifier: string, error: unknown): never {
  logger.error('mysql admin operation failed', { op, identifier, ...mysqlErrorFields(error) });
  throw httpError(502, 'Database server error');
}

const userHost = (): string => getHostingConfig().mysql.userHost;

// Intentional httpErrors (400/503 raised by validation or the disabled check)
// must pass through untouched — only raw driver failures become 502.
const passthrough = (error: unknown): boolean =>
  (error as { expose?: unknown } | null)?.expose === true;

async function runInConnection<T>(
  op: string,
  identifier: string,
  fn: (conn: mysql.PoolConnection) => Promise<T>,
): Promise<T> {
  let conn: mysql.PoolConnection;
  try {
    conn = await getPool().getConnection();
  } catch (error) {
    if (passthrough(error)) {
      throw error;
    }
    driverError(op, identifier, error);
  }
  try {
    return await fn(conn);
  } catch (error) {
    if (passthrough(error)) {
      throw error;
    }
    driverError(op, identifier, error);
  } finally {
    conn.release();
  }
}

export async function ensureAccountUser(username: string, password: string): Promise<void> {
  const user = assertUserName(username);
  const host = userHost();
  await runInConnection('ensureAccountUser', username, async (conn) => {
    await conn.query(`CREATE USER IF NOT EXISTS ${user}@? IDENTIFIED BY ?`, [host, password]);
    // CREATE ... IF NOT EXISTS leaves a pre-existing user's password untouched;
    // ALTER guarantees the password on every retry.
    await conn.query(`ALTER USER ${user}@? IDENTIFIED BY ?`, [host, password]);
  });
}

export async function ensureDatabase(dbName: string, username: string): Promise<void> {
  const db = assertDatabaseName(dbName);
  const user = assertUserName(username);
  const host = userHost();
  await runInConnection('ensureDatabase', dbName, async (conn) => {
    await conn.query(`CREATE DATABASE IF NOT EXISTS ${db} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await conn.query(`GRANT ALL PRIVILEGES ON ${grantTarget(dbName)} TO ${user}@?`, [host]);
  });
}

export async function dropDatabase(dbName: string): Promise<void> {
  const db = assertDatabaseName(dbName);
  await runInConnection('dropDatabase', dbName, async (conn) => {
    await conn.query(`DROP DATABASE IF EXISTS ${db}`);
  });
}

export async function dropAccountUser(username: string): Promise<void> {
  const user = assertUserName(username);
  const host = userHost();
  await runInConnection('dropAccountUser', username, async (conn) => {
    await conn.query(`DROP USER IF EXISTS ${user}@?`, [host]);
  });
}

export async function setAccountUserPassword(username: string, password: string): Promise<void> {
  const user = assertUserName(username);
  const host = userHost();
  await runInConnection('setAccountUserPassword', username, async (conn) => {
    await conn.query(`ALTER USER ${user}@? IDENTIFIED BY ?`, [host, password]);
  });
}

export async function setAccountUserLocked(username: string, locked: boolean): Promise<void> {
  const user = assertUserName(username);
  const host = userHost();
  await runInConnection('setAccountUserLocked', username, async (conn) => {
    await conn.query(`ALTER USER ${user}@? ACCOUNT ${locked ? 'LOCK' : 'UNLOCK'}`, [host]);
    if (!locked) {
      return;
    }
    // ACCOUNT LOCK only blocks NEW logins — existing sessions stay alive, so
    // kill this user's live connections too (best-effort per connection).
    const [rows] = await conn.query(
      'SELECT ID FROM information_schema.PROCESSLIST WHERE USER = ?',
      [username],
    );
    for (const row of rows as Array<{ ID: number | bigint }>) {
      try {
        await conn.query('KILL ?', [Number(row.ID)]);
      } catch (error) {
        logger.warn('failed to kill mysql session', {
          op: 'setAccountUserLocked',
          identifier: username,
          ...mysqlErrorFields(error),
        });
      }
    }
  });
}

export async function healthCheck(): Promise<{ ok: boolean; message?: string }> {
  if (!isMysqlEnabled()) {
    return { ok: true, message: 'disabled' };
  }
  let conn: mysql.PoolConnection | null = null;
  try {
    conn = await getPool().getConnection();
    await conn.query('SELECT 1');
    return { ok: true };
  } catch (error) {
    logger.error('mysql health check failed', mysqlErrorFields(error));
    return { ok: false, message: 'Database server error' };
  } finally {
    conn?.release();
  }
}
