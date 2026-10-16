import type { Response } from 'express';
import type { HostingRequest } from '../../../src/middlewares/hostingAccount';

const findFirst = jest.fn();

jest.mock('../../../src/config/database', () => ({
  prisma: { hostingAccount: { findFirst: (...args: unknown[]) => findFirst(...args) } },
}));

import { ANY_LIVE_STATUS, requireHostingAccount } from '../../../src/middlewares/hostingAccount';

const res = (): { res: Response; status: jest.Mock; json: jest.Mock } => {
  const json = jest.fn();
  const status = jest.fn(() => ({ json }));
  return { res: { status, json } as unknown as Response, status, json };
};

const req = (userId: string | null = 'u1'): HostingRequest =>
  ({ user: userId ? { userId, id: userId, email: 'u@x.y', role: 'USER', isVerified: true } : null }) as HostingRequest;

const ACTIVE_ACCOUNT = { id: 'a1', status: 'ACTIVE', plan: { id: 'p1' } };

describe('requireHostingAccount', () => {
  beforeEach(() => {
    findFirst.mockReset();
  });

  test('401 when unauthenticated', async () => {
    const { res: r, status, json } = res();
    const next = jest.fn();
    await requireHostingAccount()(req(null), r, next);
    expect(status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
    expect(json).toHaveBeenCalledWith({ success: false, message: 'Authentication required' });
  });

  test('attaches account with plan and calls next when status allowed', async () => {
    findFirst.mockResolvedValueOnce(ACTIVE_ACCOUNT);
    const { res: r } = res();
    const next = jest.fn();
    const request = req();
    await requireHostingAccount()(request, r, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(request.hostingAccount).toEqual(ACTIVE_ACCOUNT);
    expect(findFirst).toHaveBeenCalledWith({
      where: { userId: 'u1', status: { in: ['ACTIVE'] } },
      include: { plan: true },
    });
  });

  test('404 when user has no non-TERMINATED account', async () => {
    findFirst.mockResolvedValue(null);
    const { res: r, status, json } = res();
    const next = jest.fn();
    await requireHostingAccount()(req(), r, next);
    expect(status).toHaveBeenCalledWith(404);
    expect(json).toHaveBeenCalledWith({ success: false, message: 'No hosting account found' });
    expect(next).not.toHaveBeenCalled();
  });

  test('403 with reason when account is SUSPENDED', async () => {
    findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'a1', status: 'SUSPENDED', suspendReason: 'BANDWIDTH_EXCEEDED' });
    const { res: r, status, json } = res();
    await requireHostingAccount()(req(), r, jest.fn());
    expect(status).toHaveBeenCalledWith(403);
    expect(json).toHaveBeenCalledWith({
      success: false,
      message: 'Your hosting account is suspended (BANDWIDTH_EXCEEDED)',
    });
  });

  test('403 "still being set up" for PROVISIONING and PROVISION_FAILED', async () => {
    for (const st of ['PROVISIONING', 'PROVISION_FAILED']) {
      findFirst.mockReset();
      findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'a1', status: st });
      const { res: r, status, json } = res();
      await requireHostingAccount()(req(), r, jest.fn());
      expect(status).toHaveBeenCalledWith(403);
      expect(json).toHaveBeenCalledWith({
        success: false,
        message: 'Your hosting account is still being set up',
      });
    }
  });

  test('ANY_LIVE_STATUS allows every non-TERMINATED status', async () => {
    findFirst.mockResolvedValueOnce({ id: 'a1', status: 'SUSPENDED', plan: {} });
    const { res: r } = res();
    const next = jest.fn();
    const request = req();
    await requireHostingAccount({ allowedStatuses: ANY_LIVE_STATUS })(request, r, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(findFirst).toHaveBeenCalledWith({
      where: { userId: 'u1', status: { in: ANY_LIVE_STATUS } },
      include: { plan: true },
    });
  });

  test('passes unexpected errors to next', async () => {
    const boom = new Error('db down');
    findFirst.mockRejectedValueOnce(boom);
    const { res: r } = res();
    const next = jest.fn();
    await requireHostingAccount()(req(), r, next);
    expect(next).toHaveBeenCalledWith(boom);
  });
});
