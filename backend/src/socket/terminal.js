const JWTUtils = require('../utils/jwt');
const AuthService = require('../services/authService');
const dockerService = require('../services/dockerService');
const prisma = require('../config/database').prisma;
const logger = require('../utils/logger');

/**
 * Set up terminal socket events for a single authenticated socket connection.
 *
 * Protocol:
 *  client → terminal:start  { vmId, containerId, cols, rows }
 *  server → terminal:data   <raw string>
 *  client → terminal:input  <raw string>
 *  client → terminal:resize { cols, rows }
 *  server → terminal:error  <message string>
 *  server → terminal:closed (no payload)
 *
 * @param {import('socket.io').Socket} socket
 */
async function handleTerminalSocket(socket) {
  // ── 1. Authenticate ──────────────────────────────────────────────────────
  const token = socket.handshake.auth?.token;

  if (!token) {
    socket.emit('terminal:error', 'Authentication required');
    socket.disconnect(true);
    return;
  }

  let user;
  try {
    const decoded = await JWTUtils.verifyAccessToken(token);
    user = await AuthService.getUserById(decoded.userId);

    if (!user || !user.isActive) {
      throw new Error('User not found or inactive');
    }
  } catch (err) {
    logger.warn(`Terminal socket auth failed: ${err.message}`);
    socket.emit('terminal:error', 'Authentication failed: ' + err.message);
    socket.disconnect(true);
    return;
  }

  logger.info(`Terminal socket connected — user: ${user.email} (${user.id})`);

  // Track the active exec stream so we can clean up on disconnect
  let execStream = null;
  let execInstance = null;

  // ── 2. terminal:start ─────────────────────────────────────────────────────
  socket.on('terminal:start', async ({ vmId, containerId, cols = 80, rows = 24 }) => {
    try {
      if (!dockerService.isReady()) {
        throw new Error('Docker service is not available');
      }

      // Ownership check: confirm this VM belongs to the requesting user
      const vm = await prisma.virtualMachine.findFirst({
        where: { id: vmId, userId: user.id },
      });

      if (!vm) {
        throw new Error('VM not found or access denied');
      }

      if (vm.status?.toLowerCase() !== 'running') {
        throw new Error(`VM is not running (status: ${vm.status})`);
      }

      const targetContainerId = containerId || vm.dockerContainerId;
      if (!targetContainerId) {
        throw new Error('No Docker container ID associated with this VM');
      }

      const container = dockerService.docker.getContainer(targetContainerId);

      // Create a pseudo-TTY exec session
      execInstance = await container.exec({
        Cmd: ['/bin/bash'],
        AttachStdin: true,
        AttachStdout: true,
        AttachStderr: true,
        Tty: true,
        Env: ['TERM=xterm-256color'],
      });

      execStream = await execInstance.start({
        hijack: true,
        stdin: true,
        Tty: true,
      });

      // Set initial terminal size
      try {
        await execInstance.resize({ h: rows, w: cols });
      } catch (_) {
        // Resize may fail before the process fully starts; ignore
      }

      // Forward container output → client
      execStream.on('data', (chunk) => {
        socket.emit('terminal:data', chunk.toString('utf-8'));
      });

      execStream.on('end', () => {
        socket.emit('terminal:closed');
        execStream = null;
      });

      execStream.on('error', (err) => {
        logger.error(`Terminal exec stream error: ${err.message}`);
        socket.emit('terminal:error', err.message);
        execStream = null;
      });

      logger.info(`Terminal session started — vmId: ${vmId}, container: ${targetContainerId}`);
    } catch (err) {
      logger.error(`terminal:start error: ${err.message}`);
      socket.emit('terminal:error', err.message);
    }
  });

  // ── 3. terminal:input ─────────────────────────────────────────────────────
  socket.on('terminal:input', (data) => {
    if (execStream && !execStream.destroyed) {
      try {
        execStream.write(data);
      } catch (err) {
        logger.error(`terminal:input write error: ${err.message}`);
      }
    }
  });

  // ── 4. terminal:resize ────────────────────────────────────────────────────
  socket.on('terminal:resize', async ({ cols, rows }) => {
    if (execInstance) {
      try {
        await execInstance.resize({ h: rows, w: cols });
      } catch (err) {
        // Non-fatal — log and continue
        logger.warn(`terminal:resize failed: ${err.message}`);
      }
    }
  });

  // ── 5. Cleanup on disconnect ──────────────────────────────────────────────
  socket.on('disconnect', (reason) => {
    logger.info(`Terminal socket disconnected — user: ${user.email}, reason: ${reason}`);
    if (execStream && !execStream.destroyed) {
      try {
        execStream.destroy();
      } catch (_) { }
    }
    execStream = null;
    execInstance = null;
  });
}

/**
 * Register the terminal namespace on a Socket.io server instance.
 *
 * @param {import('socket.io').Server} io
 */
function setupTerminalSocket(io) {
  const terminalNs = io.of('/terminal');

  terminalNs.on('connection', (socket) => {
    handleTerminalSocket(socket).catch((err) => {
      logger.error(`Unhandled terminal socket error: ${err.message}`);
      socket.disconnect(true);
    });
  });

  logger.info('🖥️  Terminal socket namespace registered at /terminal');
}

module.exports = { setupTerminalSocket };
