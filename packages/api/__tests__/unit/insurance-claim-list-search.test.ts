/**
 * Liste des sinistres : recherche libre (`search`) et filtres, `where` construit
 * côté service (prisma mocké) et validation Zod de la requête (400 si invalide).
 */
const findMany = jest.fn();
const count = jest.fn();

jest.mock('../../src/utils/database', () => ({
  prisma: { insuranceClaim: { findMany: (...a: unknown[]) => findMany(...a), count: (...a: unknown[]) => count(...a) } }
}));
jest.mock('../../src/utils/property-tenant-guard', () => ({ getPropertyForTenant: jest.fn() }));
jest.mock('../../src/services/audit-service', () => ({ logAuditEvent: jest.fn() }));

import { listClaims } from '../../src/lib/patrimoine/insurance/claim-service';
import { listClaimsQuerySchema } from '../../src/lib/patrimoine/insurance/schemas';

describe('listClaims : where', () => {
  beforeEach(() => {
    findMany.mockReset().mockResolvedValue([]);
    count.mockReset().mockResolvedValue(0);
  });
  const whereOf = () => findMany.mock.calls[0][0].where;

  it('sans filtre : seulement l’agence', async () => {
    await listClaims('T1', {});
    expect(whereOf()).toEqual({ tenantId: 'T1' });
  });

  it('les identifiants reçus restent dans le where de l’agence', async () => {
    await listClaims('T1', { propertyId: 'P9', policyId: 'POL9', status: 'SETTLED' });
    expect(whereOf()).toEqual({ tenantId: 'T1', propertyId: 'P9', policyId: 'POL9', status: 'SETTLED' });
  });

  it('recherche insensible à la casse : description, bien, assureur et numéro de police', async () => {
    await listClaims('T1', { search: 'fuite' });
    const contains = { contains: 'fuite', mode: 'insensitive' };
    expect(whereOf()).toEqual({
      tenantId: 'T1',
      OR: [
        { description: contains },
        { property: { internalReference: contains } },
        { property: { title: contains } },
        { policy: { insurer: contains } },
        { policy: { policyNumber: contains } }
      ]
    });
  });

  it('la recherche se combine avec le statut et pagine après filtrage', async () => {
    await listClaims('T1', { search: 'nsia', status: 'DECLARED', page: 2, limit: 100 });
    expect(whereOf().tenantId).toBe('T1');
    expect(whereOf().status).toBe('DECLARED');
    expect(whereOf().OR).toHaveLength(5);
    expect(findMany.mock.calls[0][0]).toMatchObject({ skip: 100, take: 100 });
    expect(count).toHaveBeenCalledWith({ where: whereOf() });
  });
});

describe('listClaimsQuerySchema : search', () => {
  it('accepte un terme (espaces retirés) et ignore un terme vide', () => {
    expect(listClaimsQuerySchema.parse({ search: '  fuite  ' }).search).toBe('fuite');
    expect(listClaimsQuerySchema.parse({ search: '   ' }).search).toBeUndefined();
    expect(listClaimsQuerySchema.parse({}).search).toBeUndefined();
  });

  it('refuse un terme trop long, un tableau et un paramètre inconnu', () => {
    expect(listClaimsQuerySchema.safeParse({ search: 'x'.repeat(201) }).success).toBe(false);
    expect(listClaimsQuerySchema.safeParse({ search: ['a', 'b'] }).success).toBe(false);
    expect(listClaimsQuerySchema.safeParse({ unknown: '1' }).success).toBe(false);
  });
});
