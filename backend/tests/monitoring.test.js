const monitoringService = require('../src/services/monitoringService');
const redisService = require('../src/services/redisService');

describe('Monitoring Service', () => {
  beforeAll(async () => {
    await redisService.connect();
  });

  afterAll(async () => {
    await redisService.disconnect();
  });

  describe('Health Checks', () => {
    it('should get overall health status', async () => {
      const health = await monitoringService.getHealthStatus();

      expect(health).toHaveProperty('status');
      expect(health).toHaveProperty('timestamp');
      expect(health).toHaveProperty('uptime');
      expect(health).toHaveProperty('checks');
      expect(Array.isArray(health.checks)).toBe(true);
    });

    it('should check database health', async () => {
      const dbHealth = await monitoringService.checkDatabase();

      expect(dbHealth).toHaveProperty('healthy');
      expect(dbHealth).toHaveProperty('message');
      
      if (dbHealth.healthy) {
        expect(dbHealth).toHaveProperty('responseTime');
      }
    });

    it('should check Redis health', async () => {
      const redisHealth = await monitoringService.checkRedis();

      expect(redisHealth).toHaveProperty('healthy');
      expect(redisHealth).toHaveProperty('message');
    });

    it('should check memory usage', () => {
      const memoryHealth = monitoringService.checkMemory();

      expect(memoryHealth).toHaveProperty('healthy');
      expect(memoryHealth).toHaveProperty('total');
      expect(memoryHealth).toHaveProperty('used');
      expect(memoryHealth).toHaveProperty('free');
      expect(memoryHealth).toHaveProperty('usagePercentage');
      expect(typeof memoryHealth.usagePercentage).toBe('number');
    });

    it('should check CPU usage', () => {
      const cpuHealth = monitoringService.checkCPU();

      expect(cpuHealth).toHaveProperty('healthy');
      expect(cpuHealth).toHaveProperty('cores');
      expect(cpuHealth).toHaveProperty('model');
      expect(cpuHealth).toHaveProperty('usagePercentage');
      expect(typeof cpuHealth.usagePercentage).toBe('number');
    });

    it('should check disk usage', () => {
      const diskHealth = monitoringService.checkDisk();

      expect(diskHealth).toHaveProperty('healthy');
      expect(diskHealth).toHaveProperty('loadAverage');
      expect(Array.isArray(diskHealth.loadAverage)).toBe(true);
    });
  });

  describe('System Information', () => {
    it('should get system information', () => {
      const systemInfo = monitoringService.getSystemInfo();

      expect(systemInfo).toHaveProperty('platform');
      expect(systemInfo).toHaveProperty('arch');
      expect(systemInfo).toHaveProperty('hostname');
      expect(systemInfo).toHaveProperty('nodeVersion');
      expect(systemInfo).toHaveProperty('cpus');
      expect(systemInfo).toHaveProperty('totalMemory');
      expect(systemInfo).toHaveProperty('freeMemory');
      expect(systemInfo).toHaveProperty('uptime');
    });

    it('should get uptime', () => {
      const uptime = monitoringService.getUptime();

      expect(uptime).toHaveProperty('application');
      expect(uptime).toHaveProperty('system');
      expect(typeof uptime.application).toBe('string');
      expect(typeof uptime.system).toBe('string');
    });
  });

  describe('Metrics', () => {
    beforeEach(() => {
      monitoringService.resetMetrics();
    });

    it('should record request metrics', () => {
      monitoringService.recordRequest(100, true);
      monitoringService.recordRequest(200, true);
      monitoringService.recordRequest(150, false);

      const metrics = monitoringService.getMetrics();

      expect(metrics.requests.total).toBe(3);
      expect(metrics.requests.success).toBe(2);
      expect(metrics.requests.errors).toBe(1);
      expect(metrics.requests.errorRate).toBe(33.33);
    });

    it('should calculate average response time', () => {
      monitoringService.recordRequest(100, true);
      monitoringService.recordRequest(200, true);
      monitoringService.recordRequest(300, true);

      const metrics = monitoringService.getMetrics();

      expect(metrics.performance.avgResponseTime).toBe(200);
    });

    it('should track max response time', () => {
      monitoringService.recordRequest(100, true);
      monitoringService.recordRequest(500, true);
      monitoringService.recordRequest(200, true);

      const metrics = monitoringService.getMetrics();

      expect(metrics.performance.maxResponseTime).toBe(500);
    });

    it('should track min response time', () => {
      monitoringService.recordRequest(100, true);
      monitoringService.recordRequest(50, true);
      monitoringService.recordRequest(200, true);

      const metrics = monitoringService.getMetrics();

      expect(metrics.performance.minResponseTime).toBe(50);
    });

    it('should reset metrics', () => {
      monitoringService.recordRequest(100, true);
      monitoringService.recordRequest(200, true);

      monitoringService.resetMetrics();
      const metrics = monitoringService.getMetrics();

      expect(metrics.requests.total).toBe(0);
      expect(metrics.requests.success).toBe(0);
      expect(metrics.requests.errors).toBe(0);
    });

    it('should get metrics with timestamp', () => {
      const metrics = monitoringService.getMetrics();

      expect(metrics).toHaveProperty('timestamp');
      expect(metrics).toHaveProperty('uptime');
    });
  });

  describe('Utility Functions', () => {
    it('should format bytes correctly', () => {
      expect(monitoringService.formatBytes(0)).toBe('0 Bytes');
      expect(monitoringService.formatBytes(1024)).toBe('1 KB');
      expect(monitoringService.formatBytes(1048576)).toBe('1 MB');
      expect(monitoringService.formatBytes(1073741824)).toBe('1 GB');
    });

    it('should format uptime correctly', () => {
      expect(monitoringService.formatUptime(0)).toBe('0s');
      expect(monitoringService.formatUptime(60)).toBe('1m');
      expect(monitoringService.formatUptime(3600)).toBe('1h');
      expect(monitoringService.formatUptime(86400)).toBe('1d');
      expect(monitoringService.formatUptime(90061)).toBe('1d 1h 1m 1s');
    });
  });

  describe('Detailed Health Report', () => {
    it('should get detailed health report', async () => {
      const report = await monitoringService.getDetailedHealthReport();

      expect(report).toHaveProperty('status');
      expect(report).toHaveProperty('checks');
      expect(report).toHaveProperty('metrics');
      expect(report).toHaveProperty('system');
    });
  });
});
