const express = require('express');
const HostingController = require('../controllers/hostingController');
const { authenticate } = require('../middlewares/auth');
const { sanitizeInput, xssProtection } = require('../middlewares/security');

const router = express.Router();

router.use(sanitizeInput());
router.use(xssProtection());

// ─── Plans (public) ───────────────────────────────────────────────────────────
router.get('/plans', HostingController.listPlans);

// ─── Account management (authenticated) ──────────────────────────────────────
router.get('/accounts/me', authenticate, HostingController.getMyAccount);
router.post('/accounts', authenticate, HostingController.createAccount);
router.delete('/accounts/:id', authenticate, HostingController.terminateAccount);

// ─── Domain management (authenticated) ───────────────────────────────────────
router.get('/domains', authenticate, HostingController.listDomains);
router.post('/domains', authenticate, HostingController.addDomain);
router.post('/domains/:id/verify', authenticate, HostingController.verifyDomain);
router.delete('/domains/:id', authenticate, HostingController.removeDomain);

module.exports = router;
