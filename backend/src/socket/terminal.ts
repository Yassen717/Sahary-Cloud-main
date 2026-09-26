import type { Socket } from 'socket.io';
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

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }

  return 'Unknown error';
};

const handleTerminalSocket = async (socket: Socket): Promise<void> => {
  const token = socket.handshake.auth?.token;

  if (!token || typeof token !== 'string') {
    socket.emit('terminal:error', 'Authentication required');
    socket.disconnect(true);
    return;
  }

  let user: Awaited<ReturnType<typeof AuthService.getUserById>> | null = null;

  try {
    const decoded = await JWTUtils.verifyAccessToken(token);
    if (!decoded.userId) {
      throw new Error('Invalid access token payload');
    }

    user = await AuthService.getUserById(decoded.userId);

    if (!user || !user.isActive) {
      throw new Error('User not found or inactive');
    }
  } catch (error) {
    const message = getErrorMessage(error);
    logger.warn(`Terminal socket auth failed: ${message}`);
    socket.emit('terminal:error', `Authentication failed: ${message}`);
    socket.disconnect(true);
    return;
  }

  logger.info(`Terminal socket connected — user: ${user.email} (${user.id})`);

  let execStream: ExecStream | null = null;
  let execInstance: ExecInstance | null = null;

  socket.on('terminal:start', async (payload: TerminalStartPayload) => {
    const {
      vmId, containerId, cols = 80, rows = 24,
    } = payload;

    try {
      if (!dockerService.isReady()) {
        throw new Error('Docker service is not available');
      }

      const vm = await prisma.virtualMachine.findFirst({
        where: { id: vmId, userId: user?.id },
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

      const container = dockerService.getContainer(targetContainerId);

      execInstance = (await container.exec({
        Cmd: ['/bin/bash'],
        AttachStdin: true,
        AttachStdout: true,
        AttachStderr: true,
        Tty: true,
        Env: ['TERM=xterm-256color'],
      })) as ExecInstance;

      execStream = (await execInstance.start({
        hijack: true,
        stdin: true,
        Tty: true,
      })) as ExecStream;

      try {
        await execInstance.resize({ h: rows, w: cols });
      } catch {
        // Resize can fail before the process is fully ready.
      }

      execStream.on('data', (chunk: Buffer | string) => {
        socket.emit('terminal:data', chunk.toString());
      });

      execStream.on('end', () => {
        socket.emit('terminal:closed');
        execStream = null;
      });

      execStream.on('error', (error) => {
        const message = getErrorMessage(error);
        logger.error(`Terminal exec stream error: ${message}`);
        socket.emit('terminal:error', message);
        execStream = null;
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
    const { cols = 80, rows = 24 } = payload;

    if (execInstance) {
      try {
        await execInstance.resize({ h: rows, w: cols });
      } catch (error) {
        logger.warn(`terminal:resize failed: ${getErrorMessage(error)}`);
      }
    }
  });

  socket.on('disconnect', (reason) => {
    logger.info(`Terminal socket disconnected — user: ${user?.email}, reason: ${reason}`);

    if (execStream && !execStream.destroyed) {
      try {
        execStream.destroy?.();
      } catch {
        // Ignore cleanup errors.
      }
    }

    execStream = null;
    execInstance = null;
  });
};

const setupTerminalSocket = (io: { of: (namespace: string) => { on: (event: 'connection', listener: (socket: Socket) => void) => void } }): void => {
  const terminalNs = io.of('/terminal');

  terminalNs.on('connection', (socket) => {
    handleTerminalSocket(socket).catch((error) => {
      logger.error(`Unhandled terminal socket error: ${getErrorMessage(error)}`);
      socket.disconnect(true);
    });
  });

  logger.info('🖥️  Terminal socket namespace registered at /terminal');
};

export { setupTerminalSocket, handleTerminalSocket };

export default { setupTerminalSocket, handleTerminalSocket };
