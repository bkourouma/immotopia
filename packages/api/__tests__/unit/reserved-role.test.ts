/**
 * Rôle réservé PERSONAL_SPACE_OWNER (PATRIMOINE_PERSONAL_*) : jamais attribuable
 * par une agence (invitation, changement de rôles), absent du catalogue des
 * rôles pour un non super-admin, mais conservé par un membre qui l'a déjà et
 * toujours accordé par la création d'espace et le provisioning.
 */
const mockPrisma: any = {
  tenant: { findUnique: jest.fn() },
  invitation: { findFirst: jest.fn() },
  user: { findFirst: jest.fn() },
  role: { findMany: jest.fn() },
  membership: { findUnique: jest.fn() },
  userRole: {
    deleteMany: jest.fn(async () => ({})),
    createMany: jest.fn(async () => ({})),
    // Garde-fou « dernier administrateur » : la cible n'est pas administrateur.
    count: jest.fn(async () => 0)
  },
  // updateMemberRoles réécrit les rôles et écrit sa trace d'audit dans une même transaction.
  $transaction: jest.fn(async (cb: (tx: unknown) => unknown): Promise<unknown> => cb(mockPrisma))
};
jest.mock('../../src/utils/database', () => ({ prisma: mockPrisma }));
jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }
}));
jest.mock('../../src/services/email-service', () => ({ emailService: {} }));
jest.mock('../../src/services/audit-service', () => {
  const actual = jest.requireActual('../../src/services/audit-service');
  return { ...actual, logAuditEvent: jest.fn(), recordAuditEvent: jest.fn() };
});
jest.mock('../../src/middleware/session-invalidation', () => ({ revokeUserSessions: jest.fn() }));

import { inviteCollaborator } from '../../src/services/invitation-service';
import { updateMemberRoles } from '../../src/services/membership-service';
import { listRolesHandler } from '../../src/controllers/role-controller';
import { RESERVED_ROLE_KEYS, PERSONAL_SPACE_OWNER_ROLE_KEY } from '../../src/lib/patrimoine/personal-permissions';

beforeEach(() => {
  jest.clearAllMocks();
  mockPrisma.tenant.findUnique.mockResolvedValue({ id: 't1', status: 'ACTIVE' });
  mockPrisma.invitation.findFirst.mockResolvedValue(null);
  mockPrisma.user.findFirst.mockResolvedValue(null);
  mockPrisma.membership.findUnique.mockResolvedValue({ userId: 'u1', tenantId: 't1' });
});

describe('rôle réservé', () => {
  it('RESERVED_ROLE_KEYS contient PERSONAL_SPACE_OWNER', () => {
    expect(RESERVED_ROLE_KEYS).toEqual([PERSONAL_SPACE_OWNER_ROLE_KEY]);
  });

  it('invitation avec roleIds:[rôle réservé] -> 400 (même message qu’un rôle inconnu)', async () => {
    mockPrisma.role.findMany.mockResolvedValue([
      { id: 'r-owner', scope: 'TENANT', key: PERSONAL_SPACE_OWNER_ROLE_KEY }
    ]);
    await expect(
      inviteCollaborator({ email: 'x@example.com', tenantId: 't1', roleIds: ['r-owner'], invitedByUserId: 'a' })
    ).rejects.toMatchObject({ statusCode: 400, message: 'Un ou plusieurs roles sont introuvables.' });
  });

  it('invitation avec un rôle d’agence ordinaire : le contrôle de rôles passe (pas de 400 « introuvables »)', async () => {
    mockPrisma.role.findMany.mockResolvedValue([{ id: 'r-agent', scope: 'TENANT', key: 'TENANT_AGENT' }]);
    await expect(
      inviteCollaborator({ email: 'x@example.com', tenantId: 't1', roleIds: ['r-agent'], invitedByUserId: 'a' })
    ).rejects.not.toMatchObject({ message: 'Un ou plusieurs roles sont introuvables.' });
  });

  it('PATCH des rôles d’un membre avec le rôle réservé -> refusé (la requête exclut les clés réservées)', async () => {
    // Le filtre `notIn` fait que le rôle réservé n'est pas trouvé : le décompte diffère -> erreur.
    mockPrisma.role.findMany.mockResolvedValue([]);
    await expect(updateMemberRoles('u1', 't1', { roleIds: ['r-owner'] } as any, 'actor')).rejects.toThrow(/invalides/);
    expect(mockPrisma.role.findMany).toHaveBeenCalledWith({
      where: expect.objectContaining({ key: { notIn: RESERVED_ROLE_KEYS } })
    });
    expect(mockPrisma.userRole.deleteMany).not.toHaveBeenCalled();
  });

  it('PATCH des autres rôles : le rôle réservé du membre est conservé (deleteMany l’exclut)', async () => {
    mockPrisma.role.findMany.mockResolvedValue([{ id: 'r-agent' }]);
    // La relecture finale (getMemberById) n'est pas simulée : seule l'écriture compte ici.
    await updateMemberRoles('u1', 't1', { roleIds: ['r-agent'] } as any, 'actor').catch(() => undefined);
    expect(mockPrisma.userRole.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'u1', tenantId: 't1', role: { key: { notIn: RESERVED_ROLE_KEYS } } }
    });
  });

  describe('GET /api/roles', () => {
    const call = async (globalRole: string) => {
      mockPrisma.role.findMany.mockResolvedValue([]);
      const res: any = { status: jest.fn().mockReturnThis(), json: jest.fn() };
      await listRolesHandler({ query: {}, user: { userId: 'u', email: 'e', globalRole } } as any, res);
      return mockPrisma.role.findMany.mock.calls[0][0].where;
    };
    it('admin d’agence : le rôle réservé est exclu', async () => {
      expect((await call('USER')).key).toEqual({ notIn: RESERVED_ROLE_KEYS });
    });
    it('super-admin : catalogue complet', async () => {
      expect((await call('SUPER_ADMIN')).key).toBeUndefined();
    });
  });
});
