// @ts-nocheck
const express = require('express');
const HostingController = require('../controllers/hostingController');
const { authenticate, requireEmailVerification } = require('../middlewares/auth');
const { sanitizeInput, xssProtection, apiRateLimit } = require('../middlewares/security');

const filesRouter = require('./hostingFiles');
const plansRouter = require('./hostingPlans');
const sslRouter = require('./hostingSsl');
const databasesRouter = require('./hostingDatabases');
const ftpRouter = require('./hostingFtp');
const usageRouter = require('./hostingUsage');

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
router.post('/accounts', authenticate, requireEmailVerification, HostingController.createAccount);
router.delete('/accounts/:id', authenticate, requireEmailVerification, HostingController.terminateAccount);

// ─── Domain management (authenticated) ───────────────────────────────────────
router.get('/domains', authenticate, HostingController.listDomains);
router.post('/domains', authenticate, requireEmailVerification, HostingController.addDomain);
router.post('/domains/:id/verify', apiRateLimit(), authenticate, requireEmailVerification, HostingController.verifyDomain);
router.delete('/domains/:id', authenticate, requireEmailVerification, HostingController.removeDomain);

router.use('/domains', sslRouter);
router.use('/databases', databasesRouter);
router.use('/ftp', ftpRouter);
router.use('/usage', usageRouter);

module.exports = router;
