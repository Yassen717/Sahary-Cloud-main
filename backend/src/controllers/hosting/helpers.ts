import type { Response } from 'express';
import { Prisma } from '@prisma/client';
import logger from '../../utils/logger';

type MaybeHttpError = { status?: unknown; expose?: unknown; message?: unknown };

const statusOf = (error: unknown): number | null => {
  const e = error as MaybeHttpError;
  if (e && typeof e.status === 'number' && e.status >= 400 && e.status < 600) {
    return e.status;
  }
  return null;
};

const messageOf = (error: unknown, fallback: string): string => {
  const e = error as MaybeHttpError;
  return e && typeof e.message === 'string' && e.message.length > 0 ? e.message : fallback;
};

/**
 * Maps service-layer errors onto the API envelope:
 * httpError-style ({status, expose}) -> that status with its message;
 * Prisma P2002 -> 409, P2025 -> 404; anything else -> 500 generic.
 */
export const handleHostingError = (res: Response, error: unknown, fallbackMessage: string): void => {
  const status = statusOf(error);
  if (status !== null) {
    res.status(status).json({ success: false, message: messageOf(error, fallbackMessage) });
    return;
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') {
      res.status(409).json({ success: false, message: 'Resource already exists' });
      return;
    }
    if (error.code === 'P2025') {
      res.status(404).json({ success: false, message: 'Resource not found' });
      return;
    }
  }

  logger.error('hosting request failed', { error: error instanceof Error ? error.message : String(error) });
  res.status(500).json({ success: false, message: fallbackMessage });
};

export const sendOk = (res: Response, data: unknown, opts?: { status?: number; message?: string }): void => {
  const body: { success: true; data: unknown; message?: string } = {
    success: true,
    data,
  };
  if (opts?.message) {
    body.message = opts.message;
  }
  res.status(opts?.status ?? 200).json(body);
};
