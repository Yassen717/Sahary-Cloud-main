import type { Response } from 'express';
import { prisma } from '../config/database';
import { isSslEnabled, issueCertificateForDomain } from '../services/sslService';
import { toDomainDTO } from '../services/hostingDto';
import { handleHostingError, sendOk } from './hosting/helpers';
import { httpError } from '../utils/httpError';
import logger from '../utils/logger';
import type { HostingRequest } from '../middlewares/hostingAccount';

class HostingSslController {
  /**
   * POST /hosting/domains/:id/ssl — queue an on-demand certificate issuance.
   * The domain row flips to PENDING inside issueCertificateForDomain; we
   * answer 202 immediately and report the accepted (PENDING) state.
   */
  static async requestCertificate(req: HostingRequest, res: Response): Promise<void> {
    try {
      const account = req.hostingAccount;
      if (!account) {
        throw httpError(404, 'No hosting account found');
      }

      const rawId = req.params.id;
      const id = Array.isArray(rawId) ? rawId[0] : rawId;
      if (!id) {
        throw httpError(400, 'Domain id is required');
      }

      const domain = await prisma.hostingDomain.findUnique({ where: { id } });
      if (!domain) {
        throw httpError(404, 'Domain not found');
      }
      if (domain.accountId !== account.id) {
        throw httpError(403, 'Forbidden');
      }
      if (!domain.isVerified) {
        throw httpError(409, 'Verify the domain first');
      }
      if (!isSslEnabled()) {
        throw httpError(503, 'SSL is not enabled on this server');
      }

      const dto = toDomainDTO(domain);
      const data = { ...dto, ssl: { ...dto.ssl, status: 'PENDING' as const } };
      sendOk(res, data, { status: 202, message: 'Certificate issuance started' });

      // Issuance is network-bound (ACME HTTP-01) — run it in the background;
      // the job also picks the domain up if this attempt leaves it stale.
      setImmediate(() => {
        issueCertificateForDomain(domain.id).catch((error) => {
          logger.error('Background certificate issuance failed', {
            domainId: domain.id,
            message: error instanceof Error ? error.message : String(error),
          });
        });
      });
    } catch (error) {
      handleHostingError(res, error, 'Failed to request certificate issuance');
    }
  }
}

export default HostingSslController;
