'use client';

import {
  AlertCircle,
  Ban,
  Check,
  CheckCircle2,
  FileWarning,
  Loader2,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { formatBytes } from './utils';
import type { UploadTask } from './use-upload-queue';

interface UploadQueuePanelProps {
  tasks: UploadTask[];
  onCancel: (id: string) => void;
  onResolveConflict: (id: string, overwrite: boolean) => void;
  onClearFinished: () => void;
}

const FINISHED: ReadonlySet<UploadTask['status']> = new Set([
  'done',
  'error',
  'cancelled',
  'skipped',
]);

function StatusLine({ task }: { task: UploadTask }) {
  switch (task.status) {
    case 'queued':
      return <span className="text-muted-foreground">Waiting…</span>;
    case 'uploading':
      return (
        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          Uploading {task.progress}%
        </span>
      );
    case 'conflict':
      return (
        <span className="inline-flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
          <FileWarning className="h-3.5 w-3.5" aria-hidden="true" />
          A file with this name already exists.
        </span>
      );
    case 'done':
      return (
        <span className="inline-flex items-center gap-1.5 text-green-600 dark:text-green-400">
          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
          Uploaded
        </span>
      );
    case 'error':
      return (
        <span className="inline-flex items-center gap-1.5 text-destructive">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {task.error ?? 'Upload failed'}
        </span>
      );
    case 'skipped':
      return (
        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
          <Ban className="h-3.5 w-3.5" aria-hidden="true" />
          Skipped — existing file kept
        </span>
      );
    case 'cancelled':
      return (
        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
          <Ban className="h-3.5 w-3.5" aria-hidden="true" />
          Cancelled
        </span>
      );
  }
}

export function UploadQueuePanel({
  tasks,
  onCancel,
  onResolveConflict,
  onClearFinished,
}: UploadQueuePanelProps) {
  if (tasks.length === 0) return null;

  const active = tasks.filter(
    (t) => t.status === 'queued' || t.status === 'uploading',
  ).length;
  const conflicts = tasks.filter((t) => t.status === 'conflict').length;
  const doneCount = tasks.filter((t) => t.status === 'done').length;
  const failedCount = tasks.filter((t) => t.status === 'error').length;
  const hasFinished = tasks.some((t) => FINISHED.has(t.status));

  const liveSummary = [
    active > 0 ? `${active} upload${active === 1 ? '' : 's'} in progress` : null,
    conflicts > 0
      ? `${conflicts} file${conflicts === 1 ? '' : 's'} waiting for confirmation`
      : null,
    doneCount > 0 ? `${doneCount} uploaded` : null,
    failedCount > 0 ? `${failedCount} failed` : null,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <section
      aria-label="Upload queue"
      className="rounded-lg border bg-card p-4 shadow-xs"
    >
      <p className="sr-only" role="status" aria-live="polite">
        {liveSummary}
      </p>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-medium">
          Uploads ({tasks.length})
        </h2>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onClearFinished}
          disabled={!hasFinished}
        >
          Clear finished
        </Button>
      </div>
      <ul className="space-y-3">
        {tasks.map((task) => (
          <li
            key={task.id}
            className={cn(
              'rounded-md border p-3',
              task.status === 'conflict' &&
                'border-amber-500/50 bg-amber-50/50 dark:bg-amber-950/20',
              task.status === 'error' && 'border-destructive/40',
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p
                  className="truncate text-sm font-medium"
                  title={task.file.name}
                >
                  {task.file.name}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatBytes(task.file.size)} → {task.dir}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {task.status === 'queued' || task.status === 'uploading' ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    aria-label={`Cancel upload of ${task.file.name}`}
                    onClick={() => onCancel(task.id)}
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                  </Button>
                ) : null}
                {task.status === 'done' ? (
                  <Check
                    className="h-4 w-4 text-green-600 dark:text-green-400"
                    aria-hidden="true"
                  />
                ) : null}
              </div>
            </div>
            {task.status === 'uploading' ? (
              <Progress
                value={task.progress}
                className="mt-2 h-1.5"
                aria-label={`Uploading ${task.file.name}`}
              />
            ) : null}
            <div className="mt-2 text-xs">
              <StatusLine task={task} />
            </div>
            {task.status === 'conflict' ? (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => onResolveConflict(task.id, true)}
                >
                  Replace existing file
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => onResolveConflict(task.id, false)}
                >
                  Skip
                </Button>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
