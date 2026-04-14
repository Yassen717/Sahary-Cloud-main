export type InvoiceStatus = 'PENDING' | 'PAID' | 'OVERDUE' | 'CANCELLED' | 'REFUNDED';
export type PaymentStatus = 'PENDING' | 'COMPLETED' | 'FAILED' | 'REFUNDED';
export type BillingGroupBy = 'hour' | 'day' | 'week' | 'month';
export type NumericLike = number | string | { toString(): string };

export interface UsageRecordInput {
  cpuUsage: number | string;
  ramUsage: number | string;
  storageUsage: number | string;
  bandwidthUsage: number | string;
  duration: number | string;
}

export interface BillingVmSummary {
  id: string;
  cpu: number;
  ram: number;
  storage: number;
  bandwidth?: number | null;
  hourlyRate: string | number;
  userId: string;
}

export interface UsageQueryOptions {
  startDate?: string;
  endDate?: string;
  page?: number | string;
  limit?: number | string;
  groupBy?: BillingGroupBy;
}

export interface UsageAggregationResult {
  totalRecords: number;
  totalCost: number;
  totalDuration: number;
  totalBandwidth: number;
  averages: {
    cpu: number;
    ram: number;
    storage: number;
    bandwidth: number;
  };
  peaks: {
    cpu: number;
    ram: number;
    storage: number;
    bandwidth: number;
  };
}

export interface UsageSummaryResult {
  summary?: {
    totalCost: number;
    totalDuration: number;
    totalBandwidth: number;
    vmCount: number;
  };
  breakdown?: Array<Record<string, unknown>>;
  vms: Array<Record<string, unknown>>;
  totalCost?: number;
  totalDuration?: number;
  totalBandwidth?: number;
  vmCount?: number;
}

export interface InvoiceQueryOptions {
  page?: number | string;
  limit?: number | string;
  status?: InvoiceStatus;
  startDate?: string;
  endDate?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  userId?: string;
}

export interface DiscountInput {
  discountCode?: string;
  discountAmount?: number | string;
  discountPercentage?: number | string;
  reason?: string;
}

export interface InvoiceCreationOptions {
  month?: number;
  year?: number;
  dueInDays?: number;
}

export interface InvoiceBatchOptions {
  month?: number;
  year?: number;
}

export interface InvoiceStatusUpdateMetadata {
  [key: string]: unknown;
}

export interface PaymentQueryOptions {
  page?: number | string;
  limit?: number | string;
  status?: PaymentStatus;
  startDate?: string;
  endDate?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface RefundInput {
  amount?: number | string;
  reason?: string;
}

export interface PaymentIntentOptions {
  paymentMethodId?: string;
  savePaymentMethod?: boolean;
}
