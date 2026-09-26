// @ts-nocheck
const fs = require('fs').promises;
const path = require('path');
const { promisify } = require('util');
const { execFile } = require('child_process');
const logger = require('../utils/logger').default;

const execFileAsync = promisify(execFile);
const EXEC_TIMEOUT_MS = 10_000;

const DOMAIN_REGEX = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i;

const NGINX_ENABLED = process.env.HOSTING_NGINX_ENABLED === 'true';
const SITES_AVAILABLE_DIR = process.env.HOSTING_NGINX_SITES_AVAILABLE || '/etc/nginx/sites-available';
const SITES_ENABLED_DIR = process.env.HOSTING_NGINX_SITES_ENABLED || '/etc/nginx/sites-enabled';
// Optional directory already included by nginx.conf inside the http context.
// When set, candidate configs are staged there so `nginx -t` actually parses
// them BEFORE the vhost is enabled.
const STAGING_DIR = process.env.HOSTING_NGINX_STAGING_DIR || '';
// Fixed command argv — env vars must never be parsed into shell commands.
const NGINX_TEST_ARGV = ['nginx', '-t'];
const NGINX_RELOAD_ARGV = ['nginx', '-s', 'reload'];

/**
 * Error annotated with an HTTP status and a safe-to-expose flag so the
 * controller layer can map infrastructure failures without leaking internals.
 */
function vhostError(status, message) {
  const error = new Error(message);
  error.status = status;
  error.expose = true;
  return error;
}

function isValidDomain(domain) {
  return typeof domain === 'string' && DOMAIN_REGEX.test(domain);
}

function getConfigFileName(primaryDomain) {
  return `${primaryDomain.toLowerCase()}.conf`;
}

function normalizeDomains(primaryDomain, customDomains = []) {
  const all = [primaryDomain, ...customDomains]
    .filter(Boolean)
    .map((domain) => domain.toLowerCase().trim())
    .filter((domain, index, list) => list.indexOf(domain) === index)
    .filter(isValidDomain);

  if (all.length === 0) {
    throw vhostError(400, 'Cannot generate vhost config: no valid domains');
  }

  return all;
}

function buildVhostConfig(domains, documentRoot) {
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

async function ensureSymlink(targetPath, linkPath) {
  try {
    const stat = await fs.lstat(linkPath);
    if (stat.isSymbolicLink()) {
      const current = await fs.readlink(linkPath);
      if (current === targetPath) {
        return;
      }
    }
    // Remove whatever occupies the link path — stale symlink, regular file,
    // or anything else — before creating the new symlink.
    await fs.unlink(linkPath);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
  }

  await fs.symlink(targetPath, linkPath);
}

class VhostService {
  static async syncAccountVhost({ primaryDomain, customDomains = [], documentRoot }) {
    if (!NGINX_ENABLED) {
      logger.info('Vhost sync skipped: HOSTING_NGINX_ENABLED=false', { primaryDomain });
      return { skipped: true };
    }

    if (!isValidDomain(primaryDomain)) {
      throw vhostError(400, 'Cannot sync vhost: invalid primary domain');
    }

    if (!path.isAbsolute(documentRoot)) {
      throw vhostError(400, 'Cannot sync vhost: documentRoot must be an absolute path');
    }

    const domains = normalizeDomains(primaryDomain, customDomains);
    const confName = getConfigFileName(primaryDomain);
    const availablePath = path.join(SITES_AVAILABLE_DIR, confName);
    const enabledPath = path.join(SITES_ENABLED_DIR, confName);

    await fs.mkdir(SITES_AVAILABLE_DIR, { recursive: true });
    await fs.mkdir(SITES_ENABLED_DIR, { recursive: true });

    const config = buildVhostConfig(domains, documentRoot);

    // Preserve the previous state so a failed sync can roll back to the last
    // known-good config instead of leaving a broken vhost enabled.
    let previousConfig = null;
    try {
      previousConfig = await fs.readFile(availablePath, 'utf8');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    let hadEnabled = false;
    try {
      await fs.lstat(enabledPath);
      hadEnabled = true;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }

    let stagingPath = null;
    try {
      // Write the candidate config WITHOUT enabling it yet.
      await fs.writeFile(availablePath, config, { encoding: 'utf8', mode: 0o644 });

      if (STAGING_DIR) {
        // The staging dir is included by nginx.conf, so `nginx -t` parses the
        // candidate before it is enabled.
        await fs.mkdir(STAGING_DIR, { recursive: true });
        stagingPath = path.join(STAGING_DIR, confName);
        await fs.writeFile(stagingPath, config, { encoding: 'utf8', mode: 0o644 });
        await VhostService.testConfig();
        await fs.unlink(stagingPath);
        stagingPath = null;
      }

      // Enable only after validation, then test + reload. When STAGING_DIR is
      // unset this is also the first real parse of the candidate — a failure
      // triggers the rollback below, so a broken config never stays enabled.
      await ensureSymlink(availablePath, enabledPath);
      await VhostService.testAndReload();
    } catch (error) {
      // Roll back: drop the staging copy, disable the vhost and restore or
      // remove the config file.
      if (stagingPath) {
        try {
          await fs.unlink(stagingPath);
        } catch (stagingError) {
          logger.warn('Failed to remove staged vhost during rollback', {
            stagingPath,
            message: stagingError.message,
          });
        }
      }
      try {
        await fs.unlink(enabledPath);
      } catch (unlinkError) {
        if (unlinkError.code !== 'ENOENT') {
          logger.error('Failed to disable broken vhost during rollback', {
            enabledPath,
            message: unlinkError.message,
          });
        }
      }
      try {
        if (previousConfig === null) {
          try {
            await fs.unlink(availablePath);
          } catch (unlinkError) {
            if (unlinkError.code !== 'ENOENT') throw unlinkError;
          }
        } else {
          await fs.writeFile(availablePath, previousConfig, { encoding: 'utf8', mode: 0o644 });
          if (hadEnabled) {
            await ensureSymlink(availablePath, enabledPath);
          }
        }
      } catch (restoreError) {
        logger.error('Failed to restore previous vhost config during rollback', {
          availablePath,
          message: restoreError.message,
        });
      }
      // Re-verify/reload so nginx returns to the last known-good state.
      try {
        await VhostService.testAndReload();
      } catch (verifyError) {
        logger.error('Nginx still unhealthy after vhost rollback', {
          primaryDomain,
          message: verifyError.message,
        });
      }
      logger.error('Vhost sync failed, rolled back', {
        primaryDomain,
        availablePath,
        enabledPath,
        message: error.message,
      });
      throw error;
    }

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

  static async removeAccountVhost(primaryDomain) {
    if (!NGINX_ENABLED) {
      logger.info('Vhost removal skipped: HOSTING_NGINX_ENABLED=false', { primaryDomain });
      return { skipped: true };
    }

    if (!isValidDomain(primaryDomain)) {
      throw vhostError(400, 'Cannot remove vhost: invalid primary domain');
    }

    const confName = getConfigFileName(primaryDomain);
    const availablePath = path.join(SITES_AVAILABLE_DIR, confName);
    const enabledPath = path.join(SITES_ENABLED_DIR, confName);

    try {
      await fs.unlink(enabledPath);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }

    try {
      await fs.unlink(availablePath);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }

    await VhostService.testAndReload();

    logger.info('Vhost removed', { primaryDomain, availablePath, enabledPath });

    return {
      skipped: false,
      configPath: availablePath,
      symlinkPath: enabledPath,
    };
  }

  static async testConfig() {
    try {
      await execFileAsync(NGINX_TEST_ARGV[0], NGINX_TEST_ARGV.slice(1), { timeout: EXEC_TIMEOUT_MS });
    } catch (error) {
      logger.error('Nginx config test failed', {
        message: error.message,
        stderr: error.stderr,
        stdout: error.stdout,
      });
      throw vhostError(502, 'Nginx configuration test failed');
    }
  }

  static async testAndReload() {
    await VhostService.testConfig();
    try {
      await execFileAsync(NGINX_RELOAD_ARGV[0], NGINX_RELOAD_ARGV.slice(1), { timeout: EXEC_TIMEOUT_MS });
    } catch (error) {
      logger.error('Nginx reload failed', {
        message: error.message,
        stderr: error.stderr,
        stdout: error.stdout,
      });
      throw vhostError(502, 'Nginx reload failed after vhost update');
    }
  }
}

module.exports = VhostService;
