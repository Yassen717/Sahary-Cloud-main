import { spawn } from 'child_process';
import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { getHostingConfig } from '../config/hosting';
import type { HostingConfig } from '../config/hosting';
import httpError from '../utils/httpError';
import logger from '../utils/logger';

/**
 * pure-ftpd virtual-user management via the pure-pw CLI (CONTRACT section 8).
 * pure-ftpd is not installed on dev machines — every behavior here is driven
 * by the documented pure-pw interface and is unit-tested with a mocked
 * child_process.
 *
 * Commands used (man pure-pw(8), README.Virtual-Users):
 *   pure-pw useradd <login> -f <passwd> -F <pdb> -u <sysUser> -g <sysGroup>
 *                   -d <chrooted home> -N <quota MB> -m     (asks password twice on stdin)
 *   pure-pw passwd  <login> -f <passwd> -F <pdb> -m         (asks password twice on stdin)
 *   pure-pw userdel <login> -f <passwd> -F <pdb> -m
 *   pure-pw usermod <login> -f <passwd> -F <pdb> -N <quota MB> -m
 *   pure-pw usermod <login> -f <passwd> -F <pdb> -r <allowIPs> -R <denyIPs> -m
 *   pure-pw show    <login> -f <passwd>                     (existence probe)
 *
 * `-m` commits the change to the PureDB file (no `pure-pw mkdb` needed), `-d`
 * stores the home with the `/./` chroot marker. Passwords are written to the
 * child's stdin (twice, as pure-pw prompts) and NEVER appear in argv, env,
 * logs or error messages.
 *
 * Enable/disable uses pure-pw's documented client-IP filtering: disabling sets
 * the denied client list to a catch-all (`-R 0.0.0.0/0,::/0`) and clears any
 * allow-list; enabling resets both lists (`-r '' -R ''` is the documented "To
 * disable IP filtering" form). That denies every FTP login without touching
 * the stored password or home.
 */

const USERNAME_PATTERN = /^[a-z0-9_]{3,32}$/;
const MAX_QUOTA_MB = 1_048_576;
const PUREPW_TIMEOUT_MS = 15_000;
const CAPTURE_LIMIT = 4096;
// Catch-all client range for the deny list (IPv4 + IPv6).
const DENY_ALL_CLIENTS = '0.0.0.0/0,::/0';

type FtpConfig = HostingConfig['ftp'];

const ftpConfig = (): FtpConfig => getHostingConfig().ftp;

export function isFtpEnabled(): boolean {
  return ftpConfig().driver === 'pureftpd';
}

const assertUsername = (username: string): void => {
  if (typeof username !== 'string' || !USERNAME_PATTERN.test(username)) {
    throw httpError(400, 'Invalid FTP username');
  }
};

const assertQuotaMB = (quotaMB: number): void => {
  if (!Number.isInteger(quotaMB) || quotaMB < 1 || quotaMB > MAX_QUOTA_MB) {
    throw httpError(400, 'Invalid FTP quota');
  }
};

// The virtual user's home must stay under HOSTING_WWW_BASE — anything else
// would let a login reach files outside the hosting tree.
const assertDocumentRoot = (documentRoot: string, wwwBase: string): void => {
  if (typeof documentRoot !== 'string' || documentRoot.includes(String.fromCharCode(0)) || !path.isAbsolute(documentRoot)) {
    throw httpError(400, 'FTP document root must be an absolute path');
  }
  const rel = path.relative(path.resolve(wwwBase), path.resolve(documentRoot));
  if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) {
    throw httpError(400, 'FTP document root must be inside HOSTING_WWW_BASE');
  }
};

// 20 chars from a URL-safe alphabet; suitable for pure-pw's stdin prompt.
const generatePassword = (): string => crypto.randomBytes(15).toString('base64url');

class PurePwExitError extends Error {
  code: number | null;
  stderr: string;

  constructor(code: number | null, stderr: string) {
    super(`pure-pw exited with code ${String(code)}: ${stderr}`);
    this.code = code;
    this.stderr = stderr;
  }
}

/**
 * Spawns purePwBin with a FIXED argv array — never a shell, never any user
 * input outside the validated argument positions, and the password only ever
 * travels on stdin. Stdout/stderr are captured (capped) for logging; stdin
 * content is never logged.
 */
function runPurePw(args: string[], stdinPayload?: string): Promise<void> {
  const { purePwBin } = ftpConfig();
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn(purePwBin, args, { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    } catch (error) {
      reject(error);
      return;
    }

    let settled = false;
    let stderr = '';
    let stdout = '';
    const capture = (current: string, chunk: Buffer): string => (
      current.length < CAPTURE_LIMIT ? current + chunk.toString('utf8') : current
    );

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        try {
          child.kill('SIGKILL');
        } catch {
          // already gone
        }
        reject(new Error('pure-pw timed out'));
      }
    }, PUREPW_TIMEOUT_MS);
    timer.unref?.();

    child.stderr.on('data', (chunk: Buffer) => {
      stderr = capture(stderr, chunk);
    });
    child.stdout.on('data', (chunk: Buffer) => {
      stdout = capture(stdout, chunk);
    });
    child.on('error', (error: Error) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code: number | null) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      if (code === 0) {
        resolve();
      } else {
        reject(new PurePwExitError(code, stderr.trim() || stdout.trim()));
      }
    });

    try {
      if (stdinPayload !== undefined) {
        child.stdin.write(stdinPayload);
      }
      child.stdin.end();
    } catch {
      // Child already exited — its close handler reports the real failure.
    }
  });
}

// Driver failures surface to callers as a plain 502 — stderr/detail stays in
// the server log and never in the API response.
const runOr502 = async (args: string[], stdinPayload?: string): Promise<void> => {
  try {
    await runPurePw(args, stdinPayload);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    logger.error('pure-pw command failed', {
      command: args.join(' '),
      error: detail,
    });
    throw httpError(502, 'FTP server error');
  }
};

// Resolves true/false from `pure-pw show`'s exit code; rethrows spawn-level
// failures (binary missing, timeout) because they say nothing about whether
// the user exists — callers must not mistake "cannot check" for "not there".
const userExists = async (username: string, cfg: FtpConfig): Promise<boolean> => {
  try {
    await runPurePw(['show', username, '-f', cfg.passwdFile]);
    return true;
  } catch (error) {
    if (error instanceof PurePwExitError) {
      return false;
    }
    throw error;
  }
};

export async function provisionFtpUser(
  input: { username: string; documentRoot: string; quotaMB: number },
): Promise<void> {
  if (!isFtpEnabled()) {
    return;
  }
  const cfg = ftpConfig();
  const hosting = getHostingConfig();
  assertUsername(input.username);
  assertDocumentRoot(input.documentRoot, hosting.wwwBase);
  assertQuotaMB(input.quotaMB);
  // Random password, discarded: the usable credential only exists after a
  // resetFtpPassword reveal (CONTRACT section 3).
  const password = generatePassword();
  await runOr502([
    'useradd', input.username,
    '-f', cfg.passwdFile,
    '-F', cfg.pdbFile,
    '-u', cfg.systemUser,
    '-g', cfg.systemGroup,
    '-d', input.documentRoot,
    '-N', String(input.quotaMB),
    '-m',
  ], `${password}\n${password}\n`);
}

export async function deleteFtpUser(username: string): Promise<void> {
  if (!isFtpEnabled()) {
    return;
  }
  const cfg = ftpConfig();
  assertUsername(username);
  try {
    await runPurePw(['userdel', username, '-f', cfg.passwdFile, '-F', cfg.pdbFile, '-m']);
    return;
  } catch (error) {
    // Deletion must be idempotent for termination retries: if the user no
    // longer exists the desired end-state is already reached. A failed probe
    // (binary missing / timeout) is NOT proof of absence and must not be
    // swallowed — fall through to the 502 below.
    try {
      if (!(await userExists(username, cfg))) {
        logger.info('pure-pw userdel skipped — user not present', { username });
        return;
      }
    } catch {
      // Probe itself failed — treat the original userdel error as real.
    }
    const detail = error instanceof Error ? error.message : String(error);
    logger.error('pure-pw userdel failed', { command: `userdel ${username}`, error: detail });
    throw httpError(502, 'FTP server error');
  }
}

export async function setFtpQuota(username: string, quotaMB: number): Promise<void> {
  if (!isFtpEnabled()) {
    return;
  }
  const cfg = ftpConfig();
  assertUsername(username);
  assertQuotaMB(quotaMB);
  await runOr502(['usermod', username, '-f', cfg.passwdFile, '-F', cfg.pdbFile, '-N', String(quotaMB), '-m']);
}

export async function setFtpUserEnabled(username: string, enabled: boolean): Promise<void> {
  if (!isFtpEnabled()) {
    return;
  }
  const cfg = ftpConfig();
  assertUsername(username);
  // Disable: deny every client IP (and drop any stale allow-list). Enable:
  // reset both IP lists, which restores unrestricted logins.
  const ipArgs = enabled
    ? ['-r', '', '-R', '']
    : ['-r', '', '-R', DENY_ALL_CLIENTS];
  await runOr502(['usermod', username, '-f', cfg.passwdFile, '-F', cfg.pdbFile, ...ipArgs, '-m']);
}

export async function resetFtpPassword(username: string): Promise<string> {
  if (!isFtpEnabled()) {
    throw httpError(503, 'FTP is not enabled');
  }
  const cfg = ftpConfig();
  assertUsername(username);
  const password = generatePassword();
  // pure-pw prompts for the password twice; both go on stdin, never argv.
  await runOr502(['passwd', username, '-f', cfg.passwdFile, '-F', cfg.pdbFile, '-m'], `${password}\n${password}\n`);
  return password;
}

export async function healthCheck(): Promise<{ ok: boolean; message?: string }> {
  if (!isFtpEnabled()) {
    return { ok: true, message: 'disabled' };
  }
  const cfg = ftpConfig();
  try {
    // `pure-pw --help` prints usage and may exit non-zero — only a spawn
    // failure (binary missing / not executable) is unhealthy.
    await runPurePw(['--help']);
  } catch (error) {
    if (error instanceof PurePwExitError) {
      // Spawned fine; usage output exit codes are expected.
    } else {
      const detail = error instanceof Error ? error.message : String(error);
      return { ok: false, message: `pure-pw binary not runnable: ${detail}` };
    }
  }
  for (const file of [cfg.passwdFile, cfg.pdbFile]) {
    const dir = path.dirname(file);
    try {
      const st = await fs.stat(dir);
      if (!st.isDirectory()) {
        return { ok: false, message: `not a directory: ${dir}` };
      }
    } catch {
      return { ok: false, message: `missing directory: ${dir}` };
    }
  }
  return { ok: true };
}

export default {
  isFtpEnabled,
  provisionFtpUser,
  deleteFtpUser,
  setFtpQuota,
  setFtpUserEnabled,
  resetFtpPassword,
  healthCheck,
};
