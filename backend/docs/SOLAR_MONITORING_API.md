# Solar Energy Monitoring API Documentation

## Overview

The Solar Energy Monitoring API provides endpoints to monitor and track solar energy production, consumption, and environmental impact for the Sahary Cloud platform.

## Base URL

```
/api/v1/solar
```

## Authentication

All endpoints require authentication. Include the JWT token in the Authorization header:

```
Authorization: Bearer <your_jwt_token>
```

## Endpoints

### 1. Get System Status

Get the current status of the solar energy system.

**Endpoint:** `GET /api/v1/solar/status`

**Response:**
```json
{
  "success": true,
  "data": {
    "status": "operational",
    "production": 18.5,
    "consumption": 12.3,
    "efficiency": 66.49,
    "batteryLevel": 85,
    "activeVMs": 5,
    "timestamp": "2024-01-15T10:30:00.000Z"
  }
}
```

**Status Values:**
- `operational` - System is working normally
- `warning` - System has issues but still functioning
- `error` - System error occurred

---

### 2. Get Current Production

Get current solar energy production data.

**Endpoint:** `GET /api/v1/solar/production`

**Response:**
```json
{
  "success": true,
  "data": {
    "production": 18.5,
    "timestamp": "2024-01-15T10:30:00.000Z"
  }
}
```

---

### 3. Get Current Consumption

Get current energy consumption from all active VMs.

**Endpoint:** `GET /api/v1/solar/consumption`

**Response:**
```json
{
  "success": true,
  "data": {
    "consumption": 12.3,
    "vmCount": 5,
    "timestamp": "2024-01-15T10:30:00.000Z"
  }
}
```

---

### 4. Get Environmental Impact

Get environmental impact report for a specific period.

**Endpoint:** `GET /api/v1/solar/environmental-impact`

**Query Parameters:**
- `period` (optional): Time period - `day`, `week`, or `month` (default: `day`)

**Example Request:**
```bash
GET /api/v1/solar/environmental-impact?period=month
```

**Response:**
```json
{
  "success": true,
  "data": {
    "period": "month",
    "environmentalImpact": {
      "co2Saved": 1250.5,
      "treesEquivalent": 21.75,
      "solarEnergyUsed": 2501.0
    },
    "totalProduction": 2501.0,
    "totalConsumption": 2100.8
  }
}
```

**Environmental Impact Metrics:**
- `co2Saved`: CO2 emissions saved in kg
- `treesEquivalent`: Equivalent number of trees planted
- `solarEnergyUsed`: Total solar energy used in kWh

---

### 5. Get Solar Statistics

Get aggregated solar statistics for a period.

**Endpoint:** `GET /api/v1/solar/statistics`

**Query Parameters:**
- `period` (optional): Time period - `day`, `week`, or `month` (default: `day`)

**Example Request:**
```bash
GET /api/v1/solar/statistics?period=week
```

**Response:**
```json
{
  "success": true,
  "data": {
    "totalProduction": 850.5,
    "totalConsumption": 720.3,
    "averageEfficiency": 84.68,
    "environmentalImpact": {
      "co2Saved": 425.25,
      "treesEquivalent": 7.39,
      "solarEnergyUsed": 850.5
    },
    "dataPoints": 672,
    "period": "week"
  }
}
```

---

### 6. Get Solar Data History

Get historical solar data for a date range.

**Endpoint:** `GET /api/v1/solar/history`

**Query Parameters:**
- `startDate` (optional): Start date in ISO format (default: 24 hours ago)
- `endDate` (optional): End date in ISO format (default: now)

**Example Request:**
```bash
GET /api/v1/solar/history?startDate=2024-01-01T00:00:00Z&endDate=2024-01-31T23:59:59Z
```

**Response:**
```json
{
  "success": true,
  "count": 2976,
  "data": [
    {
      "id": "clr1234567890",
      "production": 18.5,
      "consumption": 12.3,
      "efficiency": 66.49,
      "timestamp": "2024-01-15T10:30:00.000Z"
    },
    {
      "id": "clr0987654321",
      "production": 15.2,
      "consumption": 11.8,
      "efficiency": 77.63,
      "timestamp": "2024-01-15T10:15:00.000Z"
    }
  ]
}
```

---

### 7. Get Battery Level (Admin Only)

Get the current battery level for backup power.

**Endpoint:** `GET /api/v1/solar/battery`

**Authorization:** Requires `ADMIN` or `SUPER_ADMIN` role

**Response:**
```json
{
  "success": true,
  "data": {
    "level": 85,
    "timestamp": "2024-01-15T10:30:00.000Z"
  }
}
```

---

### 8. Manually Collect Data (Admin Only)

Manually trigger solar data collection.

**Endpoint:** `POST /api/v1/solar/collect`

**Authorization:** Requires `ADMIN` or `SUPER_ADMIN` role

**Response:**
```json
{
  "success": true,
  "message": "Solar data collected successfully",
  "data": {
    "id": "clr1234567890",
    "production": 18.5,
    "consumption": 12.3,
    "efficiency": 66.49,
    "timestamp": "2024-01-15T10:30:00.000Z"
  }
}
```

---

## Error Responses

All endpoints may return the following error responses:

### 400 Bad Request
```json
{
  "success": false,
  "error": "Invalid period. Must be day, week, or month"
}
```

### 401 Unauthorized
```json
{
  "success": false,
  "error": "Not authorized to access this route"
}
```

### 403 Forbidden
```json
{
  "success": false,
  "error": "User role is not authorized to access this route"
}
```

### 500 Internal Server Error
```json
{
  "success": false,
  "error": "Failed to calculate solar statistics"
}
```

---

## Data Collection

Solar data is automatically collected every 15 minutes by a background job. The collection schedule can be configured using the `SOLAR_COLLECTION_SCHEDULE` environment variable (cron format).

Default schedule: `*/15 * * * *` (every 15 minutes)

---

## Calculations

### Efficiency Calculation
```
Efficiency = (Consumption / Production) × 100
```
Capped at 100% maximum.

### CO2 Savings Calculation
```
CO2 Saved (kg) = Solar Energy Used (kWh) × 0.5 kg/kWh
```
Based on average grid electricity emissions.

### Trees Equivalent Calculation
```
Trees Equivalent = (CO2 Saved × 365 days) / 21 kg CO2/tree/year
```
Based on average CO2 absorption per tree.

### Energy Consumption Estimation
```
VM Power = (CPU cores × 50W) + (RAM GB × 5W)
Total Consumption = Sum of all running VMs power / 1000 (to convert to kW)
```

---

## Example Usage

### Get Today's Environmental Impact

```bash
curl -X GET \
  'http://localhost:3000/api/v1/solar/environmental-impact?period=day' \
  -H 'Authorization: Bearer YOUR_JWT_TOKEN'
```

### Get Last Week's Statistics

```bash
curl -X GET \
  'http://localhost:3000/api/v1/solar/statistics?period=week' \
  -H 'Authorization: Bearer YOUR_JWT_TOKEN'
```

### Get Historical Data for January

```bash
curl -X GET \
  'http://localhost:3000/api/v1/solar/history?startDate=2024-01-01T00:00:00Z&endDate=2024-01-31T23:59:59Z' \
  -H 'Authorization: Bearer YOUR_JWT_TOKEN'
```

### Check System Status

```bash
curl -X GET \
  'http://localhost:3000/api/v1/solar/status' \
  -H 'Authorization: Bearer YOUR_JWT_TOKEN'
```

---

## Notes

- All timestamps are in ISO 8601 format (UTC)
- Energy values are in kilowatt-hours (kWh)
- CO2 values are in kilograms (kg)
- Battery level is a percentage (0-100)
- Efficiency is a percentage (0-100)
- The system uses simulated data when the actual solar monitoring API is unavailable (development mode)

---

## Configuration

Required environment variables:

```env
# Solar Energy Monitoring API
SOLAR_API_URL="http://localhost:8080"
SOLAR_API_KEY="your-solar-monitoring-api-key"
SOLAR_COLLECTION_SCHEDULE="*/15 * * * *"
```

---

## Support

For issues or questions about the Solar Monitoring API, please contact the development team or refer to the main API documentation.
