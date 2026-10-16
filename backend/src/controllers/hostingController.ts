import type { Response } from 'express';
import type { AuthRequest } from '../middlewares/auth';
import { getHostingConfig } from '../config/hosting';
import { httpError } from '../utils/httpError';
import * as hostingService from '../services/hostingService';
import {
  provisionUnpaidAccount,
  terminateAccountById,
} from '../services/hostingLifecycleService';
import { handleHostingError, sendOk } from './hosting/helpers';

const DOMAIN_REGEX = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i;

const isValidDomain = (domain: unknown): domain is string =>
  typeof domain === 'string' && domain.length <= 253 && DOMAIN_REGEX.test(domain);

const requireUserId = (req: AuthRequest): string => {
  if (!req.user) {
    throw httpError(401, 'Authentication required');
  }
  return req.user.userId;
};

class HostingController {
  static async listPlans(_req: AuthRequest, res: Response): Promise<void> {
    try {
      sendOk(res, await hostingService.getPlans());
    } catch (error) {
      handleHostingError(res, error, 'Failed to retrieve plans');
    }
  }

  /**
   * Dev/test account creation — real accounts are created exclusively by the
   * Stripe webhook (contract P3). This endpoint answers 402 unless the
   * allowUnpaidAccounts escape hatch is enabled.
   */
  static async createAccount(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = requireUserId(req);
      const { planId, domain } = req.body as { planId?: unknown; domain?: unknown };

      if (typeof planId !== 'string' || planId.length === 0) {
        res.status(400).json({ success: false, message: 'planId is required' });
        return;
      }

      if (domain !== undefined && domain !== null && domain !== '' && !isValidDomain(domain)) {
        res.status(400).json({ success: false, message: 'Invalid domain format' });
        return;
      }

      if (!getHostingConfig().allowUnpaidAccounts) {
        throw httpError(402, 'An active subscription is required. Subscribe to a plan first.');
      }

      const account = await provisionUnpaidAccount({
        userId,
        planId,
        requestedDomain: typeof domain === 'string' && domain !== '' ? domain.toLowerCase() : undefined,
      });

      sendOk(res, account, { status: 201, message: 'Hosting account provisioned successfully' });
    } catch (error) {
      handleHostingError(res, error, 'Failed to create hosting account');
    }
  }

  static async getMyAccount(req: AuthRequest, res: Response): Promise<void> {
    try {
      const account = await hostingService.getAccountByUser(requireUserId(req));
      sendOk(res, account);
    } catch (error) {
      handleHostingError(res, error, 'Failed to retrieve hosting account');
    }
  }

  static async terminateAccount(req: AuthRequest, res: Response): Promise<void> {
    try {
      const id = String(req.params.id);
      const account = await terminateAccountById(id, {
        actorUserId: requireUserId(req),
        reason: 'USER',
      });
      sendOk(res, account, { message: 'Hosting account terminated' });
    } catch (error) {
      handleHostingError(res, error, 'Failed to terminate hosting account');
    }
  }

  static async listDomains(req: AuthRequest, res: Response): Promise<void> {
    try {
      sendOk(res, await hostingService.getDomains(requireUserId(req)));
    } catch (error) {
      handleHostingError(res, error, 'Failed to list domains');
    }
  }

  static async addDomain(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { domain } = req.body as { domain?: unknown };

      if (typeof domain !== 'string' || domain === '') {
        res.status(400).json({ success: false, message: 'domain is required' });
        return;
      }

      if (!isValidDomain(domain)) {
        res.status(400).json({ success: false, message: 'Invalid domain format' });
        return;
      }

      const record = await hostingService.addDomain(requireUserId(req), domain.toLowerCase());

      sendOk(res, record, {
        status: 201,
        message: 'Domain added. Add the DNS TXT record shown to verify ownership.',
      });
    } catch (error) {
      handleHostingError(res, error, 'Failed to add domain');
    }
  }

  static async removeDomain(req: AuthRequest, res: Response): Promise<void> {
    try {
      const id = String(req.params.id);
      await hostingService.removeDomain(requireUserId(req), id);
      sendOk(res, { removed: true }, { message: 'Domain removed' });
    } catch (error) {
      handleHostingError(res, error, 'Failed to remove domain');
    }
  }

  static async verifyDomain(req: AuthRequest, res: Response): Promise<void> {
    try {
      const id = String(req.params.id);
      const record = await hostingService.verifyDomain(requireUserId(req), id);

      sendOk(res, record, {
        message: record.isVerified ? 'Domain verified successfully' : 'Verification pending',
      });
    } catch (error) {
      handleHostingError(res, error, 'Failed to verify domain');
    }
  }
}

export = HostingController;
