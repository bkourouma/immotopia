/**
 * `GET /api/auth/me` expose les appartenances ACTIVE de l'utilisateur avec
 * leurs permissions effectives, calculées par le service des gardes serveur
 * (`getUserPermissions`). Contrat : `user.memberships[]`.
 */
const mockPrisma: Record<string, any> = {
  user: { findUnique: jest.fn() },
  membership: { findMany: jest.fn() },
  userRole: { findMany: jest.fn() }
};
const getUserPermissions = jest.fn();
const warn = jest.fn();

jest.mock('../../src/utils/database', () => ({ prisma: mockPrisma }));
jest.mock('../../src/services/permission-service', () => ({
  getUserPermissions: (...a: unknown[]) => getUserPermissions(...a)
}));
jest.mock('../../src/services/audit-auth-events', () => ({ logAuthEvent: jest.fn(), recordAuthEvent: jest.fn() }));
jest.mock('../../src/services/email-service', () => ({
  emailService: {},
  isEmailDeliveryConfigured: () => true
}));
jest.mock('../../src/utils/logger', () => ({
  logger: { warn: (...a: unknown[]) => warn(...a), error: jest.fn(), info: jest.fn(), debug: jest.fn() }
}));

import type { Request, Response } from 'express';
import { getCurrentUser } from '../../src/services/auth-service';
import { getMe } from '../../src/controllers/auth-controller';

const dbUser = {
  id: 'u1',
  email: 'a@b.test',
  passwordHash: 'secret-hash',
  fullName: 'Awa',
  globalRole: 'USER',
  isActive: true,
  emailVerified: true,
  preferredLanguage: 'fr'
};

const membershipRows = [
  { id: 'm1', tenantId: 't1', tenant: { name: 'Agence Un', slug: 'agence-un', type: 'AGENCY' } },
  { id: 'm2', tenantId: 't2', tenant: { name: 'Syndic Deux', slug: 'syndic-deux', type: 'SYNDIC' } }
];

beforeEach(() => {
  jest.clearAllMocks();
  mockPrisma.user.findUnique.mockResolvedValue(dbUser);
  mockPrisma.membership.findMany.mockResolvedValue(membershipRows);
  mockPrisma.userRole.findMany.mockResolvedValue([
    { tenantId: 't1', role: { key: 'TENANT_ADMIN', scope: 'TENANT' } },
    { tenantId: 't1', role: { key: 'AGENT', scope: 'TENANT' } },
    { tenantId: 't2', role: { key: 'PLATFORM_ONLY', scope: 'PLATFORM' } }
  ]);
  getUserPermissions.mockImplementation(async (_userId: string, tenantId: string) =>
    tenantId === 't1' ? ['PROPERTIES_VIEW', 'CRM_EDIT', 'PROPERTIES_VIEW'] : ['SYNDIC_VIEW']
  );
});

describe('getCurrentUser — appartenances et permissions', () => {
  it('garde les champs publics, retire passwordHash et ajoute memberships', async () => {
    const user: any = await getCurrentUser('u1');

    expect(user.passwordHash).toBeUndefined();
    expect(user).toEqual(expect.objectContaining({ id: 'u1', email: 'a@b.test', fullName: 'Awa', globalRole: 'USER' }));
    expect(user.memberships).toEqual([
      {
        tenantId: 't1',
        tenantName: 'Agence Un',
        tenantSlug: 'agence-un',
        tenantType: 'AGENCY',
        membershipId: 'm1',
        roleKeys: ['AGENT', 'TENANT_ADMIN'],
        permissions: ['CRM_EDIT', 'PROPERTIES_VIEW']
      },
      {
        tenantId: 't2',
        tenantName: 'Syndic Deux',
        tenantSlug: 'syndic-deux',
        tenantType: 'SYNDIC',
        membershipId: 'm2',
        roleKeys: [],
        permissions: ['SYNDIC_VIEW']
      }
    ]);
    expect(getUserPermissions).toHaveBeenCalledWith('u1', 't1');
    expect(getUserPermissions).toHaveBeenCalledWith('u1', 't2');
  });

  it("ne lit que les appartenances ACTIVE d'une agence active, avec select (jamais l'objet User)", async () => {
    await getCurrentUser('u1');

    const call = mockPrisma.membership.findMany.mock.calls[0][0];
    expect(call.where).toEqual({
      userId: 'u1',
      status: 'ACTIVE',
      tenant: { isActive: true, status: { not: 'SUSPENDED' } }
    });
    expect(call.include).toBeUndefined();
    expect(call.select.user).toBeUndefined();
    expect(mockPrisma.userRole.findMany).toHaveBeenCalledTimes(1);
    expect(mockPrisma.userRole.findMany.mock.calls[0][0].where).toEqual({
      userId: 'u1',
      tenantId: { in: ['t1', 't2'] }
    });
  });

  it('exclut une appartenance non ACTIVE (filtrée en base) : aucune permission calculée pour elle', async () => {
    // La base n'a renvoyé que l'appartenance active ; la suspendue n'apparaît pas.
    mockPrisma.membership.findMany.mockResolvedValue([membershipRows[0]]);
    const user: any = await getCurrentUser('u1');
    expect(user.memberships.map((m: any) => m.tenantId)).toEqual(['t1']);
    expect(getUserPermissions).toHaveBeenCalledTimes(1);
  });

  it('un échec du calcul pour une agence donne permissions: [] pour elle seule, journalisé, sans faire échouer /me', async () => {
    getUserPermissions.mockImplementation(async (_userId: string, tenantId: string) => {
      if (tenantId === 't2') throw new Error('db down');
      return ['PROPERTIES_VIEW'];
    });

    const user: any = await getCurrentUser('u1');

    expect(user.memberships[0].permissions).toEqual(['PROPERTIES_VIEW']);
    expect(user.memberships[1].permissions).toEqual([]);
    expect(warn).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ userId: 'u1', tenantId: 't2' }));
  });

  it('ne trie pas en place le tableau du cache de permissions', async () => {
    const cached = ['Z_PERM', 'A_PERM'];
    getUserPermissions.mockResolvedValue(cached);
    await getCurrentUser('u1');
    expect(cached).toEqual(['Z_PERM', 'A_PERM']);
  });

  it('sans appartenance : memberships vide, aucune requête de rôles', async () => {
    mockPrisma.membership.findMany.mockResolvedValue([]);
    const user: any = await getCurrentUser('u1');
    expect(user.memberships).toEqual([]);
    expect(mockPrisma.userRole.findMany).not.toHaveBeenCalled();
    expect(getUserPermissions).not.toHaveBeenCalled();
  });
});

describe('getMe — contrat de réponse', () => {
  it('renvoie { success: true, user } avec user.memberships et sans passwordHash', async () => {
    const json = jest.fn();
    const res = { status: jest.fn().mockReturnValue({ json }) } as unknown as Response;
    await getMe({ user: { userId: 'u1' } } as unknown as Request, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const body = json.mock.calls[0][0];
    expect(body.success).toBe(true);
    expect(body.user.passwordHash).toBeUndefined();
    expect(body.user.memberships).toHaveLength(2);
    expect(body.user.memberships[0].permissions).toEqual(['CRM_EDIT', 'PROPERTIES_VIEW']);
  });
});
