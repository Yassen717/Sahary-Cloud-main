# API Testing Guide - Sahary Cloud VM Management

## Overview
This guide provides comprehensive testing instructions for the Sahary Cloud VM Management APIs using various tools and methods.

## Table of Contents
1. [Prerequisites](#prerequisites)
2. [Authentication Setup](#authentication-setup)
3. [Testing with cURL](#testing-with-curl)
4. [Testing with Postman](#testing-with-postman)
5. [Testing with HTTPie](#testing-with-httpie)
6. [Automated Testing](#automated-testing)
7. [Test Scenarios](#test-scenarios)

---

## Prerequisites

### Required Tools
- **cURL**: Command-line tool for HTTP requests
- **Postman**: API testing platform (optional)
- **HTTPie**: User-friendly HTTP client (optional)
- **Node.js & npm**: For running automated tests

### Environment Setup
```bash
# Clone the repository
git clone https://github.com/saharycloud/backend.git
cd backend

# Install dependencies
npm install

# Setup environment variables
cp .env.example .env
# Edit .env with your configuration

# Start the development server
npm run dev
```

---

## Authentication Setup

### 1. Register a New User
```bash
curl -X POST http://localhost:3000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "TestPassword123!",
    "firstName": "Test",
    "lastName": "User"
  }'
```

**Response:**
```json
{
  "success": true,
  "message": "User registered successfully",
  "data": {
    "user": {
      "id": "cm4user123",
      "email": "test@example.com",
      "firstName": "Test",
      "lastName": "User"
    },
    "tokens": {
      "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
      "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
    }
  }
}
```

### 2. Login
```bash
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "TestPassword123!"
  }'
```

### 3. Save Your Token
```bash
# Save the access token for subsequent requests
export TOKEN="your_access_token_here"
```

---

## Testing with cURL

### Create a VM
```bash
curl -X POST http://localhost:3000/api/v1/vms \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "name": "test-vm-1",
    "description": "Test virtual machine",
    "cpu": 2,
    "ram": 2048,
    "storage": 40,
    "bandwidth": 1000,
    "dockerImage": "ubuntu:22.04"
  }'
```

### Get All User VMs
```bash
curl -X GET "http://localhost:3000/api/v1/vms?page=1&limit=10" \
  -H "Authorization: Bearer $TOKEN"
```

### Get VM by ID
```bash
# Save VM ID from previous response
export VM_ID="cm4abc123xyz"

curl -X GET "http://localhost:3000/api/v1/vms/$VM_ID" \
  -H "Authorization: Bearer $TOKEN"
```

### Start VM
```bash
curl -X POST "http://localhost:3000/api/v1/vms/$VM_ID/start" \
  -H "Authorization: Bearer $TOKEN"
```

### Stop VM
```bash
curl -X POST "http://localhost:3000/api/v1/vms/$VM_ID/stop" \
  -H "Authorization: Bearer $TOKEN"
```

### Restart VM
```bash
curl -X POST "http://localhost:3000/api/v1/vms/$VM_ID/restart" \
  -H "Authorization: Bearer $TOKEN"
```

### Get VM Statistics
```bash
curl -X GET "http://localhost:3000/api/v1/vms/$VM_ID/stats" \
  -H "Authorization: Bearer $TOKEN"
```

### Get VM Resource Stats
```bash
curl -X GET "http://localhost:3000/api/v1/vms/$VM_ID/resources" \
  -H "Authorization: Bearer $TOKEN"
```

### Get Container Status
```bash
curl -X GET "http://localhost:3000/api/v1/vms/$VM_ID/container/status" \
  -H "Authorization: Bearer $TOKEN"
```

### Get Container Logs
```bash
curl -X GET "http://localhost:3000/api/v1/vms/$VM_ID/container/logs?tail=50&timestamps=true" \
  -H "Authorization: Bearer $TOKEN"
```

### Execute Command in Container
```bash
curl -X POST "http://localhost:3000/api/v1/vms/$VM_ID/container/exec" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "command": ["ls", "-la", "/"]
  }'
```

### Create Backup
```bash
curl -X POST "http://localhost:3000/api/v1/vms/$VM_ID/backup" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "backupName": "test-vm-backup-2024-01-01"
  }'
```

### Restore from Backup
```bash
export BACKUP_ID="cm4backup123"

curl -X POST "http://localhost:3000/api/v1/vms/restore/$BACKUP_ID" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "name": "restored-vm",
    "description": "Restored from backup",
    "cpu": 2,
    "ram": 2048,
    "storage": 40,
    "bandwidth": 1000
  }'
```

### Update VM
```bash
curl -X PUT "http://localhost:3000/api/v1/vms/$VM_ID" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "name": "updated-test-vm",
    "description": "Updated description",
    "cpu": 4,
    "ram": 4096,
    "storage": 80
  }'
```

### Delete VM
```bash
curl -X DELETE "http://localhost:3000/api/v1/vms/$VM_ID" \
  -H "Authorization: Bearer $TOKEN"
```

### Get User Resource Usage
```bash
curl -X GET "http://localhost:3000/api/v1/vms/resources" \
  -H "Authorization: Bearer $TOKEN"
```

### Calculate Pricing
```bash
curl -X POST "http://localhost:3000/api/v1/vms/pricing" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "cpu": 2,
    "ram": 4096,
    "storage": 50,
    "bandwidth": 1000,
    "duration": 720
  }'
```

---

## Testing with Postman

### 1. Import Collection

Create a new Postman collection with the following structure:

**Collection Variables:**
- `base_url`: `http://localhost:3000/api/v1`
- `token`: `{{access_token}}`
- `vm_id`: `{{vm_id}}`

### 2. Setup Authentication

1. Create a folder called "Auth"
2. Add requests for:
   - Register
   - Login
   - Refresh Token
   - Logout

3. Add a test script to save the token:
```javascript
// In Login request > Tests tab
if (pm.response.code === 200) {
    const response = pm.response.json();
    pm.collectionVariables.set("access_token", response.data.tokens.accessToken);
    pm.collectionVariables.set("refresh_token", response.data.tokens.refreshToken);
}
```

### 3. Create VM Requests

Create a folder called "VMs" with the following requests:

1. **Create VM**
   - Method: POST
   - URL: `{{base_url}}/vms`
   - Headers: `Authorization: Bearer {{token}}`
   - Body: JSON with VM configuration
   - Test script to save VM ID:
   ```javascript
   if (pm.response.code === 201) {
       const response = pm.response.json();
       pm.collectionVariables.set("vm_id", response.data.vm.id);
   }
   ```

2. **Get All VMs**
   - Method: GET
   - URL: `{{base_url}}/vms?page=1&limit=10`

3. **Get VM by ID**
   - Method: GET
   - URL: `{{base_url}}/vms/{{vm_id}}`

4. **Start VM**
   - Method: POST
   - URL: `{{base_url}}/vms/{{vm_id}}/start`

5. **Stop VM**
   - Method: POST
   - URL: `{{base_url}}/vms/{{vm_id}}/stop`

6. **Delete VM**
   - Method: DELETE
   - URL: `{{base_url}}/vms/{{vm_id}}`

### 4. Run Collection

Use Postman's Collection Runner to execute all requests in sequence.

---

## Testing with HTTPie

HTTPie provides a more user-friendly syntax:

### Create VM
```bash
http POST localhost:3000/api/v1/vms \
  Authorization:"Bearer $TOKEN" \
  name="test-vm" \
  cpu:=2 \
  ram:=2048 \
  storage:=40 \
  bandwidth:=1000 \
  dockerImage="ubuntu:22.04"
```

### Get VMs
```bash
http GET localhost:3000/api/v1/vms \
  Authorization:"Bearer $TOKEN" \
  page==1 \
  limit==10
```

### Start VM
```bash
http POST localhost:3000/api/v1/vms/$VM_ID/start \
  Authorization:"Bearer $TOKEN"
```

---

## Automated Testing

### Run Unit Tests
```bash
# Run all tests
npm test

# Run tests with coverage
npm run test:coverage

# Run tests in watch mode
npm run test:watch

# Run specific test file
npm test -- tests/vm.test.js
```

### Run Integration Tests
```bash
# Run integration tests
npm run test:integration

# Run with verbose output
npm test -- --verbose
```

### Test Coverage Report
```bash
npm run test:coverage

# View coverage report
open coverage/lcov-report/index.html
```

---

## Test Scenarios

### Scenario 1: Complete VM Lifecycle

```bash
#!/bin/bash

# 1. Login
TOKEN=$(curl -s -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"TestPassword123!"}' \
  | jq -r '.data.tokens.accessToken')

# 2. Create VM
VM_ID=$(curl -s -X POST http://localhost:3000/api/v1/vms \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "name":"lifecycle-test-vm",
    "cpu":2,
    "ram":2048,
    "storage":40,
    "bandwidth":1000
  }' | jq -r '.data.vm.id')

echo "Created VM: $VM_ID"

# 3. Start VM
curl -X POST "http://localhost:3000/api/v1/vms/$VM_ID/start" \
  -H "Authorization: Bearer $TOKEN"

echo "VM Started"
sleep 5

# 4. Get VM Status
curl -X GET "http://localhost:3000/api/v1/vms/$VM_ID" \
  -H "Authorization: Bearer $TOKEN"

# 5. Get Container Stats
curl -X GET "http://localhost:3000/api/v1/vms/$VM_ID/resources" \
  -H "Authorization: Bearer $TOKEN"

# 6. Execute Command
curl -X POST "http://localhost:3000/api/v1/vms/$VM_ID/container/exec" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"command":["uname","-a"]}'

# 7. Create Backup
BACKUP_ID=$(curl -s -X POST "http://localhost:3000/api/v1/vms/$VM_ID/backup" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"backupName":"lifecycle-backup"}' \
  | jq -r '.data.id')

echo "Created Backup: $BACKUP_ID"

# 8. Stop VM
curl -X POST "http://localhost:3000/api/v1/vms/$VM_ID/stop" \
  -H "Authorization: Bearer $TOKEN"

echo "VM Stopped"
sleep 3

# 9. Delete VM
curl -X DELETE "http://localhost:3000/api/v1/vms/$VM_ID" \
  -H "Authorization: Bearer $TOKEN"

echo "VM Deleted"
```

### Scenario 2: Resource Limit Testing

```bash
#!/bin/bash

# Test creating VMs until resource limit is reached
for i in {1..10}; do
  echo "Creating VM $i..."
  curl -X POST http://localhost:3000/api/v1/vms \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d "{
      \"name\":\"test-vm-$i\",
      \"cpu\":2,
      \"ram\":2048,
      \"storage\":40,
      \"bandwidth\":1000
    }"
  
  if [ $? -ne 0 ]; then
    echo "Failed to create VM $i - Resource limit reached"
    break
  fi
done
```

### Scenario 3: Concurrent Operations

```bash
#!/bin/bash

# Test concurrent VM operations
VM_IDS=("vm1" "vm2" "vm3")

# Start all VMs concurrently
for vm_id in "${VM_IDS[@]}"; do
  curl -X POST "http://localhost:3000/api/v1/vms/$vm_id/start" \
    -H "Authorization: Bearer $TOKEN" &
done

wait

echo "All VMs started"

# Get stats for all VMs concurrently
for vm_id in "${VM_IDS[@]}"; do
  curl -X GET "http://localhost:3000/api/v1/vms/$vm_id/stats" \
    -H "Authorization: Bearer $TOKEN" &
done

wait

echo "Retrieved all stats"
```

### Scenario 4: Error Handling

```bash
#!/bin/bash

# Test various error scenarios

# 1. Invalid VM ID
curl -X GET "http://localhost:3000/api/v1/vms/invalid-id" \
  -H "Authorization: Bearer $TOKEN"

# 2. Missing required fields
curl -X POST http://localhost:3000/api/v1/vms \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"name":"test"}'

# 3. Invalid resource values
curl -X POST http://localhost:3000/api/v1/vms \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "name":"test-vm",
    "cpu":0,
    "ram":100,
    "storage":1
  }'

# 4. Unauthorized access
curl -X GET "http://localhost:3000/api/v1/vms"

# 5. Start already running VM
curl -X POST "http://localhost:3000/api/v1/vms/$VM_ID/start" \
  -H "Authorization: Bearer $TOKEN"
curl -X POST "http://localhost:3000/api/v1/vms/$VM_ID/start" \
  -H "Authorization: Bearer $TOKEN"
```

---

## Performance Testing

### Load Testing with Apache Bench

```bash
# Test VM listing endpoint
ab -n 1000 -c 10 -H "Authorization: Bearer $TOKEN" \
  http://localhost:3000/api/v1/vms

# Test VM creation endpoint
ab -n 100 -c 5 -p vm-data.json -T application/json \
  -H "Authorization: Bearer $TOKEN" \
  http://localhost:3000/api/v1/vms
```

### Load Testing with Artillery

Create `artillery-config.yml`:
```yaml
config:
  target: "http://localhost:3000"
  phases:
    - duration: 60
      arrivalRate: 10
      name: "Warm up"
    - duration: 120
      arrivalRate: 50
      name: "Sustained load"
  variables:
    token: "your_token_here"

scenarios:
  - name: "VM Operations"
    flow:
      - get:
          url: "/api/v1/vms"
          headers:
            Authorization: "Bearer {{ token }}"
      - post:
          url: "/api/v1/vms"
          headers:
            Authorization: "Bearer {{ token }}"
            Content-Type: "application/json"
          json:
            name: "load-test-vm"
            cpu: 2
            ram: 2048
            storage: 40
            bandwidth: 1000
```

Run the test:
```bash
artillery run artillery-config.yml
```

---

## Troubleshooting

### Common Issues

1. **401 Unauthorized**
   - Check if token is valid and not expired
   - Verify Authorization header format: `Bearer <token>`

2. **403 Forbidden**
   - Check user permissions
   - Verify email is verified (if required)

3. **404 Not Found**
   - Verify VM ID is correct
   - Check if VM belongs to the authenticated user

4. **429 Too Many Requests**
   - Wait for rate limit window to reset
   - Reduce request frequency

5. **500 Internal Server Error**
   - Check server logs
   - Verify database connection
   - Ensure Docker daemon is running

### Debug Mode

Enable debug logging:
```bash
# Set environment variable
export LOG_LEVEL=debug

# Restart server
npm run dev
```

### Check Server Health

```bash
curl http://localhost:3000/health
```

---

## Best Practices

1. **Always authenticate** before testing protected endpoints
2. **Clean up test data** after testing
3. **Use meaningful names** for test VMs
4. **Test error scenarios** as well as success cases
5. **Monitor resource usage** during load testing
6. **Use environment variables** for sensitive data
7. **Document test results** for future reference
8. **Automate repetitive tests** with scripts

---

## Additional Resources

- [VM API Documentation](./VM_API_DOCUMENTATION.md)
- [Postman Collection](./postman/sahary-cloud-vm-apis.json)
- [Test Scripts](../tests/)
- [API Status Page](https://status.saharycloud.com)

---

## Support

For testing support or questions:
- Email: support@saharycloud.com
- Slack: #api-testing
- Documentation: https://docs.saharycloud.com/testing
