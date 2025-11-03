# VM Management API Documentation

## Overview

The VM Management API provides comprehensive endpoints for creating, managing, and monitoring virtual machines on the Sahary Cloud platform. All endpoints require authentication and proper authorization.

## Base URL

```
/api/v1/vms
```

## Authentication

All endpoints require a valid JWT token in the Authorization header:

```
Authorization: Bearer <your_jwt_token>
```

## Endpoints

### 1. Create VM

**POST** `/api/v1/vms`

Creates a new virtual machine with specified resources.

**Request Body:**
```json
{
  "name": "my-vm",
  "description": "My production VM",
  "cpu": 2,
  "ram": 2048,
  "storage": 40,
  "bandwidth": 1000,
  "dockerImage": "ubuntu:latest"
}
```

**Validation Rules:**
- `name`: 3-50 characters, alphanumeric with hyphens and underscores only
- `description`: Optional, max 500 characters
- `cpu`: 1-32 cores
- `ram`: 512-131072 MB (512 MB - 128 GB)
- `storage`: 10-2048 GB (10 GB - 2 TB)
- `bandwidth`: 100-10000 GB (100 GB - 10 TB), optional, default 1000
- `dockerImage`: Optional, max 200 characters

**Response (201):**
```json
{
  "success": true,
  "message": "VM created successfully",
  "data": {
    "vm": {
      "id": "clxxxxxxxxxxxxxxxxxx",
      "name": "my-vm",
      "description": "My production VM",
      "cpu": 2,
      "ram": 2048,
      "storage": 40,
      "bandwidth": 1000,
      "dockerImage": "ubuntu:latest",
      "status": "STOPPED",
      "hourlyRate": 0.05,
      "createdAt": "2024-01-01T00:00:00.000Z",
      "user": {
        "id": "clxxxxxxxxxxxxxxxxxx",
        "email": "user@example.com",
        "firstName": "John",
        "lastName": "Doe"
      }
    }
  }
}
```

**Error Responses:**
- `400`: Validation failed, duplicate name, insufficient resources
- `401`: Unauthorized
- `403`: Email not verified

---

### 2. Get User VMs

**GET** `/api/v1/vms`

Retrieves all VMs belonging to the authenticated user with pagination and filtering.

**Query Parameters:**
- `page`: Page number (default: 1)
- `limit`: Items per page (1-100, default: 10)
- `status`: Filter by status (RUNNING, STOPPED, STARTING, STOPPING, RESTARTING, ERROR, SUSPENDED)
- `search`: Search by name or description
- `sortBy`: Sort field (name, createdAt, updatedAt, status, cpu, ram, storage)
- `sortOrder`: Sort order (asc, desc, default: desc)

**Response (200):**
```json
{
  "success": true,
  "message": "VMs retrieved successfully",
  "data": [
    {
      "id": "clxxxxxxxxxxxxxxxxxx",
      "name": "my-vm",
      "status": "RUNNING",
      "cpu": 2,
      "ram": 2048,
      "storage": 40,
      "ipAddress": "192.168.1.100",
      "createdAt": "2024-01-01T00:00:00.000Z",
      "usageRecords": [
        {
          "cpuUsage": 45.5,
          "ramUsage": 1024,
          "storageUsage": 20,
          "timestamp": "2024-01-01T12:00:00.000Z"
        }
      ]
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 5,
    "totalPages": 1
  }
}
```

---

### 3. Get VM by ID

**GET** `/api/v1/vms/:id`

Retrieves detailed information about a specific VM.

**Response (200):**
```json
{
  "success": true,
  "message": "VM retrieved successfully",
  "data": {
    "vm": {
      "id": "clxxxxxxxxxxxxxxxxxx",
      "name": "my-vm",
      "description": "My production VM",
      "status": "RUNNING",
      "cpu": 2,
      "ram": 2048,
      "storage": 40,
      "bandwidth": 1000,
      "dockerImage": "ubuntu:latest",
      "dockerContainerId": "abc123...",
      "ipAddress": "192.168.1.100",
      "hourlyRate": 0.05,
      "startedAt": "2024-01-01T10:00:00.000Z",
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-01T10:00:00.000Z",
      "user": {
        "id": "clxxxxxxxxxxxxxxxxxx",
        "email": "user@example.com",
        "firstName": "John",
        "lastName": "Doe"
      },
      "usageRecords": [...],
      "backups": [...]
    }
  }
}
```

**Error Responses:**
- `400`: Invalid VM ID format
- `404`: VM not found or access denied

---

### 4. Update VM

**PUT** `/api/v1/vms/:id`

Updates VM configuration. VM must be stopped to update resources.

**Request Body:**
```json
{
  "name": "updated-vm-name",
  "description": "Updated description",
  "cpu": 4,
  "ram": 4096,
  "storage": 80,
  "bandwidth": 2000
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "VM updated successfully",
  "data": {
    "vm": {
      "id": "clxxxxxxxxxxxxxxxxxx",
      "name": "updated-vm-name",
      "cpu": 4,
      "ram": 4096,
      "hourlyRate": 0.10,
      ...
    }
  }
}
```

**Error Responses:**
- `400`: Validation failed, VM in transitional state, insufficient resources
- `404`: VM not found

---

### 5. Delete VM

**DELETE** `/api/v1/vms/:id`

Deletes a VM. VM must be stopped before deletion.

**Response (200):**
```json
{
  "success": true,
  "message": "VM deleted successfully"
}
```

**Error Responses:**
- `400`: VM is running or in transitional state
- `404`: VM not found

---

### 6. Start VM

**POST** `/api/v1/vms/:id/start`

Starts a stopped VM.

**Response (200):**
```json
{
  "success": true,
  "message": "VM start initiated successfully",
  "data": {
    "vm": {
      "id": "clxxxxxxxxxxxxxxxxxx",
      "status": "STARTING",
      ...
    }
  }
}
```

**Error Responses:**
- `400`: VM already running or in transitional state

---

### 7. Stop VM

**POST** `/api/v1/vms/:id/stop`

Stops a running VM.

**Response (200):**
```json
{
  "success": true,
  "message": "VM stop initiated successfully",
  "data": {
    "vm": {
      "id": "clxxxxxxxxxxxxxxxxxx",
      "status": "STOPPING",
      ...
    }
  }
}
```

**Error Responses:**
- `400`: VM already stopped or in transitional state

---

### 8. Restart VM

**POST** `/api/v1/vms/:id/restart`

Restarts a running VM.

**Response (200):**
```json
{
  "success": true,
  "message": "VM restart initiated successfully",
  "data": {
    "vm": {
      "id": "clxxxxxxxxxxxxxxxxxx",
      "status": "RESTARTING",
      ...
    }
  }
}
```

**Error Responses:**
- `400`: VM not running

---

### 9. Get Resource Usage

**GET** `/api/v1/vms/resources`

Gets the authenticated user's total resource usage and limits.

**Response (200):**
```json
{
  "success": true,
  "message": "Resource usage retrieved successfully",
  "data": {
    "usage": {
      "cpu": 8,
      "ram": 16384,
      "storage": 200,
      "bandwidth": 5000
    },
    "limits": {
      "cpu": 16,
      "ram": 32768,
      "storage": 1024,
      "bandwidth": 10000
    },
    "usagePercentages": {
      "cpu": 50,
      "ram": 50,
      "storage": 19.53,
      "bandwidth": 50
    },
    "available": {
      "cpu": 8,
      "ram": 16384,
      "storage": 824,
      "bandwidth": 5000
    }
  }
}
```

---

### 10. Get Pricing Estimate

**POST** `/api/v1/vms/pricing`

Calculates pricing estimate for VM resources.

**Request Body:**
```json
{
  "resources": {
    "cpu": 2,
    "ram": 2048,
    "storage": 40,
    "bandwidth": 1000
  },
  "duration": 24
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Pricing estimate calculated successfully",
  "data": {
    "resources": {
      "cpu": 2,
      "ram": 2048,
      "storage": 40,
      "bandwidth": 1000
    },
    "estimates": {
      "hourly": 0.05,
      "daily": 1.20,
      "weekly": 8.40,
      "monthly": 36.00,
      "yearly": 438.00,
      "custom": 1.20
    },
    "currency": "USD",
    "warnings": []
  }
}
```

---

### 11. Get VM Statistics

**GET** `/api/v1/vms/:id/stats`

Gets usage statistics for a specific VM.

**Query Parameters:**
- `startDate`: Start date (ISO 8601 format)
- `endDate`: End date (ISO 8601 format)
- `granularity`: Data granularity (hour, day, week, month)

**Response (200):**
```json
{
  "success": true,
  "message": "VM statistics retrieved successfully",
  "data": {
    "totalRecords": 100,
    "totalCost": 12.50,
    "averageCPU": 45.5,
    "averageRAM": 1024,
    "totalBandwidth": 50000,
    "peakCPU": 95.0,
    "peakRAM": 1800,
    "records": [...]
  }
}
```

---

### 12. Get All VMs (Admin Only)

**GET** `/api/v1/vms/all`

Gets all VMs across all users (admin only).

**Query Parameters:**
- `page`: Page number
- `limit`: Items per page (1-100, default: 20)
- `status`: Filter by status
- `userId`: Filter by user ID
- `search`: Search term
- `sortBy`: Sort field
- `sortOrder`: Sort order

**Response (200):**
```json
{
  "success": true,
  "message": "All VMs retrieved successfully",
  "data": [...],
  "pagination": {...}
}
```

**Error Responses:**
- `403`: Insufficient permissions

---

### 13. Get System Statistics (Admin Only)

**GET** `/api/v1/vms/stats`

Gets system-wide resource statistics (admin only).

**Response (200):**
```json
{
  "success": true,
  "message": "System statistics retrieved successfully",
  "data": {
    "vms": {
      "total": 150,
      "running": 120,
      "stopped": 25,
      "error": 5
    },
    "resources": {
      "totalCPU": 500,
      "totalRAM": 1048576,
      "totalStorage": 50000,
      "usedCPU": 350,
      "usedRAM": 700000,
      "usedStorage": 30000
    },
    "timestamp": "2024-01-01T12:00:00.000Z"
  }
}
```

---

### 14. Suspend VM (Admin Only)

**POST** `/api/v1/vms/:id/suspend`

Suspends a VM (admin only).

**Request Body:**
```json
{
  "reason": "Policy violation - excessive resource usage detected"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "VM suspended successfully"
}
```

**Error Responses:**
- `400`: Invalid reason (must be at least 10 characters)
- `403`: Insufficient permissions

---

### 15. Resume VM (Admin Only)

**POST** `/api/v1/vms/:id/resume`

Resumes a suspended VM (admin only).

**Response (200):**
```json
{
  "success": true,
  "message": "VM resumed successfully"
}
```

**Error Responses:**
- `400`: VM not suspended
- `403`: Insufficient permissions

---

## VM Status Values

- `STOPPED`: VM is stopped
- `STARTING`: VM is starting up
- `RUNNING`: VM is running
- `STOPPING`: VM is stopping
- `RESTARTING`: VM is restarting
- `ERROR`: VM encountered an error
- `SUSPENDED`: VM is suspended by admin

## Error Response Format

All error responses follow this format:

```json
{
  "success": false,
  "error": "Error type",
  "message": "Detailed error message",
  "details": [...], // Optional, for validation errors
  "timestamp": "2024-01-01T12:00:00.000Z"
}
```

## Rate Limiting

API endpoints are rate-limited to prevent abuse:
- Default: 100 requests per 15 minutes per IP
- Rate limit headers are included in responses:
  - `X-RateLimit-Limit`: Maximum requests allowed
  - `X-RateLimit-Remaining`: Remaining requests
  - `X-RateLimit-Reset`: Time when limit resets

## Security

- All endpoints require authentication via JWT token
- Sensitive operations require email verification
- Input is sanitized to prevent XSS attacks
- RBAC (Role-Based Access Control) enforces permissions
- Admin-only endpoints are protected

## Best Practices

1. **Always check VM status** before performing operations
2. **Stop VMs before deletion** to prevent data loss
3. **Monitor resource usage** to avoid hitting limits
4. **Use pagination** for large result sets
5. **Handle rate limits** gracefully in your application
6. **Validate input** on the client side before sending requests
7. **Store sensitive data** (like tokens) securely

## Examples

### Creating a VM with cURL

```bash
curl -X POST https://api.saharycloud.com/api/v1/vms \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "my-production-vm",
    "description": "Production web server",
    "cpu": 4,
    "ram": 8192,
    "storage": 100,
    "bandwidth": 2000,
    "dockerImage": "nginx:latest"
  }'
```

### Starting a VM with JavaScript

```javascript
const response = await fetch('https://api.saharycloud.com/api/v1/vms/VM_ID/start', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  }
});

const data = await response.json();
console.log(data);
```

### Getting VMs with Python

```python
import requests

headers = {
    'Authorization': f'Bearer {token}'
}

params = {
    'page': 1,
    'limit': 10,
    'status': 'RUNNING'
}

response = requests.get(
    'https://api.saharycloud.com/api/v1/vms',
    headers=headers,
    params=params
)

vms = response.json()
```

## Support

For API support, contact: support@saharycloud.com
