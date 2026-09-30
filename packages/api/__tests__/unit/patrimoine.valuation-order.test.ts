/**
 * BUG-2026-09-30-099 : deux valorisations le même jour — la dernière saisie
 * (createdAt, puis id) fait foi dans la vue consolidée, jamais la plus ancienne.
 * Le mock applique réellement l'`orderBy` reçu, comme Prisma.
 */
const VALUATIONS: any[] = [];

function applyOrderBy(rows: any[], orderBy: any) {
  const keys: Array<Record<string, 'asc' | 'desc'>> = Array.isArray(orderBy) ? orderBy : orderBy ? [orderBy] : [];
  return [...rows].sort((a, b) => {
    for (const k of keys) {
      const [field, dir] = Object.entries(k)[0];
      const av = a[field] instanceof Date ? a[field].getTime() : a[field];
      const bv = b[field] instanceof Date ? b[field].getTime() : b[field];
      if (av === bv) continue;
      return (av < bv ? -1 : 1) * (dir === 'desc' ? -1 : 1);
    }
    return 0;
  });
}

jest.mock('../../src/utils/database', () => ({
  prisma: {
    property: {
      findFirst: jest.fn(async () => ({ id: 'p1', tenantId: 't1' })),
      findMany: jest.fn(async () => [{ id: 'p1' }])
    },
    rentalLease: { findMany: jest.fn(async () => []) },
    assetValuation: {
      findMany: jest.fn(async ({ orderBy }: any) => applyOrderBy(VALUATIONS, orderBy)),
      findFirst: jest.fn(async ({ orderBy }: any) => applyOrderBy(VALUATIONS, orderBy)[0] ?? null)
    },
    propertyExpense: { findMany: jest.fn(async () => []) },
    propertyLoan: { findMany: jest.fn(async () => []) }
  }
}));

import {
  getPatrimoineOverview,
  buildPropertyYieldInput,
  listPropertyValuations
} from '../../src/lib/patrimoine/queries';
import { compareValuationsDesc, latestValuation } from '../../src/lib/patrimoine/valuation-order';

const DAY = new Date('2026-09-30T00:00:00Z');
const auto = {
  id: 'a-auto',
  propertyId: 'p1',
  valuatedAt: DAY,
  createdAt: new Date('2026-09-30T08:00:00Z'),
  estimatedValue: 85_000,
  currency: 'XOF',
  acquisitionCost: null
};
const manuelle = {
  id: 'z-manuelle',
  propertyId: 'p1',
  valuatedAt: DAY,
  createdAt: new Date('2026-09-30T09:00:00Z'),
  estimatedValue: 30_000_000,
  currency: 'XOF',
  acquisitionCost: 22_380_000
};

beforeEach(() => {
  VALUATIONS.length = 0;
});

describe('valeur courante = dernière valorisation (date, création, id)', () => {
  it('la saisie manuelle du même jour, créée après, fait foi dans la vue consolidée (30 000 000, pas 85 000)', async () => {
    // Ordre d'insertion volontairement défavorable : la plus ancienne en premier.
    VALUATIONS.push(manuelle, auto);
    const overview = await getPatrimoineOverview('t1');
    expect(overview.totalEstimatedValue).toBe(30_000_000);
  });

  it('indépendant de l’ordre d’insertion, et liste des valorisations du bien dans le même ordre', async () => {
    VALUATIONS.push(auto, manuelle);
    expect((await getPatrimoineOverview('t1')).totalEstimatedValue).toBe(30_000_000);
    const listed = await listPropertyValuations('t1', 'p1');
    expect(listed.map((v: any) => v.id)).toEqual(['z-manuelle', 'a-auto']);
    const input = await buildPropertyYieldInput('t1', 'p1');
    expect(input.currentValue).toBe(30_000_000);
  });

  it('une valorisation d’un jour postérieur l’emporte toujours, quel que soit createdAt', async () => {
    VALUATIONS.push(manuelle, {
      ...auto,
      valuatedAt: new Date('2026-10-01T00:00:00Z'),
      createdAt: new Date('2026-01-01T00:00:00Z')
    });
    expect((await getPatrimoineOverview('t1')).totalEstimatedValue).toBe(85_000);
  });

  it('départage à createdAt égal par id, de façon déterministe', () => {
    const a = { id: 'a', valuatedAt: DAY, createdAt: DAY };
    const b = { id: 'b', valuatedAt: DAY, createdAt: DAY };
    expect(latestValuation([a, b])?.id).toBe('b');
    expect(latestValuation([b, a])?.id).toBe('b');
    expect(compareValuationsDesc(a, a)).toBe(0);
    expect(latestValuation([])).toBeUndefined();
  });
});
