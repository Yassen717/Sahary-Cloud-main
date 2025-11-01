# Usage Tracking System Documentation

## Overview

The Usage Tracking System is a comprehensive solution for monitoring and billing VM resource consumption in real-time. It automatically collects usage metrics, calculates costs, and provides detailed analytics for both users and administrators.

## Architecture

### Components

1. **BillingService** - Core service for usage tracking and cost calculation
2. **UsageCollector** - Background job for periodic usage collection
3. **UsageRecord Model** - Database model for storing usage data

### Data Flow

```
Running VM → Docker Stats → UsageCollector → BillingService → UsageRecord → Database
                                                    ↓
                                              Cost Calculation
                                                    ↓
                                              User Billing
```

## Features

### 1. Real-Time Usage Tracking

- Automatic collection every 5 minutes (configurable)
- Tracks CPU, RAM, Storage, and Bandwidth usage
- Docker container integration for accurate metrics
- Graceful error handling

### 2. Cost Calculation

- Dynamic pricing based on actual resource utilization
- Weighted cost factors (CPU: 40%, RAM: 40%, Storage: 20%)
- Bandwidth billing per GB
- Hourly rate prorated by minute

### 3. Usage Analytics

- Per-VM statistics
- User-level aggregation
- Time-based breakdowns (hour, day, week, month)
- Peak usage tracking
- Average usage calculation

### 4. Flexible Querying

- Date range filtering
- Pagination support
- Multiple grouping options
- Real-time and historical data

## Usage Recording

### Recording Usage

```javascript
const BillingService = require('./services/billingService');

// Record usage for a VM
const usageRecord = await BillingService.recordUsage(vmId, {
  cpuUsage: 45.5,        // CPU usage percentage (0-100)
  ramUsage: 1024,        // RAM usage in MB
  storageUsage: 20,      // Storage usage in GB
  bandwidthUsage: 500,   // Bandwidth usage in MB
  duration: 60           // Duration in minutes
});

console.log(`Cost: $${usageRecord.cost}`);
```

### Cost Calculation Formula

```javascript
// Base calculation
hourlyRate = VM.hourlyRate
cpuUtilization = cpuUsage / 100
ramUtilization = ramUsage / VM.ram
storageUtilization = storageUsage / VM.storage

// Weighted utilization
utilizationFactor = 
  (cpuUtilization * 0.4) + 
  (ramUtilization * 0.4) + 
  (storageUtilization * 0.2)

// Time-based cost
hourlyUsageCost = hourlyRate * utilizationFactor
minuteCost = hourlyUsageCost / 60
timeCost = minuteCost * duration

// Bandwidth cost
bandwidthCostPerGB = 0.01
bandwidthCost = (bandwidthUsage / 1024) * bandwidthCostPerGB

// Total cost
totalCost = timeCost + bandwidthCost
```

## Usage Statistics

### Get VM Usage

```javascript
// Get usage for a specific VM
const usage = await BillingService.getVMUsage(vmId, {
  startDate: '2024-01-01T00:00:00Z',
  endDate: '2024-01-31T23:59:59Z',
  page: 1,
  limit: 100,
  groupBy: 'day'
});

console.log('Total Cost:', usage.statistics.totalCost);
console.log('Average CPU:', usage.statistics.averages.cpu);
console.log('Peak RAM:', usage.statistics.peaks.ram);
```

### Get User Usage

```javascript
// Get total usage for a user across all VMs
const userUsage = await BillingService.getUserUsage(userId, {
  startDate: '2024-01-01T00:00:00Z',
  endDate: '2024-01-31T23:59:59Z'
});

console.log('Total Cost:', userUsage.totalCost);
console.log('Total Duration:', userUsage.totalDuration, 'minutes');
console.log('Total Bandwidth:', userUsage.totalBandwidth, 'GB');
console.log('VM Count:', userUsage.vmCount);

// Per-VM breakdown
userUsage.vms.forEach(vm => {
  console.log(`${vm.vmName}: $${vm.totalCost}`);
});
```

### Get Usage Summary

```javascript
// Get comprehensive usage summary with breakdown
const summary = await BillingService.getUsageSummary(userId, {
  startDate: '2024-01-01T00:00:00Z',
  endDate: '2024-01-31T23:59:59Z',
  groupBy: 'day'
});

// Overall summary
console.log('Summary:', summary.summary);

// Daily breakdown
summary.breakdown.forEach(day => {
  console.log(`${day.period}: $${day.cost}`);
});

// Per-VM details
summary.vms.forEach(vm => {
  console.log(`${vm.vmName}:`, vm);
});
```

## Usage Tracking Control

### Start Tracking

```javascript
// Start tracking for a running VM
const result = await BillingService.startUsageTracking(vmId);
console.log(result.message); // "Usage tracking started"
```

### Stop Tracking

```javascript
// Stop tracking for a VM
const result = await BillingService.stopUsageTracking(vmId);
console.log(result.message); // "Usage tracking stopped"
```

### Collect Current Usage

```javascript
// Get current usage metrics from Docker
const currentUsage = await BillingService.collectCurrentUsage(vmId);

console.log('Current CPU:', currentUsage.cpuUsage, '%');
console.log('Current RAM:', currentUsage.ramUsage, 'MB');
console.log('Current Storage:', currentUsage.storageUsage, 'GB');
console.log('Current Bandwidth:', currentUsage.bandwidthUsage, 'MB');
```

## Usage Collector Job

### Configuration

The usage collector runs automatically in the background and can be configured via environment variables:

```env
# Collection interval in milliseconds (default: 5 minutes)
USAGE_COLLECTION_INTERVAL=300000
```

### Manual Control

```javascript
const usageCollector = require('./jobs/usageCollector');

// Start the collector
usageCollector.start();

// Stop the collector
usageCollector.stop();

// Get status
const status = usageCollector.getStatus();
console.log('Running:', status.isRunning);
console.log('Interval:', status.intervalInMinutes, 'minutes');

// Update interval (in milliseconds)
usageCollector.updateInterval(10 * 60 * 1000); // 10 minutes

// Manual collection
const results = await usageCollector.collect();
console.log('Collected:', results.success, 'VMs');
console.log('Failed:', results.failed, 'VMs');
```

### Collection Results

```javascript
{
  success: 10,      // Number of successful collections
  failed: 0,        // Number of failed collections
  total: 10,        // Total VMs processed
  errors: []        // Array of error details
}
```

## Usage Breakdown

### Grouping Options

- **hour** - Group by hour (YYYY-MM-DD HH:00)
- **day** - Group by day (YYYY-MM-DD)
- **week** - Group by week (YYYY-WXX)
- **month** - Group by month (YYYY-MM)

### Example Breakdown

```javascript
const breakdown = await BillingService.getUsageBreakdown(userId, {
  startDate: '2024-01-01T00:00:00Z',
  endDate: '2024-01-31T23:59:59Z',
  groupBy: 'day'
});

// Output:
[
  {
    period: '2024-01-01',
    cost: 1.25,
    duration: 1440,      // minutes
    bandwidth: 5.5,      // GB
    records: 288         // number of records
  },
  {
    period: '2024-01-02',
    cost: 1.30,
    duration: 1440,
    bandwidth: 6.2,
    records: 288
  },
  // ...
]
```

## Database Schema

### UsageRecord Model

```prisma
model UsageRecord {
  id              String   @id @default(cuid())
  vmId            String
  cpuUsage        Float    // CPU usage percentage (0-100)
  ramUsage        Float    // RAM usage in MB
  storageUsage    Float    // Storage usage in GB
  bandwidthUsage  Float    // Bandwidth usage in MB
  duration        Int      // Duration in minutes
  cost            Decimal  // Calculated cost in USD
  timestamp       DateTime @default(now())
  
  vm              VirtualMachine @relation(fields: [vmId], references: [id])
  
  @@index([vmId, timestamp])
  @@index([timestamp])
}
```

## Performance Considerations

### Indexing

- `vmId` and `timestamp` are indexed for fast queries
- Composite index on `(vmId, timestamp)` for VM-specific queries
- Separate index on `timestamp` for time-range queries

### Optimization Tips

1. **Use Date Ranges** - Always specify date ranges to limit query scope
2. **Pagination** - Use pagination for large result sets
3. **Aggregation** - Use statistics instead of fetching all records
4. **Caching** - Cache frequently accessed statistics
5. **Archiving** - Archive old usage records periodically

### Query Performance

```javascript
// Good - Specific date range with pagination
const usage = await BillingService.getVMUsage(vmId, {
  startDate: '2024-01-01T00:00:00Z',
  endDate: '2024-01-31T23:59:59Z',
  page: 1,
  limit: 100
});

// Better - Use statistics for aggregated data
const stats = await BillingService.calculateUsageStatistics(vmId, {
  startDate: '2024-01-01T00:00:00Z',
  endDate: '2024-01-31T23:59:59Z'
});
```

## Error Handling

### Common Errors

1. **VM Not Found**
   ```javascript
   try {
     await BillingService.recordUsage('invalid-id', usageData);
   } catch (error) {
     console.error('Error:', error.message); // "VM not found"
   }
   ```

2. **VM Not Running**
   ```javascript
   try {
     await BillingService.startUsageTracking(vmId);
   } catch (error) {
     console.error('Error:', error.message); // "VM must be running to track usage"
   }
   ```

3. **Collection Errors**
   ```javascript
   const results = await BillingService.collectAllRunningVMsUsage();
   
   if (results.failed > 0) {
     results.errors.forEach(error => {
       console.error(`VM ${error.vmId} (${error.vmName}): ${error.error}`);
     });
   }
   ```

## Best Practices

### 1. Automatic Tracking

Always start usage tracking when a VM starts:

```javascript
// In VM start handler
await VMService.startVM(vmId, userId);
await BillingService.startUsageTracking(vmId);
```

### 2. Graceful Shutdown

Stop tracking when a VM stops:

```javascript
// In VM stop handler
await BillingService.stopUsageTracking(vmId);
await VMService.stopVM(vmId, userId);
```

### 3. Regular Collection

Let the UsageCollector run automatically:

```javascript
// In server startup
const usageCollector = require('./jobs/usageCollector');
usageCollector.start();

// In server shutdown
process.on('SIGTERM', () => {
  usageCollector.stop();
});
```

### 4. Monitoring

Monitor collection results:

```javascript
const results = await usageCollector.collect();

if (results.failed > 0) {
  // Alert administrators
  logger.error('Usage collection failures', {
    failed: results.failed,
    errors: results.errors
  });
}
```

### 5. Data Retention

Archive old usage records:

```javascript
// Archive records older than 1 year
const oneYearAgo = new Date();
oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

await prisma.usageRecord.deleteMany({
  where: {
    timestamp: {
      lt: oneYearAgo
    }
  }
});
```

## Testing

### Unit Tests

```javascript
describe('BillingService', () => {
  it('should record usage correctly', async () => {
    const record = await BillingService.recordUsage(vmId, usageData);
    expect(record.cost).toBeGreaterThan(0);
  });

  it('should calculate statistics', async () => {
    const stats = await BillingService.calculateUsageStatistics(vmId);
    expect(stats.totalCost).toBeGreaterThan(0);
  });
});
```

### Integration Tests

```javascript
describe('Usage Tracking Integration', () => {
  it('should track usage for running VM', async () => {
    await VMService.startVM(vmId, userId);
    await BillingService.startUsageTracking(vmId);
    
    // Wait for collection
    await new Promise(resolve => setTimeout(resolve, 6000));
    
    const usage = await BillingService.getVMUsage(vmId);
    expect(usage.data.length).toBeGreaterThan(0);
  });
});
```

## Troubleshooting

### Issue: No usage records being created

**Solution:**
1. Check if UsageCollector is running: `usageCollector.getStatus()`
2. Verify VMs are in RUNNING state
3. Check Docker container IDs are valid
4. Review logs for collection errors

### Issue: Incorrect cost calculations

**Solution:**
1. Verify VM hourly rate is set correctly
2. Check usage metrics are within valid ranges
3. Review cost calculation formula
4. Ensure duration is in minutes

### Issue: High database load

**Solution:**
1. Increase collection interval
2. Add database indexes
3. Implement caching for statistics
4. Archive old records

## API Integration

The usage tracking system integrates with the billing API endpoints:

- `GET /api/v1/billing/usage` - Get user usage
- `GET /api/v1/billing/usage/:vmId` - Get VM usage
- `GET /api/v1/billing/usage/summary` - Get usage summary
- `POST /api/v1/billing/usage/collect` - Manual collection (admin)

See [Billing API Documentation](./BILLING_API_DOCUMENTATION.md) for details.

## Support

For issues or questions:
- Check logs: `tail -f logs/usage-collector.log`
- Review audit logs in database
- Contact: support@saharycloud.com
