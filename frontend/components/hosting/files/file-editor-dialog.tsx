'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, Loader2 } from 'lucide-react';
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
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { readTextFile, writeTextFile } from '@/lib/hosting-api';
import type { FileEntryDTO } from '@/lib/hosting-types';
import { ConfirmDialog } from './confirm-dialog';
import { TEXT_EDIT_MAX_BYTES, fileNameOf, formatBytes } from './utils';

interface FileEditorDialogProps {
  /** File path to edit; null closes the dialog. */
  path: string | null;
  onOpenChange: (open: boolean) => void;
  onSaved: (entry: FileEntryDTO) => void;
}

type EditorState = 'loading' | 'ready' | 'error' | 'saving';

export function FileEditorDialog({
  path,
  onOpenChange,
  onSaved,
}: FileEditorDialogProps) {
  const { toast } = useToast();
  const [state, setState] = useState<EditorState>('loading');
  const [content, setContent] = useState('');
  const [baseline, setBaseline] = useState('');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [discardOpen, setDiscardOpen] = useState(false);
  // Guards against a stale fetch overwriting a newer request.
  const requestIdRef = useRef(0);

  const dirty = content !== baseline && state === 'ready';
  const contentBytes = new TextEncoder().encode(content).length;
  const tooLarge = contentBytes > TEXT_EDIT_MAX_BYTES;

  const load = useCallback(
    async (targetPath: string) => {
      const requestId = ++requestIdRef.current;
      setState('loading');
      setLoadError(null);
      try {
        const file = await readTextFile(targetPath);
        if (requestIdRef.current !== requestId) return;
        setContent(file.content);
        setBaseline(file.content);
        setState('ready');
      } catch (err) {
        if (requestIdRef.current !== requestId) return;
        const message =
          err instanceof Error ? err.message : 'Failed to load the file';
        setLoadError(message);
        setState('error');
        toast({
          title: 'Cannot edit file',
          description: message,
          variant: 'destructive',
        });
      }
    },
    [toast],
  );

  // Fetch the file whenever a new path is opened; reset on close.
  useEffect(() => {
    if (path) {
      void load(path);
    } else {
      requestIdRef.current += 1;
      setContent('');
      setBaseline('');
      setLoadError(null);
      setDiscardOpen(false);
    }
  }, [path, load]);

  const requestClose = (next: boolean) => {
    if (next) return;
    if (state === 'saving') return;
    if (dirty) {
      setDiscardOpen(true);
      return;
    }
    onOpenChange(false);
  };

  const save = async () => {
    if (!path || state !== 'ready' || tooLarge) return;
    setState('saving');
    try {
      const entry = await writeTextFile(path, content);
      toast({ title: 'File saved', description: fileNameOf(path) });
      setBaseline(content);
      onSaved(entry);
      onOpenChange(false);
    } catch (err) {
      setState('ready');
      toast({
        title: 'Save failed',
        description: err instanceof Error ? err.message : 'Failed to save',
        variant: 'destructive',
      });
    }
  };

  return (
    <>
      <Dialog open={path !== null} onOpenChange={requestClose}>
        <DialogContent className="flex h-[85vh] max-w-3xl flex-col">
          <DialogHeader>
            <DialogTitle className="truncate">
              {path ? `Edit ${fileNameOf(path)}` : 'Edit file'}
            </DialogTitle>
            <DialogDescription className="truncate font-mono text-xs">
              {path}
            </DialogDescription>
          </DialogHeader>

          {state === 'loading' ? (
            <div
              className="flex flex-1 items-center justify-center"
              role="status"
            >
              <Loader2
                className="h-8 w-8 animate-spin text-muted-foreground"
                aria-hidden="true"
              />
              <span className="sr-only">Loading file…</span>
            </div>
          ) : null}

          {state === 'error' ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-4">
              <Alert variant="destructive" className="max-w-md">
                <AlertCircle className="h-4 w-4" aria-hidden="true" />
                <AlertDescription>{loadError}</AlertDescription>
              </Alert>
              {path ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void load(path)}
                >
                  Try again
                </Button>
              ) : null}
            </div>
          ) : null}

          {state === 'ready' || state === 'saving' ? (
            <>
              <Textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                className="min-h-0 flex-1 resize-none overflow-auto font-mono text-sm"
                spellCheck={false}
                wrap="off"
                aria-label={`Contents of ${path ? fileNameOf(path) : 'file'}`}
                disabled={state === 'saving'}
              />
              <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>
                  {formatBytes(contentBytes)}
                  {tooLarge ? (
                    <span className="ms-2 text-destructive">
                      — exceeds the {formatBytes(TEXT_EDIT_MAX_BYTES)} editor
                      limit
                    </span>
                  ) : null}
                </span>
                {dirty ? <span>Unsaved changes</span> : null}
              </div>
            </>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => requestClose(false)}
              disabled={state === 'saving'}
            >
              {dirty ? 'Discard & close' : 'Close'}
            </Button>
            <Button
              type="button"
              onClick={save}
              disabled={state !== 'ready' || !dirty || tooLarge}
            >
              {state === 'saving' ? (
                <>
                  <Loader2
                    className="me-2 h-4 w-4 animate-spin"
                    aria-hidden="true"
                  />
                  Saving…
                </>
              ) : (
                'Save'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={discardOpen}
        onOpenChange={setDiscardOpen}
        title="Discard unsaved changes?"
        description="Your edits will be lost. This cannot be undone."
        confirmLabel="Discard changes"
        destructive
        onConfirm={() => {
          setDiscardOpen(false);
          onOpenChange(false);
        }}
      />
    </>
  );
}
