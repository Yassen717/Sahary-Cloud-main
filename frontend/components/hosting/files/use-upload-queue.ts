'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { uploadFiles } from '@/lib/hosting-api';
import { ApiError } from '@/lib/api';

export type UploadStatus =
  | 'queued'
  | 'uploading'
  | 'conflict' // server answered 409; waiting for the user to pick Replace/Skip
  | 'done'
  | 'error'
  | 'cancelled'
  | 'skipped'; // existed on the server; user chose not to overwrite

export interface UploadTask {
  id: string;
  /** Directory the file is uploaded into (captured at enqueue time). */
  dir: string;
  file: File;
  status: UploadStatus;
  /** 0-100 while uploading. */
  progress: number;
  error: string | null;
}

const MAX_CONCURRENT = 2;

let nextId = 1;

interface UseUploadQueueOptions {
  /** Called after each file finishes uploading successfully. */
  onFileUploaded?: (task: UploadTask) => void;
}

export interface UploadQueue {
  tasks: UploadTask[];
  hasPending: boolean;
  enqueue: (files: File[], dir: string) => number;
  cancel: (id: string) => void;
  resolveConflict: (id: string, overwrite: boolean) => void;
  clearFinished: () => void;
}

export function useUploadQueue({
  onFileUploaded,
}: UseUploadQueueOptions = {}): UploadQueue {
  const [tasks, setTasks] = useState<UploadTask[]>([]);
  // Ref mirror so async continuations always see the latest task list.
  const tasksRef = useRef<UploadTask[]>([]);
  const controllersRef = useRef(new Map<string, AbortController>());
  // Synchronously tracks tasks whose XHR has already been kicked off, so a
  // pump pass on a stale snapshot can never start the same file twice.
  const startingRef = useRef(new Set<string>());
  const onFileUploadedRef = useRef(onFileUploaded);
  useEffect(() => {
    onFileUploadedRef.current = onFileUploaded;
  }, [onFileUploaded]);

  const updateTasks = useCallback(
    (updater: (prev: UploadTask[]) => UploadTask[]) => {
      setTasks((prev) => {
        const next = updater(prev);
        tasksRef.current = next;
        return next;
      });
    },
    [],
  );

  const patchTask = useCallback(
    (id: string, patch: Partial<UploadTask>) => {
      updateTasks((prev) =>
        prev.map((t) => (t.id === id ? { ...t, ...patch } : t)),
      );
    },
    [updateTasks],
  );

  const runUpload = useCallback(
    async (task: UploadTask, overwrite: boolean) => {
      const controller = new AbortController();
      controllersRef.current.set(task.id, controller);
      try {
        await uploadFiles(task.dir, [task.file], {
          overwrite,
          signal: controller.signal,
          onProgress: (pct) => patchTask(task.id, { progress: pct }),
        });
        patchTask(task.id, { status: 'done', progress: 100 });
        onFileUploadedRef.current?.(task);
      } catch (err) {
        if (controller.signal.aborted) {
          patchTask(task.id, { status: 'cancelled', error: null });
        } else if (err instanceof ApiError && err.status === 409 && !overwrite) {
          patchTask(task.id, { status: 'conflict', progress: 0 });
        } else {
          patchTask(task.id, {
            status: 'error',
            error: err instanceof Error ? err.message : 'Upload failed',
          });
        }
      } finally {
        controllersRef.current.delete(task.id);
        startingRef.current.delete(task.id);
      }
    },
    [patchTask],
  );

  // Pump: keep up to MAX_CONCURRENT uploads in flight.
  useEffect(() => {
    const inFlight = tasks.filter((t) => t.status === 'uploading').length;
    let slots = MAX_CONCURRENT - inFlight;
    if (slots <= 0) return;
    for (const task of tasks) {
      if (slots <= 0) break;
      if (task.status !== 'queued' || startingRef.current.has(task.id)) {
        continue;
      }
      slots -= 1;
      startingRef.current.add(task.id);
      updateTasks((prev) =>
        prev.map((t) =>
          t.id === task.id ? { ...t, status: 'uploading', progress: 0 } : t,
        ),
      );
      void runUpload({ ...task, status: 'uploading' }, false);
    }
  }, [tasks, runUpload, updateTasks]);

  // Abort everything in flight when the component unmounts.
  useEffect(() => {
    const controllers = controllersRef.current;
    return () => {
      for (const controller of controllers.values()) {
        controller.abort();
      }
      controllers.clear();
    };
  }, []);

  const enqueue = useCallback(
    (files: File[], dir: string): number => {
      const pending = new Set(
        tasksRef.current
          .filter(
            (t) =>
              t.dir === dir &&
              (t.status === 'queued' ||
                t.status === 'uploading' ||
                t.status === 'conflict'),
          )
          .map((t) => t.file.name),
      );
      const fresh = files.filter((f) => !pending.has(f.name));
      if (fresh.length > 0) {
        const additions: UploadTask[] = fresh.map((file) => ({
          id: `u${nextId++}`,
          dir,
          file,
          status: 'queued',
          progress: 0,
          error: null,
        }));
        updateTasks((prev) => [...prev, ...additions]);
      }
      return fresh.length;
    },
    [updateTasks],
  );

  const cancel = useCallback(
    (id: string) => {
      const task = tasksRef.current.find((t) => t.id === id);
      if (!task) return;
      if (task.status === 'uploading') {
        controllersRef.current.get(id)?.abort();
      }
      if (
        task.status === 'queued' ||
        task.status === 'uploading' ||
        task.status === 'conflict'
      ) {
        patchTask(id, { status: 'cancelled', error: null });
      }
    },
    [patchTask],
  );

  const resolveConflict = useCallback(
    (id: string, overwrite: boolean) => {
      const task = tasksRef.current.find((t) => t.id === id);
      if (!task || task.status !== 'conflict') return;
      if (!overwrite) {
        patchTask(id, { status: 'skipped', error: null });
        return;
      }
      // Restart immediately with overwrite=true (bypasses the queue so the
      // user's answer is honoured right away).
      startingRef.current.add(id);
      updateTasks((prev) =>
        prev.map((t) =>
          t.id === id ? { ...t, status: 'uploading', progress: 0 } : t,
        ),
      );
      void runUpload({ ...task, status: 'uploading' }, true);
    },
    [patchTask, runUpload, updateTasks],
  );

  const clearFinished = useCallback(() => {
    updateTasks((prev) =>
      prev.filter(
        (t) =>
          t.status === 'queued' ||
          t.status === 'uploading' ||
          t.status === 'conflict',
      ),
    );
  }, [updateTasks]);

  const hasPending = tasks.some(
    (t) =>
      t.status === 'queued' || t.status === 'uploading' || t.status === 'conflict',
  );

  return { tasks, hasPending, enqueue, cancel, resolveConflict, clearFinished };
}
