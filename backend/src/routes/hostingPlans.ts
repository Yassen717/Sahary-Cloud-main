import express from 'express';
import { authenticate, requireEmailVerification } from '../middlewares/auth';
import { apiRateLimit } from '../middlewares/security';
import { ANY_LIVE_STATUS, requireHostingAccount } from '../middlewares/hostingAccount';
import HostingPlansController from '../controllers/hostingPlansController';

const router = express.Router();

const requireLiveAccount = requireHostingAccount({ allowedStatuses: ANY_LIVE_STATUS });

router.post(
  '/subscribe',
  apiRateLimit(),
  authenticate,
  requireEmailVerification,
  HostingPlansController.subscribe,
);

router.post(
  '/change',
  apiRateLimit(),
  authenticate,
  requireEmailVerification,
  requireLiveAccount,
  HostingPlansController.changePlan,
);

router.delete(
  '/cancel',
  apiRateLimit(),
  authenticate,
  requireEmailVerification,
  requireLiveAccount,
  HostingPlansController.cancelSubscription,
);

router.post(
  '/resume',
  apiRateLimit(),
  authenticate,
  requireEmailVerification,
  requireLiveAccount,
  HostingPlansController.resumeSubscription,
);

router.post(
  '/portal',
  apiRateLimit(),
  authenticate,
  requireEmailVerification,
  requireLiveAccount,
  HostingPlansController.createPortalSession,
);

router.get('/subscription', authenticate, HostingPlansController.getSubscription);

export = router;
