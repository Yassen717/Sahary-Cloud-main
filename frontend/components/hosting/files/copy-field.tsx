'use client';

import { useId, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface CopyFieldProps {
  label: string;
  value: string | null;
  /** Empty-state hint rendered instead of an input when value is null. */
  emptyHint?: string;
  className?: string;
}

/** Read-only value with a copy-to-clipboard button. */
export function CopyField({ label, value, emptyHint, className }: CopyFieldProps) {
  const { toast } = useToast();
  const inputId = useId();
  const [feedback, setFeedback] = useState<'copied' | 'failed' | null>(null);

  const copy = async () => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setFeedback('copied');
    } catch {
      setFeedback('failed');
      toast({
        title: 'Copy failed',
        description: 'The clipboard is not available in this browser.',
        variant: 'destructive',
      });
    } finally {
      setTimeout(() => setFeedback(null), 2000);
    }
  };

  return (
    <div className={cn('space-y-1', className)}>
      <Label htmlFor={inputId}>{label}</Label>
      <div className="flex items-center gap-1">
        {value === null ? (
          <p className="text-sm text-muted-foreground">{emptyHint ?? '—'}</p>
        ) : (
          <>
            <Input
              id={inputId}
              readOnly
              value={value}
              className="font-mono"
              aria-label={label}
              onFocus={(e) => e.target.select()}
            />
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label={`Copy ${label}`}
              onClick={copy}
            >
              {feedback === 'copied' ? (
                <Check className="h-4 w-4" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </Button>
          </>
        )}
      </div>
      <p className="sr-only" role="status" aria-live="polite">
        {feedback === 'copied'
          ? `${label} copied to clipboard`
          : feedback === 'failed'
            ? `Copying ${label} failed`
            : ''}
      </p>
    </div>
  );
}
