const HostingService = require('../services/hostingService');

class HostingController {
  /**
   * GET /api/v1/hosting/plans
   * Public — list all active hosting plans.
   */
  static async listPlans(req, res) {
    try {
      const plans = await HostingService.getPlans();
      res.status(200).json({ success: true, data: plans });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * POST /api/v1/hosting/accounts
   * Authenticated — provision a hosting account for the current user.
   * Body: { planId, domain }
   */
  static async createAccount(req, res) {
    try {
      const userId = req.user.id;
      const { planId, domain } = req.body;

      if (!planId || !domain) {
        return res.status(400).json({
          success: false,
          message: 'planId and domain are required',
        });
      }

      // Basic domain format validation — prevent injection
      const domainRegex = /^[a-z0-9]([a-z0-9\-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9\-]{0,61}[a-z0-9])?)*$/i;
      if (!domainRegex.test(domain) || domain.length > 253) {
        return res.status(400).json({
          success: false,
          message: 'Invalid domain format',
        });
      }

      const result = await HostingService.createAccount(userId, planId, domain.toLowerCase());

      res.status(201).json({
        success: true,
        message: 'Hosting account provisioned successfully',
        data: result,
      });
    } catch (error) {
      const status =
        error.message === 'Forbidden' ? 403
        : error.message.includes('not found') ? 404
        : error.message.includes('already') ? 409
        : 400;
      res.status(status).json({ success: false, message: error.message });
    }
  }

  /**
   * GET /api/v1/hosting/accounts/me
   * Authenticated — return the current user's hosting account.
   */
  static async getMyAccount(req, res) {
    try {
      const account = await HostingService.getAccountByUser(req.user.id);
      res.status(200).json({ success: true, data: account });
    } catch (error) {
      const status = error.message === 'No hosting account found' ? 404 : 500;
      res.status(status).json({ success: false, message: error.message });
    }
  }

  /**
   * DELETE /api/v1/hosting/accounts/:id
   * Authenticated — terminate a hosting account.
   */
  static async terminateAccount(req, res) {
    try {
      const { id } = req.params;
      const account = await HostingService.terminateAccount(id, req.user.id);
      res.status(200).json({
        success: true,
        message: 'Hosting account terminated',
        data: account,
      });
    } catch (error) {
      const status =
        error.message === 'Forbidden' ? 403
        : error.message.includes('not found') ? 404
        : 400;
      res.status(status).json({ success: false, message: error.message });
    }
  }
}

module.exports = HostingController;
