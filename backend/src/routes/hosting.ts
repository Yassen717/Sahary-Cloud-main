// @ts-nocheck
const express = require('express');
const HostingController = require('../controllers/hostingController');
const { authenticate, requireEmailVerification } = require('../middlewares/auth');
const { sanitizeInput, xssProtection, apiRateLimit } = require('../middlewares/security');

const router = express.Router();

router.use(sanitizeInput());
router.use(xssProtection());

// ─── Plans (public) ───────────────────────────────────────────────────────────
router.get('/plans', HostingController.listPlans);

// ─── Account management (authenticated) ──────────────────────────────────────
router.get('/accounts/me', authenticate, HostingController.getMyAccount);
router.post('/accounts', authenticate, requireEmailVerification, HostingController.createAccount);
router.delete('/accounts/:id', authenticate, requireEmailVerification, HostingController.terminateAccount);

// ─── Domain management (authenticated) ───────────────────────────────────────
router.get('/domains', authenticate, HostingController.listDomains);
router.post('/domains', authenticate, requireEmailVerification, HostingController.addDomain);
router.post('/domains/:id/verify', apiRateLimit(), authenticate, requireEmailVerification, HostingController.verifyDomain);
router.delete('/domains/:id', authenticate, requireEmailVerification, HostingController.removeDomain);

module.exports = router;
