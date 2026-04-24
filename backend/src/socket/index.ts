import type { Server as HttpServer } from 'http';
import { Server } from 'socket.io';
import { setupTerminalSocket } from './terminal';
import logger from '../utils/logger';

const initSocket = (httpServer: HttpServer): Server => {
  const io = new Server(httpServer, {
    cors: {
      origin: process.env.CORS_ORIGIN || 'http://localhost:3001',
      methods: ['GET', 'POST'],
      credentials: true,
    },
    maxHttpBufferSize: 1e6,
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  setupTerminalSocket(io);

  logger.info('🔌 Socket.io server initialised');
  return io;
};

export { initSocket };

export default { initSocket };