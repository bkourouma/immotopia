/**
 * Liste des collaborateurs : construction du `where` (recherche, statuts multiples,
 * rôle, agence) et validation des paramètres de requête (400 si invalide).
 */
const findMany = jest.fn();
const count = jest.fn();

jest.mock('../../src/utils/database', () => ({
  prisma: {
    membership: { findMany: (...a: unknown[]) => findMany(...a), count: (...a: unknown[]) => count(...a) }
  }
}));
jest.mock('../../src/services/audit-service', () => ({ logAuditEvent: jest.fn(), AuditActionKey: {} }));
jest.mock('../../src/middleware/session-invalidation', () => ({ revokeUserSessions: jest.fn() }));
jest.mock('../../src/services/permission-service', () => ({ invalidateAllUserPermissionCache: jest.fn() }));
jest.mock('../../src/services/email-service', () => ({ emailService: {} }));

import { listMembers } from '../../src/services/membership-service';
import { listMembersHandler, parseListMembersQuery } from '../../src/controllers/membership-controller';
import { BadRequestError } from '../../src/middleware/error-middleware';

describe('listMembers - where', () => {
  beforeEach(() => {
    findMany.mockReset().mockResolvedValue([]);
    count.mockReset().mockResolvedValue(0);
  });
  const whereOf = () => findMany.mock.calls[0][0].where;

  it('sans filtre : seulement l agence', async () => {
    await listMembers({ tenantId: 'T1' });
    expect(whereOf()).toEqual({ tenantId: 'T1' });
  });

  it('recherche sur e-mail et nom', async () => {
    await listMembers({ tenantId: 'T1', search: 'aya' });
    expect(whereOf()).toEqual({
      tenantId: 'T1',
      user: {
        OR: [
          { email: { contains: 'aya', mode: 'insensitive' } },
          { fullName: { contains: 'aya', mode: 'insensitive' } }
        ]
      }
    });
  });

  it('statuts multiples via in, un seul statut en égalité', async () => {
    await listMembers({ tenantId: 'T1', status: ['ACTIVE', 'DISABLED'] as any });
    expect(whereOf().status).toEqual({ in: ['ACTIVE', 'DISABLED'] });
    findMany.mockClear();
    await listMembers({ tenantId: 'T1', status: ['ACTIVE'] as any });
    expect(whereOf().status).toBe('ACTIVE');
  });

  it('rôle filtré avec l agence', async () => {
    await listMembers({ tenantId: 'T1', roleId: 'R1' });
    expect(whereOf()).toEqual({
      tenantId: 'T1',
      user: { userRoles: { some: { roleId: 'R1', tenantId: 'T1' } } }
    });
  });
});

describe('parseListMembersQuery', () => {
  it('accepte une liste de statuts, ignore les doublons et les valeurs vides', () => {
    expect(parseListMembersQuery({ status: 'ACTIVE,DISABLED,ACTIVE', search: '  ', roleId: '' })).toEqual({
      search: undefined,
      status: ['ACTIVE', 'DISABLED'],
      roleId: undefined
    });
  });

  it('trim la recherche', () => {
    expect(parseListMembersQuery({ search: '  aya ' }).search).toBe('aya');
  });

  it('statut invalide : 400', () => {
    expect(() => parseListMembersQuery({ status: 'ACTIVE,BOGUS' })).toThrow(BadRequestError);
    try {
      parseListMembersQuery({ status: 'BOGUS' });
    } catch (e) {
      expect((e as BadRequestError).statusCode).toBe(400);
    }
  });

  it('recherche trop longue ou roleId trop long : 400', () => {
    expect(() => parseListMembersQuery({ search: 'a'.repeat(201) })).toThrow(BadRequestError);
    expect(() => parseListMembersQuery({ roleId: 'r'.repeat(65) })).toThrow(BadRequestError);
  });
});

describe('listMembersHandler', () => {
  it('transmet une erreur 400 au middleware pour un statut invalide', async () => {
    const next = jest.fn();
    const req: any = { user: { userId: 'u1' }, params: { tenantId: 'T1' }, query: { status: 'NOPE' } };
    const res: any = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    await (listMembersHandler as any)(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.any(BadRequestError));
    expect(res.json).not.toHaveBeenCalled();
  });
});
