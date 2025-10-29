const { z } = require('zod');

// Solar data query validation
const solarDataQuerySchema = z.object({
  query: z.object({
    startDate: z
      .string()
      .datetime('Invalid start date format')
      .optional(),
    
    endDate: z
      .string()
      .datetime('Invalid end date format')
      .optional(),
    
    period: z
      .enum(['hour', 'day', 'week', 'month'])
      .optional()
      .default('day'),
    
    metrics: z
      .string()
      .transform(val => val.split(',').map(m => m.trim()))
      .refine(
        val => val.every(metric => 
          ['production', 'consumption', 'efficiency', 'co2Saved', 'temperature', 'solarIrradiance'].includes(metric)
        ),
        'Invalid metrics specified'
      )
      .optional(),
    
    page: z
      .string()
      .regex(/^\d+$/, 'Page must be a positive integer')
      .transform(Number)
      .refine(val => val > 0, 'Page must be greater than 0')
      .optional()
      .default('1'),
    
    limit: z
      .string()
      .regex(/^\d+$/, 'Limit must be a positive integer')
      .transform(Number)
      .refine(val => val > 0 && val <= 1000, 'Limit must be between 1 and 1000')
      .optional()
      .default('100'),
    
    sortBy: z
      .enum(['timestamp', 'production', 'consumption', 'efficiency'])
      .optional()
      .default('timestamp'),
    
    sortOrder: z
      .enum(['asc', 'desc'])
      .optional()
      .default('desc'),
  }).refine((data) => {
    if (data.startDate && data.endDate) {
      return new Date(data.startDate) <= new Date(data.endDate);
    }
    return true;
  }, {
    message: 'Start date must be before or equal to end date',
    path: ['endDate'],
  }),
});

// Solar data creation validation (for API endpoints that accept solar data)
const createSolarDataSchema = z.object({
  body: z.object({
    production: z
      .number({
        required_error: 'Production is required',
      })
      .min(0, 'Production cannot be negative')
      .max(1000, 'Production cannot exceed 1000 kWh'),
    
    consumption: z
      .number({
        required_error: 'Consumption is required',
      })
      .min(0, 'Consumption cannot be negative')
      .max(1000, 'Consumption cannot exceed 1000 kWh'),
    
    efficiency: z
      .number()
      .min(0, 'Efficiency cannot be negative')
      .max(100, 'Efficiency cannot exceed 100%')
      .optional()
      .default(0),
    
    co2Saved: z
      .number()
      .min(0, 'CO2 saved cannot be negative')
      .optional()
      .default(0),
    
    solarIrradiance: z
      .number()
      .min(0, 'Solar irradiance cannot be negative')
      .max(1500, 'Solar irradiance cannot exceed 1500 W/m²')
      .optional(),
    
    temperature: z
      .number()
      .min(-50, 'Temperature cannot be below -50°C')
      .max(70, 'Temperature cannot exceed 70°C')
      .optional(),
    
    cloudCover: z
      .number()
      .min(0, 'Cloud cover cannot be negative')
      .max(100, 'Cloud cover cannot exceed 100%')
      .optional(),
    
    systemStatus: z
      .enum(['NORMAL', 'WARNING', 'ERROR', 'MAINTENANCE', 'OFFLINE'])
      .optional()
      .default('NORMAL'),
    
    timestamp: z
      .string()
      .datetime('Invalid timestamp format')
      .optional(),
  }),
});

// Environmental impact query validation
const environmentalImpactQuerySchema = z.object({
  query: z.object({
    startDate: z
      .string()
      .datetime('Invalid start date format')
      .optional(),
    
    endDate: z
      .string()
      .datetime('Invalid end date format')
      .optional(),
    
    period: z
      .enum(['day', 'week', 'month', 'year'])
      .optional()
      .default('month'),
    
    compareWith: z
      .enum(['traditional', 'renewable', 'grid'])
      .optional()
      .default('traditional'),
    
    includeProjections: z
      .string()
      .transform(val => val === 'true')
      .optional()
      .default(false),
  }).refine((data) => {
    if (data.startDate && data.endDate) {
      return new Date(data.startDate) <= new Date(data.endDate);
    }
    return true;
  }, {
    message: 'Start date must be before or equal to end date',
    path: ['endDate'],
  }),
});

// Solar system status update validation
const updateSystemStatusSchema = z.object({
  body: z.object({
    status: z
      .enum(['NORMAL', 'WARNING', 'ERROR', 'MAINTENANCE', 'OFFLINE'], {
        required_error: 'System status is required',
      }),
    
    reason: z
      .string()
      .min(10, 'Reason must be at least 10 characters')
      .max(500, 'Reason must not exceed 500 characters')
      .optional(),
    
    estimatedDuration: z
      .number()
      .int('Duration must be an integer')
      .min(1, 'Duration must be at least 1 minute')
      .max(10080, 'Duration cannot exceed 1 week') // 1 week in minutes
      .optional(),
    
    notifyUsers: z
      .boolean()
      .optional()
      .default(true),
  }),
});

// Solar efficiency analysis validation
const efficiencyAnalysisSchema = z.object({
  query: z.object({
    startDate: z
      .string()
      .datetime('Invalid start date format')
      .optional(),
    
    endDate: z
      .string()
      .datetime('Invalid end date format')
      .optional(),
    
    analysisType: z
      .enum(['performance', 'weather_correlation', 'seasonal', 'maintenance'])
      .optional()
      .default('performance'),
    
    includeWeatherData: z
      .string()
      .transform(val => val === 'true')
      .optional()
      .default(false),
    
    granularity: z
      .enum(['hour', 'day', 'week'])
      .optional()
      .default('day'),
  }).refine((data) => {
    if (data.startDate && data.endDate) {
      const start = new Date(data.startDate);
      const end = new Date(data.endDate);
      const diffDays = (end - start) / (1000 * 60 * 60 * 24);
      
      // Limit analysis period to 1 year
      return diffDays <= 365;
    }
    return true;
  }, {
    message: 'Analysis period cannot exceed 1 year',
    path: ['endDate'],
  }),
});

// Solar forecast validation
const solarForecastSchema = z.object({
  query: z.object({
    days: z
      .string()
      .regex(/^\d+$/, 'Days must be a positive integer')
      .transform(Number)
      .refine(val => val > 0 && val <= 7, 'Forecast days must be between 1 and 7')
      .optional()
      .default('3'),
    
    includeWeather: z
      .string()
      .transform(val => val === 'true')
      .optional()
      .default(true),
    
    granularity: z
      .enum(['hour', 'day'])
      .optional()
      .default('hour'),
  }),
});

// Solar alert configuration validation
const solarAlertConfigSchema = z.object({
  body: z.object({
    alertType: z
      .enum(['low_production', 'high_consumption', 'system_error', 'maintenance_due'])
      .array()
      .min(1, 'At least one alert type must be selected'),
    
    thresholds: z.object({
      lowProductionThreshold: z
        .number()
        .min(0, 'Low production threshold cannot be negative')
        .max(100, 'Low production threshold cannot exceed 100%')
        .optional(),
      
      highConsumptionThreshold: z
        .number()
        .min(0, 'High consumption threshold cannot be negative')
        .optional(),
      
      efficiencyThreshold: z
        .number()
        .min(0, 'Efficiency threshold cannot be negative')
        .max(100, 'Efficiency threshold cannot exceed 100%')
        .optional(),
    }).optional(),
    
    notificationMethods: z
      .enum(['email', 'sms', 'push', 'webhook'])
      .array()
      .min(1, 'At least one notification method must be selected'),
    
    isEnabled: z
      .boolean()
      .optional()
      .default(true),
  }),
});

module.exports = {
  solarDataQuerySchema,
  createSolarDataSchema,
  environmentalImpactQuerySchema,
  updateSystemStatusSchema,
  efficiencyAnalysisSchema,
  solarForecastSchema,
  solarAlertConfigSchema,
};