import type { Server, Socket } from 'socket.io';
import JWTUtils from '../utils/jwt';
import AuthService from '../services/authService';
import dockerService from '../services/dockerService';
import { prisma } from '../config/database';
import logger from '../utils/logger';

type TerminalStartPayload = {
  vmId: string;
  containerId?: string;
  cols?: number;
  rows?: number;
};

type ExecInstance = {
  start: (options: { hijack: boolean; stdin: boolean; Tty: boolean }) => Promise<NodeJS.ReadWriteStream>;
  resize: (options: { h: number; w: number }) => Promise<void>;
};

type ExecStream = NodeJS.ReadWriteStream & {
  destroyed?: boolean;
  destroy?: () => void;
};

type TerminalUser = NonNullable<Awaited<ReturnType<typeof AuthService.getUserById>>>;

const MIN_TTY_SIZE = 1;
const MAX_TTY_SIZE = 500;

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }

  return 'Unknown error';
};

const clampTerminalSize = (value: unknown, fallback: number): number => {
  const size = typeof value === 'number' && Number.isFinite(value) ? Math.floor(value) : fallback;
  return Math.min(Math.max(size, MIN_TTY_SIZE), MAX_TTY_SIZE);
};

const destroyExecStream = (stream: ExecStream | null): void => {
  if (stream && !stream.destroyed) {
    try {
      stream.destroy?.();
    } catch {
      // Ignore cleanup errors.
    }
  }
};

// Handshake middleware — authenticates the socket before the connection is accepted,
// so client events can never arrive before handlers are registered.
const authenticateTerminalSocket = async (socket: Socket, next: (err?: Error) => void): Promise<void> => {
  try {
    const token = socket.handshake.auth?.token;

    if (!token || typeof token !== 'string') {
      throw new Error('Missing access token');
    }

    const decoded = await JWTUtils.verifyAccessToken(token);
    if (!decoded.userId) {
      throw new Error('Invalid access token payload');
    }

    const user = await AuthService.getUserById(decoded.userId);

    if (!user || !user.isActive) {
      throw new Error('User not found or inactive');
    }

    socket.data.user = user;
    next();
  } catch (error) {
    // Log the real reason server-side only — never leak auth internals to the client.
    logger.warn(`Terminal socket auth failed: ${getErrorMessage(error)}`);
    next(new Error('Authentication failed'));
  }
};

const handleTerminalSocket = (socket: Socket): void => {
  const user = socket.data.user as TerminalUser | undefined;

  if (!user) {
    logger.warn('Terminal socket connected without an authenticated user');
    socket.disconnect(true);
    return;
  }

  logger.info(`Terminal socket connected — user: ${user.email} (${user.id})`);

  let execStream: ExecStream | null = null;
  let execInstance: ExecInstance | null = null;
  let disconnected = false;

  socket.on('terminal:start', async (payload: TerminalStartPayload) => {
    try {
      if (!payload || typeof payload !== 'object') {
        throw new Error('Invalid terminal:start payload');
      }

      const { vmId, containerId } = payload;
      const cols = clampTerminalSize(payload.cols, 80);
      const rows = clampTerminalSize(payload.rows, 24);

      if (!vmId || typeof vmId !== 'string') {
        throw new Error('A valid vmId is required');
      }

      if (!dockerService.isReady()) {
        throw new Error('Docker service is not available');
      }

      const vm = await prisma.virtualMachine.findFirst({
        where: { id: vmId, userId: user.id },
      });

      if (disconnected) {
        return;
      }

      if (!vm) {
        throw new Error('VM not found or access denied');
      }

      if (vm.status?.toLowerCase() !== 'running') {
        throw new Error(`VM is not running (status: ${vm.status})`);
      }

      // Never trust a client-supplied containerId — always exec into the VM's own container.
      const targetContainerId = vm.dockerContainerId;

      if (!targetContainerId) {
        throw new Error('No Docker container ID associated with this VM');
      }

      if (containerId && containerId !== targetContainerId) {
        logger.warn(`terminal:start containerId mismatch — user: ${user.email}, vmId: ${vmId}`);
        throw new Error('Invalid container ID for this VM');
      }

      // A repeated terminal:start must not orphan the previous /bin/bash session.
      destroyExecStream(execStream);
      execStream = null;
      execInstance = null;

      const container = dockerService.getContainer(targetContainerId);

      const nextExecInstance = (await container.exec({
        Cmd: ['/bin/bash'],
        AttachStdin: true,
        AttachStdout: true,
        AttachStderr: true,
        Tty: true,
        Env: ['TERM=xterm-256color'],
      })) as ExecInstance;

      if (disconnected) {
        // The exec was created but never started — no process is spawned.
        return;
      }

      execInstance = nextExecInstance;

      const stream = (await nextExecInstance.start({
        hijack: true,
        stdin: true,
        Tty: true,
      })) as ExecStream;

      if (disconnected) {
        destroyExecStream(stream);
        if (execInstance === nextExecInstance) {
          execInstance = null;
        }
        return;
      }

      execStream = stream;

      try {
        await nextExecInstance.resize({ h: rows, w: cols });
      } catch {
        // Resize can fail before the process is fully ready.
      }

      if (disconnected) {
        destroyExecStream(stream);
        if (execStream === stream) {
          execStream = null;
        }
        if (execInstance === nextExecInstance) {
          execInstance = null;
        }
        return;
      }

      stream.on('data', (chunk: Buffer | string) => {
        socket.emit('terminal:data', chunk.toString());
      });

      stream.on('end', () => {
        socket.emit('terminal:closed');
        // Only clear state if this stream is still the current session.
        if (execStream === stream) {
          execStream = null;
          execInstance = null;
        }
      });

      stream.on('error', (error) => {
        const message = getErrorMessage(error);
        logger.error(`Terminal exec stream error: ${message}`);
        socket.emit('terminal:error', message);
        if (execStream === stream) {
          execStream = null;
          execInstance = null;
        }
      });

      logger.info(`Terminal session started — vmId: ${vmId}, container: ${targetContainerId}`);
    } catch (error) {
      const message = getErrorMessage(error);
      logger.error(`terminal:start error: ${message}`);
      socket.emit('terminal:error', message);
    }
  });

  socket.on('terminal:input', (data: string) => {
    if (execStream && !execStream.destroyed) {
      try {
        execStream.write(data);
      } catch (error) {
        logger.error(`terminal:input write error: ${getErrorMessage(error)}`);
      }
    }
  });

  socket.on('terminal:resize', async (payload: { cols?: number; rows?: number }) => {
    try {
      if (!payload || typeof payload !== 'object') {
        return;
      }

      const cols = clampTerminalSize(payload.cols, 80);
      const rows = clampTerminalSize(payload.rows, 24);

      if (execInstance) {
        await execInstance.resize({ h: rows, w: cols });
      }
    } catch (error) {
      logger.warn(`terminal:resize failed: ${getErrorMessage(error)}`);
    }
  });

  socket.on('disconnect', (reason) => {
    disconnected = true;
    logger.info(`Terminal socket disconnected — user: ${user.email}, reason: ${reason}`);

    destroyExecStream(execStream);

    execStream = null;
    execInstance = null;
  });
};

const setupTerminalSocket = (io: Server): void => {
  const terminalNs = io.of('/terminal');

  // Authenticate during the handshake so unauthenticated sockets never reach 'connection'
  // and every handler below is registered before any client event can be delivered.
  terminalNs.use((socket, next) => {
    authenticateTerminalSocket(socket, next).catch((error) => {
      logger.error(`Terminal socket middleware error: ${getErrorMessage(error)}`);
      next(new Error('Authentication failed'));
    });
  });

  terminalNs.on('connection', (socket) => {
    try {
      handleTerminalSocket(socket);
    } catch (error) {
      logger.error(`Unhandled terminal socket error: ${getErrorMessage(error)}`);
      socket.disconnect(true);
    }
  });

  logger.info('🖥️  Terminal socket namespace registered at /terminal');
};

export { setupTerminalSocket, handleTerminalSocket };

export default { setupTerminalSocket, handleTerminalSocket };
