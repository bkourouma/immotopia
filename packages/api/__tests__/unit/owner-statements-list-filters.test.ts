/**
 * Liste des releves proprietaire : construction du `where` (recherche, statuts,
 * proprietaire, periodes, ancien calcul), pagination optionnelle et validation
 * des parametres de requete (400 si invalide).
 */
const findMany = jest.fn();
const count = jest.fn();

jest.mock('../../src/services/personal-space/free-tier', () => ({
  getAssetCapacityLimit: jest.fn(async () => null),
  isFreeTierLimitReached: jest.fn(async () => false),
  lockTenantAssets: jest.fn(async () => undefined),
  assertFreeTierCapacityTx: jest.fn(async () => undefined)
}));
jest.mock('../../src/utils/database', () => ({
  prisma: {
    ownerStatement: { findMany: (...a: unknown[]) => findMany(...a), count: (...a: unknown[]) => count(...a) }
  }
}));

import { listOwnerStatements } from '../../src/lib/patrimoine/queries';
import { OWNER_STATEMENT_COMPUTATION_VERSION } from '../../src/lib/patrimoine/owner-statement-computation';
import { parseListOwnerStatementsQuery } from '../../src/controllers/owner-statements-controller';
import { BadRequestError } from '../../src/middleware/error-middleware';

const V = OWNER_STATEMENT_COMPUTATION_VERSION;

describe('listOwnerStatements - where', () => {
  beforeEach(() => {
    findMany.mockReset().mockResolvedValue([]);
    count.mockReset().mockResolvedValue(0);
  });
  const whereOf = () => findMany.mock.calls[0][0].where;

  it('sans filtre : seulement l agence', async () => {
    await listOwnerStatements('T1');
    expect(whereOf()).toEqual({ tenantId: 'T1' });
  });

  it('proprietaire et mois exact restent dans le where de l agence', async () => {
    await listOwnerStatements('T1', { ownerContactId: 'C9', period: '2026-03' });
    expect(whereOf()).toEqual({ tenantId: 'T1', ownerContactId: 'C9', period: '2026-03' });
  });

  it('statut unique ou multiple', async () => {
    await listOwnerStatements('T1', { status: ['SENT'] as never });
    expect(whereOf().status).toBe('SENT');
    findMany.mockClear();
    await listOwnerStatements('T1', { status: ['DRAFT', 'PAID'] as never });
    expect(whereOf().status).toEqual({ in: ['DRAFT', 'PAID'] });
  });

  it('plage de mois en bornes incluses', async () => {
    await listOwnerStatements('T1', { periodFrom: '2026-01', periodTo: '2026-06' });
    expect(whereOf().period).toEqual({ gte: '2026-01', lte: '2026-06' });
  });

  it('mois exact + plage : les deux tiennent', async () => {
    await listOwnerStatements('T1', { period: '2026-03', periodFrom: '2026-01' });
    expect(whereOf().period).toEqual({ gte: '2026-01' });
    expect(whereOf().AND).toEqual([{ period: '2026-03' }]);
  });

  it('legacy true / false', async () => {
    await listOwnerStatements('T1', { legacy: true });
    expect(whereOf().computationVersion).toEqual({ lt: V });
    findMany.mockClear();
    await listOwnerStatements('T1', { legacy: false });
    expect(whereOf().computationVersion).toEqual({ gte: V });
  });

  it('recherche : OR insensible sur proprietaire, periode et biens', async () => {
    await listOwnerStatements('T1', { search: 'aya' });
    const contains = { contains: 'aya', mode: 'insensitive' };
    expect(whereOf().tenantId).toBe('T1');
    expect(whereOf().AND).toEqual([
      {
        OR: [
          { owner: { firstName: contains } },
          { owner: { lastName: contains } },
          { owner: { email: contains } },
          { owner: { legalName: contains } },
          { period: { contains: 'aya' } },
          { items: { some: { property: { OR: [{ title: contains }, { internalReference: contains }] } } } }
        ]
      }
    ]);
  });
});

describe('listOwnerStatements - pagination optionnelle', () => {
  beforeEach(() => {
    findMany.mockReset().mockResolvedValue([{ id: 's1' }]);
    count.mockReset().mockResolvedValue(0);
  });

  it('sans page ni limit : liste complete, ni skip/take ni count', async () => {
    const result = await listOwnerStatements('T1', { status: ['DRAFT'] as never });
    expect(Array.isArray(result)).toBe(true);
    const arg = findMany.mock.calls[0][0];
    expect(arg).not.toHaveProperty('skip');
    expect(arg).not.toHaveProperty('take');
    expect(arg.orderBy).toEqual([{ period: 'desc' }, { createdAt: 'desc' }]);
    expect(arg.include).toEqual({ owner: true, items: { include: { property: true } } });
    expect(count).not.toHaveBeenCalled();
  });

  it('avec page : limite 20 par defaut, pagination et legacyUnpaidCount hors filtres', async () => {
    count.mockResolvedValueOnce(45).mockResolvedValueOnce(4);
    const result = await listOwnerStatements('T1', { page: 2, search: 'x', status: ['SENT'] as never });
    expect(findMany.mock.calls[0][0]).toMatchObject({ skip: 20, take: 20 });
    expect(result).toEqual({
      items: [{ id: 's1' }],
      pagination: { page: 2, limit: 20, total: 45, totalPages: 3 },
      legacyUnpaidCount: 4
    });
    expect(count.mock.calls[0][0].where.tenantId).toBe('T1');
    expect(count.mock.calls[0][0].where.status).toBe('SENT');
    expect(count.mock.calls[1][0]).toEqual({
      where: { tenantId: 'T1', computationVersion: { lt: V }, status: { not: 'PAID' } }
    });
  });

  it('avec limit seul : page 1', async () => {
    await listOwnerStatements('T1', { limit: 10 });
    expect(findMany.mock.calls[0][0]).toMatchObject({ skip: 0, take: 10 });
  });
});

describe('parseListOwnerStatementsQuery', () => {
  it('requete vide : aucun filtre', () => {
    expect(parseListOwnerStatementsQuery({})).toEqual({});
  });

  it('valeurs valides, CSV dedoublonne, legacy booleen, page/limit nombres', () => {
    const q = parseListOwnerStatementsQuery({
      search: '  aya ',
      status: 'DRAFT,SENT,DRAFT',
      ownerContactId: 'C1',
      period: '2026-02',
      periodFrom: '2026-01',
      periodTo: '2026-12',
      legacy: 'true',
      page: '2',
      limit: '50'
    });
    expect(q).toEqual({
      search: 'aya',
      status: ['DRAFT', 'SENT'],
      ownerContactId: 'C1',
      period: '2026-02',
      periodFrom: '2026-01',
      periodTo: '2026-12',
      legacy: true,
      page: 2,
      limit: 50
    });
  });

  it('bornes de mois egales acceptees', () => {
    expect(parseListOwnerStatementsQuery({ periodFrom: '2026-03', periodTo: '2026-03' })).toEqual({
      periodFrom: '2026-03',
      periodTo: '2026-03'
    });
  });

  it.each([
    { status: 'BOGUS' },
    { period: '2026-13' },
    { periodFrom: '2026-13' },
    { periodTo: '2026-00' },
    { periodFrom: '2026-06', periodTo: '2026-01' },
    { periodFrom: '26-01' },
    { legacy: 'peut-etre' },
    { limit: '500' },
    { limit: '0' },
    { page: '0' },
    { page: 'abc' },
    { search: ['a', 'b'] }
  ])('refuse %j (BadRequestError)', query => {
    expect(() => parseListOwnerStatementsQuery(query as never)).toThrow(BadRequestError);
  });
});
