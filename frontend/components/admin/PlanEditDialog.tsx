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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, AlertCircle, Info } from 'lucide-react';
import type { AdminHostingPlanDTO } from '@/lib/hosting-types';
import type { AdminUpdatePlanPatch } from '@/lib/hosting-api';

interface PlanEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  plan: AdminHostingPlanDTO | null;
  onConfirm: (id: string, patch: AdminUpdatePlanPatch) => Promise<void>;
}

type NumericField = 'monthlyPrice' | 'diskGB' | 'bandwidthGB' | 'maxDomains' | 'maxDatabases' | 'maxFtpAccounts';

const FIELDS: Array<{ key: NumericField; label: string; integer: boolean }> = [
  { key: 'monthlyPrice', label: 'Monthly price (USD)', integer: false },
  { key: 'diskGB', label: 'Disk space (GB)', integer: false },
  { key: 'bandwidthGB', label: 'Bandwidth (GB)', integer: false },
  { key: 'maxDomains', label: 'Max domains', integer: true },
  { key: 'maxDatabases', label: 'Max databases', integer: true },
  { key: 'maxFtpAccounts', label: 'Max FTP accounts', integer: true },
];

export function PlanEditDialog({ open, onOpenChange, plan, onConfirm }: PlanEditDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && plan && (
        <PlanEditDialogInner
          plan={plan}
          onConfirm={onConfirm}
          close={() => onOpenChange(false)}
        />
      )}
    </Dialog>
  );
}

function PlanEditDialogInner({
  plan,
  onConfirm,
  close,
}: {
  plan: AdminHostingPlanDTO;
  onConfirm: (id: string, patch: AdminUpdatePlanPatch) => Promise<void>;
  close: () => void;
}) {
  const [values, setValues] = useState<Record<NumericField, string>>({
    monthlyPrice: String(plan.monthlyPrice),
    diskGB: String(plan.diskGB),
    bandwidthGB: String(plan.bandwidthGB),
    maxDomains: String(plan.maxDomains),
    maxDatabases: String(plan.maxDatabases),
    maxFtpAccounts: String(plan.maxFtpAccounts),
  });
  const [description, setDescription] = useState(plan.description ?? '');
  const [isActive, setIsActive] = useState(plan.isActive);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsed = {} as Record<NumericField, number>;
  let invalid: string | null = null;
  for (const field of FIELDS) {
    const raw = values[field.key].trim();
    const num = field.integer ? parseInt(raw, 10) : Number(raw);
    if (raw === '' || Number.isNaN(num) || num < 0 || (field.integer && !/^\d+$/.test(raw))) {
      invalid = field.label;
      break;
    }
    parsed[field.key] = num;
  }

  const handleSubmit = async () => {
    if (invalid) return;
    setSubmitting(true);
    setError(null);
    try {
      await onConfirm(plan.id, {
        description: description.trim() || null,
        monthlyPrice: parsed.monthlyPrice,
        diskGB: parsed.diskGB,
        bandwidthGB: parsed.bandwidthGB,
        maxDomains: parsed.maxDomains,
        maxDatabases: parsed.maxDatabases,
        maxFtpAccounts: parsed.maxFtpAccounts,
        isActive,
      });
      close();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update the plan');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <DialogContent className="max-w-lg">
      <DialogHeader>
        <DialogTitle>Edit plan — {plan.name}</DialogTitle>
        <DialogDescription>
          {plan.accountCount} account{plan.accountCount === 1 ? '' : 's'} on this plan.
        </DialogDescription>
      </DialogHeader>

      <div className="grid gap-4 sm:grid-cols-2">
        {FIELDS.map((field) => (
          <div key={field.key} className="space-y-1.5">
            <Label htmlFor={`plan-${field.key}`}>{field.label}</Label>
            <Input
              id={`plan-${field.key}`}
              inputMode={field.integer ? 'numeric' : 'decimal'}
              value={values[field.key]}
              onChange={(event) =>
                setValues((prev) => ({ ...prev, [field.key]: event.target.value }))
              }
              disabled={submitting}
              aria-invalid={invalid === field.label || undefined}
            />
          </div>
        ))}
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="plan-description">Description</Label>
          <Textarea
            id="plan-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={2}
            disabled={submitting}
          />
        </div>
        <div className="flex items-center gap-3 sm:col-span-2">
          <Switch
            id="plan-active"
            checked={isActive}
            onCheckedChange={setIsActive}
            disabled={submitting}
          />
          <Label htmlFor="plan-active">Plan is purchasable (active)</Label>
        </div>
      </div>

      <Alert>
        <Info className="h-4 w-4" aria-hidden="true" />
        <AlertDescription>
          Price changes apply to new subscribers only. Existing subscriptions keep their
          current price.
        </AlertDescription>
      </Alert>

      {invalid && (
        <p className="text-sm text-destructive" role="alert">
          Enter a valid {invalid === 'Monthly price (USD)' ? 'price' : invalid.toLowerCase()} — a
          non-negative {FIELDS.find((f) => f.label === invalid)?.integer ? 'whole number' : 'number'}.
        </p>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" aria-hidden="true" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <DialogFooter>
        <Button variant="outline" onClick={close} disabled={submitting}>
          Cancel
        </Button>
        <Button onClick={handleSubmit} disabled={!!invalid || submitting}>
          {submitting && <Loader2 className="me-2 h-4 w-4 animate-spin" aria-hidden="true" />}
          Save changes
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
