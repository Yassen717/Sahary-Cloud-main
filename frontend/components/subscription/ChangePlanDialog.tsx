'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, TrendingDown, TrendingUp, ArrowLeftRight, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { HostingPlanDTO } from '@/lib/hosting-types';

interface ChangePlanDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentPlan: HostingPlanDTO;
  plans: HostingPlanDTO[];
  onConfirm: (planId: string) => Promise<void>;
}

/** Dialog to pick a different plan; upgrade/downgrade is priced by Stripe with proration. */
export function ChangePlanDialog({
  open,
  onOpenChange,
  currentPlan,
  plans,
  onConfirm,
}: ChangePlanDialogProps) {
  const alternatives = plans
    .filter((plan) => plan.isActive && plan.purchasable && plan.id !== currentPlan.id)
    .sort((a, b) => a.monthlyPrice - b.monthlyPrice);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && (
        <ChangePlanDialogInner
          currentPlan={currentPlan}
          alternatives={alternatives}
          onConfirm={onConfirm}
          close={() => onOpenChange(false)}
        />
      )}
    </Dialog>
  );
}

interface ChangePlanDialogInnerProps {
  currentPlan: HostingPlanDTO;
  alternatives: HostingPlanDTO[];
  onConfirm: (planId: string) => Promise<void>;
  close: () => void;
}

function ChangePlanDialogInner({
  currentPlan,
  alternatives,
  onConfirm,
  close,
}: ChangePlanDialogInnerProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = alternatives.find((plan) => plan.id === selectedId) ?? null;
  const isDowngrade = selected !== null && selected.monthlyPrice < currentPlan.monthlyPrice;

  const handleConfirm = async () => {
    if (!selected) return;
    setSubmitting(true);
    setError(null);
    try {
      await onConfirm(selected.id);
      close();
    } catch (err) {
      // Show the API message verbatim (e.g. the 409 downgrade limit violations).
      setError(err instanceof Error ? err.message : 'Failed to change plan');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <DialogContent className="max-w-xl">
      <DialogHeader>
        <DialogTitle>Change plan</DialogTitle>
        <DialogDescription>
          You are currently on <span className="font-medium">{currentPlan.name}</span> ($
          {currentPlan.monthlyPrice.toFixed(2)}/month). Price changes are prorated by Stripe.
        </DialogDescription>
      </DialogHeader>

      {alternatives.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">
          There are no other plans available to switch to right now.
        </p>
      ) : (
        <div className="space-y-2" role="radiogroup" aria-label="Choose a new plan">
          {alternatives.map((plan) => {
            const upgrade = plan.monthlyPrice > currentPlan.monthlyPrice;
            const downgrade = plan.monthlyPrice < currentPlan.monthlyPrice;
            const selectedRow = plan.id === selectedId;
            return (
              <button
                key={plan.id}
                type="button"
                role="radio"
                aria-checked={selectedRow}
                onClick={() => {
                  setSelectedId(plan.id);
                  setError(null);
                }}
                className={cn(
                  'flex w-full items-center justify-between gap-3 rounded-lg border p-3 text-start transition-colors hover:border-primary/60',
                  selectedRow && 'border-primary ring-1 ring-primary',
                )}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{plan.name}</span>
                    {upgrade && (
                      <Badge className="gap-1 border-transparent bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                        <TrendingUp className="h-3 w-3" aria-hidden="true" />
                        Upgrade
                      </Badge>
                    )}
                    {downgrade && (
                      <Badge className="gap-1 border-transparent bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
                        <TrendingDown className="h-3 w-3" aria-hidden="true" />
                        Downgrade
                      </Badge>
                    )}
                    {!upgrade && !downgrade && (
                      <Badge variant="outline" className="gap-1">
                        <ArrowLeftRight className="h-3 w-3" aria-hidden="true" />
                        Same price
                      </Badge>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {plan.diskGB} GB storage · {plan.bandwidthGB} GB bandwidth ·{' '}
                    {plan.maxDomains} domain{plan.maxDomains === 1 ? '' : 's'} ·{' '}
                    {plan.maxDatabases} database{plan.maxDatabases === 1 ? '' : 's'}
                  </p>
                </div>
                <span className="shrink-0 font-semibold">
                  ${plan.monthlyPrice.toFixed(2)}
                  <span className="text-xs font-normal text-muted-foreground">/mo</span>
                </span>
              </button>
            );
          })}
        </div>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" aria-hidden="true" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {selected && isDowngrade && !error && (
        <p className="text-xs text-muted-foreground">
          Downgrades are only possible while your current usage fits within the new plan limits.
        </p>
      )}

      <DialogFooter>
        <Button variant="outline" onClick={close} disabled={submitting}>
          Cancel
        </Button>
        <Button onClick={handleConfirm} disabled={!selected || submitting}>
          {submitting ? (
            <>
              <Loader2 className="me-2 h-4 w-4 animate-spin" aria-hidden="true" />
              Changing plan...
            </>
          ) : selected ? (
            `Switch to ${selected.name}`
          ) : (
            'Select a plan'
          )}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
