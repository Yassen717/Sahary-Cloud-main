const { z } = require('zod');

// VM creation validation
const createVMSchema = z.object({
  body: z.object({
    name: z
      .string({
        required_error: 'VM name is required',
      })
      .min(3, 'VM name must be at least 3 characters')
      .max(50, 'VM name must not exceed 50 characters')
      .regex(/^[a-zA-Z0-9-_]+$/, 'VM name can only contain letters, numbers, hyphens, and underscores'),
    
    description: z
      .string()
      .max(500, 'Description must not exceed 500 characters')
      .optional(),
    
    cpu: z
      .number({
        required_error: 'CPU cores is required',
      })
      .int('CPU cores must be an integer')
      .min(1, 'CPU cores must be at least 1')
      .max(32, 'CPU cores must not exceed 32'),
    
    ram: z
      .number({
        required_error: 'RAM is required',
      })
      .int('RAM must be an integer')
      .min(512, 'RAM must be at least 512 MB')
      .max(131072, 'RAM must not exceed 128 GB'), // 128 GB in MB
    
    storage: z
      .number({
        required_error: 'Storage is required',
      })
      .int('Storage must be an integer')
      .min(10, 'Storage must be at least 10 GB')
      .max(2048, 'Storage must not exceed 2 TB'), // 2 TB in GB
    
    bandwidth: z
      .number()
      .int('Bandwidth must be an integer')
      .min(100, 'Bandwidth must be at least 100 GB')
      .max(10000, 'Bandwidth must not exceed 10 TB') // 10 TB in GB
      .optional(),
    
    dockerImage: z
      .string()
      .min(1, 'Docker image cannot be empty')
      .max(200, 'Docker image name must not exceed 200 characters')
      .optional(),
  }),
});

// VM update validation
const updateVMSchema = z.object({
  body: z.object({
    name: z
      .string()
      .min(3, 'VM name must be at least 3 characters')
      .max(50, 'VM name must not exceed 50 characters')
      .regex(/^[a-zA-Z0-9-_]+$/, 'VM name can only contain letters, numbers, hyphens, and underscores')
      .optional(),
    
    description: z
      .string()
      .max(500, 'Description must not exceed 500 characters')
      .optional(),
    
    cpu: z
      .number()
      .int('CPU cores must be an integer')
      .min(1, 'CPU cores must be at least 1')
      .max(32, 'CPU cores must not exceed 32')
      .optional(),
    
    ram: z
      .number()
      .int('RAM must be an integer')
      .min(512, 'RAM must be at least 512 MB')
      .max(131072, 'RAM must not exceed 128 GB')
      .optional(),
    
    storage: z
      .number()
      .int('Storage must be an integer')
      .min(10, 'Storage must be at least 10 GB')
      .max(2048, 'Storage must not exceed 2 TB')
      .optional(),
    
    bandwidth: z
      .number()
      .int('Bandwidth must be an integer')
      .min(100, 'Bandwidth must be at least 100 GB')
      .max(10000, 'Bandwidth must not exceed 10 TB')
      .optional(),
  }),
});

// VM action validation (start, stop, restart)
const vmActionSchema = z.object({
  params: z.object({
    id: z
      .string({
        required_error: 'VM ID is required',
      })
      .cuid('Invalid VM ID format'),
  }),
});

// VM query parameters validation
const vmQuerySchema = z.object({
  query: z.object({
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
      .refine(val => val > 0 && val <= 100, 'Limit must be between 1 and 100')
      .optional()
      .default('10'),
    
    status: z
      .enum(['RUNNING', 'STOPPED', 'STARTING', 'STOPPING', 'RESTARTING', 'ERROR', 'SUSPENDED'])
      .optional(),
    
    search: z
      .string()
      .min(1, 'Search term cannot be empty')
      .max(100, 'Search term must not exceed 100 characters')
      .optional(),
    
    sortBy: z
      .enum(['name', 'createdAt', 'updatedAt', 'status', 'cpu', 'ram', 'storage'])
      .optional()
      .default('createdAt'),
    
    sortOrder: z
      .enum(['asc', 'desc'])
      .optional()
      .default('desc'),
  }),
});

// VM backup validation
const createBackupSchema = z.object({
  body: z.object({
    name: z
      .string({
        required_error: 'Backup name is required',
      })
      .min(3, 'Backup name must be at least 3 characters')
      .max(100, 'Backup name must not exceed 100 characters')
      .regex(/^[a-zA-Z0-9-_\s]+$/, 'Backup name can only contain letters, numbers, hyphens, underscores, and spaces'),
    
    description: z
      .string()
      .max(500, 'Description must not exceed 500 characters')
      .optional(),
    
    backupType: z
      .enum(['FULL', 'INCREMENTAL', 'DIFFERENTIAL'])
      .optional()
      .default('FULL'),
  }),
  
  params: z.object({
    id: z
      .string({
        required_error: 'VM ID is required',
      })
      .cuid('Invalid VM ID format'),
  }),
});

// VM resource validation helper
const validateVMResources = (data) => {
  const { cpu, ram, storage } = data;
  
  // Check if resource combination is valid
  const minRamForCpu = cpu * 512; // Minimum 512MB per CPU core
  if (ram < minRamForCpu) {
    throw new Error(`RAM must be at least ${minRamForCpu}MB for ${cpu} CPU core(s)`);
  }
  
  // Check if storage is sufficient for the OS and applications
  const minStorageForRam = Math.max(10, Math.ceil(ram / 1024) * 2); // Minimum 2GB per GB of RAM
  if (storage < minStorageForRam) {
    throw new Error(`Storage must be at least ${minStorageForRam}GB for ${ram}MB of RAM`);
  }
  
  return true;
};

module.exports = {
  createVMSchema,
  updateVMSchema,
  vmActionSchema,
  vmQuerySchema,
  createBackupSchema,
  validateVMResources,
};