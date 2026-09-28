/**
 * Tests du service fiscal (lot P4, territoire A2,
 * `lib/patrimoine/tax/service.ts`) : résolution du pays, part non rattachée,
 * année partielle, repli d'année et sélection des paramètres par année.
 *
 * Prisma est remplacé par un magasin en mémoire ; `buildPropertyYieldInput`
 * (territoire A1, `lib/patrimoine/queries.ts`) est simulé via
 * `yield-input-adapter.ts`, seul point d'appel autorisé.
 */

type Row = Record<string, any>;

const TENANT_A = 'tenant-a';

const store = {
  properties: [] as Row[],
  taxProfiles: [] as Row[],
  holdings: [] as Row[],
  entities: [] as Row[],
  taxParameters: [] as Row[],
  tenant: { id: TENANT_A, country: null as string | null }
};

function matchesWhere(row: Row, where: Row): boolean {
  return Object.entries(where).every(([key, expected]) => {
    if (expected && typeof expected === 'object' && 'lte' in (expected as Row)) {
      return row[key] <= (expected as Row).lte;
    }
    if (expected && typeof expected === 'object' && 'in' in (expected as Row)) {
      return (expected as Row).in.includes(row[key]);
    }
    return row[key] === expected;
  });
}

const mockPrisma: Row = {
  property: {
    findFirst: jest.fn(async ({ where }: Row) => store.properties.find(p => matchesWhere(p, where)) ?? null)
  },
  propertyTaxProfile: {
    findFirst: jest.fn(async ({ where }: Row) => store.taxProfiles.find(p => matchesWhere(p, where)) ?? null),
    upsert: jest.fn(async ({ where, create, update }: Row) => {
      const existing = store.taxProfiles.find(p => p.propertyId === where.propertyId);
      if (existing) {
        Object.assign(existing, Object.fromEntries(Object.entries(update).filter(([, v]) => v !== undefined)));
        return existing;
      }
      const created = { updatedAt: new Date(), ...create };
      store.taxProfiles.push(created);
      return created;
    })
  },
  propertyHolding: {
    findMany: jest.fn(async ({ where }: Row) => store.holdings.filter(h => matchesWhere(h, where)))
  },
  holdingEntity: {
    findFirst: jest.fn(async ({ where }: Row) => store.entities.find(e => matchesWhere(e, where)) ?? null)
  },
  tenant: {
    findUnique: jest.fn(async () => store.tenant)
  },
  taxParameter: {
    findMany: jest.fn(async ({ where }: Row) => store.taxParameters.filter(p => matchesWhere(p, where))),
    groupBy: jest.fn(async () => {
      const seen = new Set<string>();
      const rows: Array<{ country: string; year: number }> = [];
      for (const p of store.taxParameters) {
        const key = `${p.country}-${p.year}`;
        if (!seen.has(key)) {
          seen.add(key);
          rows.push({ country: p.country, year: p.year });
        }
      }
      return rows;
    })
  }
};

jest.mock('../../src/utils/database', () => ({ prisma: mockPrisma }));
jest.mock('../../src/lib/patrimoine/entities/yield-input-adapter', () => ({
  loadPropertyYieldInput: jest.fn(async () => ({
    annualRent: 0,
    currentValue: 0,
    costBasis: 0,
    annualExpenses: 0,
    annualLoanPayments: 0
  }))
}));

import { getPropertyTaxEstimate, getEntityTaxEstimate, getTaxParameters } from '../../src/lib/patrimoine/tax/service';

function baseTaxParameterRow(overrides: Row): Row {
  return {
    id: `param-${Math.random()}`,
    country: 'CI',
    year: 2026,
    taxKind: 'PROPERTY_TAX',
    key: 'rate',
    propertyKind: 'ANY',
    occupancy: 'ANY',
    ownerKind: 'ANY',
    bracketIndex: 0,
    lowerBound: null,
    upperBound: null,
    value: null,
    valueText: null,
    unit: 'PERCENT',
    label: 'Taux',
    source: 'Test',
    sourceUrl: null,
    status: 'A_VALIDER',
    notes: null,
    ...overrides
  };
}

beforeEach(() => {
  store.properties = [];
  store.taxProfiles = [];
  store.holdings = [];
  store.entities = [];
  store.taxParameters = [];
  store.tenant = { id: TENANT_A, country: null };
  jest.clearAllMocks();
});

describe('tax/service — ordre de résolution du pays', () => {
  beforeEach(() => {
    store.properties.push({ id: 'prop-1', tenantId: TENANT_A, propertyType: 'APARTMENT' });
    store.taxParameters.push(
      baseTaxParameterRow({ country: 'CI', key: 'base', valueText: 'GROSS_RENT', value: null }),
      baseTaxParameterRow({ country: 'CI', key: 'rate', value: 5 }),
      baseTaxParameterRow({ country: 'ML', key: 'base', valueText: 'GROSS_RENT', value: null }),
      baseTaxParameterRow({ country: 'ML', key: 'rate', value: 3 })
    );
  });

  it('la requête (`?country=`) prime sur tout le reste', async () => {
    store.taxProfiles.push({ propertyId: 'prop-1', tenantId: TENANT_A, country: 'ML' });
    store.tenant.country = 'Mali';

    const estimate = await getPropertyTaxEstimate(TENANT_A, 'prop-1', { country: 'CI' as any });
    expect(estimate.country).toBe('CI');
    expect(estimate.countrySource).toBe('QUERY');
  });

  it('à défaut de requête, le profil fiscal du bien prime', async () => {
    store.taxProfiles.push({ propertyId: 'prop-1', tenantId: TENANT_A, country: 'ML' });
    store.tenant.country = "Côte d'Ivoire";

    const estimate = await getPropertyTaxEstimate(TENANT_A, 'prop-1', {});
    expect(estimate.country).toBe('ML');
    expect(estimate.countrySource).toBe('PROFILE');
  });

  it("à défaut de profil, le pays de l'agence (normalisé) est utilisé", async () => {
    store.tenant.country = 'Mali';

    const estimate = await getPropertyTaxEstimate(TENANT_A, 'prop-1', {});
    expect(estimate.country).toBe('ML');
    expect(estimate.countrySource).toBe('AGENCY');
  });
});

describe('tax/service — part non rattachée', () => {
  it('un bien sans détenteur est traité comme une part non rattachée de 100 %, INDIVIDUAL', async () => {
    store.properties.push({ id: 'prop-1', tenantId: TENANT_A, propertyType: 'APARTMENT' });
    store.tenant.country = 'CI';

    const estimate = await getPropertyTaxEstimate(TENANT_A, 'prop-1', {});
    expect(estimate.holders).toHaveLength(1);
    expect(estimate.holders[0]).toMatchObject({
      entityId: null,
      entityName: null,
      sharePercent: 100,
      ownerKind: 'INDIVIDUAL'
    });
  });

  it('un bien détenu à 60 % ajoute une part non rattachée de 40 %', async () => {
    store.properties.push({ id: 'prop-1', tenantId: TENANT_A, propertyType: 'APARTMENT' });
    store.entities.push({ id: 'entity-1', tenantId: TENANT_A, legalForm: 'SCI', fiscalOwnerKind: null, country: 'CI' });
    store.holdings.push({
      id: 'holding-1',
      tenantId: TENANT_A,
      propertyId: 'prop-1',
      entityId: 'entity-1',
      sharePercent: 60,
      effectiveFrom: null,
      entity: store.entities[0]
    });
    store.tenant.country = 'CI';

    const estimate = await getPropertyTaxEstimate(TENANT_A, 'prop-1', {});
    expect(estimate.holders).toHaveLength(2);
    const unassigned = estimate.holders.find(h => h.entityId === null);
    expect(unassigned?.sharePercent).toBeCloseTo(40, 4);
  });
});

describe('tax/service — repli et sélection des paramètres par année', () => {
  beforeEach(() => {
    store.properties.push({ id: 'prop-1', tenantId: TENANT_A, propertyType: 'APARTMENT' });
    store.tenant.country = 'CI';
    store.taxParameters.push(
      baseTaxParameterRow({ country: 'CI', year: 2026, key: 'base', valueText: 'GROSS_RENT', value: null }),
      baseTaxParameterRow({ country: 'CI', year: 2026, key: 'rate', value: 5 }),
      // Jeu 2027 fictif : un taux différent, pour vérifier que 2027 choisit
      // ses propres paramètres plutôt qu'un repli sur 2026.
      baseTaxParameterRow({ country: 'CI', year: 2027, key: 'base', valueText: 'GROSS_RENT', value: null }),
      baseTaxParameterRow({ country: 'CI', year: 2027, key: 'rate', value: 7 })
    );
  });

  it('2026 sélectionne le jeu 2026 (pas de repli)', async () => {
    const estimate = await getPropertyTaxEstimate(TENANT_A, 'prop-1', { year: 2026 });
    expect(estimate.parametersYear).toBe(2026);
    expect(estimate.parametersFallback).toBe(false);
  });

  it('2027 sélectionne le jeu 2027 (pas 2026)', async () => {
    const estimate = await getPropertyTaxEstimate(TENANT_A, 'prop-1', { year: 2027 });
    expect(estimate.parametersYear).toBe(2027);
    expect(estimate.parametersFallback).toBe(false);
  });

  it('2028 (sans paramètres propres) replie sur 2027 avec `parametersFallback: true`', async () => {
    const estimate = await getPropertyTaxEstimate(TENANT_A, 'prop-1', { year: 2028 });
    expect(estimate.parametersYear).toBe(2027);
    expect(estimate.parametersFallback).toBe(true);
  });

  it('getTaxParameters : 2027 renvoie le jeu 2027, 2026 renvoie le jeu 2026', async () => {
    const data2026 = await getTaxParameters({ country: 'CI' as any, year: 2026 });
    expect(data2026.parametersYear).toBe(2026);
    expect(data2026.fallback).toBe(false);

    const data2027 = await getTaxParameters({ country: 'CI' as any, year: 2027 });
    expect(data2027.parametersYear).toBe(2027);
    expect(data2027.fallback).toBe(false);
  });
});

describe("tax/service — année partielle (estimation d'une entité)", () => {
  it("un rattachement dont `effectiveFrom` tombe après le 1er janvier de l'année porte `partialYear: true`", async () => {
    store.properties.push({
      id: 'prop-1',
      tenantId: TENANT_A,
      propertyType: 'APARTMENT',
      title: 'Bien 1',
      internalReference: 'REF-1'
    });
    store.entities.push({ id: 'entity-1', tenantId: TENANT_A, legalForm: 'SCI', fiscalOwnerKind: null, country: 'CI' });
    store.holdings.push({
      id: 'holding-1',
      tenantId: TENANT_A,
      propertyId: 'prop-1',
      entityId: 'entity-1',
      sharePercent: 100,
      effectiveFrom: new Date('2026-06-15T00:00:00.000Z'),
      property: store.properties[0]
    });
    store.tenant.country = 'CI';
    store.taxParameters.push(
      baseTaxParameterRow({ country: 'CI', year: 2026, key: 'base', valueText: 'GROSS_RENT', value: null }),
      baseTaxParameterRow({ country: 'CI', year: 2026, key: 'rate', value: 5 })
    );

    const estimate = await getEntityTaxEstimate(TENANT_A, 'entity-1', { year: 2026 });
    expect(estimate.properties).toHaveLength(1);
    expect(estimate.properties[0].partialYear).toBe(true);
  });

  it("un rattachement dont `effectiveFrom` tombe après le 31 décembre de l'année est exclu", async () => {
    store.properties.push({
      id: 'prop-1',
      tenantId: TENANT_A,
      propertyType: 'APARTMENT',
      title: 'Bien 1',
      internalReference: 'REF-1'
    });
    store.entities.push({ id: 'entity-1', tenantId: TENANT_A, legalForm: 'SCI', fiscalOwnerKind: null, country: 'CI' });
    store.holdings.push({
      id: 'holding-1',
      tenantId: TENANT_A,
      propertyId: 'prop-1',
      entityId: 'entity-1',
      sharePercent: 100,
      effectiveFrom: new Date('2027-01-15T00:00:00.000Z'),
      property: store.properties[0]
    });
    store.tenant.country = 'CI';

    const estimate = await getEntityTaxEstimate(TENANT_A, 'entity-1', { year: 2026 });
    expect(estimate.properties).toHaveLength(0);
  });
});
