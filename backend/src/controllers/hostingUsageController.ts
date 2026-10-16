import type { Response } from 'express';
import httpError from '../utils/httpError';
import type { HostingRequest } from '../middlewares/hostingAccount';
import { handleHostingError, sendOk } from './hosting/helpers';
import { getUsageForAccount, measureAccount } from '../services/hostingUsageService';

// `?refresh=1` re-measurement throttle: at most one filesystem scan per
// account per minute. The map is in-memory, which assumes the single-node
// MVP deployment — on a multi-node setup each node would apply the limit
// independently (still bounded, just N× looser).
export const USAGE_REFRESH_MIN_INTERVAL_MS = 60_000;
export const usageRefreshTimestamps = new Map<string, number>();

export async function getUsage(req: HostingRequest, res: Response): Promise<void> {
  try {
    const account = req.hostingAccount;
    if (!account) {
      throw httpError(404, 'No hosting account found');
    }

    const wantsRefresh = req.query.refresh === '1' || req.query.refresh === 'true';
    if (wantsRefresh) {
      const last = usageRefreshTimestamps.get(account.id) ?? 0;
      if (Date.now() - last >= USAGE_REFRESH_MIN_INTERVAL_MS) {
        usageRefreshTimestamps.set(account.id, Date.now());
        await measureAccount(account.id);
      }
    }

    sendOk(res, await getUsageForAccount(account.id));
  } catch (error) {
    handleHostingError(res, error, 'Failed to load hosting usage');
  }
}

export default { getUsage };
