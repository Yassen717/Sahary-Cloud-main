'use client';

import { useId, useState } from 'react';
import { Check, Copy, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';

interface SecretFieldProps {
  label: string;
  value: string;
}

export function SecretField({ label, value }: SecretFieldProps) {
  const { toast } = useToast();
  const inputId = useId();
  const [visible, setVisible] = useState(false);
  const [feedback, setFeedback] = useState<'copied' | 'failed' | null>(null);

  const copy = async () => {
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
    <div className="space-y-1">
      <Label htmlFor={inputId}>{label}</Label>
      <div className="flex items-center gap-1">
        <Input
          id={inputId}
          readOnly
          type={visible ? 'text' : 'password'}
          value={value}
          className="font-mono"
          aria-label={label}
        />
        <Button
          type="button"
          size="icon"
          variant="ghost"
          aria-label={visible ? `Hide ${label}` : `Show ${label}`}
          aria-pressed={visible}
          onClick={() => setVisible((v) => !v)}
        >
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </Button>
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
