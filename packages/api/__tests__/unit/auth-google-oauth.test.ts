/**
 * Connexion Google (audit 2026-10-19, lot 1 §4) : compte désactivé refusé,
 * adresse non vérifiée par Google refusée, e-mail normalisé pour la recherche
 * et la création, `select` explicite (jamais `passwordHash`), connexion auditée.
 */
const mockPrisma: Record<string, any> = {
  user: { findMany: jest.fn(), update: jest.fn(), create: jest.fn() },
  refreshToken: { create: jest.fn(), updateMany: jest.fn() },
  $transaction: jest.fn()
};
const logAuthEvent = jest.fn();

jest.mock('../../src/utils/database', () => ({ prisma: mockPrisma }));
jest.mock('../../src/services/audit-auth-events', () => ({
  logAuthEvent: (...a: unknown[]) => logAuthEvent(...a),
  recordAuthEvent: jest.fn()
}));
jest.mock('../../src/utils/logger', () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn(), debug: jest.fn() }
}));
jest.mock('../../src/services/email-service', () => ({
  emailService: {},
  isEmailDeliveryConfigured: () => true
}));
jest.mock('../../src/utils/jwt-utils', () => ({
  generateAccessToken: jest.fn().mockReturnValue('access'),
  generateRefreshToken: jest.fn().mockReturnValue('refresh')
}));

import { resolveGoogleUser, isGoogleEmailVerified, GoogleProfileLike } from '../../src/config/passport';
import { issueGoogleSession } from '../../src/services/auth-service';

function profile(overrides: Partial<GoogleProfileLike> = {}): GoogleProfileLike {
  return {
    id: 'google-123',
    displayName: 'Foo Bar',
    emails: [{ value: 'foo@bar.com', verified: true }],
    photos: [{ value: 'https://img.test/a.png' }],
    _json: { email_verified: true },
    ...overrides
  };
}

const activeUser = {
  id: 'u1',
  email: 'foo@bar.com',
  globalRole: 'USER',
  isActive: true,
  emailVerified: true,
  googleId: 'google-123',
  avatarUrl: null
};

function expectNoPasswordHashSelected(call: any): void {
  expect(call.select).toBeDefined();
  expect(call.select.passwordHash).toBeUndefined();
  expect(call.include).toBeUndefined();
}

beforeEach(() => {
  jest.clearAllMocks();
  mockPrisma.user.findMany.mockResolvedValue([]);
  mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(mockPrisma));
});

describe('isGoogleEmailVerified', () => {
  it.each([
    ['les deux formes à true', { emails: [{ value: 'a@b.c', verified: true }], _json: { email_verified: true } }, true],
    ['la chaîne "true"', { emails: [{ value: 'a@b.c', verified: 'true' }], _json: {} }, true],
    ['seulement _json', { emails: [{ value: 'a@b.c' }], _json: { email_verified: true } }, true],
    ['aucune indication', { emails: [{ value: 'a@b.c' }], _json: {} }, false],
    ['emails[0].verified à false', { emails: [{ value: 'a@b.c', verified: false }], _json: {} }, false],
    ['_json à false', { emails: [{ value: 'a@b.c', verified: true }], _json: { email_verified: false } }, false],
    ['la chaîne "false"', { emails: [{ value: 'a@b.c', verified: 'false' }], _json: {} }, false]
  ])('%s', (_label, overrides, expected) => {
    expect(isGoogleEmailVerified(profile(overrides as Partial<GoogleProfileLike>))).toBe(expected);
  });
});

describe('resolveGoogleUser', () => {
  it('refuse un compte désactivé, sans le modifier, et audite le refus', async () => {
    mockPrisma.user.findMany.mockResolvedValue([{ ...activeUser, isActive: false }]);

    await expect(resolveGoogleUser(profile())).resolves.toBeNull();

    expect(mockPrisma.user.update).not.toHaveBeenCalled();
    expect(mockPrisma.user.create).not.toHaveBeenCalled();
    expect(logAuthEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: 'u1',
        actionKey: 'AUTH_LOGIN_FAILED',
        outcome: 'DENIED',
        payload: { method: 'google', reason: 'account_disabled' }
      })
    );
  });

  it('refuse un compte désactivé même sans googleId rattaché (pas de rattachement)', async () => {
    mockPrisma.user.findMany.mockResolvedValue([{ ...activeUser, isActive: false, googleId: null }]);
    await expect(resolveGoogleUser(profile())).resolves.toBeNull();
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });

  it('refuse une adresse non vérifiée par Google : ni création ni rattachement', async () => {
    const unverified = profile({ emails: [{ value: 'foo@bar.com', verified: false }], _json: {} });

    await expect(resolveGoogleUser(unverified)).resolves.toBeNull();
    expect(mockPrisma.user.create).not.toHaveBeenCalled();

    mockPrisma.user.findMany.mockResolvedValue([{ ...activeUser, googleId: null }]);
    await expect(resolveGoogleUser(unverified)).resolves.toBeNull();
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
    expect(logAuthEvent).toHaveBeenCalledWith(
      expect.objectContaining({ payload: { method: 'google', reason: 'email_not_verified' } })
    );
  });

  it('refuse un profil sans adresse', async () => {
    await expect(resolveGoogleUser(profile({ emails: [] }))).resolves.toBeNull();
    await expect(resolveGoogleUser(profile({ emails: [{ value: '   ', verified: true }] }))).resolves.toBeNull();
    expect(mockPrisma.user.findMany).not.toHaveBeenCalled();
  });

  it("normalise l'adresse pour la recherche (insensible à la casse, select explicite)", async () => {
    mockPrisma.user.findMany.mockResolvedValue([activeUser]);

    const user = await resolveGoogleUser(profile({ emails: [{ value: '  Foo@Bar.COM ', verified: true }] }));

    expect(user).toEqual(activeUser);
    const call = mockPrisma.user.findMany.mock.calls[0][0];
    expect(call.where).toEqual({ email: { equals: 'foo@bar.com', mode: 'insensitive' } });
    expectNoPasswordHashSelected(call);
  });

  it("crée le compte avec l'adresse normalisée en minuscules", async () => {
    mockPrisma.user.create.mockImplementation(async ({ data }: any) => ({ ...activeUser, email: data.email }));

    const user = await resolveGoogleUser(profile({ emails: [{ value: '  Foo@Bar.COM ', verified: true }] }));

    expect(user?.email).toBe('foo@bar.com');
    const call = mockPrisma.user.create.mock.calls[0][0];
    expect(call.data).toEqual(
      expect.objectContaining({ email: 'foo@bar.com', googleId: 'google-123', emailVerified: true, isActive: true })
    );
    expectNoPasswordHashSelected(call);
  });

  it('refuse un googleId différent de celui rattaché, sans rien écrire, et audite le refus', async () => {
    mockPrisma.user.findMany.mockResolvedValue([{ ...activeUser, googleId: 'autre-google' }]);
    await expect(resolveGoogleUser(profile())).resolves.toBeNull();
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
    expect(mockPrisma.user.create).not.toHaveBeenCalled();
    expect(logAuthEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: 'u1',
        actionKey: 'AUTH_LOGIN_FAILED',
        outcome: 'DENIED',
        payload: { method: 'google', reason: 'google_id_mismatch' }
      })
    );
  });

  it('renvoie le compte quand le googleId rattaché est identique', async () => {
    mockPrisma.user.findMany.mockResolvedValue([{ ...activeUser, googleId: 'google-123' }]);
    const user = await resolveGoogleUser(profile());
    expect(user?.id).toBe('u1');
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
    expect(logAuthEvent).not.toHaveBeenCalled();
  });

  it('rattache Google à un compte vérifié sans toucher au mot de passe', async () => {
    mockPrisma.user.findMany.mockResolvedValue([{ ...activeUser, googleId: null }]);
    mockPrisma.user.update.mockResolvedValue(activeUser);

    await resolveGoogleUser(profile());

    const call = mockPrisma.user.update.mock.calls[0][0];
    expect(call.data.googleId).toBe('google-123');
    expect('passwordHash' in call.data).toBe(false);
    expectNoPasswordHashSelected(call);
    expect(mockPrisma.refreshToken.updateMany).not.toHaveBeenCalled();
  });

  it('reprend un compte jamais vérifié : mot de passe effacé et sessions révoquées (pré-détournement)', async () => {
    mockPrisma.user.findMany.mockResolvedValue([{ ...activeUser, googleId: null, emailVerified: false }]);
    mockPrisma.user.update.mockResolvedValue(activeUser);

    await resolveGoogleUser(profile());

    expect(mockPrisma.$transaction).toHaveBeenCalled();
    expect(mockPrisma.user.update.mock.calls[0][0].data).toEqual(
      expect.objectContaining({ passwordHash: null, emailVerified: true })
    );
    expect(mockPrisma.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { userId: 'u1', revoked: false },
      data: { revoked: true, revokedAt: expect.any(Date) }
    });
  });

  it('préfère le compte dont la casse correspond exactement', async () => {
    const other = { ...activeUser, id: 'u2', email: 'Foo@Bar.com' };
    mockPrisma.user.findMany.mockResolvedValue([other, activeUser]);
    await expect(resolveGoogleUser(profile())).resolves.toEqual(activeUser);
  });

  it('refuse un rattachement ambigu (plusieurs comptes à la casse près, aucun exact)', async () => {
    mockPrisma.user.findMany.mockResolvedValue([
      { ...activeUser, id: 'u2', email: 'Foo@Bar.com' },
      { ...activeUser, id: 'u3', email: 'FOO@bar.com' }
    ]);
    await expect(resolveGoogleUser(profile())).resolves.toBeNull();
    expect(mockPrisma.user.create).not.toHaveBeenCalled();
  });
});

describe('issueGoogleSession', () => {
  it('ouvre la session et audite la connexion Google (AUTH_GOOGLE_LOGIN)', async () => {
    mockPrisma.user.update.mockResolvedValue({ id: 'u1' });

    const tokens = await issueGoogleSession({ id: 'u1', email: 'foo@bar.com', globalRole: 'USER' as any }, 'UA');

    expect(tokens).toEqual({ accessToken: 'access', refreshToken: 'refresh' });
    const created = mockPrisma.refreshToken.create.mock.calls[0][0].data;
    expect(created.userId).toBe('u1');
    expect(created.token).not.toBe('refresh'); // haché
    expect(created.deviceInfo).toBe('UA');
    expect(logAuthEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: 'u1',
        actionKey: 'AUTH_GOOGLE_LOGIN',
        entityId: 'u1',
        payload: { method: 'google' }
      })
    );
  });
});
