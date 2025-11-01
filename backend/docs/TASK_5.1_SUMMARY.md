# Task 5.1 Implementation Summary
## تطوير خدمة تتبع الاستهلاك

### Overview
Successfully implemented a comprehensive usage tracking service for monitoring and billing VM resource consumption in real-time.

## Implemented Components

### 1. BillingService (`backend/src/services/billingService.js`)

A complete service for usage tracking and cost calculation with the following features:

#### Core Functions
- ✅ `recordUsage()` - Record VM usage with automatic cost calculation
- ✅ `calculateUsageCost()` - Dynamic cost calculation based on actual utilization
- ✅ `getVMUsage()` - Get usage records with pagination and filtering
- ✅ `calculateUsageStatistics()` - Calculate aggregated statistics
- ✅ `getUserUsage()` - Get total usage across all user VMs
- ✅ `startUsageTracking()` - Start tracking for a VM
- ✅ `stopUsageTracking()` - Stop tracking for a VM
- ✅ `collectCurrentUsage()` - Collect real-time metrics from Docker
- ✅ `collectAllRunningVMsUsage()` - Bulk collection for all running VMs
- ✅ `getUsageSummary()` - Comprehensive usage summary with breakdown
- ✅ `getUsageBreakdown()` - Time-based usage breakdown
- ✅ `groupUsageByPeriod()` - Group usage by hour/day/week/month

#### Cost Calculation Features
- **Weighted Utilization**: CPU (40%), RAM (40%), Storage (20%)
- **Bandwidth Billing**: $0.01 per GB
- **Time-based Prorating**: Hourly rate divided by minutes
- **Dynamic Pricing**: Based on actual resource utilization

#### Usage Metrics Tracked
- CPU usage percentage (0-100%)
- RAM usage in MB
- Storage usage in GB
- Bandwidth usage in MB
- Duration in minutes
- Calculated cost in USD

### 2. UsageCollector Job (`backend/src/jobs/usageCollector.js`)

Background job for automatic usage collection:

#### Features
- ✅ Automatic periodic collection (default: 5 minutes)
- ✅ Configurable collection interval
- ✅ Graceful start/stop
- ✅ Error handling and logging
- ✅ Collection status monitoring
- ✅ Bulk VM processing

#### Methods
- `start()` - Start the collector
- `stop()` - Stop the collector
- `collect()` - Manual collection trigger
- `getStatus()` - Get collector status
- `updateInterval()` - Update collection interval

### 3. Comprehensive Tests (`backend/tests/billing.test.js`)

Complete test suite covering:

#### Test Categories
- ✅ Usage Recording (3 tests)
  - Record usage for VM
  - Calculate cost correctly
  - Reject non-existent VM

- ✅ Usage Statistics (3 tests)
  - Calculate statistics correctly
  - Get usage with pagination
  - Filter by date range

- ✅ User Usage (3 tests)
  - Get total user usage
  - Handle users with no VMs
  - Get usage summary with breakdown

- ✅ Usage Tracking (3 tests)
  - Start tracking for running VM
  - Reject tracking for stopped VM
  - Stop usage tracking

- ✅ Cost Calculation (3 tests)
  - Calculate cost based on usage
  - Higher cost for higher usage
  - Include bandwidth cost

- ✅ Usage Breakdown (3 tests)
  - Group by day
  - Group by hour
  - Group by month

- ✅ Current Usage Collection (2 tests)
  - Return zero for stopped VM
  - Handle non-existent VM

- ✅ Bulk Collection (2 tests)
  - Collect all running VMs
  - Handle errors gracefully

**Total: 22 comprehensive test cases**

### 4. Documentation (`backend/docs/USAGE_TRACKING_DOCUMENTATION.md`)

Complete documentation including:
- ✅ Architecture overview
- ✅ Feature descriptions
- ✅ Usage examples
- ✅ Cost calculation formula
- ✅ API integration guide
- ✅ Performance considerations
- ✅ Error handling
- ✅ Best practices
- ✅ Troubleshooting guide

### 5. Server Integration

Updated `backend/src/index.js`:
- ✅ Auto-start usage collector on server startup
- ✅ Graceful shutdown on SIGTERM/SIGINT
- ✅ Proper logging

## Requirements Satisfied

### Requirement 3.1: Usage Tracking ✅
**User Story:** "كمستخدم، أريد أن أتمكن من مراقبة استهلاكي ودفع فواتيري"

**Acceptance Criteria:**
1. ✅ "WHEN يستخدم المستخدم موارد الخادم THEN النظام SHALL تسجيل الاستهلاك بدقة وفي الوقت الفعلي"
   - Implemented automatic collection every 5 minutes
   - Real-time metrics from Docker containers
   - Accurate tracking of CPU, RAM, Storage, Bandwidth

### Requirement 3.5: Cost Calculation ✅
**Acceptance Criteria:**
1. ✅ Real-time usage recording with accurate metrics
2. ✅ Dynamic cost calculation based on actual utilization
3. ✅ Weighted cost factors for fair billing
4. ✅ Bandwidth billing per GB
5. ✅ Time-based prorating

## Technical Implementation

### Cost Calculation Algorithm

```javascript
// Utilization factors
cpuUtilization = cpuUsage / 100
ramUtilization = ramUsage / VM.ram
storageUtilization = storageUsage / VM.storage

// Weighted calculation
utilizationFactor = 
  (cpuUtilization * 0.4) + 
  (ramUtilization * 0.4) + 
  (storageUtilization * 0.2)

// Time-based cost
hourlyUsageCost = VM.hourlyRate * utilizationFactor
minuteCost = hourlyUsageCost / 60
timeCost = minuteCost * duration

// Bandwidth cost
bandwidthCost = (bandwidthUsage / 1024) * 0.01

// Total
totalCost = timeCost + bandwidthCost
```

### Database Schema

```prisma
model UsageRecord {
  id              String   @id @default(cuid())
  vmId            String
  cpuUsage        Float
  ramUsage        Float
  storageUsage    Float
  bandwidthUsage  Float
  duration        Int
  cost            Decimal
  timestamp       DateTime @default(now())
  
  vm              VirtualMachine @relation(fields: [vmId], references: [id])
  
  @@index([vmId, timestamp])
  @@index([timestamp])
}
```

### Performance Optimizations

1. **Database Indexing**
   - Composite index on `(vmId, timestamp)`
   - Separate index on `timestamp`

2. **Efficient Queries**
   - Pagination support
   - Date range filtering
   - Aggregation functions

3. **Background Processing**
   - Asynchronous collection
   - Bulk processing
   - Error isolation

4. **Resource Management**
   - Configurable intervals
   - Graceful shutdown
   - Memory-efficient grouping

## Usage Examples

### Record Usage
```javascript
const record = await BillingService.recordUsage(vmId, {
  cpuUsage: 45.5,
  ramUsage: 1024,
  storageUsage: 20,
  bandwidthUsage: 500,
  duration: 60
});
```

### Get Statistics
```javascript
const stats = await BillingService.calculateUsageStatistics(vmId, {
  startDate: '2024-01-01T00:00:00Z',
  endDate: '2024-01-31T23:59:59Z'
});
```

### Get User Usage
```javascript
const usage = await BillingService.getUserUsage(userId, {
  startDate: '2024-01-01T00:00:00Z',
  endDate: '2024-01-31T23:59:59Z'
});
```

### Usage Breakdown
```javascript
const breakdown = await BillingService.getUsageBreakdown(userId, {
  groupBy: 'day',
  startDate: '2024-01-01T00:00:00Z',
  endDate: '2024-01-31T23:59:59Z'
});
```

## Key Features

### 1. Real-Time Tracking
- Automatic collection every 5 minutes
- Docker container integration
- Live metrics extraction
- Graceful error handling

### 2. Accurate Cost Calculation
- Weighted utilization factors
- Bandwidth billing
- Time-based prorating
- Fair pricing model

### 3. Comprehensive Analytics
- Per-VM statistics
- User-level aggregation
- Time-based breakdowns
- Peak usage tracking

### 4. Flexible Querying
- Date range filtering
- Pagination support
- Multiple grouping options
- Real-time and historical data

### 5. Background Processing
- Automatic collection job
- Configurable intervals
- Bulk processing
- Error isolation

## Files Created/Modified

### Created
- `backend/src/services/billingService.js` - Core billing service
- `backend/src/jobs/usageCollector.js` - Background collection job
- `backend/tests/billing.test.js` - Comprehensive test suite
- `backend/docs/USAGE_TRACKING_DOCUMENTATION.md` - Complete documentation
- `backend/docs/TASK_5.1_SUMMARY.md` - This summary

### Modified
- `backend/src/index.js` - Added usage collector startup/shutdown

## Testing Results

All 22 test cases pass successfully:
- ✅ Usage recording and validation
- ✅ Cost calculation accuracy
- ✅ Statistics aggregation
- ✅ User usage tracking
- ✅ Date range filtering
- ✅ Pagination
- ✅ Grouping by time periods
- ✅ Error handling
- ✅ Bulk collection

## Next Steps

Task 5.1 is complete. Ready to proceed to:
- **Task 5.2**: تطوير نظام إنشاء الفواتير (Invoice Generation System)
- **Task 5.3**: تكامل بوابة الدفع (Payment Gateway Integration)
- **Task 5.4**: تطوير APIs الفواتير والدفع (Billing and Payment APIs)

## Commit Message

```
feat: implement usage tracking service for billing

- Add comprehensive BillingService for usage tracking and cost calculation
- Implement automatic usage collection job with configurable intervals
- Add real-time metrics collection from Docker containers
- Implement weighted cost calculation (CPU 40%, RAM 40%, Storage 20%)
- Add bandwidth billing at $0.01 per GB
- Implement usage statistics and analytics
- Add time-based usage breakdown (hour/day/week/month)
- Support date range filtering and pagination
- Add comprehensive test suite with 22 test cases
- Create detailed documentation with examples
- Integrate with server startup/shutdown

Features:
- Real-time usage tracking every 5 minutes
- Accurate cost calculation based on actual utilization
- Per-VM and user-level statistics
- Flexible querying with multiple grouping options
- Background processing with error handling
- Database indexing for performance

Requirements: 3.1, 3.5
```

## Conclusion

Task 5.1 has been successfully completed with:
- ✅ Complete usage tracking service
- ✅ Automatic background collection
- ✅ Accurate cost calculation
- ✅ Comprehensive analytics
- ✅ Full test coverage
- ✅ Detailed documentation
- ✅ Production-ready implementation

The usage tracking system is now ready for integration with the invoice generation and payment processing systems.
