import type { Response } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../config/database';
import { getHostingConfig } from '../config/hosting';
import type { HostingRequest } from '../middlewares/hostingAccount';
import type { HostingCredentialRevealDTO, HostingFtpDTO } from '../types/hosting';
import * as ftpService from '../services/ftpService';
import httpError from '../utils/httpError';
import { handleHostingError, sendOk } from './hosting/helpers';

/**
 * HTTP layer for /hosting/ftp. ftpPassword stores only a bcrypt hash; the
 * plaintext password is returned exactly once by the reset endpoint.
 */

const requireAccount = (req: HostingRequest) => {
  const account = req.hostingAccount;
  if (!account) {
    throw httpError(404, 'No hosting account found');
  }
  return account;
};

export const getFtp = async (req: HostingRequest, res: Response): Promise<void> => {
  try {
    const account = requireAccount(req);
    const cfg = getHostingConfig().ftp;
    const data: HostingFtpDTO = {
      enabled: ftpService.isFtpEnabled(),
      host: cfg.publicHost,
      port: cfg.port,
      username: account.ftpUser ?? null,
      passwordSet: account.ftpPassword != null,
    };
    sendOk(res, data);
  } catch (error) {
    handleHostingError(res, error, 'Failed to load FTP settings');
  }
};

export const resetPassword = async (req: HostingRequest, res: Response): Promise<void> => {
  try {
    const account = requireAccount(req);
    if (!ftpService.isFtpEnabled()) {
      throw httpError(503, 'FTP is not enabled');
    }
    if (!account.ftpUser) {
      throw httpError(404, 'No FTP user is provisioned for this account');
    }
    const password = await ftpService.resetFtpPassword(account.ftpUser);
    const hash = await bcrypt.hash(password, 10);
    await prisma.hostingAccount.update({
      where: { id: account.id },
      data: { ftpPassword: hash },
    });
    const cfg = getHostingConfig().ftp;
    const data: HostingCredentialRevealDTO = {
      host: cfg.publicHost,
      port: cfg.port,
      username: account.ftpUser,
      password,
    };
    sendOk(res, data);
  } catch (error) {
    handleHostingError(res, error, 'Failed to reset FTP password');
  }
};

export default { getFtp, resetPassword };
