const { Server } = require('socket.io');
const { setupTerminalSocket } = require('./terminal');
const logger = require('../utils/logger');

/**
 * Attach Socket.io to the given HTTP server and register all socket namespaces.
 *
 * @param {import('http').Server} httpServer
 * @returns {import('socket.io').Server}
 */
function initSocket(httpServer) {
    const io = new Server(httpServer, {
        cors: {
            origin: process.env.CORS_ORIGIN || 'http://localhost:3001',
            methods: ['GET', 'POST'],
            credentials: true,
        },
        // Allow up to 1 MB messages (for terminal paste buffers)
        maxHttpBufferSize: 1e6,
        // Keep connections alive with ping/pong
        pingTimeout: 60000,
        pingInterval: 25000,
    });

    // Register namespaces
    setupTerminalSocket(io);

    logger.info('🔌 Socket.io server initialised');
    return io;
}

module.exports = { initSocket };
