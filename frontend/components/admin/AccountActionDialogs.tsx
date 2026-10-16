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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, AlertTriangle } from 'lucide-react';
import { ApiError } from '@/lib/api';

/** 403 on an admin action means the caller is an admin but not a super-admin. */
const dialogError = (err: unknown, fallback: string) =>
  err instanceof ApiError && err.status === 403
    ? 'Only super-admins can perform this action.'
    : err instanceof Error
      ? err.message
      : fallback;

interface SuspendAccountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  domain: string;
  onConfirm: (note?: string) => Promise<void>;
}

export function SuspendAccountDialog({
  open,
  onOpenChange,
  domain,
  onConfirm,
}: SuspendAccountDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && (
        <SuspendAccountDialogInner
          domain={domain}
          onConfirm={onConfirm}
          close={() => onOpenChange(false)}
        />
      )}
    </Dialog>
  );
}

function SuspendAccountDialogInner({
  domain,
  onConfirm,
  close,
}: {
  domain: string;
  onConfirm: (note?: string) => Promise<void>;
  close: () => void;
}) {
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const noteId = 'suspend-note';

  const handleConfirm = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await onConfirm(note.trim() || undefined);
      close();
    } catch (err) {
      setError(dialogError(err, 'Failed to suspend the account'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Suspend {domain}</DialogTitle>
        <DialogDescription>
          The website goes offline (HTTP 503), FTP and MySQL access are locked, and the owner
          is notified. You can activate the account again at any time.
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-2">
        <Label htmlFor={noteId}>Internal note (optional)</Label>
        <Textarea
          id={noteId}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Reason for suspending this account"
          rows={3}
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
          Cancel
        </Button>
        <Button variant="destructive" onClick={handleConfirm} disabled={submitting}>
          {submitting && <Loader2 className="me-2 h-4 w-4 animate-spin" aria-hidden="true" />}
          Suspend account
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

interface ConfirmActionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => Promise<void>;
}

/** Generic confirm dialog for activate / retry-provisioning. */
export function ConfirmActionDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  onConfirm,
}: ConfirmActionDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      {open && (
        <ConfirmActionDialogInner
          title={title}
          description={description}
          confirmLabel={confirmLabel}
          onConfirm={onConfirm}
          close={() => onOpenChange(false)}
        />
      )}
    </AlertDialog>
  );
}

function ConfirmActionDialogInner({
  title,
  description,
  confirmLabel,
  onConfirm,
  close,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => Promise<void>;
  close: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await onConfirm();
      close();
    } catch (err) {
      setError(dialogError(err, 'The action failed'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>{title}</AlertDialogTitle>
        <AlertDialogDescription>{description}</AlertDialogDescription>
      </AlertDialogHeader>
      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" aria-hidden="true" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <AlertDialogFooter>
        <AlertDialogCancel disabled={submitting}>Cancel</AlertDialogCancel>
        <AlertDialogAction
          disabled={submitting}
          onClick={(event) => {
            event.preventDefault();
            void handleConfirm();
          }}
        >
          {submitting && <Loader2 className="me-2 h-4 w-4 animate-spin" aria-hidden="true" />}
          {confirmLabel}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  );
}

interface TerminateAccountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  domain: string;
  onConfirm: () => Promise<void>;
}

/** Admin termination — requires typing the domain; a 403 means super-admin only. */
export function TerminateAccountDialog({
  open,
  onOpenChange,
  domain,
  onConfirm,
}: TerminateAccountDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && (
        <TerminateAccountDialogInner
          domain={domain}
          onConfirm={onConfirm}
          close={() => onOpenChange(false)}
        />
      )}
    </Dialog>
  );
}

function TerminateAccountDialogInner({
  domain,
  onConfirm,
  close,
}: {
  domain: string;
  onConfirm: () => Promise<void>;
  close: () => void;
}) {
  const [typed, setTyped] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputId = 'confirm-terminate-domain';

  const matches = typed.trim() === domain;

  const handleConfirm = async () => {
    if (!matches) return;
    setSubmitting(true);
    setError(null);
    try {
      await onConfirm();
      close();
    } catch (err) {
      setError(dialogError(err, 'Failed to terminate the account'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2 text-destructive">
          <AlertTriangle className="h-5 w-5" aria-hidden="true" />
          Terminate {domain}
        </DialogTitle>
        <DialogDescription>
          This cancels the Stripe subscription, takes the site offline, revokes FTP/MySQL
          access and moves the files to the retention trash. The account is permanently
          removed after the retention period.
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
          Cancel
        </Button>
        <Button variant="destructive" onClick={handleConfirm} disabled={!matches || submitting}>
          {submitting && <Loader2 className="me-2 h-4 w-4 animate-spin" aria-hidden="true" />}
          Terminate account
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
