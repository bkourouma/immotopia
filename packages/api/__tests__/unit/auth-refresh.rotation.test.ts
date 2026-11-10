/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * refreshAccessToken (AUTH-10, AUTH-11 e) : rotation atomique, délai de grâce
 * de 15 s, et requête sans jamais lire `passwordHash`.
 */
const tx: Record<string, any> = { refreshToken: { updateMany: jest.fn(), create: jest.fn() } };
const mockPrisma: Record<string, any> = {
  refreshToken: { findFirst: jest.fn(), update: jest.fn() },
  $transaction: jest.fn()
};
const recordAuthEvent = jest.fn();

jest.mock('../../src/utils/database', () => ({ prisma: mockPrisma }));
jest.mock('../../src/services/audit-auth-events', () => ({
  logAuthEvent: jest.fn(),
  recordAuthEvent: (...a: unknown[]) => recordAuthEvent(...a)
}));
jest.mock('../../src/services/email-service', () => ({ emailService: {}, isEmailDeliveryConfigured: () => true }));
jest.mock('../../src/utils/jwt-utils', () => ({
  generateAccessToken: jest.fn().mockReturnValue('access'),
  generateRefreshToken: jest.fn().mockReturnValue('new-refresh')
}));
jest.mock('../../src/utils/logger', () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn(), debug: jest.fn() }
}));

import { refreshAccessToken, REFRESH_REUSE_GRACE_MS } from '../../src/services/auth-service';
import express from 'express';
import request from 'supertest';
import { UnauthorizedError, asyncHandler, errorHandler } from '../../src/middleware/error-middleware';
import { refresh } from '../../src/controllers/auth-controller';

const record = (over: Record<string, unknown> = {}) => ({
  id: 'rt1',
  userId: 'u1',
  revoked: false,
  revokedAt: null,
  expiresAt: new Date(Date.now() + 3600_000),
  deviceInfo: 'ua',
  user: { id: 'u1', email: 'a@b.test', isActive: true, emailVerified: true, globalRole: 'USER' },
  ...over
});

beforeEach(() => {
  jest.clearAllMocks();
  mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(tx));
  tx.refreshToken.updateMany.mockResolvedValue({ count: 1 });
  tx.refreshToken.create.mockResolvedValue({});
});

describe('refreshAccessToken : rotation atomique', () => {
  it('succès : updateMany conditionnel sur revoked:false puis création du nouveau jeton', async () => {
    mockPrisma.refreshToken.findFirst.mockResolvedValue(record());
    const out = await refreshAccessToken('tok');
    expect(out).toEqual({ accessToken: 'access', refreshToken: 'new-refresh' });
    expect(tx.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { id: 'rt1', revoked: false },
      data: { revoked: true, revokedAt: expect.any(Date) }
    });
    expect(tx.refreshToken.create).toHaveBeenCalledTimes(1);
  });

  it('course concurrente (count 0) : aucun nouveau jeton ; la perdante reçoit un accessToken seul si une rotation a eu lieu', async () => {
    mockPrisma.refreshToken.findFirst
      .mockResolvedValueOnce(record())
      .mockResolvedValueOnce({ revoked: true, revokedAt: new Date() }) // relecture du jeton
      .mockResolvedValueOnce({ id: 'successeur' }); // successeur non révoqué
    tx.refreshToken.updateMany.mockResolvedValue({ count: 0 });
    await expect(refreshAccessToken('tok')).resolves.toEqual({ accessToken: 'access', refreshToken: null });
    expect(tx.refreshToken.create).not.toHaveBeenCalled();
    expect(tx.refreshToken.updateMany).toHaveBeenCalledTimes(1);
    expect(recordAuthEvent).not.toHaveBeenCalled();
    const successorQuery = mockPrisma.refreshToken.findFirst.mock.calls[2][0];
    expect(successorQuery.where).toEqual(
      expect.objectContaining({
        userId: 'u1',
        revoked: false,
        createdAt: { gte: expect.any(Date), lte: expect.any(Date) }
      })
    );
  });

  it('course concurrente sans successeur (jeton révoqué par autre chose) : 401', async () => {
    mockPrisma.refreshToken.findFirst
      .mockResolvedValueOnce(record())
      .mockResolvedValueOnce({ revoked: true, revokedAt: new Date() })
      .mockResolvedValueOnce(null);
    tx.refreshToken.updateMany.mockResolvedValue({ count: 0 });
    await expect(refreshAccessToken('tok')).rejects.toBeInstanceOf(UnauthorizedError);
    expect(tx.refreshToken.create).not.toHaveBeenCalled();
  });

  it('réutilisation dans le délai de grâce avec successeur : accessToken seul, sans révocation globale', async () => {
    mockPrisma.refreshToken.findFirst
      .mockResolvedValueOnce(
        record({ revoked: true, revokedAt: new Date(Date.now() - (REFRESH_REUSE_GRACE_MS - 5_000)) })
      )
      .mockResolvedValueOnce({ id: 'successeur' });
    await expect(refreshAccessToken('tok')).resolves.toEqual({ accessToken: 'access', refreshToken: null });
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(recordAuthEvent).not.toHaveBeenCalled();
  });

  it('rejeu dans le délai de grâce sans successeur (après déconnexion) : 401, aucune révocation globale', async () => {
    mockPrisma.refreshToken.findFirst
      .mockResolvedValueOnce(record({ revoked: true, revokedAt: new Date(Date.now() - 2_000) }))
      .mockResolvedValueOnce(null);
    await expect(refreshAccessToken('tok')).rejects.toBeInstanceOf(UnauthorizedError);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(recordAuthEvent).not.toHaveBeenCalled();
  });

  it('rejeu dans le délai de grâce par un compte désactivé : refus, sans accessToken', async () => {
    mockPrisma.refreshToken.findFirst.mockResolvedValueOnce(
      record({
        revoked: true,
        revokedAt: new Date(Date.now() - 2_000),
        user: { id: 'u1', email: 'a@b.test', isActive: false, emailVerified: true, globalRole: 'USER' }
      })
    );
    await expect(refreshAccessToken('tok')).rejects.toThrow('Compte utilisateur désactivé ou non vérifié.');
    expect(mockPrisma.refreshToken.findFirst).toHaveBeenCalledTimes(1);
  });

  it('réutilisation après le délai de grâce : révocation globale et événement d’audit', async () => {
    mockPrisma.refreshToken.findFirst.mockResolvedValue(
      record({ revoked: true, revokedAt: new Date(Date.now() - REFRESH_REUSE_GRACE_MS - 1_000) })
    );
    await expect(refreshAccessToken('tok')).rejects.toBeInstanceOf(UnauthorizedError);
    expect(tx.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { userId: 'u1', revoked: false },
      data: { revoked: true, revokedAt: expect.any(Date) }
    });
    expect(recordAuthEvent).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ actionKey: 'AUTH_TOKEN_REUSE_DETECTED', outcome: 'DENIED' })
    );
  });

  it('révoqué sans date (ancien enregistrement) : traité comme une réutilisation', async () => {
    mockPrisma.refreshToken.findFirst.mockResolvedValue(record({ revoked: true, revokedAt: null }));
    await expect(refreshAccessToken('tok')).rejects.toBeInstanceOf(UnauthorizedError);
    expect(recordAuthEvent).toHaveBeenCalledTimes(1);
  });

  it('la requête de lecture n’inclut jamais passwordHash (select explicite, pas d’include)', async () => {
    mockPrisma.refreshToken.findFirst.mockResolvedValue(record());
    await refreshAccessToken('tok');
    const arg = mockPrisma.refreshToken.findFirst.mock.calls[0][0];
    expect(arg.include).toBeUndefined();
    expect(arg.select.user.select.passwordHash).toBeUndefined();
    expect(arg.select.user.select).toEqual({
      id: true,
      email: true,
      isActive: true,
      emailVerified: true,
      globalRole: true
    });
  });
});

describe('POST /refresh (contrôleur réel) : cookies du navigateur', () => {
  const app = express();
  app.use((req, _res, next) => {
    req.cookies = { refreshToken: 'tok' };
    next();
  });
  app.post('/refresh', asyncHandler(refresh));
  app.use(errorHandler);
  const cookiesOf = (res: request.Response): string[] => (res.headers['set-cookie'] as unknown as string[]) ?? [];

  it('perdante de course : 200, accessToken posé, cookie refreshToken ni posé ni effacé', async () => {
    mockPrisma.refreshToken.findFirst
      .mockResolvedValueOnce(record())
      .mockResolvedValueOnce({ revoked: true, revokedAt: new Date() })
      .mockResolvedValueOnce({ id: 'successeur' });
    tx.refreshToken.updateMany.mockResolvedValue({ count: 0 });
    const res = await request(app).post('/refresh');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, message: 'Token rafraîchi avec succès.' });
    const cookies = cookiesOf(res);
    expect(cookies.some(c => c.startsWith('accessToken=access'))).toBe(true);
    expect(cookies.some(c => c.startsWith('refreshToken='))).toBe(false);
  });

  it('succès normal : les deux cookies sont posés', async () => {
    mockPrisma.refreshToken.findFirst.mockResolvedValueOnce(record());
    const res = await request(app).post('/refresh');
    expect(res.status).toBe(200);
    expect(cookiesOf(res).some(c => c.startsWith('refreshToken=new-refresh'))).toBe(true);
  });

  it('rejeu sans successeur : 401 et cookies effacés', async () => {
    mockPrisma.refreshToken.findFirst
      .mockResolvedValueOnce(record({ revoked: true, revokedAt: new Date(Date.now() - 1_000) }))
      .mockResolvedValueOnce(null);
    const res = await request(app).post('/refresh');
    expect(res.status).toBe(401);
    expect(cookiesOf(res).some(c => c.startsWith('refreshToken=;'))).toBe(true);
  });
});
