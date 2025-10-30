const request = require('supertest');
const express = require('express');
const { AuthMiddleware, authenticate, requireRole, requireAdmin } = require('../src/middlewares/auth');
const { RBACMiddleware, requirePermission } = require('../src/middlewares/rbac');
const { SecurityMiddleware, authRateLimit, sanitizeInput, xssProtection } = require('../src/middlewares/security');
const JWTUtils = require('../src/utils/jwt');
const { prisma } = require('../src/config/database');

// Create test app
const createTestApp = (middleware) => {
  const app = express();
  app.use(express.json());
  
  if (Array.isArray(middleware)) {
    middleware.forEach(m => app.use(m));
  } else {
    app.use(middleware);
  }
  
  app.get('/test', (req, res) => {
    res.json({ success: true, user: req.user });
  });
  
  app.post('/test', (req, res) => {
    res.json({ success: true, body: req.body });
  });
  
  return app;
};

// Test user data
const testUser = {
  id: 'test-user-id',
  email: 'test@example.com',
  role: 'USER',
  isVerified: true,
  firstName: 'Test',
  lastName: 'User',
};

const testAdmin = {
  id: 'test-admin-id',
  email: 'admin@example.com',
  role: 'ADMIN',
  isVerified: true,
  firstName: 'Test',
  lastName: 'Admin',
};

describe('Authentication Middleware', () => {
  let userToken;
  let adminToken;

  beforeAll(() => {
    // Generate test tokens
    userToken = JWTUtils.generateAccessToken({
      userId: testUser.id,
      email: testUser.email,
      role: testUser.role,
    });

    adminToken = JWTUtils.generateAccessToken({
      userId: testAdmin.id,
      email: testAdmin.email,
      role: testAdmin.role,
    });
  });

  beforeEach(async () => {
    // Mock user lookup
    jest.spyOn(prisma.user, 'findUnique').mockImplementation((args) => {
      if (args.where.id === testUser.id) {
        return Promise.resolve({ ...testUser, isActive: true });
      }
      if (args.where.id === testAdmin.id) {
        return Promise.resolve({ ...testAdmin, isActive: true });
      }
      return Promise.resolve(null);
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('authenticate middleware', () => {
    test('should authenticate valid token', async () => {
      const app = createTestApp(authenticate);

      const response = await request(app)
        .get('/test')
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.user.userId).toBe(testUser.id);
    });

    test('should reject request without token', async () => {
      const app = createTestApp(authenticate);

      const response = await request(app).get('/test');

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Authentication required');
    });

    test('should reject invalid token', async () => {
      const app = createTestApp(authenticate);

      const response = await request(app)
        .get('/test')
        .set('Authorization', 'Bearer invalid-token');

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });

    test('should reject token for inactive user', async () => {
      // Mock inactive user
      jest.spyOn(prisma.user, 'findUnique').mockResolvedValue({
        ...testUser,
        isActive: false,
      });

      const app = createTestApp(authenticate);

      const response = await request(app)
        .get('/test')
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Account deactivated');
    });
  });

  describe('requireRole middleware', () => {
    test('should allow user with correct role', async () => {
      const app = createTestApp([authenticate, requireRole('USER')]);

      const response = await request(app)
        .get('/test')
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    test('should reject user with incorrect role', async () => {
      const app = createTestApp([authenticate, requireRole('ADMIN')]);

      const response = await request(app)
        .get('/test')
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(403);
      expect(response.body.error).toBe('Insufficient permissions');
    });

    test('should allow admin access', async () => {
      const app = createTestApp([authenticate, requireAdmin]);

      const response = await request(app)
        .get('/test')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });
});

describe('RBAC Middleware', () => {
  let userToken;
  let adminToken;

  beforeAll(() => {
    userToken = JWTUtils.generateAccessToken({
      userId: testUser.id,
      email: testUser.email,
      role: testUser.role,
    });

    adminToken = JWTUtils.generateAccessToken({
      userId: testAdmin.id,
      email: testAdmin.email,
      role: testAdmin.role,
    });
  });

  beforeEach(async () => {
    jest.spyOn(prisma.user, 'findUnique').mockImplementation((args) => {
      if (args.where.id === testUser.id) {
        return Promise.resolve({ ...testUser, isActive: true });
      }
      if (args.where.id === testAdmin.id) {
        return Promise.resolve({ ...testAdmin, isActive: true });
      }
      return Promise.resolve(null);
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('requirePermission middleware', () => {
    test('should allow user with correct permission', async () => {
      const app = createTestApp([
        authenticate,
        requirePermission('profile:read')
      ]);

      const response = await request(app)
        .get('/test')
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    test('should reject user without permission', async () => {
      const app = createTestApp([
        authenticate,
        requirePermission('user:delete')
      ]);

      const response = await request(app)
        .get('/test')
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(403);
      expect(response.body.error).toBe('Insufficient permissions');
    });

    test('should allow admin with admin permission', async () => {
      const app = createTestApp([
        authenticate,
        requirePermission('user:read:all')
      ]);

      const response = await request(app)
        .get('/test')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });

  describe('permission utilities', () => {
    test('should get permissions for role', () => {
      const userPermissions = RBACMiddleware.getPermissionsForRole('USER');
      const adminPermissions = RBACMiddleware.getPermissionsForRole('ADMIN');

      expect(userPermissions).toContain('profile:read');
      expect(userPermissions).toContain('vm:create');
      expect(adminPermissions).toContain('user:read:all');
      expect(adminPermissions.length).toBeGreaterThan(userPermissions.length);
    });

    test('should check if role has permission', () => {
      expect(RBACMiddleware.roleHasPermission('USER', 'profile:read')).toBe(true);
      expect(RBACMiddleware.roleHasPermission('USER', 'user:delete')).toBe(false);
      expect(RBACMiddleware.roleHasPermission('ADMIN', 'user:read:all')).toBe(true);
    });

    test('should get minimum role for permission', () => {
      expect(RBACMiddleware.getMinimumRoleForPermission('profile:read')).toBe('USER');
      expect(RBACMiddleware.getMinimumRoleForPermission('user:read:all')).toBe('ADMIN');
      expect(RBACMiddleware.getMinimumRoleForPermission('system:backup')).toBe('SUPER_ADMIN');
    });
  });
});

describe('Security Middleware', () => {
  describe('sanitizeInput middleware', () => {
    test('should sanitize malicious input', async () => {
      const app = createTestApp(sanitizeInput());

      const maliciousData = {
        name: '<script>alert("xss")</script>John',
        email: 'test@example.com',
        description: 'Hello <b>world</b>',
      };

      const response = await request(app)
        .post('/test')
        .send(maliciousData);

      expect(response.status).toBe(200);
      expect(response.body.body.name).not.toContain('<script>');
      expect(response.body.body.name).toBe('John');
      expect(response.body.body.description).not.toContain('<b>');
    });

    test('should preserve safe input', async () => {
      const app = createTestApp(sanitizeInput());

      const safeData = {
        name: 'John Doe',
        email: 'john@example.com',
        age: 30,
      };

      const response = await request(app)
        .post('/test')
        .send(safeData);

      expect(response.status).toBe(200);
      expect(response.body.body).toEqual(safeData);
    });
  });

  describe('xssProtection middleware', () => {
    test('should block XSS attempts', async () => {
      const app = createTestApp(xssProtection());

      const xssData = {
        comment: '<script>alert("xss")</script>',
      };

      const response = await request(app)
        .post('/test')
        .send(xssData);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Invalid input detected');
    });

    test('should allow safe content', async () => {
      const app = createTestApp(xssProtection());

      const safeData = {
        comment: 'This is a safe comment',
      };

      const response = await request(app)
        .post('/test')
        .send(safeData);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });

  describe('rate limiting', () => {
    test('should allow requests within limit', async () => {
      const app = createTestApp(
        SecurityMiddleware.createAdvancedRateLimit({
          windowMs: 60000,
          max: 5,
        })
      );

      // Make 3 requests (within limit)
      for (let i = 0; i < 3; i++) {
        const response = await request(app).get('/test');
        expect(response.status).toBe(200);
      }
    });

    test('should block requests exceeding limit', async () => {
      const app = createTestApp(
        SecurityMiddleware.createAdvancedRateLimit({
          windowMs: 60000,
          max: 2,
        })
      );

      // Make requests up to limit
      await request(app).get('/test');
      await request(app).get('/test');

      // This should be blocked
      const response = await request(app).get('/test');
      expect(response.status).toBe(429);
      expect(response.body.error).toBe('Rate limit exceeded');
    });
  });

  describe('request size limiting', () => {
    test('should allow requests within size limit', async () => {
      const app = createTestApp(
        SecurityMiddleware.requestSizeLimit({ maxSize: 1024 })
      );

      const smallData = { message: 'small' };

      const response = await request(app)
        .post('/test')
        .send(smallData);

      expect(response.status).toBe(200);
    });

    test('should block oversized requests', async () => {
      const app = express();
      app.use(express.json());
      app.use(SecurityMiddleware.requestSizeLimit({ maxSize: 100 }));
      
      app.post('/test', (req, res) => {
        res.json({ success: true });
      });

      const largeData = { message: 'x'.repeat(200) };

      const response = await request(app)
        .post('/test')
        .set('Content-Length', JSON.stringify(largeData).length.toString())
        .send(largeData);

      expect(response.status).toBe(413);
      expect(response.body.error).toBe('Request too large');
    });
  });

  describe('IP filtering', () => {
    test('should allow whitelisted IPs', async () => {
      const app = createTestApp(
        SecurityMiddleware.ipFilter({
          whitelist: ['127.0.0.1', '::1'],
        })
      );

      const response = await request(app).get('/test');
      expect(response.status).toBe(200);
    });

    test('should block blacklisted IPs', async () => {
      const app = express();
      app.use(express.json());
      
      // Mock req.ip to simulate blacklisted IP
      app.use((req, res, next) => {
        req.ip = '192.168.1.100';
        next();
      });
      
      app.use(SecurityMiddleware.ipFilter({
        blacklist: ['192.168.1.100'],
      }));
      
      app.get('/test', (req, res) => {
        res.json({ success: true });
      });

      const response = await request(app).get('/test');
      expect(response.status).toBe(403);
      expect(response.body.error).toBe('Access denied');
    });
  });
});

describe('Middleware Integration', () => {
  let userToken;

  beforeAll(() => {
    userToken = JWTUtils.generateAccessToken({
      userId: testUser.id,
      email: testUser.email,
      role: testUser.role,
    });
  });

  beforeEach(async () => {
    jest.spyOn(prisma.user, 'findUnique').mockResolvedValue({
      ...testUser,
      isActive: true,
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('should work with combined middleware', async () => {
    const app = express();
    app.use(express.json());
    
    // Apply multiple middleware
    app.use(sanitizeInput());
    app.use(xssProtection());
    
    app.get('/protected', 
      authenticate,
      requirePermission('profile:read'),
      (req, res) => {
        res.json({ 
          success: true, 
          user: req.user,
          permissions: req.userPermissions 
        });
      }
    );

    const response = await request(app)
      .get('/protected')
      .set('Authorization', `Bearer ${userToken}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.user.userId).toBe(testUser.id);
  });

  test('should handle middleware chain failures', async () => {
    const app = express();
    app.use(express.json());
    
    app.get('/protected',
      authenticate, // This will fail without token
      requirePermission('profile:read'),
      (req, res) => {
        res.json({ success: true });
      }
    );

    const response = await request(app).get('/protected');

    expect(response.status).toBe(401);
    expect(response.body.success).toBe(false);
  });
});