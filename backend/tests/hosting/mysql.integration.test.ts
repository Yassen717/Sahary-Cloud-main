// Real-server integration test for mysqlProvisionService.
// Skipped unless MYSQL_IT=1 and MYSQL_IT_URL=mysql://root:pw@host:port are set.
// The runner is responsible for the docker container — e.g.
//   docker run -d --name <name> -p <port>:3306 -e MYSQL_ROOT_PASSWORD=pw -e MYSQL_ROOT_HOST=% mysql:8.4
// This suite only needs the server reachable; it creates and drops its own
// scit_* fixtures via the service itself.

const IT_ENABLED = process.env.MYSQL_IT === '1' && Boolean(process.env.MYSQL_IT_URL);
const describeIt = IT_ENABLED ? describe : describe.skip;

if (IT_ENABLED) {
  process.env.HOSTING_MYSQL_ENABLED = 'true';
  process.env.HOSTING_MYSQL_ADMIN_URL = process.env.MYSQL_IT_URL as string;
  process.env.HOSTING_MYSQL_USER_HOST = '%';
}

import * as mysql from 'mysql2/promise';
import * as svc from '../../src/services/mysqlProvisionService';

const U1 = 'scit1';
const U2 = 'scit2';
const DB_MAIN = 'scit1_main'; // grant must NOT cover `scit1Xmain`
const DB_SIBLING = 'scit1xmain';
const DB_EXTRA = 'scit1_shop';
const PW1 = 'Wp03ItPassA1';
const PW2 = 'Wp03ItPassB2';

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const itUrl = (): { host: string; port: number } => {
  const u = new URL(process.env.MYSQL_IT_URL as string);
  return { host: u.hostname, port: Number(u.port || 3306) };
};

const canLogin = async (user: string, password: string): Promise<boolean> => {
  const { host, port } = itUrl();
  try {
    const conn = await mysql.createConnection({ host, port, user, password });
    await conn.end();
    return true;
  } catch {
    return false;
  }
};

const loginOrThrow = async (user: string, password: string): Promise<mysql.Connection> => {
  const { host, port } = itUrl();
  return mysql.createConnection({ host, port, user, password });
};

const adminQuery = async (sql: string): Promise<unknown> => {
  const conn = await mysql.createConnection(process.env.MYSQL_IT_URL as string);
  try {
    const [rows] = await conn.query(sql);
    return rows;
  } finally {
    await conn.end();
  }
};

describeIt('mysqlProvisionService — real MySQL integration', () => {
  beforeAll(async () => {
    // The container may still be initializing when jest starts.
    const deadline = Date.now() + 90_000;
    let ready = false;
    while (Date.now() < deadline) {
      const health = await svc.healthCheck();
      if (health.ok) {
        ready = true;
        break;
      }
      await sleep(2000);
    }
    if (!ready) {
      throw new Error('MySQL did not become ready within 90s');
    }
    // Clean slate for repeat runs.
    await svc.dropAccountUser(U1).catch(() => undefined);
    await svc.dropAccountUser(U2).catch(() => undefined);
    await svc.dropDatabase(DB_MAIN).catch(() => undefined);
    await svc.dropDatabase(DB_SIBLING).catch(() => undefined);
    await svc.dropDatabase(DB_EXTRA).catch(() => undefined);
  }, 120_000);

  afterAll(async () => {
    await svc.dropAccountUser(U1).catch(() => undefined);
    await svc.dropAccountUser(U2).catch(() => undefined);
    await svc.dropDatabase(DB_MAIN).catch(() => undefined);
    await svc.dropDatabase(DB_SIBLING).catch(() => undefined);
    await svc.dropDatabase(DB_EXTRA).catch(() => undefined);
    await svc.closeMysqlPool();
  }, 60_000);

  test('healthCheck reaches the server', async () => {
    await expect(svc.healthCheck()).resolves.toEqual({ ok: true });
  });

  test('ensureAccountUser is idempotent and yields a working login', async () => {
    await svc.ensureAccountUser(U1, PW1);
    await svc.ensureAccountUser(U1, PW1);
    expect(await canLogin(U1, PW1)).toBe(true);
  });

  test('ensureDatabase is idempotent and grants only that database', async () => {
    await svc.ensureDatabase(DB_MAIN, U1);
    await svc.ensureDatabase(DB_MAIN, U1);
    // A lookalike database the wildcard would have matched without escaping.
    await svc.ensureAccountUser(U2, PW2);
    await svc.ensureDatabase(DB_SIBLING, U2);
    await svc.ensureDatabase(DB_EXTRA, U1);

    // Server-side view: the stored grant keeps the escaped literal name.
    const grants = (await adminQuery(`SHOW GRANTS FOR '${U1}'@'%'`)) as Array<Record<string, string>>;
    const grantText = grants.map((g) => Object.values(g)[0]).join('\n');
    expect(grantText).toContain('`scit1\\_main`.*');
    expect(grantText).not.toContain('`scit1_main`.*');

    const conn = await loginOrThrow(U1, PW1);
    conn.on('error', () => undefined);
    try {
      // Own database is writable.
      await conn.query(`CREATE TABLE \`${DB_MAIN}\`.wp03_probe (id INT PRIMARY KEY)`);

      // The `_` in scit1_main must NOT act as a wildcard for scit1xmain:
      // writes there must be denied.
      await expect(
        conn.query(`CREATE TABLE \`${DB_SIBLING}\`.wp03_probe (id INT PRIMARY KEY)`),
      ).rejects.toMatchObject({ code: expect.stringMatching(/ACCESS_DENIED/) });

      // But a second granted database works.
      await conn.query(`CREATE TABLE \`${DB_EXTRA}\`.wp03_probe (id INT PRIMARY KEY)`);
    } finally {
      await conn.end();
    }

    // And the sibling's owner cannot write back into scit1_main either.
    const other = await loginOrThrow(U2, PW2);
    other.on('error', () => undefined);
    try {
      await expect(
        other.query(`CREATE TABLE \`${DB_MAIN}\`.wp03_probe2 (id INT PRIMARY KEY)`),
      ).rejects.toMatchObject({ code: expect.stringMatching(/ACCESS_DENIED/) });
    } finally {
      await other.end();
    }
  });

  test('setAccountUserPassword rotates the password', async () => {
    const NEWPW = 'Wp03ItPassC3';
    await svc.setAccountUserPassword(U1, NEWPW);
    expect(await canLogin(U1, NEWPW)).toBe(true);
    expect(await canLogin(U1, PW1)).toBe(false);
  });

  test('lock blocks new logins and kills live sessions; unlock restores them', async () => {
    const pw = 'Wp03ItPassC3';
    const live = await loginOrThrow(U1, pw);
    live.on('error', () => undefined);
    try {
      await svc.setAccountUserLocked(U1, true);

      // New logins are refused (account locked).
      expect(await canLogin(U1, pw)).toBe(false);

      // The pre-existing session was KILLed — its next use must fail.
      let killed = false;
      for (let i = 0; i < 15 && !killed; i += 1) {
        try {
          await live.query('SELECT 1');
          await sleep(200);
        } catch {
          killed = true;
        }
      }
      expect(killed).toBe(true);
    } finally {
      live.destroy();
    }

    await svc.setAccountUserLocked(U1, false);
    expect(await canLogin(U1, pw)).toBe(true);
  });

  test('drops remove the database and the user', async () => {
    const pw = 'Wp03ItPassC3';
    await svc.dropDatabase(DB_MAIN);
    const rows = (await adminQuery('SHOW DATABASES')) as Array<Record<string, string>>;
    const names = rows.map((r) => Object.values(r)[0]);
    expect(names).not.toContain(DB_MAIN);
    expect(names).toContain(DB_SIBLING);

    await svc.dropAccountUser(U1);
    expect(await canLogin(U1, pw)).toBe(false);
    const users = (await adminQuery(
      "SELECT User FROM mysql.user WHERE User LIKE 'scit%'",
    )) as Array<{ User: string }>;
    expect(users.map((u) => u.User)).toEqual([U2]);
  });

  test('IF EXISTS is safe on missing objects', async () => {
    await expect(svc.dropDatabase('scit_missing_db')).resolves.toBeUndefined();
    await expect(svc.dropAccountUser('scit_missing_user')).resolves.toBeUndefined();
    await expect(svc.dropDatabase(DB_MAIN)).resolves.toBeUndefined(); // already dropped
  });
});
