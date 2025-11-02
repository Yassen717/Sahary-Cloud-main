const request = require('supertest');
const app = require('../src/index');
const { prisma } = require('../src/config/database');
const AuthService = require('../src/services/authService');
const VMService = require('../src/services/vmService');
const BillingService = require('../src/services/billingService');
const JWTUtils = require('../src/utils/jwt');

/**
 * Billing API Integration Tests
 * Tests all billing and invoice API endpoints
 */

describe('Billing API Integration Tests', () => {
    let testUser;
    let testAdmin;
    let userToken;
    let adminToken;
    let testVM;
    let testInvoice;

    beforeAll(async () => {
        // Clean up existing test data
        await prisma.payment.deleteMany({});
        await prisma.invoice.deleteMany({});
        await prisma.usageRecord.deleteMany({});
        await prisma.virtualMachine.deleteMany({});
        await prisma.user.deleteMany({
            where: {
                email: {
                    in: ['billing-api@test.com', 'billing-admin@test.com'],
                },
            },
        });

        // Create test user
        const userResult = await AuthService.register({
            email: 'billing-api@test.com',
            password: 'TestPassword123!',
            firstName: 'Billing',
            lastName: 'API',
        });

        testUser = userResult.user;
        userToken = userResult.tokens.accessToken;

        // Verify user
        await prisma.user.update({
            where: { id: testUser.id },
            data: { isVerified: true },
        });

        // Create admin user
        const adminResult = await AuthService.register({
            email: 'billing-admin@test.com',
            password: 'AdminPassword123!',
            firstName: 'Billing',
            lastName: 'Admin',
        });

        testAdmin = adminResult.user;

        // Update admin role
        await prisma.user.update({
            where: { id: testAdmin.id },
            data: { role: 'ADMIN', isVerified: true },
        });

        // Generate admin token
        adminToken = JWTUtils.generateAccessToken({
            userId: testAdmin.id,
            email: testAdmin.email,
            role: 'ADMIN',
        });

        // Create test VM
        testVM = await VMService.createVM(testUser.id, {
            name: 'billing-api-vm',
            cpu: 2,
            ram: 2048,
            storage: 40,
            bandwidth: 1000,
        });

        // Create usage records
        const usageRecords = [
            { cpuUsage: 40, ramUsage: 1000, storageUsage: 18, bandwidthUsage: 400, duration: 60 },
            { cpuUsage: 55, ramUsage: 1300, storageUsage: 22, bandwidthUsage: 600, duration: 60 },
            { cpuUsage: 65, ramUsage: 1500, storageUsage: 25, bandwidthUsage: 800, duration: 60 },
        ];

        for (const usage of usageRecords) {
            await BillingService.recordUsage(testVM.id, usage);
        }

        // Generate invoice
        const now = new Date();
        testInvoice = await BillingService.generateMonthlyInvoice(testUser.id, {
            month: now.getMonth(),
            year: now.getFullYear(),
        });
    });

    afterAll(async () => {
        // Clean up test data
        await prisma.payment.deleteMany({});
        await prisma.invoice.deleteMany({});
        await prisma.usageRecord.deleteMany({});
        await prisma.virtualMachine.deleteMany({});
        await prisma.user.deleteMany({
            where: {
                email: {
                    in: ['billing-api@test.com', 'billing-admin@test.com'],
                },
            },
        });
        await prisma.$disconnect();
    });

    describe('Invoice API Endpoints', () => {
        describe('GET /api/v1/billing/invoices', () => {
            it('should get user invoices', async () => {
                const response = await request(app)
                    .get('/api/v1/billing/invoices')
                    .set('Authorization', `Bearer ${userToken}`);

                expect(response.status).toBe(200);
                expect(response.body.success).toBe(true);
                expect(response.body.data).toBeInstanceOf(Array);
                expect(response.body.pagination).toBeDefined();
            });

            it('should filter invoices by status', async () => {
                const response = await request(app)
                    .get('/api/v1/billing/invoices')
                    .set('Authorization', `Bearer ${userToken}`)
                    .query({ status: 'PENDING' });

                expect(response.status).toBe(200);
                expect(response.body.success).toBe(true);
                response.body.data.forEach((invoice) => {
                    expect(invoice.status).toBe('PENDING');
                });
            });

            it('should require authentication', async () => {
                const response = await request(app).get('/api/v1/billing/invoices');

                expect(response.status).toBe(401);
                expect(response.body.success).toBe(false);
            });
        });

        describe('GET /api/v1/billing/invoices/:id', () => {
            it('should get invoice by ID', async () => {
                const response = await request(app)
                    .get(`/api/v1/billing/invoices/${testInvoice.id}`)
                    .set('Authorization', `Bearer ${userToken}`);

                expect(response.status).toBe(200);
                expect(response.body.success).toBe(true);
                expect(response.body.data.invoice.id).toBe(testInvoice.id);
                expect(response.body.data.invoice.items).toBeInstanceOf(Array);
            });

            it('should return 404 for non-existent invoice', async () => {
                const response = await request(app)
                    .get('/api/v1/billing/invoices/clxxxxxxxxxxxxxxxxxx')
                    .set('Authorization', `Bearer ${userToken}`);

                expect(response.status).toBe(404);
                expect(response.body.success).toBe(false);
            });
        });

        describe('GET /api/v1/billing/invoices/stats', () => {
            it('should get invoice statistics', async () => {
                const response = await request(app)
                    .get('/api/v1/billing/invoices/stats')
                    .set('Authorization', `Bearer ${userToken}`);

                expect(response.status).toBe(200);
                expect(response.body.success).toBe(true);
                expect(response.body.data.counts).toBeDefined();
                expect(response.body.data.amounts).toBeDefined();
            });
        });

        describe('POST /api/v1/billing/invoices/:id/discount (Admin)', () => {
            it('should apply discount to invoice', async () => {
                const response = await request(app)
                    .post(`/api/v1/billing/invoices/${testInvoice.id}/discount`)
                    .set('Authorization', `Bearer ${adminToken}`)
                    .send({
                        discountAmount: 5.0,
                        reason: 'Test discount',
                    });

                expect(response.status).toBe(200);
                expect(response.body.success).toBe(true);
                expect(response.body.data.invoice.discountAmount).toBe(5.0);
            });

            it('should reject non-admin access', async () => {
                const response = await request(app)
                    .post(`/api/v1/billing/invoices/${testInvoice.id}/discount`)
                    .set('Authorization', `Bearer ${userToken}`)
                    .send({
                        discountAmount: 5.0,
                        reason: 'Test discount',
                    });

                expect(response.status).toBe(403);
                expect(response.body.success).toBe(false);
            });
        });

        describe('PUT /api/v1/billing/invoices/:id/status (Admin)', () => {
            it('should update invoice status', async () => {
                const response = await request(app)
                    .put(`/api/v1/billing/invoices/${testInvoice.id}/status`)
                    .set('Authorization', `Bearer ${adminToken}`)
                    .send({
                        status: 'PAID',
                    });

                expect(response.status).toBe(200);
                expect(response.body.success).toBe(true);
                expect(response.body.data.invoice.status).toBe('PAID');
            });

            it('should reject invalid status', async () => {
                const response = await request(app)
                    .put(`/api/v1/billing/invoices/${testInvoice.id}/status`)
                    .set('Authorization', `Bearer ${adminToken}`)
                    .send({
                        status: 'INVALID_STATUS',
                    });

                expect(response.status).toBe(400);
                expect(response.body.success).toBe(false);
            });
        });

        describe('GET /api/v1/billing/invoices/all (Admin)', () => {
            it('should get all invoices as admin', async () => {
                const response = await request(app)
                    .get('/api/v1/billing/invoices/all')
                    .set('Authorization', `Bearer ${adminToken}`);

                expect(response.status).toBe(200);
                expect(response.body.success).toBe(true);
                expect(response.body.data).toBeInstanceOf(Array);
            });

            it('should reject non-admin access', async () => {
                const response = await request(app)
                    .get('/api/v1/billing/invoices/all')
                    .set('Authorization', `Bearer ${userToken}`);

                expect(response.status).toBe(403);
                expect(response.body.success).toBe(false);
            });
        });
    });

    describe('Usage API Endpoints', () => {
        describe('GET /api/v1/billing/usage', () => {
            it('should get user usage', async () => {
                const response = await request(app)
                    .get('/api/v1/billing/usage')
                    .set('Authorization', `Bearer ${userToken}`);

                expect(response.status).toBe(200);
                expect(response.body.success).toBe(true);
                expect(response.body.data.totalCost).toBeGreaterThanOrEqual(0);
                expect(response.body.data.vms).toBeInstanceOf(Array);
            });

            it('should filter usage by date range', async () => {
                const startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
                const endDate = new Date().toISOString();

                const response = await request(app)
                    .get('/api/v1/billing/usage')
                    .set('Authorization', `Bearer ${userToken}`)
                    .query({ startDate, endDate });

                expect(response.status).toBe(200);
                expect(response.body.success).toBe(true);
            });
        });

        describe('GET /api/v1/billing/usage/summary', () => {
            it('should get usage summary', async () => {
                const response = await request(app)
                    .get('/api/v1/billing/usage/summary')
                    .set('Authorization', `Bearer ${userToken}`)
                    .query({ groupBy: 'day' });

                expect(response.status).toBe(200);
                expect(response.body.success).toBe(true);
                expect(response.body.data.summary).toBeDefined();
                expect(response.body.data.breakdown).toBeInstanceOf(Array);
            });

            it('should support different grouping options', async () => {
                const response = await request(app)
                    .get('/api/v1/billing/usage/summary')
                    .set('Authorization', `Bearer ${userToken}`)
                    .query({ groupBy: 'hour' });

                expect(response.status).toBe(200);
                expect(response.body.success).toBe(true);
            });
        });

        describe('GET /api/v1/billing/usage/vm/:vmId', () => {
            it('should get VM usage', async () => {
                const response = await request(app)
                    .get(`/api/v1/billing/usage/vm/${testVM.id}`)
                    .set('Authorization', `Bearer ${userToken}`);

                expect(response.status).toBe(200);
                expect(response.body.success).toBe(true);
                expect(response.body.data).toBeInstanceOf(Array);
                expect(response.body.statistics).toBeDefined();
            });

            it('should support pagination', async () => {
                const response = await request(app)
                    .get(`/api/v1/billing/usage/vm/${testVM.id}`)
                    .set('Authorization', `Bearer ${userToken}`)
                    .query({ page: 1, limit: 2 });

                expect(response.status).toBe(200);
                expect(response.body.success).toBe(true);
                expect(response.body.pagination).toBeDefined();
                expect(response.body.pagination.page).toBe(1);
                expect(response.body.pagination.limit).toBe(2);
            });
        });
    });

    describe('Pricing API Endpoints', () => {
        describe('POST /api/v1/billing/pricing/estimate', () => {
            it('should calculate pricing estimate', async () => {
                const response = await request(app)
                    .post('/api/v1/billing/pricing/estimate')
                    .set('Authorization', `Bearer ${userToken}`)
                    .send({
                        cpu: 2,
                        ram: 2048,
                        storage: 40,
                        bandwidth: 1000,
                        duration: 24,
                    });

                expect(response.status).toBe(200);
                expect(response.body.success).toBe(true);
                expect(response.body.data.estimates).toBeDefined();
                expect(response.body.data.estimates.hourly).toBeGreaterThan(0);
                expect(response.body.data.estimates.daily).toBeGreaterThan(0);
                expect(response.body.data.estimates.custom).toBeGreaterThan(0);
            });

            it('should reject invalid resources', async () => {
                const response = await request(app)
                    .post('/api/v1/billing/pricing/estimate')
                    .set('Authorization', `Bearer ${userToken}`)
                    .send({
                        cpu: 0, // Invalid
                        ram: 100, // Too low
                        storage: 5, // Too low
                    });

                expect(response.status).toBe(400);
                expect(response.body.success).toBe(false);
            });

            it('should require authentication', async () => {
                const response = await request(app)
                    .post('/api/v1/billing/pricing/estimate')
                    .send({
                        cpu: 2,
                        ram: 2048,
                        storage: 40,
                    });

                expect(response.status).toBe(401);
                expect(response.body.success).toBe(false);
            });
        });
    });

    describe('Admin Invoice Operations', () => {
        describe('POST /api/v1/billing/invoices/generate/:userId', () => {
            it('should generate invoice for user as admin', async () => {
                // Create new user for this test
                const newUser = await AuthService.register({
                    email: 'invoice-gen-test@example.com',
                    password: 'TestPassword123!',
                    firstName: 'Invoice',
                    lastName: 'Gen',
                });

                await prisma.user.update({
                    where: { id: newUser.user.id },
                    data: { isVerified: true },
                });

                const newVM = await VMService.createVM(newUser.user.id, {
                    name: 'invoice-gen-vm',
                    cpu: 1,
                    ram: 1024,
                    storage: 20,
                });

                await BillingService.recordUsage(newVM.id, {
                    cpuUsage: 50,
                    ramUsage: 512,
                    storageUsage: 10,
                    bandwidthUsage: 200,
                    duration: 60,
                });

                const now = new Date();
                const response = await request(app)
                    .post(`/api/v1/billing/invoices/generate/${newUser.user.id}`)
                    .set('Authorization', `Bearer ${adminToken}`)
                    .send({
                        month: now.getMonth(),
                        year: now.getFullYear(),
                    });

                expect(response.status).toBe(201);
                expect(response.body.success).toBe(true);
                expect(response.body.data.invoice).toBeDefined();

                // Cleanup
                await prisma.invoice.deleteMany({ where: { userId: newUser.user.id } });
                await prisma.virtualMachine.delete({ where: { id: newVM.id } });
                await prisma.user.delete({ where: { id: newUser.user.id } });
            });

            it('should reject non-admin access', async () => {
                const response = await request(app)
                    .post(`/api/v1/billing/invoices/generate/${testUser.id}`)
                    .set('Authorization', `Bearer ${userToken}`)
                    .send({
                        month: 0,
                        year: 2024,
                    });

                expect(response.status).toBe(403);
                expect(response.body.success).toBe(false);
            });
        });

        describe('POST /api/v1/billing/invoices/mark-overdue', () => {
            it('should mark overdue invoices', async () => {
                const response = await request(app)
                    .post('/api/v1/billing/invoices/mark-overdue')
                    .set('Authorization', `Bearer ${adminToken}`);

                expect(response.status).toBe(200);
                expect(response.body.success).toBe(true);
                expect(response.body.data.updated).toBeGreaterThanOrEqual(0);
            });
        });
    });

    describe('Health Check', () => {
        it('should return healthy status', async () => {
            const response = await request(app).get('/api/v1/billing/health');

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.message).toContain('healthy');
        });
    });
});
