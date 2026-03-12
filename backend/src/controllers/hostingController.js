const HostingService = require('../services/hostingService');

// Validates a fully-qualified domain name.
// Enforces RFC 1123 labels, max 253 chars total.
const DOMAIN_REGEX = /^(?:[a-z0-9](?:[a-z0-9\-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i;

function isValidDomain(domain) {
  return typeof domain === 'string' && domain.length <= 253 && DOMAIN_REGEX.test(domain);
}

class HostingController {
  // ---------------------------------------------------------------------------
  // Plans
  // ---------------------------------------------------------------------------

  /**
   * GET /api/v1/hosting/plans
   * Public — list all active hosting plans.
   */
  static async listPlans(req, res) {
    try {
      const plans = await HostingService.getPlans();
      res.status(200).json({ success: true, data: plans });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Failed to retrieve plans' });
    }
  }

  // ---------------------------------------------------------------------------
  // Account management
  // ---------------------------------------------------------------------------

  /**
   * POST /api/v1/hosting/accounts
   * Authenticated — provision a hosting account for the current user.
   * Body: { planId, domain }
   */
  static async createAccount(req, res) {
    try {
      const userId = req.user.userId; // auth middleware sets req.user.userId
      const { planId, domain } = req.body;

      if (!planId || typeof planId !== 'string') {
        return res.status(400).json({ success: false, message: 'planId is required' });
      }

      if (domain && !isValidDomain(domain)) {
        return res.status(400).json({ success: false, message: 'Invalid domain format' });
      }

      const result = await HostingService.createAccount(userId, planId, domain ? domain.toLowerCase() : undefined);

      res.status(201).json({
        success: true,
        message: 'Hosting account provisioned successfully',
        data: result,
      });
    } catch (error) {
      const status = HostingController._errorStatus(error);
      res.status(status).json({ success: false, message: error.message });
    }
  }

  /**
   * GET /api/v1/hosting/accounts/me
   * Authenticated — return the current user's hosting account (no hashed passwords).
   */
  static async getMyAccount(req, res) {
    try {
      const account = await HostingService.getAccountByUser(req.user.userId);
      res.status(200).json({ success: true, data: account });
    } catch (error) {
      const status = error.message === 'No hosting account found' ? 404 : 500;
      res.status(status).json({ success: false, message: error.message });
    }
  }

  /**
   * DELETE /api/v1/hosting/accounts/:id
   * Authenticated — terminate a hosting account (owner only).
   */
  static async terminateAccount(req, res) {
    try {
      const { id } = req.params;
      const account = await HostingService.terminateAccount(id, req.user.userId);
      res.status(200).json({ success: true, message: 'Hosting account terminated', data: account });
    } catch (error) {
      const status = HostingController._errorStatus(error);
      res.status(status).json({ success: false, message: error.message });
    }
  }

  // ---------------------------------------------------------------------------
  // Domain management
  // ---------------------------------------------------------------------------

  /**
   * GET /api/v1/hosting/domains
   * Authenticated — list custom domains for the current user's account.
   */
  static async listDomains(req, res) {
    try {
      const domains = await HostingService.getDomains(req.user.userId);
      res.status(200).json({ success: true, data: domains });
    } catch (error) {
      const status = HostingController._errorStatus(error);
      res.status(status).json({ success: false, message: error.message });
    }
  }

  /**
   * POST /api/v1/hosting/domains
   * Authenticated — add a custom domain to the user's account.
   * Body: { domain }
   */
  static async addDomain(req, res) {
    try {
      const { domain } = req.body;

      if (!domain) {
        return res.status(400).json({ success: false, message: 'domain is required' });
      }

      if (!isValidDomain(domain)) {
        return res.status(400).json({ success: false, message: 'Invalid domain format' });
      }

      const record = await HostingService.addDomain(req.user.userId, domain.toLowerCase());

      res.status(201).json({
        success: true,
        message: 'Domain added. Add the DNS TXT record shown to verify ownership.',
        data: record,
      });
    } catch (error) {
      const status = HostingController._errorStatus(error);
      res.status(status).json({ success: false, message: error.message });
    }
  }

  /**
   * DELETE /api/v1/hosting/domains/:id
   * Authenticated — remove a custom domain from the user's account.
   */
  static async removeDomain(req, res) {
    try {
      await HostingService.removeDomain(req.user.userId, req.params.id);
      res.status(200).json({ success: true, message: 'Domain removed' });
    } catch (error) {
      const status = HostingController._errorStatus(error);
      res.status(status).json({ success: false, message: error.message });
    }
  }

  /**
   * POST /api/v1/hosting/domains/:id/verify
   * Authenticated — trigger DNS TXT ownership check for a custom domain.
   */
  static async verifyDomain(req, res) {
    try {
      const record = await HostingService.verifyDomain(req.user.userId, req.params.id);
      res.status(200).json({
        success: true,
        message: record.isVerified ? 'Domain verified successfully' : 'Verification pending',
        data: record,
      });
    } catch (error) {
      const status = HostingController._errorStatus(error);
      res.status(status).json({ success: false, message: error.message });
    }
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  static _errorStatus(error) {
    const msg = error.message;
    if (msg === 'Forbidden') return 403;
    if (msg.includes('not found') || msg.includes('No ')) return 404;
    if (msg.includes('already') || msg.includes('limit')) return 409;
    return 400;
  }
}

module.exports = HostingController;
