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
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, AlertTriangle } from 'lucide-react';

interface DeleteAccountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The exact domain the user must type to confirm deletion. */
  domain: string;
  onConfirm: () => Promise<void>;
}

/** Danger-zone confirmation: the user must type their subdomain to proceed. */
export function DeleteAccountDialog({
  open,
  onOpenChange,
  domain,
  onConfirm,
}: DeleteAccountDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && (
        <DeleteAccountDialogInner
          domain={domain}
          onConfirm={onConfirm}
          close={() => onOpenChange(false)}
        />
      )}
    </Dialog>
  );
}

interface DeleteAccountDialogInnerProps {
  domain: string;
  onConfirm: () => Promise<void>;
  close: () => void;
}

function DeleteAccountDialogInner({ domain, onConfirm, close }: DeleteAccountDialogInnerProps) {
  const [typed, setTyped] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputId = 'confirm-delete-domain';

  const matches = typed.trim() === domain;

  const handleConfirm = async () => {
    if (!matches) return;
    setSubmitting(true);
    setError(null);
    try {
      await onConfirm();
      close();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete the hosting account');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2 text-destructive">
          <AlertTriangle className="h-5 w-5" aria-hidden="true" />
          Delete hosting account
        </DialogTitle>
        <DialogDescription>
          This permanently deletes the hosting account for{' '}
          <span className="font-medium">{domain}</span>. Your subscription is canceled
          immediately, your website goes offline, and your files are kept for a short
          retention period before being removed. This cannot be undone.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-2">
        <Label htmlFor={inputId}>
          Type <span className="font-mono font-medium">{domain}</span> to confirm
        </Label>
        <Input
          id={inputId}
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
          placeholder={domain}
          autoComplete="off"
          disabled={submitting}
        />
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" aria-hidden="true" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <DialogFooter>
        <Button variant="outline" onClick={close} disabled={submitting}>
          Keep my account
        </Button>
        <Button variant="destructive" onClick={handleConfirm} disabled={!matches || submitting}>
          {submitting ? (
            <>
              <Loader2 className="me-2 h-4 w-4 animate-spin" aria-hidden="true" />
              Deleting...
            </>
          ) : (
            'Delete my hosting account'
          )}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
