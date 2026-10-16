import express from 'express';
import controller from '../controllers/hostingFtpController';
import { authenticate, requireEmailVerification } from '../middlewares/auth';
import { ANY_LIVE_STATUS, requireHostingAccount } from '../middlewares/hostingAccount';
import { apiRateLimit } from '../middlewares/security';

/**
 * Mounted at /api/v1/hosting/ftp. GET is a read (any non-TERMINATED account
 * may view its FTP coordinates); resetting the password is a mutation and
 * requires an ACTIVE, email-verified account.
 */
const router = express.Router();

router.get('/', authenticate, requireHostingAccount({ allowedStatuses: ANY_LIVE_STATUS }), controller.getFtp);
router.post('/reset-password', apiRateLimit(), authenticate, requireEmailVerification, requireHostingAccount(), controller.resetPassword);

export = router;
