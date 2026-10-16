import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import { authenticate } from '../middlewares/auth';
import {
  ANY_LIVE_STATUS,
  requireHostingAccount,
  type HostingRequest,
} from '../middlewares/hostingAccount';
import { getUsage } from '../controllers/hostingUsageController';

const router = express.Router();

// Usage is readable in every non-terminal state — a suspended user still gets
// to see why. Mutating-rate limiting is not needed for this read-only route.
router.get(
  '/',
  authenticate,
  requireHostingAccount({ allowedStatuses: ANY_LIVE_STATUS }),
  (req: Request, res: Response, next: NextFunction) => {
    getUsage(req as HostingRequest, res).catch(next);
  },
);

export = router;
