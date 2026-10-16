import type { NextFunction, Response } from 'express';
import type { HostingAccount, HostingPlan } from '@prisma/client';
import { prisma } from '../config/database';
import type { AuthRequest } from './auth';
import type { HostingAccountStatus } from '../types/hosting';

export const ANY_LIVE_STATUS: HostingAccountStatus[] = [
  'PROVISIONING',
  'ACTIVE',
  'SUSPENDED',
  'PROVISION_FAILED',
];

export type HostingAccountWithPlan = HostingAccount & { plan: HostingPlan };

export interface HostingRequest extends AuthRequest {
  hostingAccount?: HostingAccountWithPlan;
}

export function requireHostingAccount(opts?: { allowedStatuses?: HostingAccountStatus[] }) {
  const allowed = opts?.allowedStatuses ?? ['ACTIVE'];

  return async (req: HostingRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, message: 'Authentication required' });
        return;
      }

      const account = await prisma.hostingAccount.findFirst({
        where: { userId: req.user.userId, status: { in: allowed } },
        include: { plan: true },
      });

      if (account) {
        req.hostingAccount = account;
        next();
        return;
      }

      // No account in an allowed status — distinguish "exists but wrong state"
      // (403) from "no account at all" (404).
      const anyLive = await prisma.hostingAccount.findFirst({
        where: { userId: req.user.userId, status: { not: 'TERMINATED' } },
      });

      if (anyLive) {
        const message = anyLive.status === 'SUSPENDED'
          ? `Your hosting account is suspended (${anyLive.suspendReason ?? 'no reason given'})`
          : 'Your hosting account is still being set up';
        res.status(403).json({ success: false, message });
        return;
      }

      res.status(404).json({ success: false, message: 'No hosting account found' });
    } catch (error) {
      next(error);
    }
  };
}

export default { requireHostingAccount, ANY_LIVE_STATUS };
