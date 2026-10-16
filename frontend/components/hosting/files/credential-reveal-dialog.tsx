'use client';

import { AlertTriangle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { SecretField } from '@/components/hosting/SecretField';
import { CopyField } from './copy-field';
import type { HostingCredentialRevealDTO } from '@/lib/hosting-types';

interface CredentialRevealDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** e.g. "New database password" / "New FTP password" */
  title: string;
  credentials: HostingCredentialRevealDTO | null;
}

/**
 * Reveal-once dialog for reset credentials. The plaintext password only
 * exists in this dialog; closing it clears the parent's copy.
 */
export function CredentialRevealDialog({
  open,
  onOpenChange,
  title,
  credentials,
}: CredentialRevealDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Copy these credentials now — the password will not be shown again.
          </DialogDescription>
        </DialogHeader>
        {credentials ? (
          <div className="space-y-4">
            <CopyField
              label="Host"
              value={`${credentials.host}:${credentials.port}`}
            />
            <CopyField label="Username" value={credentials.username} />
            <SecretField label="Password" value={credentials.password} />
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" aria-hidden="true" />
              <AlertDescription>
                This is the only time the password is displayed. Store it
                somewhere safe; if you lose it you will have to reset it again.
              </AlertDescription>
            </Alert>
          </div>
        ) : null}
        <DialogFooter>
          <Button type="button" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
