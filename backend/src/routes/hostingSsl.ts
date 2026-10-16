import express from 'express';
import { authenticate, requireEmailVerification } from '../middlewares/auth';
import { apiRateLimit } from '../middlewares/security';
import { requireHostingAccount } from '../middlewares/hostingAccount';
import HostingSslController from '../controllers/hostingSslController';

const router = express.Router();

// Mounted by routes/hosting.ts under /domains — matches POST
// /api/v1/hosting/domains/:id/ssl. Account must be ACTIVE (default of
// requireHostingAccount) and is resolved from the authenticated user.
router.post(
  '/:id/ssl',
  apiRateLimit(),
  authenticate,
  requireEmailVerification,
  requireHostingAccount(),
  HostingSslController.requestCertificate,
);

export = router;
