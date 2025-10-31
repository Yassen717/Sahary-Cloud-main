# VM Management API Documentation

## Overview
This document provides comprehensive documentation for the Virtual Machine (VM) Management APIs in the Sahary Cloud platform.

## Base URL
```
http://localhost:3000/api/v1/vms
```

## Authentication
All VM endpoints require authentication using JWT Bearer token:
```
Authorization: Bearer <your_jwt_token>
```

## Table of Contents
1. [VM CRUD Operations](#vm-crud-operations)
2. [VM State Management](#vm-state-management)
3. [VM Statistics & Monitoring](#vm-statistics--monitoring)
4. [Docker Container Management](#docker-container-management)
5. [Backup & Restore](#backup--restore)
6. [Admin Operations](#admin-operations)
7. [Error Responses](#error-responses)

---

## VM CRUD Operations

### 1. Create VM
Create a new virtual machine.

**Endpoint:** `POST /api/v1/vms`

**Permissions:** `vm:create`

**Request Body:**
```json
{
  "name": "my-web-server",
  "description": "Production web server",
  "cpu": 2,
  "ram": 4096,
  "storage": 50,
  "bandwidth": 1000,
  "dockerImage": "ubuntu:22.04"
}
```

**Validation Rules:**
- `name`: 3-50 characters, alphanumeric with hyphens and underscores only
- `description`: Optional, max 500 characters
- `cpu`: 1-32 cores
- `ram`: 512-131072 MB (0.5-128 GB)
- `storage`: 10-2048 GB (10 GB - 2 TB)
- `bandwidth`: 100-10000 GB (100 GB - 10 TB), optional
- `dockerImage`: Valid Docker image name, optional (default: ubuntu:latest)

**Success Response (201):**
```json
{
  "success": true,
  "message": "VM created successfully",
  "data": {
    "vm": {
      "id": "cm4abc123xyz",
      "name": "my-web-server",
      "description": "Production web server",
      "status": "STOPPED",
      "cpu": 2,
      "ram": 4096,
      "storage": 50,
      "bandwidth": 1000,
      "dockerImage": "ubuntu:22.04",
      "dockerContainerId": null,
      "ipAddress": null,
      "hourlyRate": "0.05",
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-01T00:00:00.000Z",
      "startedAt": null,
      "stoppedAt": null,
      "userId": "cm4user123",
      "user": {
        "id": "cm4user123",
        "email": "user@example.com",
        "firstName": "John",
        "lastName": "Doe"
      }
    }
  }
}
```

**Error Responses:**
- `400`: Validation failed or resource limits exceeded
- `401`: Unauthorized
- `403`: Insufficient permissions

---

### 2. Get User's VMs
Retrieve all VMs belonging to the authenticated user.

**Endpoint:** `GET /api/v1/vms`

**Permissions:** `vm:read:own`

**Query Parameters:**
- `page`: Page number (default: 1)
- `limit`: Items per page (default: 10, max: 100)
- `status`: Filter by status (RUNNING, STOPPED, STARTING, STOPPING, RESTARTING, ERROR, SUSPENDED)
- `search`: Search by name or description
- `sortBy`: Sort field (createdAt, name, status, cpu, ram, storage)
- `sortOrder`: Sort order (asc, desc)

**Example Request:**
```
GET /api/v1/vms?page=1&limit=10&status=RUNNING&sortBy=createdAt&sortOrder=desc
```

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "vms": [
      {
        "id": "cm4abc123xyz",
        "name": "my-web-server",
        "status": "RUNNING",
        "cpu": 2,
        "ram": 4096,
        "storage": 50,
        "ipAddress": "172.20.0.5",
        "hourlyRate": "0.05",
        "createdAt": "2024-01-01T00:00:00.000Z"
      }
    ],
    "pagination": {
      "total": 5,
      "page": 1,
      "limit": 10,
      "totalPages": 1
    }
  }
}
```

---

### 3. Get VM by ID
Retrieve detailed information about a specific VM.

**Endpoint:** `GET /api/v1/vms/:id`

**Permissions:** `vm:read:own` or `vm:read:all` (admin)

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "vm": {
      "id": "cm4abc123xyz",
      "name": "my-web-server",
      "description": "Production web server",
      "status": "RUNNING",
      "cpu": 2,
      "ram": 4096,
      "storage": 50,
      "bandwidth": 1000,
      "dockerImage": "ubuntu:22.04",
      "dockerContainerId": "abc123def456",
      "ipAddress": "172.20.0.5",
      "port": null,
      "hourlyRate": "0.05",
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-01T00:00:00.000Z",
      "startedAt": "2024-01-01T01:00:00.000Z",
      "stoppedAt": null,
      "userId": "cm4user123",
      "user": {
        "id": "cm4user123",
        "email": "user@example.com",
        "firstName": "John",
        "lastName": "Doe"
      },
      "usageRecords": []
    }
  }
}
```

**Error Responses:**
- `404`: VM not found
- `403`: Access denied

---

### 4. Update VM
Update VM configuration (only when stopped).

**Endpoint:** `PUT /api/v1/vms/:id`

**Permissions:** `vm:manage:own` or `vm:manage:all` (admin)

**Request Body:**
```json
{
  "name": "updated-web-server",
  "description": "Updated description",
  "cpu": 4,
  "ram": 8192,
  "storage": 100,
  "bandwidth": 2000
}
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "VM updated successfully",
  "data": {
    "vm": {
      "id": "cm4abc123xyz",
      "name": "updated-web-server",
      "cpu": 4,
      "ram": 8192,
      "storage": 100,
      "bandwidth": 2000,
      "hourlyRate": "0.10",
      "updatedAt": "2024-01-01T02:00:00.000Z"
    }
  }
}
```

**Error Responses:**
- `400`: VM is running or in transitional state
- `403`: Access denied
- `404`: VM not found

---

### 5. Delete VM
Delete a virtual machine (must be stopped).

**Endpoint:** `DELETE /api/v1/vms/:id`

**Permissions:** `vm:delete:own` or `vm:delete:all` (admin)

**Success Response (200):**
```json
{
  "success": true,
  "message": "VM deleted successfully"
}
```

**Error Responses:**
- `400`: VM is running
- `403`: Access denied
- `404`: VM not found

---

## VM State Management

### 6. Start VM
Start a stopped virtual machine.

**Endpoint:** `POST /api/v1/vms/:id/start`

**Permissions:** `vm:manage:own` or `vm:manage:all` (admin)

**Success Response (200):**
```json
{
  "success": true,
  "message": "VM started successfully",
  "data": {
    "vm": {
      "id": "cm4abc123xyz",
      "name": "my-web-server",
      "status": "STARTING",
      "dockerContainerId": "abc123def456",
      "ipAddress": "172.20.0.5"
    }
  }
}
```

**Error Responses:**
- `400`: VM is already running or in error state
- `403`: Access denied
- `404`: VM not found

---

### 7. Stop VM
Stop a running virtual machine.

**Endpoint:** `POST /api/v1/vms/:id/stop`

**Permissions:** `vm:manage:own` or `vm:manage:all` (admin)

**Success Response (200):**
```json
{
  "success": true,
  "message": "VM stopped successfully",
  "data": {
    "vm": {
      "id": "cm4abc123xyz",
      "name": "my-web-server",
      "status": "STOPPING"
    }
  }
}
```

---

### 8. Restart VM
Restart a running virtual machine.

**Endpoint:** `POST /api/v1/vms/:id/restart`

**Permissions:** `vm:manage:own` or `vm:manage:all` (admin)

**Success Response (200):**
```json
{
  "success": true,
  "message": "VM restarted successfully",
  "data": {
    "vm": {
      "id": "cm4abc123xyz",
      "name": "my-web-server",
      "status": "RESTARTING"
    }
  }
}
```

---

### 9. Suspend VM (Admin Only)
Suspend a virtual machine.

**Endpoint:** `POST /api/v1/vms/:id/suspend`

**Permissions:** `vm:suspend:all` (admin only)

**Success Response (200):**
```json
{
  "success": true,
  "message": "VM suspended successfully",
  "data": {
    "vm": {
      "id": "cm4abc123xyz",
      "status": "SUSPENDED"
    }
  }
}
```

---

### 10. Resume VM (Admin Only)
Resume a suspended virtual machine.

**Endpoint:** `POST /api/v1/vms/:id/resume`

**Permissions:** `vm:suspend:all` (admin only)

**Success Response (200):**
```json
{
  "success": true,
  "message": "VM resumed successfully",
  "data": {
    "vm": {
      "id": "cm4abc123xyz",
      "status": "STOPPED"
    }
  }
}
```

---

## VM Statistics & Monitoring

### 11. Get VM Statistics
Get detailed statistics for a specific VM.

**Endpoint:** `GET /api/v1/vms/:id/stats`

**Permissions:** `vm:read:own` or `vm:read:all` (admin)

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "vm": {
      "id": "cm4abc123xyz",
      "name": "my-web-server",
      "status": "RUNNING"
    },
    "statistics": {
      "totalUptime": 86400,
      "totalCost": "1.20",
      "averageCpuUsage": 45.5,
      "averageRamUsage": 2048,
      "totalBandwidthUsage": 150.5,
      "recentUsage": []
    }
  }
}
```

---

### 12. Get VM Resource Stats
Get real-time resource usage from Docker container.

**Endpoint:** `GET /api/v1/vms/:id/resources`

**Permissions:** `vm:read:own` or `vm:read:all` (admin)

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "vmId": "cm4abc123xyz",
    "vmName": "my-web-server",
    "vmStatus": "RUNNING",
    "dockerContainerId": "abc123def456",
    "stats": {
      "timestamp": "2024-01-01T12:00:00.000Z",
      "cpu": {
        "usage": 45.5,
        "systemUsage": 1234567890
      },
      "memory": {
        "used": 2147483648,
        "limit": 4294967296,
        "percentage": 50.0
      },
      "network": {
        "rxBytes": 1048576,
        "txBytes": 2097152,
        "totalBytes": 3145728
      },
      "blockIO": {
        "readBytes": 4194304,
        "writeBytes": 8388608,
        "totalBytes": 12582912
      },
      "pids": 25
    }
  }
}
```

---

### 13. Get User Resource Usage
Get total resource usage for the authenticated user.

**Endpoint:** `GET /api/v1/vms/resources`

**Permissions:** `vm:read:own`

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "usage": {
      "cpu": 6,
      "ram": 12288,
      "storage": 200,
      "bandwidth": 500,
      "vmCount": 3
    },
    "limits": {
      "cpu": 16,
      "ram": 32768,
      "storage": 1000,
      "bandwidth": 5000,
      "maxVMs": 10
    },
    "available": {
      "cpu": 10,
      "ram": 20480,
      "storage": 800,
      "bandwidth": 4500,
      "vms": 7
    }
  }
}
```

---

## Docker Container Management

### 14. Get Container Status
Get Docker container status and details.

**Endpoint:** `GET /api/v1/vms/:id/container/status`

**Permissions:** `vm:read:own` or `vm:read:all` (admin)

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "vmId": "cm4abc123xyz",
    "vmName": "my-web-server",
    "vmStatus": "RUNNING",
    "containerStatus": {
      "containerId": "abc123def456",
      "name": "/sahary-vm-cm4abc123xyz",
      "status": "running",
      "running": true,
      "paused": false,
      "restarting": false,
      "exitCode": 0,
      "error": "",
      "startedAt": "2024-01-01T01:00:00.000Z",
      "finishedAt": null,
      "image": "ubuntu:22.04",
      "ipAddress": "172.20.0.5",
      "ports": [],
      "stats": {
        "cpu": { "usage": 45.5 },
        "memory": { "used": 2147483648, "limit": 4294967296, "percentage": 50.0 }
      }
    }
  }
}
```

---

### 15. Get Container Logs
Get Docker container logs.

**Endpoint:** `GET /api/v1/vms/:id/container/logs`

**Permissions:** `vm:read:own` or `vm:read:all` (admin)

**Query Parameters:**
- `tail`: Number of lines to retrieve (default: 100, max: 10000)
- `since`: ISO 8601 timestamp to get logs since
- `until`: ISO 8601 timestamp to get logs until
- `timestamps`: Include timestamps (true/false, default: true)

**Example Request:**
```
GET /api/v1/vms/:id/container/logs?tail=50&timestamps=true
```

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "vmId": "cm4abc123xyz",
    "vmName": "my-web-server",
    "dockerContainerId": "abc123def456",
    "logs": "2024-01-01T01:00:00.000Z Container started\n2024-01-01T01:00:01.000Z Application initialized\n..."
  }
}
```

---

### 16. Execute Command in Container
Execute a command inside the VM container.

**Endpoint:** `POST /api/v1/vms/:id/container/exec`

**Permissions:** `vm:manage:own` or `vm:manage:all` (admin)

**Request Body:**
```json
{
  "command": ["ls", "-la", "/app"]
}
```

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "vmId": "cm4abc123xyz",
    "vmName": "my-web-server",
    "dockerContainerId": "abc123def456",
    "result": {
      "exitCode": 0,
      "output": "total 4\ndrwxr-xr-x 2 root root 4096 Jan  1 00:00 .\ndrwxr-xr-x 3 root root 4096 Jan  1 00:00 ..",
      "command": "ls -la /app"
    }
  }
}
```

---

## Backup & Restore

### 17. Create VM Backup
Create a backup of the VM container.

**Endpoint:** `POST /api/v1/vms/:id/backup`

**Permissions:** `vm:manage:own` or `vm:manage:all` (admin)

**Request Body:**
```json
{
  "backupName": "my-web-server-backup-2024-01-01"
}
```

**Success Response (201):**
```json
{
  "success": true,
  "message": "VM backup created successfully",
  "data": {
    "id": "cm4backup123",
    "name": "my-web-server-backup-2024-01-01",
    "vmId": "cm4abc123xyz",
    "userId": "cm4user123",
    "size": 1073741824,
    "dockerImageId": "sha256:abc123...",
    "status": "COMPLETED",
    "createdAt": "2024-01-01T12:00:00.000Z",
    "dockerBackup": {
      "backupId": "sha256:abc123...",
      "name": "my-web-server-backup-2024-01-01",
      "size": 1073741824,
      "created": "2024-01-01T12:00:00.000Z",
      "tags": ["sahary-backup/my-web-server-backup-2024-01-01:2024-01-01T12-00-00-000Z"]
    }
  }
}
```

---

### 18. Restore VM from Backup
Restore a VM from a backup.

**Endpoint:** `POST /api/v1/vms/restore/:backupId`

**Permissions:** `vm:create:own` or `vm:create:all` (admin)

**Request Body:**
```json
{
  "name": "restored-web-server",
  "description": "Restored from backup",
  "cpu": 2,
  "ram": 4096,
  "storage": 50,
  "bandwidth": 1000
}
```

**Success Response (201):**
```json
{
  "success": true,
  "message": "VM restored from backup successfully",
  "data": {
    "id": "cm4newvm123",
    "name": "restored-web-server",
    "status": "STOPPED",
    "dockerImage": "sha256:abc123...",
    "createdAt": "2024-01-01T13:00:00.000Z"
  }
}
```

---

## Admin Operations

### 19. Get All VMs (Admin Only)
Get all VMs in the system.

**Endpoint:** `GET /api/v1/vms/all`

**Permissions:** `vm:read:all` (admin only)

**Query Parameters:** Same as "Get User's VMs" plus:
- `userId`: Filter by user ID

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "vms": [],
    "pagination": {
      "total": 50,
      "page": 1,
      "limit": 10,
      "totalPages": 5
    }
  }
}
```

---

### 20. Get System Stats (Admin Only)
Get system-wide VM statistics.

**Endpoint:** `GET /api/v1/vms/stats`

**Permissions:** `vm:read:all` (admin only)

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "totalVMs": 50,
    "runningVMs": 35,
    "stoppedVMs": 10,
    "suspendedVMs": 5,
    "totalUsers": 25,
    "resourceUsage": {
      "totalCpu": 120,
      "totalRam": 262144,
      "totalStorage": 5000,
      "totalBandwidth": 50000
    },
    "resourceLimits": {
      "maxCpu": 256,
      "maxRam": 524288,
      "maxStorage": 10000,
      "maxBandwidth": 100000
    }
  }
}
```

---

### 21. Calculate Pricing Estimate
Calculate pricing estimate for VM configuration.

**Endpoint:** `POST /api/v1/vms/pricing`

**Permissions:** Authenticated user

**Request Body:**
```json
{
  "cpu": 2,
  "ram": 4096,
  "storage": 50,
  "bandwidth": 1000,
  "duration": 720
}
```

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "hourlyRate": "0.05",
    "dailyRate": "1.20",
    "monthlyRate": "36.00",
    "estimatedCost": "36.00",
    "duration": 720,
    "breakdown": {
      "cpuCost": "14.40",
      "ramCost": "10.80",
      "storageCost": "7.20",
      "bandwidthCost": "3.60"
    }
  }
}
```

---

## Error Responses

### Standard Error Format
```json
{
  "success": false,
  "error": "Error type",
  "message": "Detailed error message"
}
```

### Common HTTP Status Codes
- `200`: Success
- `201`: Created
- `400`: Bad Request (validation error, invalid state)
- `401`: Unauthorized (missing or invalid token)
- `403`: Forbidden (insufficient permissions)
- `404`: Not Found (resource doesn't exist)
- `429`: Too Many Requests (rate limit exceeded)
- `500`: Internal Server Error

### Example Error Responses

**Validation Error (400):**
```json
{
  "success": false,
  "error": "Validation failed",
  "message": "VM name must be at least 3 characters"
}
```

**Unauthorized (401):**
```json
{
  "success": false,
  "error": "Unauthorized",
  "message": "Invalid or expired token"
}
```

**Forbidden (403):**
```json
{
  "success": false,
  "error": "Forbidden",
  "message": "Insufficient permissions to perform this action"
}
```

**Not Found (404):**
```json
{
  "success": false,
  "error": "Not Found",
  "message": "VM not found or access denied"
}
```

**Rate Limit (429):**
```json
{
  "success": false,
  "error": "Too Many Requests",
  "message": "Rate limit exceeded. Please try again later."
}
```

---

## Rate Limiting

All VM endpoints are rate-limited to prevent abuse:
- **Standard endpoints**: 100 requests per 15 minutes per IP
- **Resource-intensive operations** (start, stop, restart): Additional throttling may apply

---

## Best Practices

1. **Always check VM status** before performing state operations
2. **Use pagination** when listing VMs to improve performance
3. **Monitor resource usage** regularly to avoid hitting limits
4. **Create backups** before major changes or updates
5. **Use appropriate error handling** in your client applications
6. **Respect rate limits** to ensure service availability
7. **Clean up unused VMs** to optimize resource allocation

---

## Support

For API support or questions, please contact:
- Email: support@saharycloud.com
- Documentation: https://docs.saharycloud.com
- Status Page: https://status.saharycloud.com
