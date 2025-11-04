const request = require('supertest');
const app = require('../src/index');
const { PrismaClient } = require('@prisma/client');
const jwt = require('jsonwebtoken');

const prisma = new PrismaClient();

// Helper function to generate JWT token
const generateToken = (userId, role = 'USER') => {
  return jwt.sign(
    { id: userId, role },
    process.env.JWT_SECRET || 'test-secret',
    { expiresIn: '1h' }
  );
};

describe('Solar Energy Monitoring API Integration Tests', () => {
  let userToken;
  let adminToken;
  let testUser;
  let testAdmin;

  beforeAll(async () => {
    // Create test user
    testUser = await prisma.user.create({
      data: {
        email: 'testuser@solar.com',
        password: 'hashedpassword',
        firstName: 'Test',
        lastName: 'User',
        role: 'USER',
        isActive: true,
        isVerified: true
      }
    });

    // Create test admin
    testAdmin = await prisma.user.create({
      data: {
        email: 'testadmin@solar.com',
        password: 'hashedpassword',
        firstName: 'Test',
        lastName: 'Admin',
        role: 'ADMIN',
        isActive: true,
        isVerified: true
      }
    });

    userToken = generateToken(testUser.id, 'USER');
    adminToken = generateToken(testAdmin.id, 'ADMIN');
  });

  afterAll(async () => {
    // Cleanup
    await prisma.user.deleteMany({
      where: {
        email: {
          in: ['testuser@solar.com', 'testadmin@solar.com']
        }
      }
    });
    await prisma.$disconnect();
  });

  describe('GET /api/v1/solar/status', () => {
    it('should return system status for authenticated user', async () => {
      const response = await request(app)
        .get('/api/v1/solar/status')
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('status');
      expect(response.body.data).toHaveProperty('production');
      expect(response.body.data).toHaveProperty('consumption');
      expect(response.body.data).toHaveProperty('efficiency');
    });

    it('should return 401 for unauthenticated request', async () => {
      const response = await request(app)
        .get('/api/v1/solar/status');

      expect(response.status).toBe(401);
    });
  });

  describe('GET /api/v1/solar/production', () => {
    it('should return current production data', async () => {
      const response = await request(app)
        .get('/api/v1/solar/production')
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('production');
      expect(response.body.data).toHaveProperty('timestamp');
      expect(typeof response.body.data.production).toBe('number');
    });
  });

  describe('GET /api/v1/solar/consumption', () => {
    it('should return current consumption data', async () => {
      const response = await request(app)
        .get('/api/v1/solar/consumption')
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('consumption');
      expect(response.body.data).toHaveProperty('vmCount');
      expect(response.body.data).toHaveProperty('timestamp');
    });
  });

  describe('GET /api/v1/solar/environmental-impact', () => {
    it('should return environmental impact for default period', async () => {
      const response = await request(app)
        .get('/api/v1/solar/environmental-impact')
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('period');
      expect(response.body.data).toHaveProperty('environmentalImpact');
      expect(response.body.data.environmentalImpact).toHaveProperty('co2Saved');
      expect(response.body.data.environmentalImpact).toHaveProperty('treesEquivalent');
    });

    it('should accept period query parameter', async () => {
      const response = await request(app)
        .get('/api/v1/solar/environmental-impact?period=week')
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data.period).toBe('week');
    });
  });

  describe('GET /api/v1/solar/statistics', () => {
    it('should return solar statistics', async () => {
      const response = await request(app)
        .get('/api/v1/solar/statistics')
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('totalProduction');
      expect(response.body.data).toHaveProperty('totalConsumption');
      expect(response.body.data).toHaveProperty('averageEfficiency');
      expect(response.body.data).toHaveProperty('environmentalImpact');
    });

    it('should validate period parameter', async () => {
      const response = await request(app)
        .get('/api/v1/solar/statistics?period=invalid')
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it('should accept valid period values', async () => {
      const periods = ['day', 'week', 'month'];

      for (const period of periods) {
        const response = await request(app)
          .get(`/api/v1/solar/statistics?period=${period}`)
          .set('Authorization', `Bearer ${userToken}`);

        expect(response.status).toBe(200);
        expect(response.body.data.period).toBe(period);
      }
    });
  });

  describe('GET /api/v1/solar/history', () => {
    it('should return solar data history', async () => {
      const response = await request(app)
        .get('/api/v1/solar/history')
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body).toHaveProperty('count');
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('should accept date range parameters', async () => {
      const startDate = new Date('2024-01-01').toISOString();
      const endDate = new Date('2024-01-31').toISOString();

      const response = await request(app)
        .get(`/api/v1/solar/history?startDate=${startDate}&endDate=${endDate}`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(200);
    });

    it('should validate date format', async () => {
      const response = await request(app)
        .get('/api/v1/solar/history?startDate=invalid-date')
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(400);
    });

    it('should validate date range', async () => {
      const startDate = new Date('2024-01-31').toISOString();
      const endDate = new Date('2024-01-01').toISOString();

      const response = await request(app)
        .get(`/api/v1/solar/history?startDate=${startDate}&endDate=${endDate}`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(400);
    });
  });

  describe('GET /api/v1/solar/battery (Admin Only)', () => {
    it('should return battery level for admin', async () => {
      const response = await request(app)
        .get('/api/v1/solar/battery')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('level');
      expect(response.body.data).toHaveProperty('timestamp');
    });

    it('should deny access for regular user', async () => {
      const response = await request(app)
        .get('/api/v1/solar/battery')
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(403);
    });
  });

  describe('POST /api/v1/solar/collect (Admin Only)', () => {
    it('should trigger data collection for admin', async () => {
      const response = await request(app)
        .post('/api/v1/solar/collect')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('collected');
    });

    it('should deny access for regular user', async () => {
      const response = await request(app)
        .post('/api/v1/solar/collect')
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(403);
    });
  });

  describe('GET /api/v1/solar/alerts (Admin Only)', () => {
    it('should return active alerts for admin', async () => {
      const response = await request(app)
        .get('/api/v1/solar/alerts')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body).toHaveProperty('count');
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('should deny access for regular user', async () => {
      const response = await request(app)
        .get('/api/v1/solar/alerts')
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(403);
    });
  });

  describe('PUT /api/v1/solar/alerts/:id/resolve (Admin Only)', () => {
    let testAlert;

    beforeAll(async () => {
      // Create a test alert
      testAlert = await prisma.solarAlert.create({
        data: {
          type: 'TEST_ALERT',
          severity: 'WARNING',
          message: 'Test alert for API testing',
          resolved: false
        }
      });
    });

    afterAll(async () => {
      // Cleanup
      await prisma.solarAlert.deleteMany({
        where: { type: 'TEST_ALERT' }
      });
    });

    it('should resolve alert for admin', async () => {
      const response = await request(app)
        .put(`/api/v1/solar/alerts/${testAlert.id}/resolve`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.resolved).toBe(true);
    });

    it('should deny access for regular user', async () => {
      const response = await request(app)
        .put(`/api/v1/solar/alerts/${testAlert.id}/resolve`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(403);
    });
  });

  describe('GET /api/v1/solar/emergency-logs (Admin Only)', () => {
    it('should return emergency logs for admin', async () => {
      const response = await request(app)
        .get('/api/v1/solar/emergency-logs')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('should accept limit parameter', async () => {
      const response = await request(app)
        .get('/api/v1/solar/emergency-logs?limit=10')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
    });

    it('should accept severity filter', async () => {
      const response = await request(app)
        .get('/api/v1/solar/emergency-logs?severity=CRITICAL')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
    });

    it('should deny access for regular user', async () => {
      const response = await request(app)
        .get('/api/v1/solar/emergency-logs')
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(403);
    });
  });

  describe('GET /api/v1/solar/system-state (Admin Only)', () => {
    it('should return system state for admin', async () => {
      const response = await request(app)
        .get('/api/v1/solar/system-state')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('state');
      expect(['NORMAL', 'WARNING', 'CRITICAL', 'EMERGENCY']).toContain(response.body.data.state);
    });

    it('should deny access for regular user', async () => {
      const response = await request(app)
        .get('/api/v1/solar/system-state')
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(403);
    });
  });

  describe('POST /api/v1/solar/reset-state (Admin Only)', () => {
    it('should reset system state for admin', async () => {
      const response = await request(app)
        .post('/api/v1/solar/reset-state')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('reset');
    });

    it('should deny access for regular user', async () => {
      const response = await request(app)
        .post('/api/v1/solar/reset-state')
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(403);
    });
  });

  describe('POST /api/v1/solar/emergency/:severity (Admin Only)', () => {
    it('should trigger WARNING emergency plan for admin', async () => {
      const response = await request(app)
        .post('/api/v1/solar/emergency/WARNING')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('WARNING');
    });

    it('should trigger CRITICAL emergency plan for admin', async () => {
      const response = await request(app)
        .post('/api/v1/solar/emergency/CRITICAL')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('CRITICAL');
    });

    it('should reject invalid severity level', async () => {
      const response = await request(app)
        .post('/api/v1/solar/emergency/INVALID')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(400);
    });

    it('should deny access for regular user', async () => {
      const response = await request(app)
        .post('/api/v1/solar/emergency/WARNING')
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(403);
    });
  });
});
