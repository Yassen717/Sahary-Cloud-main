'use client';

import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { HostingAccountStatus, SuspendReason } from '@/lib/hosting-types';

const STATUS_LABELS: Record<HostingAccountStatus, string> = {
  PROVISIONING: 'Provisioning',
  ACTIVE: 'Active',
  SUSPENDED: 'Suspended',
  PROVISION_FAILED: 'Provisioning failed',
  TERMINATED: 'Terminated',
};

const STATUS_CLASSES: Record<HostingAccountStatus, string> = {
  PROVISIONING:
    'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  ACTIVE:
    'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  SUSPENDED:
    'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
  PROVISION_FAILED:
    'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  TERMINATED:
    'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400',
};

const SUSPEND_REASON_LABELS: Record<SuspendReason, string> = {
  PAYMENT_FAILED: 'Payment failed',
  SUBSCRIPTION_CANCELED: 'Subscription canceled',
  BANDWIDTH_EXCEEDED: 'Bandwidth quota exceeded',
  ADMIN: 'Suspended by administrator',
  ABUSE: 'Suspended for abuse',
};

interface StatusBadgeProps {
  status: HostingAccountStatus;
  suspendReason?: SuspendReason | null;
  className?: string;
}

export function StatusBadge({ status, suspendReason, className }: StatusBadgeProps) {
  const badge = (
    <Badge
      variant="outline"
      className={cn('border-transparent', STATUS_CLASSES[status], className)}
    >
      {STATUS_LABELS[status]}
    </Badge>
  );

  if (status === 'SUSPENDED' && suspendReason) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>{badge}</TooltipTrigger>
          <TooltipContent>
            {SUSPEND_REASON_LABELS[suspendReason]}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return badge;
}
