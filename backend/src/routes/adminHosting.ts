import express from 'express';
import { apiRateLimit } from '../middlewares/security';
import { requirePermission } from '../middlewares/rbac';
import * as AdminHostingController from '../controllers/adminHostingController';

const router = express.Router();

// Mounted under /api/v1/admin/hosting after authenticate +
// requirePermission('admin:access') (see routes/admin.ts).

router.get('/accounts', apiRateLimit(), AdminHostingController.listAccounts);
router.get('/accounts/:id', apiRateLimit(), AdminHostingController.getAccount);
router.post(
  '/accounts/:id/suspend',
  apiRateLimit(),
  AdminHostingController.suspendAccount,
);
router.post(
  '/accounts/:id/activate',
  apiRateLimit(),
  AdminHostingController.activateAccount,
);
router.post(
  '/accounts/:id/retry-provisioning',
  apiRateLimit(),
  AdminHostingController.retryProvisioning,
);
router.delete(
  '/accounts/:id',
  apiRateLimit(),
  requirePermission('admin:super'),
  AdminHostingController.terminateAccount,
);

router.get('/stats', apiRateLimit(), AdminHostingController.getStats);

router.get('/plans', apiRateLimit(), AdminHostingController.listPlans);
router.put('/plans/:id', apiRateLimit(), AdminHostingController.updatePlan);

export = router;
