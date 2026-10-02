/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Lot 1 « patrimoine multi-actifs » — les vues IMMOBILIÈRES ne comptent jamais
 * les lignes d'un actif non immobilier.
 *
 * `AssetValuation`, `PropertyLoan` et `PropertyHolding` peuvent désormais
 * porter un `assetId` (sans `propertyId`) ; un prêt sans bien ni actif est une
 * dette personnelle. La synthèse patrimoine, les exports et la consolidation
 * d'entité doivent rester strictement ce qu'ils étaient : ce test monte un
 * magasin en mémoire qui mélange lignes de biens et lignes d'actifs, puis
 * vérifie que rien ne fuit dans les vues immobilières.
 *
 * Mock à la frontière `utils/database` (`.claude/rules/testing.md`) ; le
 * moteur de filtrage du faux Prisma comprend `in`, `not` et `NOT`.
 */

type Row = Record<string, any>;

const TENANT = 'tenant-1';
const OTHER_TENANT = 'tenant-2';
const PROP_1 = 'prop-1';
const ASSET_ID = '00000000-0000-4000-8000-0000000000a1';

const store = {
  properties: [] as Row[],
  valuations: [] as Row[],
  loans: [] as Row[],
  holdings: [] as Row[],
  entities: [] as Row[],
  expenses: [] as Row[],
  leases: [] as Row[]
};

function matches(row: Row, where: Row = {}): boolean {
  return Object.entries(where).every(([key, expected]) => {
    if (key === 'NOT') return !matches(row, expected);
    if (expected && typeof expected === 'object' && !(expected instanceof Date)) {
      if ('in' in expected) return expected.in.includes(row[key]);
      if ('notIn' in expected) return !expected.notIn.includes(row[key]);
      if ('not' in expected) return row[key] !== expected.not && row[key] !== undefined;
      if ('gte' in expected || 'lte' in expected) {
        return (!('gte' in expected) || row[key] >= expected.gte) && (!('lte' in expected) || row[key] <= expected.lte);
      }
    }
    return row[key] === expected;
  });
}

function orderRows(rows: Row[], orderBy: any): Row[] {
  const clauses: Row[] = Array.isArray(orderBy) ? orderBy : orderBy ? [orderBy] : [];
  return [...rows].sort((a, b) => {
    for (const clause of clauses) {
      const [field, dir] = Object.entries(clause)[0] as [string, string];
      if (a[field] === b[field]) continue;
      const cmp = a[field] > b[field] ? 1 : -1;
      return dir === 'desc' ? -cmp : cmp;
    }
    return 0;
  });
}

const spies = {
  valuationFindMany: jest.fn(),
  loanFindMany: jest.fn(),
  holdingFindMany: jest.fn()
};

const mockPrisma: Row = {
  property: {
    findFirst: jest.fn(async ({ where }: Row) => store.properties.find(p => matches(p, where)) ?? null),
    findMany: jest.fn(async ({ where }: Row) => store.properties.filter(p => matches(p, where)))
  },
  assetValuation: {
    findMany: jest.fn(async (args: Row) => {
      spies.valuationFindMany(args);
      return orderRows(
        store.valuations.filter(v => matches(v, args.where)),
        args.orderBy
      );
    }),
    findFirst: jest.fn(async (args: Row) => {
      const rows = orderRows(
        store.valuations.filter(v => matches(v, args.where)),
        args.orderBy
      );
      return rows[0] ?? null;
    })
  },
  propertyLoan: {
    findMany: jest.fn(async (args: Row) => {
      spies.loanFindMany(args);
      return orderRows(
        store.loans.filter(l => matches(l, args.where)),
        args.orderBy
      );
    })
  },
  propertyHolding: {
    findMany: jest.fn(async (args: Row) => {
      spies.holdingFindMany(args);
      return store.holdings
        .filter(h => matches(h, args.where))
        .map(h => ({ ...h, property: store.properties.find(p => p.id === h.propertyId) ?? null }));
    })
  },
  holdingEntity: {
    findFirst: jest.fn(async ({ where }: Row) => store.entities.find(e => matches(e, where)) ?? null)
  },
  propertyExpense: {
    findMany: jest.fn(async ({ where }: Row) => store.expenses.filter(e => matches(e, where)))
  },
  workProgram: { findMany: jest.fn(async () => []) },
  propertyDocument: { findMany: jest.fn(async () => []) },
  patrimonyDocument: { findMany: jest.fn(async () => []) },
  rentalLease: {
    findMany: jest.fn(async ({ where }: Row) =>
      store.leases.filter(
        l => l.tenant_id === where.tenant_id && (!where.property_id || l.property_id === where.property_id)
      )
    )
  }
};

jest.mock('../../src/utils/database', () => ({ prisma: mockPrisma }));

import { getPatrimoineOverview } from '../../src/lib/patrimoine/queries';
import { collectAgencyPatrimoineExport, collectPropertyPatrimoineExport } from '../../src/lib/patrimoine/export/data';
import { getEntityConsolidation } from '../../src/lib/patrimoine/entities/consolidation-service';

const valuationRow = (overrides: Row): Row => ({
  id: `val-${Math.random()}`,
  tenantId: TENANT,
  propertyId: null,
  assetId: null,
  valuatedAt: new Date('2026-01-01'),
  estimatedValue: 0,
  acquisitionCost: null,
  currency: 'XOF',
  method: 'MANUAL',
  ...overrides
});

const loanRow = (overrides: Row): Row => ({
  id: `loan-${Math.random()}`,
  tenantId: TENANT,
  propertyId: null,
  assetId: null,
  lender: 'Banque',
  capitalAmount: 0,
  remainingCapital: 0,
  interestRate: 5,
  monthlyPayment: 0,
  currency: 'XOF',
  startDate: new Date('2024-01-01'),
  endDate: new Date('2034-01-01'),
  status: 'ACTIVE',
  ...overrides
});

beforeEach(() => {
  jest.clearAllMocks();
  store.properties = [
    {
      id: PROP_1,
      tenantId: TENANT,
      // Bien DÉTENU par l'agence : seul retenu par l'export d'agence.
      ownershipType: 'TENANT',
      internalReference: 'REF-1',
      title: 'Bien 1',
      propertyType: 'APARTMENT',
      status: 'AVAILABLE',
      address: 'Abidjan'
    }
  ];
  store.expenses = [];
  store.leases = [];
  store.entities = [{ id: 'entity-1', tenantId: TENANT, name: 'SCI A', legalForm: 'SCI', country: 'CI' }];
  store.valuations = [
    valuationRow({ id: 'val-property', propertyId: PROP_1, estimatedValue: 100_000_000 }),
    // Actif non immobilier : valeur énorme et plus récente, qui fausserait tout total qui la laisserait passer.
    valuationRow({
      id: 'val-asset',
      assetId: ASSET_ID,
      estimatedValue: 777_000_000,
      valuatedAt: new Date('2026-06-01')
    }),
    // Autre agence : jamais lue non plus.
    valuationRow({ id: 'val-other', tenantId: OTHER_TENANT, propertyId: 'prop-x', estimatedValue: 5 })
  ];
  store.loans = [
    loanRow({ id: 'loan-property', propertyId: PROP_1, remainingCapital: 30_000_000 }),
    loanRow({ id: 'loan-asset', assetId: ASSET_ID, remainingCapital: 555_000_000 }),
    loanRow({ id: 'loan-personal', remainingCapital: 444_000_000 })
  ];
  store.holdings = [
    {
      id: 'holding-property',
      tenantId: TENANT,
      entityId: 'entity-1',
      propertyId: PROP_1,
      assetId: null,
      sharePercent: 50
    },
    {
      id: 'holding-asset',
      tenantId: TENANT,
      entityId: 'entity-1',
      propertyId: null,
      assetId: ASSET_ID,
      sharePercent: 90
    }
  ];
});

describe("getPatrimoineOverview — ignore les lignes d'actifs non immobiliers", () => {
  it("n'additionne ni la valeur d'un actif, ni son prêt, ni une dette personnelle", async () => {
    const overview = await getPatrimoineOverview(TENANT);

    expect(overview.totalEstimatedValue).toBe(100_000_000);
    expect(overview.totalLoanBalance).toBe(30_000_000);
  });

  it('borne les deux lectures agrégées par un propertyId non nul', async () => {
    await getPatrimoineOverview(TENANT);

    expect(spies.valuationFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: TENANT, propertyId: { not: null } } })
    );
    expect(spies.loanFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: TENANT, status: 'ACTIVE', propertyId: { not: null } } })
    );
  });
});

describe("exports PDF/Excel — ne contiennent aucune ligne d'actif non immobilier", () => {
  it("l'export d'agence ne reprend que les valorisations et prêts du bien, et une synthèse propre", async () => {
    const data = await collectAgencyPatrimoineExport(TENANT);

    expect(data.overview!.totalEstimatedValue).toBe(100_000_000);
    expect(data.overview!.totalLoanBalance).toBe(30_000_000);
    expect(data.properties).toHaveLength(1);
    expect(data.properties[0].valuations.map(v => v.estimatedValue)).toEqual([100_000_000]);
    expect(data.properties[0].loans.map(l => l.remainingCapital)).toEqual([30_000_000]);
    expect(data.properties[0].yield.currentValue).toBe(100_000_000);
  });

  it("l'export d'un bien lit ses lignes par propertyId, jamais par tenant seul", async () => {
    const data = await collectPropertyPatrimoineExport(TENANT, PROP_1);

    expect(data.properties[0].valuations).toHaveLength(1);
    expect(data.properties[0].loans).toHaveLength(1);
    for (const [args] of [...spies.valuationFindMany.mock.calls, ...spies.loanFindMany.mock.calls]) {
      expect(args.where.propertyId).toBeDefined();
    }
  });
});

describe("consolidation d'entité — parts d'actifs hors périmètre immobilier", () => {
  it('ne consolide que les parts de biens et ne lit que la dette de ces biens', async () => {
    const result = await getEntityConsolidation(TENANT, 'entity-1');

    expect(result.properties.map(p => p.propertyId)).toEqual([PROP_1]);
    expect(spies.holdingFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: TENANT, entityId: 'entity-1', propertyId: { not: null } } })
    );
    // Dette : 30 M du bien à 50 % ; ni le prêt de l'actif, ni la dette personnelle.
    expect(result.totals.outstandingDebt).toBe(15_000_000);
  });
});
