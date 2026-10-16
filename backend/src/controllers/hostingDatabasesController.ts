import crypto from 'crypto';
import type { Response } from 'express';
import { prisma } from '../config/database';
import { getHostingConfig } from '../config/hosting';
import { httpError } from '../utils/httpError';
import type { HostingRequest } from '../middlewares/hostingAccount';
import { isValidDbLabel, mysqlDbFor } from '../services/hostingNaming';
import { toDatabaseDTO } from '../services/hostingDto';
import {
  dropDatabase,
  ensureDatabase,
  isMysqlEnabled,
  setAccountUserPassword,
} from '../services/mysqlProvisionService';
import type { HostingCredentialRevealDTO, HostingDatabasesDTO } from '../types/hosting';
import { handleHostingError, sendOk } from './hosting/helpers';

const bcrypt = require('bcryptjs');

const ALNUM = 'abcdefghijklmnopqrstuvwxyz0123456789';

// Alphanumeric-only secrets: nothing here ever needs shell or URL escaping.
const randomAlnum = (length: number): string => {
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += ALNUM[crypto.randomInt(ALNUM.length)];
  }
  return out;
};

const accountOf = (req: HostingRequest) => {
  if (!req.hostingAccount) {
    throw httpError(404, 'No hosting account found');
  }
  return req.hostingAccount;
};

export async function listDatabases(req: HostingRequest, res: Response): Promise<void> {
  try {
    const account = accountOf(req);
    const { mysql } = getHostingConfig();
    const rows = await prisma.hostingDatabase.findMany({
      where: { accountId: account.id },
      orderBy: { createdAt: 'asc' },
    });
    const dto: HostingDatabasesDTO = {
      enabled: isMysqlEnabled(),
      host: mysql.publicHost,
      port: mysql.publicPort,
      username: account.dbUser,
      passwordSet: account.dbPassword != null,
      limit: account.plan.maxDatabases,
      databases: rows.map(toDatabaseDTO),
    };
    sendOk(res, dto);
  } catch (error) {
    handleHostingError(res, error, 'Failed to load databases');
  }
}

export async function createDatabase(req: HostingRequest, res: Response): Promise<void> {
  try {
    const account = accountOf(req);
    if (!isMysqlEnabled()) {
      throw httpError(503, 'MySQL is not configured on this server');
    }
    if (!account.dbUser) {
      throw httpError(503, 'Database access is not configured for this account');
    }

    const rawName = (req.body as { name?: unknown } | undefined)?.name;
    let label: string;
    if (rawName === undefined || rawName === null || rawName === '') {
      label = randomAlnum(6);
    } else if (typeof rawName === 'string' && isValidDbLabel(rawName)) {
      label = rawName;
    } else {
      throw httpError(400, 'Invalid database name');
    }

    const dbName = mysqlDbFor(account.id, label);

    // Lock the account row inside the transaction so concurrent creates can't
    // both pass the count check and overshoot plan.maxDatabases.
    const row = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT id FROM hosting_accounts WHERE id = ${account.id} FOR UPDATE`;
      const count = await tx.hostingDatabase.count({ where: { accountId: account.id } });
      if (count >= account.plan.maxDatabases) {
        throw httpError(409, `Database limit reached for your plan (max ${account.plan.maxDatabases})`);
      }
      return tx.hostingDatabase.create({
        data: { accountId: account.id, name: dbName },
      });
    });

    try {
      await ensureDatabase(dbName, account.dbUser);
    } catch (error) {
      // The MySQL side failed — roll the ledger row back so it can be retried.
      await prisma.hostingDatabase.delete({ where: { id: row.id } }).catch(() => undefined);
      throw error;
    }

    sendOk(res, toDatabaseDTO(row), { status: 201 });
  } catch (error) {
    handleHostingError(res, error, 'Failed to create database');
  }
}

export async function deleteDatabase(req: HostingRequest, res: Response): Promise<void> {
  try {
    const account = accountOf(req);
    const id = String(req.params.id ?? '');
    const row = await prisma.hostingDatabase.findFirst({
      where: { id, accountId: account.id },
    });
    if (!row) {
      throw httpError(404, 'Database not found');
    }
    if (row.isPrimary) {
      throw httpError(409, 'The primary database cannot be deleted');
    }

    await dropDatabase(row.name);
    await prisma.hostingDatabase.delete({ where: { id: row.id } });
    sendOk(res, { deleted: true });
  } catch (error) {
    handleHostingError(res, error, 'Failed to delete database');
  }
}

export async function resetDatabasePassword(req: HostingRequest, res: Response): Promise<void> {
  try {
    const account = accountOf(req);
    if (!isMysqlEnabled()) {
      throw httpError(503, 'MySQL is not configured on this server');
    }
    if (!account.dbUser) {
      throw httpError(503, 'Database access is not configured for this account');
    }

    const password = randomAlnum(20);
    await setAccountUserPassword(account.dbUser, password);
    await prisma.hostingAccount.update({
      where: { id: account.id },
      data: { dbPassword: await bcrypt.hash(password, 10) },
    });

    const { mysql } = getHostingConfig();
    const dto: HostingCredentialRevealDTO = {
      host: mysql.publicHost,
      port: mysql.publicPort,
      username: account.dbUser,
      password,
    };
    sendOk(res, dto);
  } catch (error) {
    handleHostingError(res, error, 'Failed to reset database password');
  }
}

export default {
  listDatabases,
  createDatabase,
  deleteDatabase,
  resetDatabasePassword,
};
