import { API_URL } from '@/lib/api';
import type { HostingPlanDTO } from '@/lib/hosting-types';

interface PlansEnvelope {
  success?: boolean;
  data?: HostingPlanDTO[];
}

/**
 * Server-side fetch for the public plans list (`GET /hosting/plans`).
 * Returns `null` when the API is unreachable or answers with an error so
 * pages can render a graceful "temporarily unavailable" state instead of
 * crashing. Call from server components only — it uses the Next.js fetch
 * cache (revalidated every 60 seconds).
 */
export async function fetchHostingPlans(): Promise<HostingPlanDTO[] | null> {
  try {
    const res = await fetch(`${API_URL}/hosting/plans`, {
      next: { revalidate: 60 },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as PlansEnvelope;
    return Array.isArray(body?.data) ? body.data : null;
  } catch {
    return null;
  }
}
