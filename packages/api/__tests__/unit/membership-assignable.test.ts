/**
 * Membres assignables : seuls les membres ACTIFS de l'agence, sans e-mail ni
 * donnée de connexion.
 */
const findMany = jest.fn();

jest.mock('../../src/utils/database', () => ({
  prisma: { membership: { findMany: (...a: unknown[]) => findMany(...a) } }
}));
jest.mock('../../src/services/audit-service', () => ({ logAuditEvent: jest.fn(), AuditActionKey: {} }));
jest.mock('../../src/middleware/session-invalidation', () => ({ revokeUserSessions: jest.fn() }));
jest.mock('../../src/services/permission-service', () => ({ invalidateAllUserPermissionCache: jest.fn() }));
jest.mock('../../src/services/email-service', () => ({ emailService: {} }));

import { listAssignableMembers } from '../../src/services/membership-service';

describe('listAssignableMembers', () => {
  beforeEach(() => findMany.mockReset());

  it('filtre par agence et statut ACTIVE, et ne sélectionne ni e-mail ni connexion', async () => {
    findMany.mockResolvedValue([
      { user: { id: 'u1', fullName: 'Aya Agent', userRoles: [{ role: { key: 'TENANT_AGENT', name: 'Agent' } }] } },
      { user: { id: 'u2', fullName: null, userRoles: [] } }
    ]);

    const result = await listAssignableMembers('tenant-A');

    const args = findMany.mock.calls[0][0];
    expect(args.where).toMatchObject({ tenantId: 'tenant-A', status: 'ACTIVE' });
    expect(JSON.stringify(args.select)).not.toMatch(/email|phone|lastLoginAt/);
    expect(result).toEqual([
      { userId: 'u1', displayName: 'Aya Agent', roles: [{ key: 'TENANT_AGENT', name: 'Agent' }] },
      { userId: 'u2', displayName: 'Collaborateur', roles: [] }
    ]);
  });
});
