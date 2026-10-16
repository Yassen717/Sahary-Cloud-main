'use client';

import { useEffect, useRef } from 'react';

interface PollingOptions {
  intervalMs?: number;
  timeoutMs?: number;
}

/**
 * Calls `refresh` every `intervalMs` while `active` is true, for up to
 * `timeoutMs`. Stops when `active` flips false, on timeout, or on unmount.
 * A tick is skipped while a previous refresh is still in flight, and
 * transient refresh errors are swallowed so polling keeps going.
 */
export function usePolling(
  active: boolean,
  refresh: () => Promise<unknown>,
  { intervalMs = 3000, timeoutMs = 120_000 }: PollingOptions = {},
) {
  const refreshRef = useRef(refresh);
  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    let inFlight = false;
    const startedAt = Date.now();

    const timer = setInterval(() => {
      if (cancelled || inFlight) return;
      if (Date.now() - startedAt >= timeoutMs) {
        clearInterval(timer);
        return;
      }
      inFlight = true;
      refreshRef
        .current()
        .catch(() => {
          // Keep polling through transient failures until the timeout hits.
        })
        .finally(() => {
          inFlight = false;
        });
    }, intervalMs);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [active, intervalMs, timeoutMs]);
}
