import express from 'express';
import HostingController from '../controllers/hostingController';
import { authenticate, requireEmailVerification } from '../middlewares/auth';
import { apiRateLimit, sanitizeInput, xssProtection } from '../middlewares/security';

import filesRouter from './hostingFiles';
import plansRouter from './hostingPlans';
import sslRouter from './hostingSsl';
import databasesRouter from './hostingDatabases';
import ftpRouter from './hostingFtp';
import usageRouter from './hostingUsage';

const router = express.Router();

// Files routes come first: they own request validation so file contents can
// carry markup/script payloads that the router-level sanitizers would strip.
router.use('/files', filesRouter);

router.use(sanitizeInput());
router.use(xssProtection());

// ─── Plans (public) ───────────────────────────────────────────────────────────
router.get('/plans', HostingController.listPlans);
router.use('/plans', plansRouter);

// ─── Account management (authenticated) ──────────────────────────────────────
router.get('/accounts/me', authenticate, HostingController.getMyAccount);
router.post('/accounts', apiRateLimit(), authenticate, requireEmailVerification, HostingController.createAccount);
router.delete('/accounts/:id', apiRateLimit(), authenticate, requireEmailVerification, HostingController.terminateAccount);

// ─── Domain management (authenticated) ───────────────────────────────────────
router.get('/domains', authenticate, HostingController.listDomains);
router.post('/domains', apiRateLimit(), authenticate, requireEmailVerification, HostingController.addDomain);
router.post('/domains/:id/verify', apiRateLimit(), authenticate, requireEmailVerification, HostingController.verifyDomain);
router.delete('/domains/:id', apiRateLimit(), authenticate, requireEmailVerification, HostingController.removeDomain);

router.use('/domains', sslRouter);
router.use('/databases', databasesRouter);
router.use('/ftp', ftpRouter);
router.use('/usage', usageRouter);

export = router;
