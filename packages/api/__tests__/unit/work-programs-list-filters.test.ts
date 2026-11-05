/**
 * Programmes de travaux de l'agence : construction du `where` (recherche,
 * statuts multiples, bien, dates prevues, couts) et validation des parametres.
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
    workProgram: { findMany: (...a: unknown[]) => findMany(...a), count: (...a: unknown[]) => count(...a) }
  }
}));

import { listTenantWorkPrograms } from '../../src/lib/patrimoine/queries';
import { listTenantWorkProgramsQuerySchema } from '../../src/lib/patrimoine/schemas';

describe('listTenantWorkPrograms - where', () => {
  beforeEach(() => {
    findMany.mockReset().mockResolvedValue([]);
    count.mockReset().mockResolvedValue(0);
  });
  const whereOf = () => findMany.mock.calls[0][0].where;

  it('sans filtre : seulement l agence', async () => {
    await listTenantWorkPrograms('T1', {});
    expect(whereOf()).toEqual({ tenantId: 'T1' });
    expect(count.mock.calls[0][0].where).toEqual({ tenantId: 'T1' });
  });

  it('statut unique (ancienne forme) ou liste', async () => {
    await listTenantWorkPrograms('T1', { status: 'PLANNED' as never });
    expect(whereOf().status).toBe('PLANNED');
    findMany.mockClear();
    await listTenantWorkPrograms('T1', { status: ['PLANNED', 'IN_PROGRESS'] as never });
    expect(whereOf().status).toEqual({ in: ['PLANNED', 'IN_PROGRESS'] });
  });

  it('bien dans le where de l agence', async () => {
    await listTenantWorkPrograms('T1', { propertyId: 'P7' });
    expect(whereOf()).toEqual({ tenantId: 'T1', propertyId: 'P7' });
  });

  it('dates prevues : bornes incluses jusqu a 23:59:59.999', async () => {
    await listTenantWorkPrograms('T1', { plannedFrom: '2026-01-01', plannedTo: '2026-01-31' });
    expect(whereOf().plannedDate).toEqual({
      gte: new Date('2026-01-01T00:00:00.000Z'),
      lte: new Date('2026-01-31T23:59:59.999Z')
    });
  });

  it('couts min et max', async () => {
    await listTenantWorkPrograms('T1', { minCost: 0, maxCost: 5000 });
    expect(whereOf().estimatedCost).toEqual({ gte: 0, lte: 5000 });
  });

  it('recherche : OR insensible sur titre, bien et reference', async () => {
    await listTenantWorkPrograms('T1', { search: 'toit' });
    const contains = { contains: 'toit', mode: 'insensitive' };
    expect(whereOf().OR).toEqual([
      { title: contains },
      { property: { title: contains } },
      { property: { internalReference: contains } }
    ]);
  });

  it('pagination : plafond 100 conserve', async () => {
    await listTenantWorkPrograms('T1', { page: 3, limit: 500 });
    expect(findMany.mock.calls[0][0]).toMatchObject({ skip: 200, take: 100 });
  });

  it('upcoming=true : branche inchangee, filtres ignores', async () => {
    await listTenantWorkPrograms('T1', {
      upcoming: true,
      search: 'x',
      propertyId: 'P1',
      status: ['COMPLETED'] as never
    });
    expect(findMany.mock.calls[0][0].where).toEqual({
      tenantId: 'T1',
      status: { in: ['PLANNED', 'IN_PROGRESS'] }
    });
    expect(count).toHaveBeenCalledWith({ where: { tenantId: 'T1', status: { in: ['PLANNED', 'IN_PROGRESS'] } } });
  });
});

describe('listTenantWorkProgramsQuerySchema', () => {
  const parse = (q: Record<string, unknown>) => listTenantWorkProgramsQuerySchema.safeParse(q);

  it('valeurs valides : CSV dedoublonne, nombres', () => {
    const r = parse({
      status: 'PLANNED,COMPLETED,PLANNED',
      search: ' toit ',
      propertyId: 'P1',
      plannedFrom: '2026-01-01',
      plannedTo: '2026-02-28',
      minCost: '0',
      maxCost: '1500.5',
      page: '2',
      limit: '10'
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data).toMatchObject({
        status: ['PLANNED', 'COMPLETED'],
        search: 'toit',
        propertyId: 'P1',
        plannedFrom: '2026-01-01',
        minCost: 0,
        maxCost: 1500.5,
        page: 2,
        limit: 10,
        upcoming: false
      });
    }
  });

  it('une valeur seule reste valide', () => {
    const r = parse({ status: 'IN_PROGRESS' });
    expect(r.success && r.data.status).toEqual(['IN_PROGRESS']);
  });

  it('bornes egales acceptees (dates et couts), limit 100 accepte', () => {
    expect(
      parse({ plannedFrom: '2026-03-01', plannedTo: '2026-03-01', minCost: '100', maxCost: '100', limit: '100' })
        .success
    ).toBe(true);
  });

  it('bornes inversees : l erreur porte sur le champ de fin', () => {
    const dates = parse({ plannedFrom: '2026-03-01', plannedTo: '2026-02-01' });
    expect(!dates.success && dates.error.issues[0].path).toEqual(['plannedTo']);
    const couts = parse({ minCost: '500', maxCost: '100' });
    expect(!couts.success && couts.error.issues[0].path).toEqual(['maxCost']);
  });

  it.each([
    { status: 'BOGUS' },
    { status: 'PLANNED,BOGUS' },
    { plannedFrom: '2026-02-31' },
    { plannedTo: '2026-13-45' },
    { minCost: 'abc' },
    { maxCost: '-1' },
    { plannedFrom: '2026-03-01', plannedTo: '2026-02-01' },
    { minCost: '500', maxCost: '100' },
    { limit: '101' },
    { page: '0' },
    { search: ['a', 'b'] }
  ])('refuse %j (ZodError, donc 400 par le middleware)', query => {
    expect(parse(query).success).toBe(false);
  });
});
