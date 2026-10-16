'use client';

import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import type { UsageLevel } from '@/lib/hosting-types';

interface UsageBarProps {
  label: string;
  used: number;
  quota: number;
  unit?: string;
  level?: UsageLevel;
}

export function UsageBar({ label, used, quota, unit = 'GB', level }: UsageBarProps) {
  const percent =
    quota > 0 ? Math.min(100, (used / quota) * 100) : used > 0 ? 100 : 0;
  const effectiveLevel: UsageLevel =
    level ?? (percent >= 100 ? 'EXCEEDED' : percent >= 80 ? 'WARNING' : 'OK');

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="font-medium">{label}</span>
        <span className="text-muted-foreground">
          {used} / {quota} {unit} ({Math.round(percent)}%)
        </span>
      </div>
      <Progress
        value={percent}
        aria-label={label}
        className={cn(
          effectiveLevel === 'WARNING' && '[&>div]:bg-amber-500',
          effectiveLevel === 'EXCEEDED' && '[&>div]:bg-destructive',
        )}
      />
    </div>
  );
}
