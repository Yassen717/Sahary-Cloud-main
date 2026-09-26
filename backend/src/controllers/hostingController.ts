import type { Request, Response } from 'express';

const HostingService = require('../services/hostingService');

const DOMAIN_REGEX = /^(?:[a-z0-9](?:[a-z0-9\-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i;

type HostingRequest = Request & {
  user: { userId: string };
  body: {
    planId?: string;
    domain?: string;
  };
  params: {
    id?: string;
  };
};

type MappedError = {
  status?: unknown;
  expose?: unknown;
  code?: unknown;
};

function isValidDomain(domain: unknown): domain is string {
  return typeof domain === 'string' && domain.length <= 253 && DOMAIN_REGEX.test(domain);
}

class HostingController {
  static async listPlans(_req: Request, res: Response): Promise<void> {
    try {
      const plans = await HostingService.getPlans();
      res.status(200).json({ success: true, data: plans });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Failed to retrieve plans' });
    }
  }

  static async createAccount(req: HostingRequest, res: Response): Promise<void> {
    try {
      const { userId } = req.user;
      const { planId, domain } = req.body;

      if (!planId || typeof planId !== 'string') {
        res.status(400).json({ success: false, message: 'planId is required' });
        return;
      }

      if (domain && !isValidDomain(domain)) {
        res.status(400).json({ success: false, message: 'Invalid domain format' });
        return;
      }

      const result = await HostingService.createAccount(userId, planId, domain ? domain.toLowerCase() : undefined);

      res.status(201).json({
        success: true,
        message: 'Hosting account provisioned successfully',
        data: result,
      });
    } catch (error) {
      const status = HostingController._errorStatus(error);
      const message = HostingController._errorMessage(error, 'Failed to create hosting account');
      res.status(status).json({ success: false, message });
    }
  }

  static async getMyAccount(req: HostingRequest, res: Response): Promise<void> {
    try {
      const account = await HostingService.getAccountByUser(req.user.userId);
      res.status(200).json({ success: true, data: account });
    } catch (error) {
      const status = HostingController._errorStatus(error);
      const message = HostingController._errorMessage(error, 'Failed to retrieve hosting account');
      res.status(status).json({ success: false, message });
    }
  }

  static async terminateAccount(req: HostingRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const account = await HostingService.terminateAccount(id, req.user.userId);
      res.status(200).json({ success: true, message: 'Hosting account terminated', data: account });
    } catch (error) {
      const status = HostingController._errorStatus(error);
      const message = HostingController._errorMessage(error, 'Failed to terminate hosting account');
      res.status(status).json({ success: false, message });
    }
  }

  static async listDomains(req: HostingRequest, res: Response): Promise<void> {
    try {
      const domains = await HostingService.getDomains(req.user.userId);
      res.status(200).json({ success: true, data: domains });
    } catch (error) {
      const status = HostingController._errorStatus(error);
      const message = HostingController._errorMessage(error, 'Failed to list domains');
      res.status(status).json({ success: false, message });
    }
  }

  static async addDomain(req: HostingRequest, res: Response): Promise<void> {
    try {
      const { domain } = req.body;

      if (!domain) {
        res.status(400).json({ success: false, message: 'domain is required' });
        return;
      }

      if (!isValidDomain(domain)) {
        res.status(400).json({ success: false, message: 'Invalid domain format' });
        return;
      }

      const record = await HostingService.addDomain(req.user.userId, domain.toLowerCase());

      res.status(201).json({
        success: true,
        message: 'Domain added. Add the DNS TXT record shown to verify ownership.',
        data: record,
      });
    } catch (error) {
      const status = HostingController._errorStatus(error);
      const message = HostingController._errorMessage(error, 'Failed to add domain');
      res.status(status).json({ success: false, message });
    }
  }

  static async removeDomain(req: HostingRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      await HostingService.removeDomain(req.user.userId, id);
      res.status(200).json({ success: true, message: 'Domain removed' });
    } catch (error) {
      const status = HostingController._errorStatus(error);
      const message = HostingController._errorMessage(error, 'Failed to remove domain');
      res.status(status).json({ success: false, message });
    }
  }

  static async verifyDomain(req: HostingRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const record = await HostingService.verifyDomain(req.user.userId, id);

      res.status(200).json({
        success: true,
        message: record.isVerified ? 'Domain verified successfully' : 'Verification pending',
        data: record,
      });
    } catch (error) {
      const status = HostingController._errorStatus(error);
      const message = HostingController._errorMessage(error, 'Failed to verify domain');
      res.status(status).json({ success: false, message });
    }
  }

  /**
   * Map an error to an HTTP status by its annotated fields/codes — never by
   * substring matching. Service errors carry `status` + `expose`; Prisma
   * known-request errors carry `code`; anything else is a 500.
   */
  static _errorStatus(error: unknown): number {
    const candidate = error as MappedError | null;

    if (candidate && typeof candidate.status === 'number' && candidate.status >= 400 && candidate.status < 600) {
      return candidate.status;
    }

    // Prisma known-request errors (unique violation / record not found)
    if (candidate && candidate.code === 'P2002') return 409;
    if (candidate && candidate.code === 'P2025') return 404;

    return 500;
  }

  /**
   * Only echo messages explicitly marked safe-to-expose by the service layer;
   * everything else gets a generic status-appropriate message so internals
   * (Prisma details, paths, stack data) never leak to clients.
   */
  static _errorMessage(error: unknown, fallback: string): string {
    const candidate = error as MappedError | null;

    if (error instanceof Error && candidate?.expose === true) {
      return error.message;
    }

    switch (HostingController._errorStatus(error)) {
      case 400:
        return 'Bad request';
      case 403:
        return 'Forbidden';
      case 404:
        return 'Resource not found';
      case 409:
        return 'Resource conflict';
      case 502:
        return 'Upstream service failure';
      default:
        return fallback;
    }
  }
}

export = HostingController;
