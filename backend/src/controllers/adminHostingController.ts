// Admin hosting controller (CONTRACT section 7, admin rows).
// Auth (`authenticate` + `requirePermission('admin:access')`) is applied by
// routes/admin.ts before this router is mounted; terminate additionally
// requires `admin:super` at the route level.

import type { Response } from 'express';
import { z } from 'zod';
import type { AuthRequest } from '../middlewares/auth';
import { httpError } from '../utils/httpError';
import { handleHostingError, sendOk } from './hosting/helpers';
import * as adminService from '../services/hostingAdminService';
import { HOSTING_ACCOUNT_STATUSES } from '../services/hostingAdminService';
import type { HostingAccountStatus } from '../types/hosting';

const listAccountsQuerySchema = z.object({
  status: z
    .enum(HOSTING_ACCOUNT_STATUSES as [HostingAccountStatus, ...HostingAccountStatus[]])
    .optional(),
  search: z.string().trim().min(1).max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const suspendBodySchema = z
  .object({
    note: z.string().trim().min(1).max(500).optional(),
  })
  .strict();

// Plan name is immutable (plans are referenced by name in Stripe metadata),
// and unknown keys are rejected outright so typos can't silently no-op.
const updatePlanBodySchema = z
  .object({
    description: z.string().max(1000).nullable().optional(),
    monthlyPrice: z
      .number()
      .min(0)
      .refine((v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-9, {
        message: 'monthlyPrice supports at most 2 decimal places',
      })
      .optional(),
    diskGB: z.number().int().min(0).optional(),
    bandwidthGB: z.number().int().min(0).optional(),
    maxDomains: z.number().int().min(0).optional(),
    maxDatabases: z.number().int().min(0).optional(),
    maxFtpAccounts: z.number().int().min(0).optional(),
    isActive: z.boolean().optional(),
  })
  .strict();

const firstIssueMessage = (error: z.ZodError): string => {
  const issue = error.issues[0];
  const path = issue.path.join('.');
  return path ? `${path}: ${issue.message}` : issue.message;
};

function parse<S extends z.ZodTypeAny>(schema: S, input: unknown): z.output<S> {
  const result = schema.safeParse(input ?? {});
  if (!result.success) {
    throw httpError(400, `Invalid request: ${firstIssueMessage(result.error)}`);
  }
  return result.data;
}

const paramId = (req: AuthRequest): string => {
  const value = req.params.id;
  return typeof value === 'string' ? value : (value?.[0] ?? '');
};

const actorOf = (req: AuthRequest): adminService.AdminActor => {
  if (!req.user) {
    throw httpError(401, 'Authentication required');
  }
  const userAgent = req.headers['user-agent'];
  return {
    actorUserId: req.user.userId,
    ipAddress: req.ip ?? null,
    userAgent: typeof userAgent === 'string' ? userAgent : null,
  };
};

export async function listAccounts(req: AuthRequest, res: Response): Promise<void> {
  try {
    const query = parse(listAccountsQuerySchema, req.query);
    sendOk(res, await adminService.listAccounts(query));
  } catch (error) {
    handleHostingError(res, error, 'Failed to list hosting accounts');
  }
}

export async function getAccount(req: AuthRequest, res: Response): Promise<void> {
  try {
    sendOk(res, await adminService.getAccountDetail(paramId(req)));
  } catch (error) {
    handleHostingError(res, error, 'Failed to load hosting account');
  }
}

export async function suspendAccount(req: AuthRequest, res: Response): Promise<void> {
  try {
    const body = parse(suspendBodySchema, req.body);
    sendOk(
      res,
      await adminService.suspendAccountById(paramId(req), actorOf(req), body.note),
    );
  } catch (error) {
    handleHostingError(res, error, 'Failed to suspend hosting account');
  }
}

export async function activateAccount(req: AuthRequest, res: Response): Promise<void> {
  try {
    sendOk(res, await adminService.activateAccountById(paramId(req), actorOf(req)));
  } catch (error) {
    handleHostingError(res, error, 'Failed to activate hosting account');
  }
}

export async function retryProvisioning(req: AuthRequest, res: Response): Promise<void> {
  try {
    sendOk(
      res,
      await adminService.retryAccountProvisioning(paramId(req), actorOf(req)),
    );
  } catch (error) {
    handleHostingError(res, error, 'Failed to retry provisioning');
  }
}

export async function terminateAccount(req: AuthRequest, res: Response): Promise<void> {
  try {
    sendOk(
      res,
      await adminService.terminateAccountByIdAdmin(paramId(req), actorOf(req)),
    );
  } catch (error) {
    handleHostingError(res, error, 'Failed to terminate hosting account');
  }
}

export async function getStats(_req: AuthRequest, res: Response): Promise<void> {
  try {
    sendOk(res, await adminService.getStats());
  } catch (error) {
    handleHostingError(res, error, 'Failed to load hosting stats');
  }
}

export async function listPlans(_req: AuthRequest, res: Response): Promise<void> {
  try {
    sendOk(res, await adminService.listPlans());
  } catch (error) {
    handleHostingError(res, error, 'Failed to list hosting plans');
  }
}

export async function updatePlan(req: AuthRequest, res: Response): Promise<void> {
  try {
    const patch = parse(updatePlanBodySchema, req.body);
    sendOk(res, await adminService.updatePlan(paramId(req), patch, actorOf(req)));
  } catch (error) {
    handleHostingError(res, error, 'Failed to update hosting plan');
  }
}
