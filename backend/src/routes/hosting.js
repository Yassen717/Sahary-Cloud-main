const express = require('express');
const HostingController = require('../controllers/hostingController');
const { authenticate } = require('../middlewares/auth');
const { sanitizeInput, xssProtection } = require('../middlewares/security');

const router = express.Router();

router.use(sanitizeInput());
router.use(xssProtection());

// Public — list hosting plans
router.get('/plans', HostingController.listPlans);

// Protected — account management
router.get('/accounts/me', authenticate, HostingController.getMyAccount);
router.post('/accounts', authenticate, HostingController.createAccount);
router.delete('/accounts/:id', authenticate, HostingController.terminateAccount);

module.exports = router;
