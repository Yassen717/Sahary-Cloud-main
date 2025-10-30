const request = require('supertest');
const app = require('../src/index');
const dockerService = require('../src/services/dockerService');

// Mock Docker service
jest.mock('../src/services/dockerService');

describe('Docker API Tests', () => {
  let authToken;
  let adminToken;

  beforeAll(async () => {
    // Mock authentication tokens
    authToken = 'mock-user-token';
    adminToken = 'mock-admin-token';
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/v1/docker/containers', () => {
    const validContainerConfig = {
      vmId: 'test-vm-id',
      name: 'test-container',
      image: 'ubuntu:latest',
      cpu: 1,
      ram: 1024,
      storage: 10,
      ports: [
        { containerPort: 80, hostPort: 8080 },
        { containerPort: 443, hostPort: 8443 }
      ],
      environment: ['NODE_ENV=production'],
      volumes: ['/host/path:/container/path']
    };

    it('should create container successfully with valid data', async () => {
      const mockContainerInfo = {
        containerId: 'mock-container-id',
        name: '/sahary-vm-test-vm-id',
        status: 'created',
        created: '2024-01-01T00:00:00.000Z',
        image: 'ubuntu:latest',
        ports: [
          { containerPort: 80, hostPort: 8080, protocol: 'tcp' },
          { containerPort: 443, hostPort: 8443, protocol: 'tcp' }
        ],
        ipAddress: '172.20.0.2'
      };

      dockerService.createContainer.mockResolvedValue(mockContainerInfo);

      const response = await request(app)
        .post('/api/v1/docker/containers')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(validContainerConfig);

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Container created successfully');
      expect(response.body.data).toEqual(mockContainerInfo);
      expect(dockerService.createContainer).toHaveBeenCalledWith(validContainerConfig);
    });

    it('should return 400 for invalid container configuration', async () => {
      const invalidConfig = {
        vmId: '', // Invalid: empty VM ID
        name: 'test-container',
        cpu: 0, // Invalid: CPU too low
        ram: 50, // Invalid: RAM too low
        storage: 0 // Invalid: storage too low
      };

      const response = await request(app)
        .post('/api/v1/docker/containers')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(invalidConfig);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Validation failed');
      expect(response.body.errors).toBeDefined();
    });

    it('should return 403 for non-admin users', async () => {
      const response = await request(app)
        .post('/api/v1/docker/containers')
        .set('Authorization', `Bearer ${authToken}`)
        .send(validContainerConfig);

      expect(response.status).toBe(403);
    });

    it('should handle Docker service errors', async () => {
      dockerService.createContainer.mockRejectedValue(new Error('Docker daemon not available'));

      const response = await request(app)
        .post('/api/v1/docker/containers')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(validContainerConfig);

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Failed to create container');
      expect(response.body.error).toBe('Docker daemon not available');
    });
  });

  describe('POST /api/v1/docker/containers/:containerId/start', () => {
    const containerId = 'mock-container-id-12345';

    it('should start container successfully', async () => {
      const mockContainerStatus = {
        containerId,
        status: 'running',
        startedAt: '2024-01-01T00:00:00.000Z',
        ipAddress: '172.20.0.2',
        ports: [
          { containerPort: 80, hostPort: 8080, protocol: 'tcp' }
        ]
      };

      dockerService.startContainer.mockResolvedValue(mockContainerStatus);

      const response = await request(app)
        .post(`/api/v1/docker/containers/${containerId}/start`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Container started successfully');
      expect(response.body.data).toEqual(mockContainerStatus);
      expect(dockerService.startContainer).toHaveBeenCalledWith(containerId);
    });

    it('should return 400 for invalid container ID', async () => {
      const response = await request(app)
        .post('/api/v1/docker/containers/invalid-id/start')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it('should handle container start errors', async () => {
      dockerService.startContainer.mockRejectedValue(new Error('Container not found'));

      const response = await request(app)
        .post(`/api/v1/docker/containers/${containerId}/start`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Failed to start container');
    });
  });

  describe('POST /api/v1/docker/containers/:containerId/stop', () => {
    const containerId = 'mock-container-id-12345';

    it('should stop container successfully', async () => {
      const mockContainerStatus = {
        containerId,
        status: 'exited',
        finishedAt: '2024-01-01T00:00:00.000Z'
      };

      dockerService.stopContainer.mockResolvedValue(mockContainerStatus);

      const response = await request(app)
        .post(`/api/v1/docker/containers/${containerId}/stop`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ timeout: 30 });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Container stopped successfully');
      expect(response.body.data).toEqual(mockContainerStatus);
      expect(dockerService.stopContainer).toHaveBeenCalledWith(containerId, 30);
    });

    it('should use default timeout when not provided', async () => {
      const mockContainerStatus = {
        containerId,
        status: 'exited',
        finishedAt: '2024-01-01T00:00:00.000Z'
      };

      dockerService.stopContainer.mockResolvedValue(mockContainerStatus);

      const response = await request(app)
        .post(`/api/v1/docker/containers/${containerId}/stop`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(dockerService.stopContainer).toHaveBeenCalledWith(containerId, 10);
    });
  });

  describe('GET /api/v1/docker/containers/:containerId/status', () => {
    const containerId = 'mock-container-id-12345';

    it('should get container status successfully', async () => {
      const mockContainerStatus = {
        containerId,
        name: '/sahary-vm-test',
        status: 'running',
        running: true,
        paused: false,
        restarting: false,
        exitCode: 0,
        error: '',
        startedAt: '2024-01-01T00:00:00.000Z',
        finishedAt: null,
        image: 'ubuntu:latest',
        ipAddress: '172.20.0.2',
        ports: [],
        stats: {
          timestamp: '2024-01-01T00:00:00.000Z',
          cpu: { usage: 25.5 },
          memory: { used: 512000000, limit: 1073741824, percentage: 47.7 },
          network: { rxBytes: 1024, txBytes: 2048, totalBytes: 3072 },
          blockIO: { readBytes: 4096, writeBytes: 8192, totalBytes: 12288 }
        }
      };

      dockerService.getContainerStatus.mockResolvedValue(mockContainerStatus);

      const response = await request(app)
        .get(`/api/v1/docker/containers/${containerId}/status`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(mockContainerStatus);
      expect(dockerService.getContainerStatus).toHaveBeenCalledWith(containerId);
    });

    it('should return 404 when container not found', async () => {
      dockerService.getContainerStatus.mockResolvedValue(null);

      const response = await request(app)
        .get(`/api/v1/docker/containers/${containerId}/status`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Container not found');
    });
  });

  describe('GET /api/v1/docker/containers', () => {
    it('should list containers successfully', async () => {
      const mockContainers = [
        {
          containerId: 'container-1',
          names: ['/sahary-vm-1'],
          image: 'ubuntu:latest',
          status: 'Up 2 hours',
          state: 'running',
          created: 1704067200,
          ports: [],
          labels: {
            'sahary.vm.id': 'vm-1',
            'sahary.vm.name': 'test-vm-1',
            'sahary.managed': 'true'
          },
          vmId: 'vm-1',
          vmName: 'test-vm-1'
        },
        {
          containerId: 'container-2',
          names: ['/sahary-vm-2'],
          image: 'nginx:latest',
          status: 'Exited (0) 1 hour ago',
          state: 'exited',
          created: 1704063600,
          ports: [],
          labels: {
            'sahary.vm.id': 'vm-2',
            'sahary.vm.name': 'test-vm-2',
            'sahary.managed': 'true'
          },
          vmId: 'vm-2',
          vmName: 'test-vm-2'
        }
      ];

      dockerService.listContainers.mockResolvedValue(mockContainers);

      const response = await request(app)
        .get('/api/v1/docker/containers')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(mockContainers);
      expect(response.body.count).toBe(2);
      expect(dockerService.listContainers).toHaveBeenCalledWith({});
    });

    it('should filter containers by VM ID', async () => {
      const vmId = 'vm-1';
      const mockContainers = [
        {
          containerId: 'container-1',
          names: ['/sahary-vm-1'],
          vmId: 'vm-1',
          vmName: 'test-vm-1'
        }
      ];

      dockerService.listContainers.mockResolvedValue(mockContainers);

      const response = await request(app)
        .get(`/api/v1/docker/containers?vmId=${vmId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data).toEqual(mockContainers);
      expect(dockerService.listContainers).toHaveBeenCalledWith({
        label: [`sahary.vm.id=${vmId}`]
      });
    });

    it('should filter containers by status', async () => {
      const status = 'running';
      const mockContainers = [
        {
          containerId: 'container-1',
          status: 'Up 2 hours',
          state: 'running'
        }
      ];

      dockerService.listContainers.mockResolvedValue(mockContainers);

      const response = await request(app)
        .get(`/api/v1/docker/containers?status=${status}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(dockerService.listContainers).toHaveBeenCalledWith({
        status: [status]
      });
    });
  });

  describe('GET /api/v1/docker/containers/:containerId/logs', () => {
    const containerId = 'mock-container-id-12345';

    it('should get container logs successfully', async () => {
      const mockLogs = '2024-01-01T00:00:00.000Z Container started\n2024-01-01T00:01:00.000Z Application ready';

      dockerService.getContainerLogs.mockResolvedValue(mockLogs);

      const response = await request(app)
        .get(`/api/v1/docker/containers/${containerId}/logs?tail=100&timestamps=true`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.containerId).toBe(containerId);
      expect(response.body.data.logs).toBe(mockLogs);
      expect(dockerService.getContainerLogs).toHaveBeenCalledWith(containerId, {
        tail: 100,
        since: undefined,
        until: undefined,
        timestamps: true
      });
    });

    it('should use default parameters when not provided', async () => {
      const mockLogs = 'Default logs';

      dockerService.getContainerLogs.mockResolvedValue(mockLogs);

      const response = await request(app)
        .get(`/api/v1/docker/containers/${containerId}/logs`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(dockerService.getContainerLogs).toHaveBeenCalledWith(containerId, {
        tail: 100,
        since: undefined,
        until: undefined,
        timestamps: true
      });
    });
  });

  describe('POST /api/v1/docker/containers/:containerId/exec', () => {
    const containerId = 'mock-container-id-12345';

    it('should execute command in container successfully', async () => {
      const command = ['ls', '-la', '/app'];
      const mockResult = {
        exitCode: 0,
        output: 'total 4\ndrwxr-xr-x 2 root root 4096 Jan  1 00:00 .',
        command: 'ls -la /app'
      };

      dockerService.execInContainer.mockResolvedValue(mockResult);

      const response = await request(app)
        .post(`/api/v1/docker/containers/${containerId}/exec`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ command });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(mockResult);
      expect(dockerService.execInContainer).toHaveBeenCalledWith(containerId, command);
    });

    it('should return 400 for invalid command format', async () => {
      const response = await request(app)
        .post(`/api/v1/docker/containers/${containerId}/exec`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ command: 'invalid-command-string' });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/v1/docker/images/pull', () => {
    it('should pull image successfully', async () => {
      const imageName = 'nginx:latest';

      dockerService.pullImage.mockResolvedValue();

      const response = await request(app)
        .post('/api/v1/docker/images/pull')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ imageName });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe(`Image ${imageName} pulled successfully`);
      expect(dockerService.pullImage).toHaveBeenCalledWith(imageName);
    });

    it('should return 403 for non-admin users', async () => {
      const response = await request(app)
        .post('/api/v1/docker/images/pull')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ imageName: 'nginx:latest' });

      expect(response.status).toBe(403);
    });

    it('should return 400 when image name is missing', async () => {
      const response = await request(app)
        .post('/api/v1/docker/images/pull')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /api/v1/docker/system/info', () => {
    it('should get Docker system info successfully', async () => {
      const mockSystemInfo = {
        containers: 5,
        containersRunning: 3,
        containersPaused: 0,
        containersStopped: 2,
        images: 10,
        serverVersion: '24.0.7',
        architecture: 'x86_64',
        operatingSystem: 'Ubuntu 22.04.3 LTS',
        totalMemory: 8589934592,
        cpus: 4,
        dockerRootDir: '/var/lib/docker',
        storageDriver: 'overlay2',
        kernelVersion: '5.15.0-91-generic'
      };

      dockerService.getSystemInfo.mockResolvedValue(mockSystemInfo);

      const response = await request(app)
        .get('/api/v1/docker/system/info')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(mockSystemInfo);
      expect(dockerService.getSystemInfo).toHaveBeenCalled();
    });

    it('should return 403 for non-admin users', async () => {
      const response = await request(app)
        .get('/api/v1/docker/system/info')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(403);
    });
  });

  describe('POST /api/v1/docker/cleanup', () => {
    it('should cleanup Docker resources successfully', async () => {
      const mockCleanupResults = {
        containers: 2,
        images: 3,
        volumes: 1,
        networks: 0,
        reclaimedSpace: 1073741824 // 1GB
      };

      dockerService.cleanup.mockResolvedValue(mockCleanupResults);

      const response = await request(app)
        .post('/api/v1/docker/cleanup')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Docker cleanup completed successfully');
      expect(response.body.data).toEqual(mockCleanupResults);
      expect(dockerService.cleanup).toHaveBeenCalled();
    });

    it('should return 403 for non-admin users', async () => {
      const response = await request(app)
        .post('/api/v1/docker/cleanup')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(403);
    });
  });

  describe('GET /api/v1/docker/connection', () => {
    it('should check Docker connection successfully', async () => {
      dockerService.checkConnection.mockResolvedValue(true);

      const response = await request(app)
        .get('/api/v1/docker/connection')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.connected).toBe(true);
      expect(response.body.data.timestamp).toBeDefined();
      expect(dockerService.checkConnection).toHaveBeenCalled();
    });

    it('should handle Docker connection failure', async () => {
      dockerService.checkConnection.mockResolvedValue(false);

      const response = await request(app)
        .get('/api/v1/docker/connection')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data.connected).toBe(false);
    });
  });
});

describe('Docker Service Unit Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Helper Methods', () => {
    it('should format port bindings correctly', () => {
      const ports = [
        { containerPort: 80, hostPort: 8080 },
        { containerPort: 443, hostPort: 8443 }
      ];

      const result = dockerService.formatPortBindings(ports);

      expect(result).toEqual({
        '80/tcp': [{ HostPort: '8080' }],
        '443/tcp': [{ HostPort: '8443' }]
      });
    });

    it('should format exposed ports correctly', () => {
      const ports = [
        { containerPort: 80, hostPort: 8080 },
        { containerPort: 443, hostPort: 8443 }
      ];

      const result = dockerService.formatExposedPorts(ports);

      expect(result).toEqual({
        '80/tcp': {},
        '443/tcp': {}
      });
    });

    it('should extract IP address from network settings', () => {
      const networkSettings = {
        Networks: {
          'sahary-network': {
            IPAddress: '172.20.0.2'
          }
        }
      };

      const result = dockerService.extractIPAddress(networkSettings);

      expect(result).toBe('172.20.0.2');
    });

    it('should extract port mappings correctly', () => {
      const ports = {
        '80/tcp': [{ HostPort: '8080' }],
        '443/tcp': [{ HostPort: '8443' }]
      };

      const result = dockerService.extractPortMappings(ports);

      expect(result).toEqual([
        { containerPort: 80, hostPort: 8080, protocol: 'tcp' },
        { containerPort: 443, hostPort: 8443, protocol: 'tcp' }
      ]);
    });

    it('should calculate CPU usage correctly', () => {
      const stats = {
        cpu_stats: {
          cpu_usage: { total_usage: 2000000000 },
          system_cpu_usage: 10000000000,
          online_cpus: 2
        },
        precpu_stats: {
          cpu_usage: { total_usage: 1000000000 },
          system_cpu_usage: 9000000000
        }
      };

      const result = dockerService.calculateCPUUsage(stats);

      expect(result).toBe(200); // (1000000000 / 1000000000) * 2 * 100 = 200%
    });

    it('should calculate network I/O correctly', () => {
      const networks = {
        'sahary-network': {
          rx_bytes: 1024,
          tx_bytes: 2048
        }
      };

      const result = dockerService.calculateNetworkIO(networks);

      expect(result).toEqual({
        rxBytes: 1024,
        txBytes: 2048,
        totalBytes: 3072
      });
    });

    it('should calculate block I/O correctly', () => {
      const blkioStats = {
        io_service_bytes_recursive: [
          { op: 'Read', value: 4096 },
          { op: 'Write', value: 8192 }
        ]
      };

      const result = dockerService.calculateBlockIO(blkioStats);

      expect(result).toEqual({
        readBytes: 4096,
        writeBytes: 8192,
        totalBytes: 12288
      });
    });
  });
});