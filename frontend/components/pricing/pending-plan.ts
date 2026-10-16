'use client';

// Remembers the plan a visitor picked on /pricing or the landing page across
// the register -> email verification -> login funnel. sessionStorage is
// tab-scoped, so the hand-off is best-effort by design.
const PENDING_PLAN_KEY = 'sahary:pendingPlan';

export function savePendingPlan(planId: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(PENDING_PLAN_KEY, planId);
  } catch {
    // Storage unavailable (private mode etc.) — the hand-off is best-effort.
  }
}

export function readPendingPlan(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage.getItem(PENDING_PLAN_KEY);
  } catch {
    return null;
  }
}

export function clearPendingPlan(): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(PENDING_PLAN_KEY);
  } catch {
    // Storage unavailable — nothing to clear.
  }
}
