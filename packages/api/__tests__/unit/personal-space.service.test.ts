/**
 * Lot 4B : création de l'espace personnel (service). Prisma, le cœur de
 * provisionnement, l'audit et l'e-mail sont simulés ; la concurrence réelle est
 * testée sur base dédiée (integration/personal-space.integration.test.ts).
 */

const mockEnv = { isProduction: false };
jest.mock('../../src/config/env', () => ({
  ...jest.requireActual('../../src/config/env'),
  get isProduction() {
    return mockEnv.isProduction;
  }
}));

const mockTx = {
  $executeRaw: jest.fn(async () => 1),
  membership: { findMany: jest.fn(), create: jest.fn(async () => ({})) },
  userRole: { findFirst: jest.fn(), create: jest.fn(async () => ({})) }
};
const mockPrisma = {
  user: { findUnique: jest.fn() },
  $transaction: jest.fn(async (fn: (tx: typeof mockTx) => unknown) => fn(mockTx))
};
jest.mock('../../src/utils/database', () => ({ prisma: mockPrisma }));

const mockCore = jest.fn();
jest.mock('../../src/services/tenant-provisioning-service', () => ({
  createTenantCoreTx: (...a: unknown[]) => mockCore(...a)
}));

const mockAudit = jest.fn();
jest.mock('../../src/services/audit-service', () => ({ logAuditEvent: (e: unknown) => mockAudit(e) }));

const mockEmailConfigured = jest.fn(() => true);
jest.mock('../../src/services/email-service', () => ({ isEmailDeliveryConfigured: () => mockEmailConfigured() }));

import {
  createPersonalSpace,
  resetPersonalSpaceIdempotency
} from '../../src/services/personal-space/create-personal-space';

const USER = { id: 'user-1', email: 'awa@example.com', emailVerified: true, isActive: true };
const INPUT = { displayName: 'Awa <b>Traoré</b>', country: 'CI' as const, phone: '+2250712345678' };
const NOW = new Date('2026-10-05T10:00:00Z');

beforeEach(() => {
  jest.clearAllMocks();
  resetPersonalSpaceIdempotency();
  mockEnv.isProduction = false;
  mockEmailConfigured.mockReturnValue(true);
  mockPrisma.user.findUnique.mockResolvedValue(USER);
  mockTx.membership.findMany.mockResolvedValue([]);
  mockTx.userRole.findFirst.mockResolvedValue(null);
  mockCore.mockResolvedValue({
    tenant: { id: 'tenant-new', slug: 'awa-b-traore-b-abc123', name: INPUT.displayName },
    tenantAdminRoleId: 'role-admin',
    now: NOW
  });
});

describe('createPersonalSpace', () => {
  it('crée l’espace : cœur PARTICULIER gratuit BLOCK, Membership ACTIVE, rôle TENANT_ADMIN, audit sans donnée personnelle', async () => {
    const { result, replay } = await createPersonalSpace('user-1', INPUT);

    expect(replay).toBe(false);
    expect(result).toEqual({ tenantId: 'tenant-new', slug: 'awa-b-traore-b-abc123', name: INPUT.displayName });

    expect(mockTx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(mockCore).toHaveBeenCalledTimes(1);
    const core = mockCore.mock.calls[0][1];
    expect(core).toMatchObject({
      name: INPUT.displayName,
      type: 'PARTICULIER',
      country: 'CI',
      contactEmail: 'awa@example.com',
      contactPhone: '+2250712345678',
      requested: [{ code: 'PARTICULIER_GRATUIT', quantity: 1 }],
      subscription: { status: 'ACTIVE', quotaPolicy: 'BLOCK' },
      actorUserId: 'user-1'
    });
    expect(core.slug).toMatch(/^awa-b-traore-b-[a-z0-9]{6}$/);

    expect(mockTx.membership.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: 'user-1', tenantId: 'tenant-new', status: 'ACTIVE', acceptedAt: NOW })
    });
    expect(mockTx.userRole.create).toHaveBeenCalledWith({
      data: { userId: 'user-1', roleId: 'role-admin', tenantId: 'tenant-new' }
    });

    expect(mockAudit).toHaveBeenCalledTimes(1);
    const audit = mockAudit.mock.calls[0][0];
    expect(audit).toMatchObject({ actionKey: 'PERSONAL_SPACE_CREATED', tenantId: 'tenant-new', actorUserId: 'user-1' });
    const serialized = JSON.stringify(audit);
    expect(serialized).not.toContain('Traoré');
    expect(serialized).not.toContain('0712345678');
    expect(serialized).not.toContain('awa@example.com');
  });

  it('utilise l’utilisateur passé (jeton), et lit son e-mail en base', async () => {
    await createPersonalSpace('user-1', INPUT);
    expect(mockPrisma.user.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'user-1' } }));
  });

  it('e-mail non vérifié -> 403 EMAIL_NOT_VERIFIED, rien n’est écrit', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ ...USER, emailVerified: false });
    await expect(createPersonalSpace('user-1', INPUT)).rejects.toMatchObject({
      statusCode: 403,
      code: 'EMAIL_NOT_VERIFIED'
    });
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('production sans serveur d’e-mails -> 503 SIGNUP_UNAVAILABLE', async () => {
    mockEnv.isProduction = true;
    mockEmailConfigured.mockReturnValue(false);
    await expect(createPersonalSpace('user-1', INPUT)).rejects.toMatchObject({
      statusCode: 503,
      code: 'SIGNUP_UNAVAILABLE'
    });
    expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('production AVEC serveur d’e-mails : crée normalement', async () => {
    mockEnv.isProduction = true;
    await expect(createPersonalSpace('user-1', INPUT)).resolves.toMatchObject({ replay: false });
  });

  it('utilisateur inconnu ou désactivé -> 404', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    await expect(createPersonalSpace('ghost', INPUT)).rejects.toMatchObject({ statusCode: 404 });
    mockPrisma.user.findUnique.mockResolvedValue({ ...USER, isActive: false });
    await expect(createPersonalSpace('user-1', INPUT)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('espace personnel déjà administré -> 409 PERSONAL_SPACE_EXISTS avec le tenantId, sans rien créer', async () => {
    mockTx.membership.findMany.mockResolvedValue([{ tenantId: 'tenant-old' }]);
    mockTx.userRole.findFirst.mockResolvedValue({ tenantId: 'tenant-old' });
    await expect(createPersonalSpace('user-1', INPUT)).rejects.toMatchObject({
      statusCode: 409,
      code: 'PERSONAL_SPACE_EXISTS',
      data: { tenantId: 'tenant-old' }
    });
    expect(mockCore).not.toHaveBeenCalled();
    expect(mockTx.membership.create).not.toHaveBeenCalled();
    expect(mockAudit).not.toHaveBeenCalled();
  });

  it('membre d’un espace particulier SANS en être administrateur : n’empêche pas la création', async () => {
    mockTx.membership.findMany.mockResolvedValue([{ tenantId: 'tenant-other' }]);
    mockTx.userRole.findFirst.mockResolvedValue(null);
    await expect(createPersonalSpace('user-1', INPUT)).resolves.toMatchObject({ replay: false });
  });

  describe('idempotence (Idempotency-Key)', () => {
    it('même clé, même utilisateur : rejoue la même réponse sans rien recréer', async () => {
      const first = await createPersonalSpace('user-1', INPUT, 'key-1');
      const second = await createPersonalSpace('user-1', INPUT, 'key-1');
      expect(first.replay).toBe(false);
      expect(second).toEqual({ result: first.result, replay: true });
      expect(mockCore).toHaveBeenCalledTimes(1);
    });

    it('deux appels simultanés de même clé ne créent qu’un espace', async () => {
      const [a, b] = await Promise.all([
        createPersonalSpace('user-1', INPUT, 'key-2'),
        createPersonalSpace('user-1', INPUT, 'key-2')
      ]);
      expect(a.result).toEqual(b.result);
      expect(mockCore).toHaveBeenCalledTimes(1);
    });

    it('la même clé pour un autre utilisateur ne rejoue rien', async () => {
      await createPersonalSpace('user-1', INPUT, 'key-3');
      mockPrisma.user.findUnique.mockResolvedValue({ ...USER, id: 'user-2' });
      const other = await createPersonalSpace('user-2', INPUT, 'key-3');
      expect(other.replay).toBe(false);
      expect(mockCore).toHaveBeenCalledTimes(2);
    });

    it('un échec n’est pas mémorisé : la même clé peut être rejouée après correction', async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce({ ...USER, emailVerified: false });
      await expect(createPersonalSpace('user-1', INPUT, 'key-4')).rejects.toMatchObject({ statusCode: 403 });
      await expect(createPersonalSpace('user-1', INPUT, 'key-4')).resolves.toMatchObject({ replay: false });
    });
  });
});
