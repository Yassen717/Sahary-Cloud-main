'use client';

import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface CopyButtonProps {
  value: string;
  /** Used for the aria-label and screen-reader feedback, e.g. "TXT value". */
  label: string;
  className?: string;
}

export function CopyButton({ value, label, className }: CopyButtonProps) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({
        title: 'Copy failed',
        description: 'The clipboard is not available in this browser.',
        variant: 'destructive',
      });
    }
  };

  return (
    <>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className={cn('h-6 w-6 shrink-0', className)}
        aria-label={`Copy ${label}`}
        onClick={copy}
      >
        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      </Button>
      <span className="sr-only" role="status" aria-live="polite">
        {copied ? `${label} copied to clipboard` : ''}
      </span>
    </>
  );
}
