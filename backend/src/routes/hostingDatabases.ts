import express from 'express';
import { authenticate, requireEmailVerification } from '../middlewares/auth';
import { apiRateLimit } from '../middlewares/security';
import { ANY_LIVE_STATUS, requireHostingAccount } from '../middlewares/hostingAccount';
import {
  createDatabase,
  deleteDatabase,
  listDatabases,
  resetDatabasePassword,
} from '../controllers/hostingDatabasesController';

const router = express.Router();

router.get(
  '/',
  authenticate,
  requireHostingAccount({ allowedStatuses: ANY_LIVE_STATUS }),
  listDatabases,
);
router.post(
  '/reset-password',
  apiRateLimit(),
  authenticate,
  requireEmailVerification,
  requireHostingAccount(),
  resetDatabasePassword,
);
router.post(
  '/',
  apiRateLimit(),
  authenticate,
  requireEmailVerification,
  requireHostingAccount(),
  createDatabase,
);
router.delete(
  '/:id',
  apiRateLimit(),
  authenticate,
  requireEmailVerification,
  requireHostingAccount(),
  deleteDatabase,
);

export = router;
