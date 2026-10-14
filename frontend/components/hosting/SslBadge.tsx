import { ShieldCheck, ShieldAlert, ShieldX, ShieldOff } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { SslStatus } from '@/lib/hosting-types';

const SSL_CONFIG: Record<
  SslStatus,
  { label: string; icon: typeof ShieldCheck; className: string }
> = {
  NONE: {
    label: 'No SSL',
    icon: ShieldOff,
    className: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400',
  },
  PENDING: {
    label: 'SSL pending',
    icon: ShieldAlert,
    className:
      'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  },
  ACTIVE: {
    label: 'SSL active',
    icon: ShieldCheck,
    className:
      'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  },
  FAILED: {
    label: 'SSL failed',
    icon: ShieldX,
    className: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  },
};

interface SslBadgeProps {
  status: SslStatus;
  className?: string;
}

export function SslBadge({ status, className }: SslBadgeProps) {
  const { label, icon: Icon, className: statusClass } = SSL_CONFIG[status];
  return (
    <Badge
      variant="outline"
      className={cn('border-transparent gap-1', statusClass, className)}
    >
      <Icon className="h-3 w-3" />
      {label}
    </Badge>
  );
}
