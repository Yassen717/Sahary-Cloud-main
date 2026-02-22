const { randomUUID } = require('crypto');

/**
 * Correlation ID Middleware
 * Attaches a unique X-Correlation-Id to every request and response.
 * If the client sends one we honour it; otherwise we generate a new UUID.
 * This makes it trivial to trace a single request across logs and services.
 */
const correlationId = (req, res, next) => {
    const id =
        req.headers['x-correlation-id'] ||
        req.headers['x-request-id'] ||
        randomUUID();

    // Expose on the request object so all downstream code can read it
    req.correlationId = id;

    // Echo it back in the response headers
    res.setHeader('X-Correlation-Id', id);

    next();
};

module.exports = { correlationId };
