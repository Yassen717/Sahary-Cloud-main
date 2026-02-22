const swaggerJSDoc = require('swagger-jsdoc');
const config = require('./index');

const swaggerDefinition = {
    openapi: '3.0.0',
    info: {
        title: 'Sahary Cloud API',
        version: '1.0.0',
        description:
            'REST API for the Sahary Cloud platform — VM management, solar energy monitoring, billing, and user management.',
        contact: {
            name: 'Sahary Cloud',
            email: 'support@saharycloud.com',
        },
    },
    servers: [
        {
            url: `${config.urls.backend}/api`,
            description: 'Current server',
        },
        {
            url: 'http://localhost:3000/api',
            description: 'Local development',
        },
    ],
    components: {
        securitySchemes: {
            BearerAuth: {
                type: 'http',
                scheme: 'bearer',
                bearerFormat: 'JWT',
                description: 'Enter your JWT access token',
            },
        },
        schemas: {
            // ── Common ────────────────────────────────────────────────────────────
            Error: {
                type: 'object',
                properties: {
                    success: { type: 'boolean', example: false },
                    message: { type: 'string', example: 'An error occurred' },
                    error: { type: 'string' },
                },
            },
            Pagination: {
                type: 'object',
                properties: {
                    page: { type: 'integer', example: 1 },
                    limit: { type: 'integer', example: 20 },
                    total: { type: 'integer', example: 100 },
                    pages: { type: 'integer', example: 5 },
                },
            },

            // ── Auth ──────────────────────────────────────────────────────────────
            RegisterRequest: {
                type: 'object',
                required: ['email', 'password', 'firstName', 'lastName'],
                properties: {
                    email: { type: 'string', format: 'email', example: 'user@example.com' },
                    password: { type: 'string', minLength: 8, example: 'SecurePass123!' },
                    firstName: { type: 'string', example: 'Ahmed' },
                    lastName: { type: 'string', example: 'Al-Rashidi' },
                    phone: { type: 'string', example: '+966501234567' },
                },
            },
            LoginRequest: {
                type: 'object',
                required: ['email', 'password'],
                properties: {
                    email: { type: 'string', format: 'email', example: 'user@example.com' },
                    password: { type: 'string', example: 'SecurePass123!' },
                },
            },
            AuthResponse: {
                type: 'object',
                properties: {
                    success: { type: 'boolean', example: true },
                    message: { type: 'string', example: 'Login successful' },
                    accessToken: { type: 'string' },
                    refreshToken: { type: 'string' },
                    user: { $ref: '#/components/schemas/User' },
                },
            },

            // ── User ──────────────────────────────────────────────────────────────
            User: {
                type: 'object',
                properties: {
                    id: { type: 'string', example: 'clxxx...' },
                    email: { type: 'string', format: 'email' },
                    firstName: { type: 'string' },
                    lastName: { type: 'string' },
                    phone: { type: 'string' },
                    role: { type: 'string', enum: ['USER', 'ADMIN', 'SUPER_ADMIN'] },
                    isActive: { type: 'boolean' },
                    isVerified: { type: 'boolean' },
                    createdAt: { type: 'string', format: 'date-time' },
                },
            },

            // ── VM ────────────────────────────────────────────────────────────────
            VirtualMachine: {
                type: 'object',
                properties: {
                    id: { type: 'string' },
                    name: { type: 'string', example: 'my-server' },
                    description: { type: 'string' },
                    status: { type: 'string', enum: ['RUNNING', 'STOPPED', 'PAUSED', 'ERROR'] },
                    cpu: { type: 'integer', example: 2, description: 'CPU cores' },
                    ram: { type: 'integer', example: 2048, description: 'RAM in MB' },
                    storage: { type: 'integer', example: 20, description: 'Storage in GB' },
                    ipAddress: { type: 'string', example: '172.25.0.2' },
                    hourlyRate: { type: 'number', example: 0.05 },
                    createdAt: { type: 'string', format: 'date-time' },
                },
            },
            CreateVMRequest: {
                type: 'object',
                required: ['name', 'cpu', 'ram', 'storage'],
                properties: {
                    name: { type: 'string', example: 'my-server' },
                    description: { type: 'string' },
                    cpu: { type: 'integer', minimum: 1, example: 2 },
                    ram: { type: 'integer', minimum: 512, example: 2048 },
                    storage: { type: 'integer', minimum: 10, example: 20 },
                    dockerImage: { type: 'string', example: 'ubuntu:22.04' },
                },
            },

            // ── Invoice ───────────────────────────────────────────────────────────
            Invoice: {
                type: 'object',
                properties: {
                    id: { type: 'string' },
                    invoiceNumber: { type: 'string', example: 'INV-2026-001' },
                    amount: { type: 'number', example: 49.99 },
                    status: { type: 'string', enum: ['PENDING', 'PAID', 'OVERDUE', 'CANCELLED'] },
                    dueDate: { type: 'string', format: 'date-time' },
                    paidAt: { type: 'string', format: 'date-time' },
                    createdAt: { type: 'string', format: 'date-time' },
                },
            },

            // ── Solar ─────────────────────────────────────────────────────────────
            SolarData: {
                type: 'object',
                properties: {
                    id: { type: 'string' },
                    production: { type: 'number', description: 'kWh produced', example: 12.5 },
                    consumption: { type: 'number', description: 'kWh consumed', example: 8.3 },
                    efficiency: { type: 'number', description: 'Efficiency %', example: 87.2 },
                    systemStatus: { type: 'string', enum: ['NORMAL', 'BACKUP_POWER', 'CRITICAL'] },
                    timestamp: { type: 'string', format: 'date-time' },
                },
            },
        },
        responses: {
            Unauthorized: {
                description: 'Authentication required',
                content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
            },
            Forbidden: {
                description: 'Insufficient permissions',
                content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
            },
            NotFound: {
                description: 'Resource not found',
                content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
            },
            ServiceUnavailable: {
                description: 'Service is not available (e.g. Docker not connected)',
                content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
            },
        },
    },
    security: [{ BearerAuth: [] }],
    tags: [
        { name: 'Auth', description: 'Authentication — register, login, token refresh' },
        { name: 'Users', description: 'User profile and management' },
        { name: 'VMs', description: 'Virtual machine lifecycle management' },
        { name: 'Docker', description: 'Low-level Docker container operations' },
        { name: 'Billing', description: 'Invoices and payment history' },
        { name: 'Payments', description: 'Stripe payment processing' },
        { name: 'Solar', description: 'Solar energy monitoring and alerts' },
        { name: 'Admin', description: 'Admin-only operations' },
        { name: 'Cache', description: 'Cache management' },
        { name: 'Health', description: 'Health and monitoring endpoints' },
    ],
};

const options = {
    swaggerDefinition,
    // Scan all route files for @swagger JSDoc comments
    apis: [
        `${__dirname}/../routes/*.js`,
        `${__dirname}/../controllers/*.js`,
    ],
};

const swaggerSpec = swaggerJSDoc(options);

module.exports = swaggerSpec;
