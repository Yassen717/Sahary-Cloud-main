'use client';

import { Check, Loader2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

const STEPS = [
  { title: 'Payment received', description: 'Your checkout is complete.' },
  { title: 'Setting up your hosting', description: 'Creating your website, database and FTP account.' },
  { title: 'Ready', description: 'Your site is live and ready to use.' },
] as const;

interface CheckoutSetupProps {
  /** Index of the step currently in progress (0-based). */
  currentStep: number;
}

/** Progress stepper shown while a paid account is being provisioned. */
export function CheckoutSetup({ currentStep }: CheckoutSetupProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Setting up your hosting</CardTitle>
        <CardDescription>
          This usually takes less than a minute. You can stay on this page.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ol className="space-y-4" aria-label="Setup progress">
          {STEPS.map((step, index) => {
            const done = index < currentStep;
            const active = index === currentStep;
            return (
              <li key={step.title} className="flex items-start gap-3">
                <span
                  aria-hidden="true"
                  className={cn(
                    'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs',
                    done && 'border-green-500 bg-green-500 text-white',
                    active && 'border-primary text-primary',
                    !done && !active && 'border-muted-foreground/40 text-muted-foreground',
                  )}
                >
                  {done ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : active ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    index + 1
                  )}
                </span>
                <div>
                  <p className={cn('text-sm font-medium', !done && !active && 'text-muted-foreground')}>
                    {step.title}
                    <span className="sr-only">
                      {done ? ' (done)' : active ? ' (in progress)' : ' (pending)'}
                    </span>
                  </p>
                  <p className="text-xs text-muted-foreground">{step.description}</p>
                </div>
              </li>
            );
          })}
        </ol>
      </CardContent>
    </Card>
  );
}
