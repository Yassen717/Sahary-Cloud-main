import { promises as fs } from 'fs';
import path from 'path';
import { promisify } from 'util';
import { execFile } from 'child_process';
import logger from '../utils/logger';

const execFileAsync = promisify(execFile);

const DOMAIN_REGEX = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i;

const NGINX_ENABLED = process.env.HOSTING_NGINX_ENABLED === 'true';
const SITES_AVAILABLE_DIR = process.env.HOSTING_NGINX_SITES_AVAILABLE || '/etc/nginx/sites-available';
const SITES_ENABLED_DIR = process.env.HOSTING_NGINX_SITES_ENABLED || '/etc/nginx/sites-enabled';
const NGINX_TEST_COMMAND = process.env.HOSTING_NGINX_TEST_COMMAND || 'nginx -t';
const NGINX_RELOAD_COMMAND = process.env.HOSTING_NGINX_RELOAD_COMMAND || 'nginx -s reload';

type SyncVhostOptions = {
  primaryDomain: string;
  customDomains?: string[];
  documentRoot: string;
};

type SyncVhostResult =
  | { skipped: true }
  | {
      skipped: false;
      domains: string[];
      configPath: string;
      symlinkPath: string;
    };

type RemoveVhostResult =
  | { skipped: true }
  | {
      skipped: false;
      configPath: string;
      symlinkPath: string;
    };

function shellSplit(command: string): { bin: string; args: string[] } {
  const parts = command.trim().split(/\s+/);
  const [bin, ...args] = parts;
  return { bin, args };
}

function isValidDomain(domain: unknown): domain is string {
  return typeof domain === 'string' && DOMAIN_REGEX.test(domain);
}

function getConfigFileName(primaryDomain: string): string {
  return `${primaryDomain.toLowerCase()}.conf`;
}

function normalizeDomains(primaryDomain: string, customDomains: string[] = []): string[] {
  const all = [primaryDomain, ...customDomains]
    .filter(Boolean)
    .map((domain) => domain.toLowerCase().trim())
    .filter((domain, index, list) => list.indexOf(domain) === index)
    .filter(isValidDomain);

  if (all.length === 0) {
    throw new Error('Cannot generate vhost config: no valid domains');
  }

  return all;
}

function buildVhostConfig(domains: string[], documentRoot: string): string {
  const serverNames = domains.join(' ');

  return `server {
    listen 80;
    listen [::]:80;
    server_name ${serverNames};

    root ${documentRoot};
    index index.html index.htm index.php;

    location / {
        try_files $uri $uri/ =404;
    }

    # Security headers (minimal for MVP)
    add_header X-Content-Type-Options nosniff;
    add_header X-Frame-Options SAMEORIGIN;
    add_header Referrer-Policy same-origin;
}
`;
}

async function ensureSymlink(targetPath: string, linkPath: string): Promise<void> {
  try {
    const current = await fs.readlink(linkPath);
    if (current === targetPath) {
      return;
    }
    await fs.unlink(linkPath);
  } catch (error) {
    const { code } = (error as NodeJS.ErrnoException);
    if (code !== 'ENOENT' && code !== 'EINVAL') {
      throw error;
    }
  }

  await fs.symlink(targetPath, linkPath);
}

class VhostService {
  static async syncAccountVhost({ primaryDomain, customDomains = [], documentRoot }: SyncVhostOptions): Promise<SyncVhostResult> {
    if (!NGINX_ENABLED) {
      logger.info('Vhost sync skipped: HOSTING_NGINX_ENABLED=false', { primaryDomain });
      return { skipped: true };
    }

    if (!isValidDomain(primaryDomain)) {
      throw new Error('Cannot sync vhost: invalid primary domain');
    }

    if (!path.isAbsolute(documentRoot)) {
      throw new Error('Cannot sync vhost: documentRoot must be an absolute path');
    }

    const domains = normalizeDomains(primaryDomain, customDomains);
    const confName = getConfigFileName(primaryDomain);
    const availablePath = path.join(SITES_AVAILABLE_DIR, confName);
    const enabledPath = path.join(SITES_ENABLED_DIR, confName);

    await fs.mkdir(SITES_AVAILABLE_DIR, { recursive: true });
    await fs.mkdir(SITES_ENABLED_DIR, { recursive: true });

    const config = buildVhostConfig(domains, documentRoot);
    await fs.writeFile(availablePath, config, { encoding: 'utf8' });
    await ensureSymlink(availablePath, enabledPath);

    await VhostService.testAndReload();

    logger.info('Vhost synced', {
      primaryDomain,
      domains,
      availablePath,
      enabledPath,
    });

    return {
      skipped: false,
      domains,
      configPath: availablePath,
      symlinkPath: enabledPath,
    };
  }

  static async removeAccountVhost(primaryDomain: string): Promise<RemoveVhostResult> {
    if (!NGINX_ENABLED) {
      logger.info('Vhost removal skipped: HOSTING_NGINX_ENABLED=false', { primaryDomain });
      return { skipped: true };
    }

    if (!isValidDomain(primaryDomain)) {
      throw new Error('Cannot remove vhost: invalid primary domain');
    }

    const confName = getConfigFileName(primaryDomain);
    const availablePath = path.join(SITES_AVAILABLE_DIR, confName);
    const enabledPath = path.join(SITES_ENABLED_DIR, confName);

    try {
      await fs.unlink(enabledPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }

    try {
      await fs.unlink(availablePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }

    await VhostService.testAndReload();

    logger.info('Vhost removed', { primaryDomain, availablePath, enabledPath });

    return {
      skipped: false,
      configPath: availablePath,
      symlinkPath: enabledPath,
    };
  }

  static async testAndReload(): Promise<void> {
    const testCommand = shellSplit(NGINX_TEST_COMMAND);
    const reloadCommand = shellSplit(NGINX_RELOAD_COMMAND);

    try {
      await execFileAsync(testCommand.bin, testCommand.args);
      await execFileAsync(reloadCommand.bin, reloadCommand.args);
    } catch (error) {
      const execError = error as { message?: string; stderr?: string; stdout?: string };
      logger.error('Nginx test/reload failed', {
        message: execError.message,
        stderr: execError.stderr,
        stdout: execError.stdout,
      });
      throw new Error('Nginx reload failed after vhost update');
    }
  }
}

export = VhostService;
