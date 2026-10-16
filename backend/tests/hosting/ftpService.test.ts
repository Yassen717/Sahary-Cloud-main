import { EventEmitter } from 'events';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';

/**
 * ftpService unit tests. pure-ftpd/pure-pw does not exist on this machine, so
 * child_process.spawn is mocked: we assert the exact argv, that the password
 * only ever travels on stdin (twice — pure-pw prompts for it twice), and that
 * passwords never appear in argv, error messages or log lines.
 */

const spawnCalls: Array<{ cmd: string; args: string[]; stdin: string[] }> = [];
let nextBehavior: Array<'ok' | { code: number; stderr?: string } | { spawnError: Error }> = [];

jest.mock('child_process', () => ({
  spawn: (cmd: string, args: string[]) => {
    const call = { cmd, args, stdin: [] as string[] };
    spawnCalls.push(call);
    const behavior = nextBehavior.length > 0 ? nextBehavior.shift() : 'ok';
    const child = new EventEmitter() as EventEmitter & {
      stdin: { write: (s: string) => void; end: () => void };
      stdout: EventEmitter;
      stderr: EventEmitter;
      kill: () => void;
    };
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.kill = () => {};
    child.stdin = {
      write: (s: string) => { call.stdin.push(s); },
      end: () => {
        setImmediate(() => {
          if (behavior === 'ok') {
            child.emit('close', 0);
          } else if (behavior && typeof behavior === 'object' && 'spawnError' in behavior) {
            child.emit('error', behavior.spawnError);
          } else if (behavior && typeof behavior === 'object' && 'code' in behavior) {
            if (behavior.stderr) {
              child.stderr.emit('data', Buffer.from(behavior.stderr));
            }
            child.emit('close', behavior.code);
          } else {
            child.emit('close', 0);
          }
        });
      },
    };
    return child;
  },
}));

jest.mock('../../src/utils/logger', () => ({
  __esModule: true,
  default: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

// eslint-disable-next-line import/first
import * as ftpService from '../../src/services/ftpService';
// eslint-disable-next-line import/first
import logger from '../../src/utils/logger';

const mockLoggerError = logger.error as jest.Mock;
const WWW_BASE = path.join(os.tmpdir(), 'sahary-wp04-wwwbase');
const DOCROOT = path.join(WWW_BASE, 'u123', 'public_html');

const ENV_KEYS = [
  'HOSTING_FTP_DRIVER',
  'HOSTING_FTP_PUBLIC_HOST',
  'HOSTING_FTP_PORT',
  'HOSTING_FTP_SYSTEM_USER',
  'HOSTING_FTP_SYSTEM_GROUP',
  'HOSTING_FTP_PUREPW_BIN',
  'HOSTING_FTP_PASSWD_FILE',
  'HOSTING_FTP_PDB_FILE',
  'HOSTING_WWW_BASE',
];

let savedEnv: Record<string, string | undefined> = {};
let passwdDir: string;
let pdbDir: string;

const enablePureFtpd = (): void => {
  process.env.HOSTING_FTP_DRIVER = 'pureftpd';
  process.env.HOSTING_FTP_PUBLIC_HOST = 'ftp.example.test';
  process.env.HOSTING_FTP_PORT = '21';
  process.env.HOSTING_FTP_SYSTEM_USER = 'ftpuser';
  process.env.HOSTING_FTP_SYSTEM_GROUP = 'ftpgroup';
  process.env.HOSTING_FTP_PUREPW_BIN = 'pure-pw';
  process.env.HOSTING_FTP_PASSWD_FILE = path.join(passwdDir, 'pureftpd.passwd');
  process.env.HOSTING_FTP_PDB_FILE = path.join(pdbDir, 'pureftpd.pdb');
  process.env.HOSTING_WWW_BASE = WWW_BASE;
};

beforeEach(async () => {
  savedEnv = {};
  for (const key of ENV_KEYS) {
    savedEnv[key] = process.env[key];
  }
  spawnCalls.length = 0;
  nextBehavior = [];
  mockLoggerError.mockClear();
  passwdDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sahary-wp04-ftpcfg-'));
  pdbDir = passwdDir;
});

afterEach(async () => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = savedEnv[key];
    }
  }
  await fs.rm(passwdDir, { recursive: true, force: true });
});

const argvOf = (i = 0) => spawnCalls[i].args;
const stdinOf = (i = 0) => spawnCalls[i].stdin.join('');

describe('driver gating', () => {
  test('isFtpEnabled is false unless HOSTING_FTP_DRIVER=pureftpd', () => {
    delete process.env.HOSTING_FTP_DRIVER;
    expect(ftpService.isFtpEnabled()).toBe(false);
    process.env.HOSTING_FTP_DRIVER = 'none';
    expect(ftpService.isFtpEnabled()).toBe(false);
    process.env.HOSTING_FTP_DRIVER = 'pureftpd';
    expect(ftpService.isFtpEnabled()).toBe(true);
  });

  test('driver=none: mutations are silent no-ops except reset (503)', async () => {
    delete process.env.HOSTING_FTP_DRIVER;
    await expect(ftpService.provisionFtpUser({ username: 'user_a', documentRoot: '/var/www/x', quotaMB: 100 })).resolves.toBeUndefined();
    await expect(ftpService.deleteFtpUser('user_a')).resolves.toBeUndefined();
    await expect(ftpService.setFtpQuota('user_a', 100)).resolves.toBeUndefined();
    await expect(ftpService.setFtpUserEnabled('user_a', false)).resolves.toBeUndefined();
    await expect(ftpService.resetFtpPassword('user_a')).rejects.toMatchObject({ status: 503, message: 'FTP is not enabled' });
    const health = await ftpService.healthCheck();
    expect(health).toEqual({ ok: true, message: 'disabled' });
    expect(spawnCalls).toHaveLength(0);
  });
});

describe('validation', () => {
  beforeEach(() => enablePureFtpd());

  test.each(['ab', 'UPPER', 'has-dash', 'sp ace', 'x'.repeat(33), 'a-b', 'éxtra'])(
    'rejects username %j with 400',
    async (username) => {
      await expect(ftpService.provisionFtpUser({ username, documentRoot: DOCROOT, quotaMB: 100 }))
        .rejects.toMatchObject({ status: 400 });
      expect(spawnCalls).toHaveLength(0);
    },
  );

  test('rejects a document root outside wwwBase or relative', async () => {
    await expect(ftpService.provisionFtpUser({ username: 'user_a', documentRoot: 'relative/dir', quotaMB: 1 }))
      .rejects.toMatchObject({ status: 400 });
    await expect(ftpService.provisionFtpUser({ username: 'user_a', documentRoot: path.join(os.tmpdir(), 'elsewhere'), quotaMB: 1 }))
      .rejects.toMatchObject({ status: 400 });
    // wwwBase itself is not a valid per-account docroot
    await expect(ftpService.provisionFtpUser({ username: 'user_a', documentRoot: WWW_BASE, quotaMB: 1 }))
      .rejects.toMatchObject({ status: 400 });
    expect(spawnCalls).toHaveLength(0);
  });

  test.each([0, -1, 1.5, 1048577, Number.NaN])('rejects quota %j with 400', async (quotaMB) => {
    await expect(ftpService.provisionFtpUser({ username: 'user_a', documentRoot: DOCROOT, quotaMB }))
      .rejects.toMatchObject({ status: 400 });
    await expect(ftpService.setFtpQuota('user_a', quotaMB)).rejects.toMatchObject({ status: 400 });
    expect(spawnCalls).toHaveLength(0);
  });

  test('boundary quotas 1 and 1048576 are accepted', async () => {
    await expect(ftpService.setFtpQuota('user_a', 1)).resolves.toBeUndefined();
    await expect(ftpService.setFtpQuota('user_a', 1048576)).resolves.toBeUndefined();
    expect(spawnCalls).toHaveLength(2);
  });
});

describe('command construction (argv + stdin)', () => {
  beforeEach(() => enablePureFtpd());

  test('useradd: exact argv, password only on stdin (twice), -m commits', async () => {
    await ftpService.provisionFtpUser({ username: 'user_a', documentRoot: DOCROOT, quotaMB: 512 });
    expect(spawnCalls).toHaveLength(1);
    const call = spawnCalls[0];
    expect(call.cmd).toBe('pure-pw');
    expect(call.args).toEqual([
      'useradd', 'user_a',
      '-f', process.env.HOSTING_FTP_PASSWD_FILE,
      '-F', process.env.HOSTING_FTP_PDB_FILE,
      '-u', 'ftpuser',
      '-g', 'ftpgroup',
      '-d', DOCROOT,
      '-N', '512',
      '-m',
    ]);
    const stdin = stdinOf();
    const lines = stdin.split('\n').filter(Boolean);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe(lines[1]);
    expect(lines[0].length).toBe(20); // 15 bytes -> 20 base64url chars
    // Password never appears in argv.
    expect(call.args.join(' ')).not.toContain(lines[0]);
  });

  test('passwd reset: 20-char password on stdin twice, returned once, never in argv', async () => {
    const password = await ftpService.resetFtpPassword('user_a');
    expect(password).toHaveLength(20);
    expect(argvOf()).toEqual([
      'passwd', 'user_a',
      '-f', process.env.HOSTING_FTP_PASSWD_FILE,
      '-F', process.env.HOSTING_FTP_PDB_FILE,
      '-m',
    ]);
    expect(stdinOf()).toBe(`${password}\n${password}\n`);
    expect(argvOf().join(' ')).not.toContain(password);
  });

  test('two resets produce different passwords', async () => {
    const a = await ftpService.resetFtpPassword('user_a');
    const b = await ftpService.resetFtpPassword('user_a');
    expect(a).not.toBe(b);
  });

  test('userdel: exact argv, no stdin', async () => {
    await ftpService.deleteFtpUser('user_a');
    expect(argvOf()).toEqual([
      'userdel', 'user_a',
      '-f', process.env.HOSTING_FTP_PASSWD_FILE,
      '-F', process.env.HOSTING_FTP_PDB_FILE,
      '-m',
    ]);
    expect(stdinOf()).toBe('');
  });

  test('usermod quota: -N <MB>', async () => {
    await ftpService.setFtpQuota('user_a', 2048);
    expect(argvOf()).toEqual([
      'usermod', 'user_a',
      '-f', process.env.HOSTING_FTP_PASSWD_FILE,
      '-F', process.env.HOSTING_FTP_PDB_FILE,
      '-N', '2048',
      '-m',
    ]);
  });

  test('disable: usermod -r \'\' -R 0.0.0.0/0,::/0 (deny every client IP)', async () => {
    await ftpService.setFtpUserEnabled('user_a', false);
    expect(argvOf()).toEqual([
      'usermod', 'user_a',
      '-f', process.env.HOSTING_FTP_PASSWD_FILE,
      '-F', process.env.HOSTING_FTP_PDB_FILE,
      '-r', '',
      '-R', '0.0.0.0/0,::/0',
      '-m',
    ]);
  });

  test('enable: usermod -r \'\' -R \'\' resets IP filtering', async () => {
    await ftpService.setFtpUserEnabled('user_a', true);
    expect(argvOf()).toEqual([
      'usermod', 'user_a',
      '-f', process.env.HOSTING_FTP_PASSWD_FILE,
      '-F', process.env.HOSTING_FTP_PDB_FILE,
      '-r', '',
      '-R', '',
      '-m',
    ]);
  });
});

describe('error mapping and secret hygiene', () => {
  beforeEach(() => enablePureFtpd());

  test('non-zero exit maps to 502 "FTP server error" and logs sanitized detail', async () => {
    nextBehavior = [{ code: 1, stderr: 'Unable to open the passwd file' }];
    await expect(ftpService.setFtpQuota('user_a', 10)).rejects.toMatchObject({ status: 502, message: 'FTP server error' });
    expect(mockLoggerError).toHaveBeenCalledTimes(1);
    const logArgs = mockLoggerError.mock.calls[0];
    expect(JSON.stringify(logArgs)).toContain('Unable to open the passwd file');
    expect(JSON.stringify(logArgs)).toContain('usermod');
  });

  test('spawn failure (binary missing) maps to 502', async () => {
    nextBehavior = [{ spawnError: Object.assign(new Error('spawn pure-pw ENOENT'), { code: 'ENOENT' }) }];
    await expect(ftpService.resetFtpPassword('user_a')).rejects.toMatchObject({ status: 502 });
  });

  test('a failing reset never leaks the generated password anywhere', async () => {
    nextBehavior = [{ code: 2, stderr: 'broken db' }];
    await expect(ftpService.resetFtpPassword('user_a')).rejects.toMatchObject({ status: 502, message: 'FTP server error' });
    const stdinPassword = stdinOf().split('\n')[0];
    expect(stdinPassword.length).toBe(20);
    expect(argvOf().join(' ')).not.toContain(stdinPassword);
    expect(JSON.stringify(mockLoggerError.mock.calls)).not.toContain(stdinPassword);
  });

  test('userdel is idempotent: exit 1 on userdel + user absent on show → success', async () => {
    nextBehavior = [{ code: 1, stderr: " doesn't exist" }, { code: 1 }];
    await expect(ftpService.deleteFtpUser('user_a')).resolves.toBeUndefined();
    expect(spawnCalls).toHaveLength(2);
    expect(spawnCalls[1].args[0]).toBe('show');
  });

  test('userdel failure when the user still exists surfaces 502', async () => {
    nextBehavior = [{ code: 1, stderr: 'db locked' }, 'ok']; // show exits 0 → user exists
    await expect(ftpService.deleteFtpUser('user_a')).rejects.toMatchObject({ status: 502 });
  });

  test('userdel failure + broken probe also surfaces 502 (absence is not assumed)', async () => {
    nextBehavior = [{ code: 1, stderr: 'db locked' }, { spawnError: new Error('spawn ENOENT') }];
    await expect(ftpService.deleteFtpUser('user_a')).rejects.toMatchObject({ status: 502 });
  });
});

describe('healthCheck', () => {
  test('enabled: runs pure-pw --help and verifies config dirs', async () => {
    enablePureFtpd();
    nextBehavior = ['ok'];
    await expect(ftpService.healthCheck()).resolves.toEqual({ ok: true });
    expect(argvOf()).toEqual(['--help']);
  });

  test('a non-zero --help exit is still healthy (pure-pw prints usage + exits !=0)', async () => {
    enablePureFtpd();
    nextBehavior = [{ code: 1, stderr: 'usage: pure-pw ...' }];
    await expect(ftpService.healthCheck()).resolves.toEqual({ ok: true });
  });

  test('spawn failure reports not runnable', async () => {
    enablePureFtpd();
    nextBehavior = [{ spawnError: new Error('spawn pure-pw ENOENT') }];
    const res = await ftpService.healthCheck();
    expect(res.ok).toBe(false);
    expect(res.message).toContain('pure-pw binary not runnable');
  });

  test('missing passwd/pdb directories are reported', async () => {
    enablePureFtpd();
    process.env.HOSTING_FTP_PDB_FILE = path.join(passwdDir, 'missing-dir', 'pureftpd.pdb');
    nextBehavior = ['ok'];
    const res = await ftpService.healthCheck();
    expect(res.ok).toBe(false);
    expect(res.message).toContain('missing directory');
  });
});
