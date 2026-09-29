/**
 * Tests du service du patrimoine multi-actifs (lot 1). Prisma est remplacé par
 * un magasin en mémoire (même esprit que `patrimoine.entities.service.test.ts`) :
 * aucune base requise.
 */

type Row = Record<string, any>;

const TENANT_A = 'tenant-a';
const TENANT_B = 'tenant-b';
const ENTITY_A = '11111111-1111-4111-8111-111111111111';
const ENTITY_B = '22222222-2222-4222-8222-222222222222';

const store = {
  asset: [] as Row[],
  assetValuation: [] as Row[],
  propertyLoan: [] as Row[],
  propertyHolding: [] as Row[],
  holdingEntity: [] as Row[],
  property: [] as Row[],
  seq: 0
};

function matches(row: Row, where: Row): boolean {
  return Object.entries(where).every(([key, expected]) => {
    if (key === 'OR') return (expected as Row[]).some(w => matches(row, w));
    const actual = row[key] === undefined ? null : row[key];
    if (expected && typeof expected === 'object' && !(expected instanceof Date)) {
      if ('in' in expected) return expected.in.includes(actual);
      if ('not' in expected) {
        return expected.not === null ? actual !== null : Array.isArray(expected.not) ? true : actual !== expected.not;
      }
      if ('lt' in expected) return actual instanceof Date && actual.getTime() < (expected.lt as Date).getTime();
      if ('notIn' in expected) return !expected.notIn.includes(actual);
      if ('contains' in expected) return String(actual).toLowerCase().includes(String(expected.contains).toLowerCase());
    }
    return actual === expected;
  });
}

function delegate(name: keyof typeof store, defaults: () => Row = () => ({}), hooks: (row: Row) => Row = r => r) {
  const rows = () => store[name] as Row[];
  return {
    findFirst: jest.fn(async ({ where }: Row) => {
      const found = rows().find(r => matches(r, where ?? {}));
      return found ? hooks({ ...found }) : null;
    }),
    findMany: jest.fn(async ({ where }: Row = {}) =>
      rows()
        .filter(r => matches(r, where ?? {}))
        .map(r => hooks({ ...r }))
    ),
    count: jest.fn(async ({ where }: Row = {}) => rows().filter(r => matches(r, where ?? {})).length),
    create: jest.fn(async ({ data }: Row) => {
      store.seq += 1;
      const row = { id: `${name}-${store.seq}`, createdAt: new Date(), updatedAt: new Date(), ...defaults(), ...data };
      rows().push(row);
      return hooks({ ...row });
    }),
    update: jest.fn(async ({ where, data }: Row) => {
      const row = rows().find(r => matches(r, where));
      if (!row) throw new Error('P2025');
      Object.assign(row, data);
      return hooks({ ...row });
    }),
    updateMany: jest.fn(async ({ where, data }: Row) => {
      const found = rows().filter(r => matches(r, where));
      found.forEach(r => Object.assign(r, data));
      return { count: found.length };
    }),
    delete: jest.fn(async ({ where }: Row) => {
      const index = rows().findIndex(r => matches(r, where));
      if (index < 0) throw new Error('P2025');
      return rows().splice(index, 1)[0];
    }),
    aggregate: jest.fn(async ({ where }: Row) => ({
      _sum: {
        sharePercent: rows()
          .filter(r => matches(r, where))
          .reduce((sum, r) => sum + Number(r.sharePercent), 0)
      }
    }))
  };
}

const withProperty = (row: Row): Row => ({
  ...row,
  property: row.propertyId ? (store.property.find(p => p.id === row.propertyId) ?? null) : null
});
const withEntity = (row: Row): Row => ({
  ...row,
  entity: store.holdingEntity.find(e => e.id === row.entityId) ?? { id: row.entityId, name: '?' }
});

const prismaMock: Row = {
  asset: delegate(
    'asset',
    () => ({ status: 'ACTIVE', details: {}, disposedAt: null, holdingEntityId: null, propertyId: null }),
    withProperty
  ),
  assetValuation: delegate('assetValuation', () => ({ assetId: null, propertyId: null, source: null, notes: null })),
  propertyLoan: delegate('propertyLoan', () => ({ assetId: null, propertyId: null })),
  propertyHolding: delegate('propertyHolding', () => ({ effectiveFrom: null, notes: null }), withEntity),
  holdingEntity: delegate('holdingEntity'),
  property: delegate('property')
};
prismaMock.$transaction = jest.fn(async (fn: (tx: Row) => Promise<unknown>) => fn(prismaMock));

// `$queryRaw` tagué : verrou `SELECT id, status FROM assets ... FOR UPDATE` (valeurs : id, tenantId).
prismaMock.$queryRaw = jest.fn(async (_strings: TemplateStringsArray, ...values: unknown[]) =>
  store.asset.filter(a => a.id === values[0] && a.tenantId === values[1]).map(a => ({ id: a.id, status: a.status }))
);

// Palier gratuit (lot 4B) : la garde lit les droits d'abonnement en base ; hors sujet ici (voir personal-space.*.test.ts).
jest.mock('../../src/services/personal-space/free-tier', () => ({
  getAssetCapacityLimit: jest.fn(async () => null),
  isFreeTierLimitReached: jest.fn(async () => false),
  lockTenantAssets: jest.fn(async () => undefined),
  assertFreeTierCapacityTx: jest.fn(async () => undefined)
}));

jest.mock('../../src/utils/database', () => ({ prisma: prismaMock }));
const mockAudit = jest.fn();
jest.mock('../../src/services/audit-service', () => ({ logAuditEvent: (entry: unknown) => mockAudit(entry) }));

import * as service from '../../src/services/patrimoine-assets-service';
import { AppError } from '../../src/middleware/error-middleware';
import * as freeTier from '../../src/services/personal-space/free-tier';

const iso = (value: string) => new Date(`${value}T00:00:00.000Z`);

function seedProperty(id: string, tenantId: string) {
  store.property.push({ id, tenantId, internalReference: `REF-${id}`, title: `Bien ${id}` });
}

function seedAsset(row: Row): Row {
  const asset = {
    status: 'ACTIVE',
    currency: 'XOF',
    exchangeRateToXof: null,
    acquisitionCost: null,
    acquisitionDate: null,
    disposedAt: null,
    holdingEntityId: null,
    propertyId: null,
    details: {},
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    tenantId: TENANT_A,
    ...row
  };
  store.asset.push(asset);
  return asset;
}

function seedValuation(row: Row) {
  store.assetValuation.push({
    id: `v-${store.seq++}`,
    tenantId: TENANT_A,
    currency: 'XOF',
    method: 'MANUAL',
    source: null,
    notes: null,
    assetId: null,
    propertyId: null,
    createdAt: new Date(),
    ...row
  });
}

function seedLoan(row: Row) {
  store.propertyLoan.push({
    id: `l-${store.seq++}`,
    tenantId: TENANT_A,
    currency: 'XOF',
    status: 'ACTIVE',
    assetId: null,
    propertyId: null,
    lender: 'Banque',
    capitalAmount: 1,
    interestRate: 5,
    monthlyPayment: 1,
    startDate: iso('2024-01-01'),
    endDate: iso('2034-01-01'),
    ...row
  });
}

beforeEach(() => {
  mockAudit.mockClear();
  Object.assign(store, {
    asset: [],
    assetValuation: [],
    propertyLoan: [],
    propertyHolding: [],
    holdingEntity: [
      { id: ENTITY_A, tenantId: TENANT_A, name: 'SCI A' },
      { id: ENTITY_B, tenantId: TENANT_B, name: 'SCI B' }
    ],
    property: [],
    seq: 0
  });
});

const cashDetails = { institution: 'Banque', cashKind: 'BANK' };

describe('createAsset', () => {
  it('crée un actif non immobilier avec sa première valorisation dans la même transaction', async () => {
    const dto = await service.createAsset(TENANT_A, {
      name: 'Compte courant',
      assetClass: 'CASH',
      details: cashDetails,
      initialValuation: { valuatedAt: iso('2026-01-01'), estimatedValue: 500000, method: 'MANUAL' }
    });
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(store.assetValuation).toHaveLength(1);
    expect(store.assetValuation[0]).toMatchObject({ tenantId: TENANT_A, assetId: dto.id, currency: 'XOF' });
    expect(store.assetValuation[0].propertyId).toBeNull();
    expect(dto.currentValue).toMatchObject({ amount: 500000, currency: 'XOF', valueXof: 500000 });
    expect(dto.outstandingDebtXof).toBe(0);
    expect(JSON.stringify(dto)).not.toMatch(/passwordHash|filePath/);
  });

  it('un actif immobilier lié à un bien écrit sa valorisation initiale sur le bien (propertyId)', async () => {
    seedProperty('prop-1', TENANT_A);
    const dto = await service.createAsset(TENANT_A, {
      name: 'Villa',
      assetClass: 'REAL_ESTATE',
      propertyId: 'prop-1',
      details: {},
      initialValuation: { valuatedAt: iso('2026-01-01'), estimatedValue: 1000, method: 'MANUAL' }
    });
    expect(store.assetValuation[0]).toMatchObject({ propertyId: 'prop-1' });
    expect(store.assetValuation[0].assetId).toBeNull();
    expect(dto.property).toMatchObject({ id: 'prop-1' });
  });

  it("propertyId d'un autre tenant : la même NotFoundError qu'un bien inexistant", async () => {
    seedProperty('prop-b', TENANT_B);
    const attempt = (propertyId: string) =>
      service.createAsset(TENANT_A, { name: 'Villa', assetClass: 'REAL_ESTATE', propertyId, details: {} });
    const foreign = await attempt('prop-b').catch(e => e);
    const missing = await attempt('inconnu').catch(e => e);
    expect(foreign.name).toBe('NotFoundError');
    expect(foreign.statusCode).toBe(404);
    expect(foreign.message).toBe(missing.message);
    expect(store.asset).toHaveLength(0);
  });

  it('un actif immobilier sans propertyId est refusé', async () => {
    await expect(
      service.createAsset(TENANT_A, { name: 'Villa', assetClass: 'REAL_ESTATE', details: {} })
    ).rejects.toMatchObject({ name: 'ValidationError' });
  });

  it('un bien déjà lié à un actif est refusé (409)', async () => {
    seedProperty('prop-1', TENANT_A);
    seedAsset({ id: 'asset-existing', name: 'Déjà', assetClass: 'REAL_ESTATE', propertyId: 'prop-1' });
    await expect(
      service.createAsset(TENANT_A, { name: 'Villa', assetClass: 'REAL_ESTATE', propertyId: 'prop-1', details: {} })
    ).rejects.toMatchObject({ name: 'ConflictError', statusCode: 409 });
  });

  it('une classe non immobilière avec propertyId est refusée', async () => {
    seedProperty('prop-1', TENANT_A);
    await expect(
      service.createAsset(TENANT_A, { name: 'Cpt', assetClass: 'CASH', propertyId: 'prop-1', details: cashDetails })
    ).rejects.toMatchObject({ name: 'ValidationError', errors: [{ field: 'propertyId' }] });
  });

  it('des details invalides renvoient une ValidationError avec la liste { field: details.<clé>, message }', async () => {
    const error = await service
      .createAsset(TENANT_A, { name: 'Cpt', assetClass: 'CASH', details: { institution: 'B', cashKind: 'X' } })
      .catch(e => e);
    expect(error.name).toBe('ValidationError');
    expect(error.errors).toEqual([{ field: 'details.cashKind', message: expect.any(String) }]);
    expect(store.asset).toHaveLength(0);
  });

  it('une devise autre que XOF sans taux est refusée', async () => {
    await expect(
      service.createAsset(TENANT_A, { name: 'Cpt', assetClass: 'CASH', currency: 'EUR', details: cashDetails })
    ).rejects.toMatchObject({ name: 'ValidationError', errors: [{ field: 'exchangeRateToXof' }] });
  });

  it('une devise étrangère avec taux est acceptée et la valeur convertie en XOF', async () => {
    const dto = await service.createAsset(TENANT_A, {
      name: 'Cpt EUR',
      assetClass: 'CASH',
      currency: 'EUR',
      exchangeRateToXof: 655.957,
      details: cashDetails,
      initialValuation: { valuatedAt: iso('2026-01-01'), estimatedValue: 100, method: 'MANUAL' }
    });
    expect(dto.currentValue?.valueXof).toBe(65596);
  });

  it("holdingEntityId d'un autre tenant : NotFoundError", async () => {
    await expect(
      service.createAsset(TENANT_A, {
        name: 'Cpt',
        assetClass: 'CASH',
        details: cashDetails,
        holdingEntityId: ENTITY_B
      })
    ).rejects.toMatchObject({ name: 'NotFoundError' });
  });

  it('retire les null des details facultatifs avant validation', async () => {
    await expect(
      service.createAsset(TENANT_A, {
        name: 'Cpt',
        assetClass: 'CASH',
        details: { ...cashDetails, accountLast4: null as unknown as string }
      })
    ).resolves.toMatchObject({ assetClass: 'CASH' });
  });
});

describe('cession et archivage', () => {
  it('dispose passe en DISPOSED sans supprimer, puis refuse une seconde cession', async () => {
    seedAsset({ id: 'a1', name: 'Camion', assetClass: 'VEHICLE_EQUIPMENT' });
    const dto = await service.disposeAsset(TENANT_A, 'a1', iso('2026-03-01'));
    expect(dto.status).toBe('DISPOSED');
    expect(dto.disposedAt).toBe('2026-03-01T00:00:00.000Z');
    expect(store.asset).toHaveLength(1);
    await expect(service.disposeAsset(TENANT_A, 'a1', iso('2026-04-01'))).rejects.toMatchObject({
      name: 'ConflictError'
    });
  });

  it("dispose sur l'actif d'un autre tenant : NotFoundError, actif intact", async () => {
    seedAsset({ id: 'a-b', name: 'X', assetClass: 'OTHER', tenantId: TENANT_B });
    await expect(service.disposeAsset(TENANT_A, 'a-b', iso('2026-03-01'))).rejects.toMatchObject({
      name: 'NotFoundError'
    });
    expect(store.asset[0].status).toBe('ACTIVE');
  });

  it('archive passe en ARCHIVED sans suppression, refuse un actif déjà archivé', async () => {
    seedAsset({ id: 'a1', name: 'Stock', assetClass: 'INVENTORY' });
    const dto = await service.archiveAsset(TENANT_A, 'a1');
    expect(dto.status).toBe('ARCHIVED');
    expect(store.asset).toHaveLength(1);
    await expect(service.archiveAsset(TENANT_A, 'a1')).rejects.toMatchObject({ name: 'ConflictError' });
  });
});

describe('valorisations et dettes via asset-scope', () => {
  it("un actif immobilier lit les valorisations du bien, un autre celles de l'actif", async () => {
    seedProperty('prop-1', TENANT_A);
    seedAsset({ id: 'a-re', name: 'Villa', assetClass: 'REAL_ESTATE', propertyId: 'prop-1' });
    seedAsset({ id: 'a-cash', name: 'Cpt', assetClass: 'CASH' });
    seedValuation({ propertyId: 'prop-1', estimatedValue: 100, valuatedAt: iso('2026-01-01') });
    seedValuation({ assetId: 'a-cash', estimatedValue: 5, valuatedAt: iso('2026-01-01') });
    const re = await service.listAssetValuations(TENANT_A, 'a-re');
    const cash = await service.listAssetValuations(TENANT_A, 'a-cash');
    expect(re.map(v => v.estimatedValue)).toEqual([100]);
    expect(re[0].assetId).toBe('a-re');
    expect(cash.map(v => v.estimatedValue)).toEqual([5]);
  });

  it("crée une valorisation sur le bien pour un actif immobilier, refuse une devise étrangère à l'actif", async () => {
    seedProperty('prop-1', TENANT_A);
    seedAsset({ id: 'a-re', name: 'Villa', assetClass: 'REAL_ESTATE', propertyId: 'prop-1' });
    await service.createAssetValuation(TENANT_A, 'a-re', { valuatedAt: iso('2026-01-01'), estimatedValue: 10 });
    expect(store.assetValuation[0]).toMatchObject({ propertyId: 'prop-1', tenantId: TENANT_A });
    expect(store.assetValuation[0].assetId).toBeNull();
    await expect(
      service.createAssetValuation(TENANT_A, 'a-re', {
        valuatedAt: iso('2026-01-01'),
        estimatedValue: 10,
        currency: 'USD'
      })
    ).rejects.toMatchObject({ name: 'ValidationError' });
  });

  it("supprimer la valorisation d'un autre actif est introuvable", async () => {
    seedAsset({ id: 'a1', name: 'A', assetClass: 'CASH' });
    seedAsset({ id: 'a2', name: 'B', assetClass: 'CASH' });
    seedValuation({ id: 'v-x', assetId: 'a2', estimatedValue: 1, valuatedAt: iso('2026-01-01') });
    await expect(service.deleteAssetValuation(TENANT_A, 'a1', 'v-x')).rejects.toMatchObject({ name: 'NotFoundError' });
    expect(store.assetValuation).toHaveLength(1);
  });

  it('dette : personnelle sans actif, sur le bien pour un actif immobilier, sur assetId sinon', async () => {
    seedProperty('prop-1', TENANT_A);
    seedAsset({ id: 'a-re', name: 'Villa', assetClass: 'REAL_ESTATE', propertyId: 'prop-1' });
    seedAsset({ id: 'a-biz', name: 'SARL', assetClass: 'BUSINESS_EQUITY' });
    const base = {
      lender: 'Banque',
      capitalAmount: 100,
      remainingCapital: 80,
      interestRate: 5,
      monthlyPayment: 2,
      startDate: iso('2025-01-01'),
      endDate: iso('2030-01-01')
    };
    const personal = await service.createDebt(TENANT_A, base);
    const onProperty = await service.createDebt(TENANT_A, { ...base, assetId: 'a-re' });
    const onAsset = await service.createDebt(TENANT_A, { ...base, assetId: 'a-biz' });
    expect(store.propertyLoan[0]).toMatchObject({ propertyId: null, assetId: null });
    expect(store.propertyLoan[1]).toMatchObject({ propertyId: 'prop-1', assetId: null });
    expect(store.propertyLoan[2]).toMatchObject({ propertyId: null, assetId: 'a-biz' });
    expect(personal.assetId).toBeNull();
    expect(onProperty.assetId).toBe('a-re');
    expect(onAsset.assetId).toBe('a-biz');
    const unattached = await service.listDebts(TENANT_A, { unattached: 'true' });
    expect(unattached).toHaveLength(1);
    const forAsset = await service.listDebts(TENANT_A, { assetId: 'a-re' });
    expect(forAsset.map(d => d.id)).toEqual([onProperty.id]);
  });

  it("dette sur l'actif d'un autre tenant : NotFoundError, rien n'est créé", async () => {
    seedAsset({ id: 'a-b', name: 'X', assetClass: 'OTHER', tenantId: TENANT_B });
    await expect(
      service.createDebt(TENANT_A, {
        assetId: 'a-b',
        lender: 'Banque',
        capitalAmount: 1,
        remainingCapital: 1,
        interestRate: 0,
        monthlyPayment: 0,
        startDate: iso('2025-01-01'),
        endDate: iso('2026-01-01')
      })
    ).rejects.toMatchObject({ name: 'NotFoundError' });
    expect(store.propertyLoan).toHaveLength(0);
  });

  it("le prêt d'un bien sans actif n'apparaît pas dans la liste des dettes et n'est pas modifiable ici", async () => {
    seedProperty('prop-x', TENANT_A);
    seedLoan({ id: 'loan-x', propertyId: 'prop-x', remainingCapital: 30 });
    expect(await service.listDebts(TENANT_A, {})).toHaveLength(0);
    await expect(service.deleteDebt(TENANT_A, 'loan-x')).rejects.toMatchObject({ name: 'NotFoundError' });
    expect(store.propertyLoan).toHaveLength(1);
  });

  it('une dette personnelle en devise étrangère est refusée', async () => {
    await expect(
      service.createDebt(TENANT_A, {
        lender: 'Ami',
        capitalAmount: 1,
        remainingCapital: 1,
        interestRate: 0,
        monthlyPayment: 0,
        currency: 'EUR',
        startDate: iso('2025-01-01'),
        endDate: iso('2026-01-01')
      })
    ).rejects.toMatchObject({ name: 'ValidationError' });
  });
});

describe('parts détenues', () => {
  it('refuse les parts sur un actif immobilier avec un renvoi vers les routes des entités', async () => {
    seedProperty('prop-1', TENANT_A);
    seedAsset({ id: 'a-re', name: 'Villa', assetClass: 'REAL_ESTATE', propertyId: 'prop-1' });
    const error = await service.setAssetHolding(TENANT_A, 'a-re', ENTITY_A, { sharePercent: 50 }).catch(e => e);
    expect(error.name).toBe('BadRequestError');
    expect(error.message).toContain('entités détentrices');
    expect(store.propertyHolding).toHaveLength(0);
    await expect(service.listAssetHoldings(TENANT_A, 'a-re')).rejects.toMatchObject({ name: 'BadRequestError' });
  });

  it('pose, met à jour et supprime une part sur un actif non immobilier', async () => {
    seedAsset({ id: 'a-biz', name: 'SARL', assetClass: 'BUSINESS_EQUITY' });
    const created = await service.setAssetHolding(TENANT_A, 'a-biz', ENTITY_A, { sharePercent: 40 });
    expect(created).toMatchObject({ assetId: 'a-biz', entityId: ENTITY_A, entityName: 'SCI A', sharePercent: 40 });
    expect(store.propertyHolding[0]).toMatchObject({ assetId: 'a-biz', tenantId: TENANT_A });
    expect(store.propertyHolding[0].propertyId).toBeUndefined();
    await service.setAssetHolding(TENANT_A, 'a-biz', ENTITY_A, { sharePercent: 60 });
    expect(store.propertyHolding).toHaveLength(1);
    expect((await service.listAssetHoldings(TENANT_A, 'a-biz'))[0].sharePercent).toBe(60);
    await service.deleteAssetHolding(TENANT_A, 'a-biz', ENTITY_A);
    expect(store.propertyHolding).toHaveLength(0);
  });

  it("refuse l'entité d'un autre tenant et un total au-delà de 100 %", async () => {
    seedAsset({ id: 'a-biz', name: 'SARL', assetClass: 'BUSINESS_EQUITY' });
    await expect(service.setAssetHolding(TENANT_A, 'a-biz', ENTITY_B, { sharePercent: 10 })).rejects.toMatchObject({
      name: 'NotFoundError'
    });
    store.holdingEntity.push({ id: '33333333-3333-4333-8333-333333333333', tenantId: TENANT_A, name: 'SCI C' });
    await service.setAssetHolding(TENANT_A, 'a-biz', ENTITY_A, { sharePercent: 70 });
    await expect(
      service.setAssetHolding(TENANT_A, 'a-biz', '33333333-3333-4333-8333-333333333333', { sharePercent: 40 })
    ).rejects.toMatchObject({ name: 'ValidationError' });
  });
});

describe('listAssets : pas de N+1', () => {
  it('une requête groupée de valorisations et une de prêts pour tous les actifs', async () => {
    seedProperty('prop-1', TENANT_A);
    seedAsset({ id: 'a-re', name: 'Villa', assetClass: 'REAL_ESTATE', propertyId: 'prop-1' });
    for (let i = 0; i < 5; i += 1) seedAsset({ id: `c${i}`, name: `Cpt ${i}`, assetClass: 'CASH' });
    seedValuation({ propertyId: 'prop-1', estimatedValue: 100, valuatedAt: iso('2026-01-01') });
    seedValuation({ propertyId: 'prop-1', estimatedValue: 150, valuatedAt: iso('2026-02-01') });
    seedLoan({ propertyId: 'prop-1', remainingCapital: 40 });
    prismaMock.assetValuation.findMany.mockClear();
    prismaMock.propertyLoan.findMany.mockClear();
    const list = await service.listAssets(TENANT_A, {});
    expect(prismaMock.assetValuation.findMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.propertyLoan.findMany).toHaveBeenCalledTimes(1);
    const villa = list.find(a => a.id === 'a-re');
    expect(villa?.currentValue?.amount).toBe(150);
    expect(villa?.outstandingDebtXof).toBe(40);
  });

  it('ne renvoie que les actifs du tenant et filtre par classe', async () => {
    seedAsset({ id: 'mine', name: 'Cpt', assetClass: 'CASH' });
    seedAsset({ id: 'theirs', name: 'Cpt B', assetClass: 'CASH', tenantId: TENANT_B });
    seedAsset({ id: 'other', name: 'Stock', assetClass: 'INVENTORY' });
    expect((await service.listAssets(TENANT_A, {})).map(a => a.id).sort()).toEqual(['mine', 'other']);
    expect((await service.listAssets(TENANT_A, { assetClass: 'INVENTORY' })).map(a => a.id)).toEqual(['other']);
  });

  it('sans filtre de statut : tous sauf ARCHIVED ; avec status=ARCHIVED : les archivés', async () => {
    seedAsset({ id: 'live', name: 'Actif', assetClass: 'CASH' });
    seedAsset({ id: 'sold', name: 'Cédé', assetClass: 'CASH', status: 'DISPOSED' });
    seedAsset({ id: 'old', name: 'Archivé', assetClass: 'CASH', status: 'ARCHIVED' });
    expect((await service.listAssets(TENANT_A, {})).map(a => a.id).sort()).toEqual(['live', 'sold']);
    expect((await service.listAssets(TENANT_A, { status: 'ARCHIVED' })).map(a => a.id)).toEqual(['old']);
  });
});

describe('valeur nette', () => {
  function seedScenario() {
    seedProperty('prop-1', TENANT_A);
    seedProperty('prop-noasset', TENANT_A);
    seedAsset({ id: 'a-re', name: 'Immeuble', assetClass: 'REAL_ESTATE', propertyId: 'prop-1' });
    seedAsset({ id: 'a-biz', name: 'SARL', assetClass: 'BUSINESS_EQUITY' });
    seedAsset({ id: 'a-cash', name: 'Comptes', assetClass: 'CASH' });
    seedAsset({ id: 'a-other-tenant', name: 'Autre', assetClass: 'CASH', tenantId: TENANT_B });
    seedValuation({ propertyId: 'prop-1', estimatedValue: 60000000, valuatedAt: iso('2026-01-01') });
    seedValuation({ assetId: 'a-biz', estimatedValue: 20000000, valuatedAt: iso('2026-01-01') });
    seedValuation({ assetId: 'a-cash', estimatedValue: 6400000, valuatedAt: iso('2026-01-01') });
    seedValuation({
      assetId: 'a-other-tenant',
      tenantId: TENANT_B,
      estimatedValue: 999999999,
      valuatedAt: iso('2026-01-01')
    });
    seedLoan({ propertyId: 'prop-1', remainingCapital: 15000000 });
    seedLoan({ assetId: 'a-biz', remainingCapital: 0, status: 'CLOSED' });
    seedLoan({ remainingCapital: 5000000 });
    seedLoan({ propertyId: 'prop-noasset', remainingCapital: 30000000 });
  }

  it('86 400 000 d’actifs, 20 000 000 de dettes (prêt du bien + dette personnelle), 66 400 000 net', async () => {
    seedScenario();
    const result = await service.getNetWorth(TENANT_A, { asOf: '2026-06-30' });
    expect(result.totalAssets).toBe(86400000);
    expect(result.totalDebts).toBe(20000000);
    expect(result.netWorth).toBe(66400000);
    expect(result.excluded).toEqual([]);
    expect(result.asOf.toISOString()).toBe('2026-06-30T00:00:00.000Z');
  });

  it('la dette personnelle est soustraite et le prêt d’un bien sans actif est ignoré', async () => {
    seedScenario();
    const result = await service.getNetWorth(TENANT_A, { asOf: '2026-06-30' });
    expect(result.totalDebts).not.toBe(50000000);
    store.propertyLoan = store.propertyLoan.filter(l => l.remainingCapital !== 5000000);
    expect((await service.getNetWorth(TENANT_A, { asOf: '2026-06-30' })).totalDebts).toBe(15000000);
  });

  it('une valorisation postérieure à la date demandée est ignorée ; le jour même compte en entier', async () => {
    seedScenario();
    const before = await service.getNetWorth(TENANT_A, { asOf: '2025-12-31' });
    expect(before.totalAssets).toBe(0);
    expect(before.excluded).toHaveLength(3);
    const sameDay = await service.getNetWorth(TENANT_A, { asOf: '2026-01-01' });
    expect(sameDay.totalAssets).toBe(86400000);
  });

  it('refuse une date inexistante', async () => {
    await expect(service.getNetWorth(TENANT_A, { asOf: '2026-02-30' })).rejects.toMatchObject({
      name: 'ValidationError'
    });
  });

  it('historique : 12 mois par défaut, croissants, chaque date au format AAAA-MM-JJ', async () => {
    seedScenario();
    const points = await service.getNetWorthHistory(TENANT_A, { to: '2026-06-30' });
    expect(points).toHaveLength(12);
    expect(points[0].date).toBe('2025-07-30');
    expect(points[11]).toMatchObject({ date: '2026-06-30', netWorth: 66400000 });
    expect(points[0].totalAssets).toBe(0);
    expect(points.map(p => p.date)).toEqual([...points.map(p => p.date)].sort());
  });

  it('historique : bornes validées et 60 points maximum', async () => {
    await expect(service.getNetWorthHistory(TENANT_A, { from: '2026-07-01', to: '2026-06-01' })).rejects.toMatchObject({
      name: 'ValidationError'
    });
    await expect(service.getNetWorthHistory(TENANT_A, { from: '2020-01-01', to: '2026-06-30' })).rejects.toMatchObject({
      name: 'ValidationError'
    });
    const sixty = await service.getNetWorthHistory(TENANT_A, { from: '2021-07-30', to: '2026-06-30' });
    expect(sixty).toHaveLength(60);
  });

  it('les dates mensuelles se ramènent à la fin du mois court', () => {
    const dates = service.buildHistoryDates(iso('2026-01-01'), iso('2026-03-31'));
    expect(dates.map(d => d.toISOString().slice(0, 10))).toEqual(['2026-01-31', '2026-02-28', '2026-03-31']);
  });
});

const debtBase = {
  lender: 'Banque',
  capitalAmount: 100,
  remainingCapital: 80,
  interestRate: 5,
  monthlyPayment: 2,
  startDate: iso('2025-01-01'),
  endDate: iso('2030-01-01')
};

describe('parts détenues : verrou et transaction', () => {
  it("verrouille l'actif (FOR UPDATE) dans la transaction avant de relire la somme", async () => {
    seedAsset({ id: 'a1', name: 'SARL', assetClass: 'BUSINESS_EQUITY' });
    prismaMock.$transaction.mockClear();
    prismaMock.$queryRaw.mockClear();
    prismaMock.propertyHolding.aggregate.mockClear();
    await service.setAssetHolding(TENANT_A, 'a1', ENTITY_A, { sharePercent: 40 });
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(prismaMock.$queryRaw.mock.calls[0][0].join('')).toMatch(/FROM assets .*FOR UPDATE/s);
    expect(prismaMock.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      prismaMock.propertyHolding.aggregate.mock.invocationCallOrder[0]
    );
  });

  it('un actif absent au moment du verrou : NotFoundError, aucune part écrite', async () => {
    seedAsset({ id: 'a1', name: 'SARL', assetClass: 'BUSINESS_EQUITY' });
    prismaMock.$queryRaw.mockResolvedValueOnce([]);
    await expect(service.setAssetHolding(TENANT_A, 'a1', ENTITY_A, { sharePercent: 40 })).rejects.toMatchObject({
      name: 'NotFoundError'
    });
    expect(store.propertyHolding).toHaveLength(0);
  });

  it('un archivage survenu avant le verrou est refusé sous verrou (409)', async () => {
    seedAsset({ id: 'a1', name: 'SARL', assetClass: 'BUSINESS_EQUITY' });
    prismaMock.$queryRaw.mockResolvedValueOnce([{ id: 'a1', status: 'ARCHIVED' }]);
    await expect(service.setAssetHolding(TENANT_A, 'a1', ENTITY_A, { sharePercent: 40 })).rejects.toMatchObject({
      name: 'ConflictError'
    });
    expect(store.propertyHolding).toHaveLength(0);
  });
});

describe('plafonds par agence', () => {
  it('refuse le 501e actif non archivé (409) mais compte hors archivés', async () => {
    for (let i = 0; i < service.MAX_ACTIVE_ASSETS_PER_TENANT; i += 1) {
      seedAsset({ id: `a-${i}`, name: `A${i}`, assetClass: 'OTHER', status: i === 0 ? 'ARCHIVED' : 'ACTIVE' });
    }
    const input = { name: 'Nouveau', assetClass: 'OTHER' as const, details: { label: 'x' } };
    await expect(service.createAsset(TENANT_A, input)).resolves.toMatchObject({ name: 'Nouveau' });
    await expect(service.createAsset(TENANT_A, input)).rejects.toMatchObject({
      name: 'ConflictError',
      statusCode: 409,
      message: expect.stringContaining(String(service.MAX_ACTIVE_ASSETS_PER_TENANT))
    });
  });

  it('refuse la 1001e valorisation d’un actif (409), pas celles d’un autre actif', async () => {
    seedAsset({ id: 'a1', name: 'A', assetClass: 'CASH' });
    seedAsset({ id: 'a2', name: 'B', assetClass: 'CASH' });
    for (let i = 0; i < service.MAX_VALUATIONS_PER_ASSET; i += 1) {
      seedValuation({ assetId: 'a1', estimatedValue: 1, valuatedAt: iso('2026-01-01') });
    }
    await expect(
      service.createAssetValuation(TENANT_A, 'a1', { valuatedAt: iso('2026-02-01'), estimatedValue: 1 })
    ).rejects.toMatchObject({ name: 'ConflictError', statusCode: 409 });
    await expect(
      service.createAssetValuation(TENANT_A, 'a2', { valuatedAt: iso('2026-02-01'), estimatedValue: 1 })
    ).resolves.toMatchObject({ assetId: 'a2' });
  });

  it('listAssets applique un plafond dur de 500 lignes', async () => {
    prismaMock.asset.findMany.mockClear();
    await service.listAssets(TENANT_A, {});
    expect(prismaMock.asset.findMany.mock.calls[0][0]).toMatchObject({ take: service.LIST_ASSETS_HARD_LIMIT });
    expect(service.LIST_ASSETS_HARD_LIMIT).toBe(500);
  });

  it("valeur nette : n'interroge pas les valorisations d'un actif archivé et ne sélectionne que le nécessaire", async () => {
    seedAsset({ id: 'a-arch', name: 'Vieux', assetClass: 'CASH', status: 'ARCHIVED' });
    seedAsset({ id: 'a-ok', name: 'Cpt', assetClass: 'CASH' });
    seedValuation({ assetId: 'a-arch', estimatedValue: 9, valuatedAt: iso('2026-01-01') });
    seedValuation({ assetId: 'a-ok', estimatedValue: 5, valuatedAt: iso('2026-01-01') });
    prismaMock.assetValuation.findMany.mockClear();
    const result = await service.getNetWorth(TENANT_A, { asOf: '2026-06-01' });
    expect(prismaMock.assetValuation.findMany).toHaveBeenCalledTimes(1);
    const args = prismaMock.assetValuation.findMany.mock.calls[0][0];
    expect(args.where.OR).toEqual([{ assetId: { in: ['a-ok'] } }]);
    expect(args.select).not.toHaveProperty('notes');
    expect(result.totalAssets).toBe(5);
    expect(result.excluded).toEqual([{ assetId: 'a-arch', reason: 'ARCHIVED' }]);
  });
});

describe('changement de devise', () => {
  it('refuse (409) si des valorisations ou dettes sont dans l’ancienne devise', async () => {
    seedAsset({ id: 'a1', name: 'Cpt', assetClass: 'CASH', currency: 'EUR', exchangeRateToXof: 655.957 });
    seedValuation({ assetId: 'a1', estimatedValue: 10, currency: 'EUR', valuatedAt: iso('2026-01-01') });
    await expect(
      service.updateAsset(TENANT_A, 'a1', { currency: 'USD', exchangeRateToXof: 600 })
    ).rejects.toMatchObject({
      name: 'ConflictError',
      statusCode: 409,
      message: 'Changez d’abord ou supprimez les valorisations et dettes libellées dans l’ancienne devise.'
    });
    expect(store.asset[0].currency).toBe('EUR');
  });

  it('refuse aussi quand seule une dette est dans l’ancienne devise', async () => {
    seedAsset({ id: 'a1', name: 'Cpt', assetClass: 'CASH', currency: 'EUR', exchangeRateToXof: 655.957 });
    seedLoan({ assetId: 'a1', currency: 'EUR', remainingCapital: 1 });
    await expect(service.updateAsset(TENANT_A, 'a1', { currency: 'XOF' })).rejects.toMatchObject({
      name: 'ConflictError'
    });
  });

  it('permet de changer de devise sans ligne, ou avec des lignes en XOF, ou de changer seulement le taux', async () => {
    seedAsset({ id: 'a1', name: 'Cpt', assetClass: 'CASH', currency: 'EUR', exchangeRateToXof: 655.957 });
    await expect(
      service.updateAsset(TENANT_A, 'a1', { currency: 'USD', exchangeRateToXof: 600 })
    ).resolves.toMatchObject({
      currency: 'USD'
    });
    seedValuation({ assetId: 'a1', estimatedValue: 10, currency: 'XOF', valuatedAt: iso('2026-01-01') });
    seedValuation({ assetId: 'a1', estimatedValue: 10, currency: 'USD', valuatedAt: iso('2026-02-01') });
    await expect(service.updateAsset(TENANT_A, 'a1', { exchangeRateToXof: 610 })).resolves.toMatchObject({
      exchangeRateToXof: 610
    });
  });
});

describe('updateDebt : cohérence après fusion', () => {
  beforeEach(() => {
    seedAsset({ id: 'a1', name: 'SARL', assetClass: 'BUSINESS_EQUITY' });
    seedLoan({
      id: 'l1',
      assetId: 'a1',
      capitalAmount: 100,
      remainingCapital: 80,
      startDate: iso('2025-01-01'),
      endDate: iso('2030-01-01')
    });
  });

  it('refuse un capital restant supérieur au capital, y compris via une baisse du seul capital (422)', async () => {
    await expect(service.updateDebt(TENANT_A, 'l1', { remainingCapital: 150 })).rejects.toMatchObject({
      name: 'ValidationError',
      statusCode: 422,
      errors: [{ field: 'remainingCapital', message: expect.any(String) }]
    });
    await expect(service.updateDebt(TENANT_A, 'l1', { capitalAmount: 50 })).rejects.toMatchObject({
      name: 'ValidationError',
      errors: [{ field: 'remainingCapital' }]
    });
    expect(store.propertyLoan[0].remainingCapital).toBe(80);
  });

  it('refuse une date de fin antérieure au début après fusion (422)', async () => {
    await expect(service.updateDebt(TENANT_A, 'l1', { endDate: iso('2024-01-01') })).rejects.toMatchObject({
      name: 'ValidationError',
      errors: [{ field: 'endDate' }]
    });
    await expect(service.updateDebt(TENANT_A, 'l1', { startDate: iso('2031-01-01') })).rejects.toMatchObject({
      name: 'ValidationError',
      errors: [{ field: 'endDate' }]
    });
  });

  it('accepte une modification cohérente ; la création applique les mêmes contrôles', async () => {
    await expect(service.updateDebt(TENANT_A, 'l1', { remainingCapital: 60 })).resolves.toMatchObject({
      remainingCapital: 60
    });
    await expect(service.createDebt(TENANT_A, { ...debtBase, remainingCapital: 101 })).rejects.toMatchObject({
      name: 'ValidationError',
      errors: [{ field: 'remainingCapital' }]
    });
  });
});

describe('actif archivé ou cédé : écritures', () => {
  const conflict = { name: 'ConflictError', statusCode: 409 };

  beforeEach(() => {
    seedAsset({ id: 'arch', name: 'Archivé', assetClass: 'BUSINESS_EQUITY', status: 'ARCHIVED' });
    seedValuation({ id: 'v-arch', assetId: 'arch', estimatedValue: 1, valuatedAt: iso('2026-01-01') });
    seedLoan({ id: 'l-arch', assetId: 'arch', remainingCapital: 1, capitalAmount: 1 });
    store.propertyHolding.push({
      id: 'h-arch',
      tenantId: TENANT_A,
      assetId: 'arch',
      entityId: ENTITY_A,
      sharePercent: 10
    });
  });

  it('refuse en 409 toute écriture sur un actif ARCHIVED', async () => {
    await expect(service.updateAsset(TENANT_A, 'arch', { name: 'X' })).rejects.toMatchObject(conflict);
    await expect(
      service.createAssetValuation(TENANT_A, 'arch', { valuatedAt: iso('2026-02-01'), estimatedValue: 1 })
    ).rejects.toMatchObject(conflict);
    await expect(service.updateAssetValuation(TENANT_A, 'arch', 'v-arch', { estimatedValue: 2 })).rejects.toMatchObject(
      conflict
    );
    await expect(service.deleteAssetValuation(TENANT_A, 'arch', 'v-arch')).rejects.toMatchObject(conflict);
    await expect(service.createDebt(TENANT_A, { ...debtBase, assetId: 'arch' })).rejects.toMatchObject(conflict);
    await expect(service.updateDebt(TENANT_A, 'l-arch', { lender: 'Autre' })).rejects.toMatchObject(conflict);
    await expect(service.deleteDebt(TENANT_A, 'l-arch')).rejects.toMatchObject(conflict);
    await expect(service.setAssetHolding(TENANT_A, 'arch', ENTITY_A, { sharePercent: 20 })).rejects.toMatchObject(
      conflict
    );
    await expect(service.deleteAssetHolding(TENANT_A, 'arch', ENTITY_A)).rejects.toMatchObject(conflict);
    expect(store.assetValuation).toHaveLength(1);
    expect(store.propertyLoan).toHaveLength(1);
    expect(store.propertyHolding).toHaveLength(1);
    expect(store.asset[0].name).toBe('Archivé');
  });

  it('un actif DISPOSED reste corrigeable (actif, valorisation, dette existante) mais sans nouvelle dette', async () => {
    seedAsset({ id: 'disp', name: 'Cédé', assetClass: 'BUSINESS_EQUITY', status: 'DISPOSED' });
    seedValuation({ id: 'v-disp', assetId: 'disp', estimatedValue: 1, valuatedAt: iso('2026-01-01') });
    seedLoan({ id: 'l-disp', assetId: 'disp', remainingCapital: 1, capitalAmount: 5 });
    await expect(service.updateAsset(TENANT_A, 'disp', { notes: 'corrigé' })).resolves.toMatchObject({
      notes: 'corrigé'
    });
    await expect(
      service.updateAssetValuation(TENANT_A, 'disp', 'v-disp', { estimatedValue: 3 })
    ).resolves.toMatchObject({ estimatedValue: 3 });
    await expect(service.updateDebt(TENANT_A, 'l-disp', { lender: 'Autre banque' })).resolves.toMatchObject({
      lender: 'Autre banque'
    });
    await expect(service.createDebt(TENANT_A, { ...debtBase, assetId: 'disp' })).rejects.toMatchObject(conflict);
  });
});

describe('journal d’audit', () => {
  const eventsOf = () => mockAudit.mock.calls.map(([entry]) => entry);

  it('émet un événement par écriture, avec identifiant et type seulement, sans montant ni nom', async () => {
    const ACTOR = 'user-1';
    const asset = await service.createAsset(
      TENANT_A,
      {
        name: 'Compte secret',
        assetClass: 'CASH',
        details: cashDetails,
        notes: 'note privée',
        acquisitionCost: 123456,
        initialValuation: { valuatedAt: iso('2026-01-01'), estimatedValue: 987654, method: 'MANUAL' }
      },
      ACTOR
    );
    await service.updateAsset(TENANT_A, asset.id, { name: 'Autre nom', acquisitionCost: 555555 }, ACTOR);
    const valuation = await service.createAssetValuation(
      TENANT_A,
      asset.id,
      { valuatedAt: iso('2026-02-01'), estimatedValue: 777777 },
      ACTOR
    );
    await service.updateAssetValuation(TENANT_A, asset.id, valuation.id, { estimatedValue: 888888 }, ACTOR);
    await service.deleteAssetValuation(TENANT_A, asset.id, valuation.id, ACTOR);
    const debt = await service.createDebt(
      TENANT_A,
      {
        ...debtBase,
        assetId: asset.id,
        lender: 'Banque Confidentielle',
        capitalAmount: 900000,
        remainingCapital: 800000
      },
      ACTOR
    );
    await service.updateDebt(TENANT_A, debt.id, { remainingCapital: 66666 }, ACTOR);
    await service.deleteDebt(TENANT_A, debt.id, ACTOR);
    await service.disposeAsset(TENANT_A, asset.id, iso('2026-03-01'), ACTOR);
    await service.archiveAsset(TENANT_A, asset.id, ACTOR);

    const other = await service.createAsset(
      TENANT_A,
      {
        name: 'SARL',
        assetClass: 'BUSINESS_EQUITY',
        details: { companyName: 'C', legalForm: 'SARL', country: 'CI', ownershipPercent: 10 }
      },
      ACTOR
    );
    await service.setAssetHolding(TENANT_A, other.id, ENTITY_A, { sharePercent: 33.3 }, ACTOR);
    await service.deleteAssetHolding(TENANT_A, other.id, ENTITY_A, ACTOR);

    const events = eventsOf();
    expect(events.map(e => e.actionKey)).toEqual([
      'PATRIMOINE_ASSET_CREATED',
      'PATRIMOINE_ASSET_UPDATED',
      'PATRIMOINE_VALUATION_CREATED',
      'PATRIMOINE_VALUATION_UPDATED',
      'PATRIMOINE_VALUATION_DELETED',
      'PATRIMOINE_DEBT_CREATED',
      'PATRIMOINE_DEBT_UPDATED',
      'PATRIMOINE_DEBT_DELETED',
      'PATRIMOINE_ASSET_DISPOSED',
      'PATRIMOINE_ASSET_ARCHIVED',
      'PATRIMOINE_ASSET_CREATED',
      'PATRIMOINE_HOLDING_SET',
      'PATRIMOINE_HOLDING_DELETED'
    ]);
    expect(events.every(e => e.tenantId === TENANT_A && e.actorUserId === ACTOR && e.entityId)).toBe(true);
    expect(events[0]).toMatchObject({ entityType: 'Asset', entityId: asset.id, payload: { assetClass: 'CASH' } });
    expect(events[1].payload).toEqual({ assetClass: 'CASH', changedFields: ['acquisitionCost', 'name'] });
    const serialized = JSON.stringify(events);
    for (const secret of [
      '987654',
      '123456',
      '555555',
      '777777',
      '888888',
      '900000',
      '800000',
      '66666',
      'Compte secret',
      'Autre nom',
      'note privée',
      'Banque Confidentielle',
      '33.3'
    ]) {
      expect(serialized).not.toContain(secret);
    }
  });

  it("n'émet rien quand l'écriture est refusée", async () => {
    await expect(service.disposeAsset(TENANT_A, 'inconnu', iso('2026-03-01'))).rejects.toBeDefined();
    expect(mockAudit).not.toHaveBeenCalled();
  });
});

describe('fiabilité et suggestion (lot 2)', () => {
  const NOW = new Date('2026-06-30T12:00:00.000Z');
  beforeEach(() => {
    jest.useFakeTimers({ now: NOW });
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('création : la fiabilité est calculée par le serveur et stockée (EXPERT récent = HIGH)', async () => {
    seedAsset({ id: 'a-biz', assetClass: 'BUSINESS_EQUITY' });
    const dto = await service.createAssetValuation(TENANT_A, 'a-biz', {
      valuatedAt: iso('2026-06-01'),
      estimatedValue: 1000,
      method: 'EXPERT_APPRAISAL'
    });
    expect(dto).toMatchObject({
      reliability: 'HIGH',
      reliabilityReasons: ['METHOD_EXPERT'],
      method: 'EXPERT_APPRAISAL'
    });
    expect(store.assetValuation[0]).toMatchObject({ reliability: 'HIGH', reliabilityReasons: ['METHOD_EXPERT'] });
  });

  it('création : manuel sans source = LOW, avec source = MEDIUM', async () => {
    seedAsset({ id: 'a-cash', assetClass: 'CASH' });
    const base = { valuatedAt: iso('2026-06-20'), estimatedValue: 10 };
    expect(await service.createAssetValuation(TENANT_A, 'a-cash', base)).toMatchObject({
      reliability: 'LOW',
      reliabilityReasons: ['METHOD_MANUAL_NO_SOURCE']
    });
    expect(await service.createAssetValuation(TENANT_A, 'a-cash', { ...base, source: 'Relevé' })).toMatchObject({
      reliability: 'MEDIUM',
      reliabilityReasons: ['METHOD_MANUAL_WITH_SOURCE']
    });
  });

  it('la valorisation initiale d’un actif reçoit aussi sa fiabilité', async () => {
    await service.createAsset(TENANT_A, {
      name: 'Compte',
      assetClass: 'CASH',
      details: cashDetails,
      initialValuation: { valuatedAt: iso('2026-06-20'), estimatedValue: 5, method: 'BALANCE' }
    });
    expect(store.assetValuation[0]).toMatchObject({ reliability: 'HIGH', reliabilityReasons: ['METHOD_BALANCE'] });
  });

  it('modification : la fiabilité est recalculée sur la ligne fusionnée (source retirée -> LOW)', async () => {
    seedAsset({ id: 'a-cash', assetClass: 'CASH' });
    seedValuation({
      id: 'v1',
      assetId: 'a-cash',
      estimatedValue: 10,
      valuatedAt: iso('2026-06-20'),
      source: 'Relevé',
      reliability: 'MEDIUM',
      reliabilityReasons: ['METHOD_MANUAL_WITH_SOURCE']
    });
    const dto = await service.updateAssetValuation(TENANT_A, 'a-cash', 'v1', { source: null });
    expect(dto).toMatchObject({ reliability: 'LOW', reliabilityReasons: ['METHOD_MANUAL_NO_SOURCE'] });
    expect(store.assetValuation[0]).toMatchObject({ reliability: 'LOW' });
  });

  it('lecture : l’ancienneté est recalculée à la date du jour (EXPERT de 8 mois sur du cash = MEDIUM, stale)', async () => {
    seedAsset({ id: 'a-cash', assetClass: 'CASH' });
    seedValuation({
      id: 'v1',
      assetId: 'a-cash',
      estimatedValue: 10,
      valuatedAt: iso('2025-10-01'),
      method: 'EXPERT_APPRAISAL',
      reliability: 'HIGH',
      reliabilityReasons: ['METHOD_EXPERT']
    });
    const [line] = await service.listAssetValuations(TENANT_A, 'a-cash');
    expect(line.reliability).toBe('LOW');
    expect(line.reliabilityReasons).toEqual(['METHOD_EXPERT', 'STALE_TWO_LEVELS']);
    const asset = await service.getAsset(TENANT_A, 'a-cash');
    expect(asset.stale).toBe(true);
    expect(asset.currentValue?.reliability).toBe('LOW');
  });

  it('lecture : une valeur récente n’est pas périmée', async () => {
    seedAsset({ id: 'a-cash', assetClass: 'CASH' });
    seedValuation({
      assetId: 'a-cash',
      estimatedValue: 10,
      valuatedAt: iso('2026-06-01'),
      method: 'BALANCE',
      reliability: 'HIGH'
    });
    const asset = await service.getAsset(TENANT_A, 'a-cash');
    expect(asset.stale).toBe(false);
    expect(asset.currentValue?.reliability).toBe('HIGH');
  });

  it('lecture : un actif sans valorisation est périmé, sans fiabilité', async () => {
    seedAsset({ id: 'a-cash', assetClass: 'CASH' });
    expect(await service.getAsset(TENANT_A, 'a-cash')).toMatchObject({ stale: true, currentValue: null });
  });

  it('lecture : une ligne antérieure au lot 2 (fiabilité nulle) reste inconnue', async () => {
    seedAsset({ id: 'a-cash', assetClass: 'CASH' });
    seedValuation({ assetId: 'a-cash', estimatedValue: 10, valuatedAt: iso('2026-06-20'), reliability: null });
    const [line] = await service.listAssetValuations(TENANT_A, 'a-cash');
    expect(line).toMatchObject({ reliability: null, reliabilityReasons: ['METHOD_MANUAL_NO_SOURCE'] });
    expect((await service.getAsset(TENANT_A, 'a-cash')).currentValue?.reliability).toBeNull();
  });

  it('lecture : le statut juridique COURANT de l’actif plafonne la fiabilité, sans recalcul stocké', async () => {
    seedProperty('prop-1', TENANT_A);
    seedAsset({
      id: 'a-re',
      assetClass: 'REAL_ESTATE',
      propertyId: 'prop-1',
      details: { legalStatus: 'TITRE_FONCIER' }
    });
    seedValuation({
      propertyId: 'prop-1',
      estimatedValue: 100,
      valuatedAt: iso('2026-06-01'),
      method: 'EXPERT_APPRAISAL',
      reliability: 'HIGH',
      reliabilityReasons: ['METHOD_EXPERT']
    });
    expect((await service.getAsset(TENANT_A, 'a-re')).currentValue?.reliability).toBe('HIGH');
    await service.updateAsset(TENANT_A, 'a-re', { details: { legalStatus: 'ATTESTATION_COUTUMIERE' } });
    expect(store.assetValuation[0].reliability).toBe('HIGH');
    const [line] = await service.listAssetValuations(TENANT_A, 'a-re');
    expect(line).toMatchObject({ reliability: 'LOW' });
    expect(line.reliabilityReasons).toContain('LEGAL_STATUS_FRAGILE');
  });

  it('audit : création et modification de valorisation ne portent aucun montant ni fiabilité', async () => {
    seedAsset({ id: 'a-cash', assetClass: 'CASH' });
    await service.createAssetValuation(TENANT_A, 'a-cash', { valuatedAt: iso('2026-06-20'), estimatedValue: 777 });
    const payload = JSON.stringify(mockAudit.mock.calls[0][0].payload);
    expect(payload).not.toMatch(/777|reliability/);
  });

  describe('valeur nette', () => {
    it('lowReliabilityShare : une valeur LOW (25) et une HIGH (75) donnent 25', async () => {
      seedAsset({ id: 'a-low', assetClass: 'CASH' });
      seedAsset({ id: 'a-high', assetClass: 'CASH' });
      seedValuation({ assetId: 'a-low', estimatedValue: 250, valuatedAt: iso('2026-06-20'), reliability: 'LOW' });
      seedValuation({
        assetId: 'a-high',
        estimatedValue: 750,
        valuatedAt: iso('2026-06-20'),
        method: 'BALANCE',
        reliability: 'HIGH'
      });
      const result = await service.getNetWorth(TENANT_A, { asOf: '2026-06-30' });
      expect(result.lowReliabilityShare).toBe(25);
      expect(result.assets).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: 'a-low', reliability: 'LOW', stale: false }),
          expect.objectContaining({ id: 'a-high', reliability: 'HIGH', stale: false })
        ])
      );
    });

    it('une valorisation sans fiabilité stockée compte comme peu fiable', async () => {
      seedAsset({ id: 'a-old', assetClass: 'CASH' });
      seedValuation({ assetId: 'a-old', estimatedValue: 100, valuatedAt: iso('2026-06-20'), reliability: null });
      const result = await service.getNetWorth(TENANT_A, { asOf: '2026-06-30' });
      expect(result.lowReliabilityShare).toBe(100);
      expect(result.assets[0].reliability).toBeNull();
    });
  });

  describe('suggestAssetValuation', () => {
    it('véhicule : montant, devise de l’actif, méthode et hypothèses ; aucune écriture ni audit', async () => {
      seedAsset({
        id: 'a-car',
        assetClass: 'VEHICLE_EQUIPMENT',
        acquisitionCost: 10000000,
        acquisitionDate: iso('2024-06-30'),
        details: { usefulLifeYears: 5, residualValuePercent: 0, depreciationMethod: 'LINEAR' }
      });
      const result = await service.suggestAssetValuation(TENANT_A, 'a-car', { asOf: '2026-06-30' });
      expect(result).toMatchObject({ ok: true, currency: 'XOF', method: 'DEPRECIATION_LINEAR' });
      expect(result.ok && result.amount).toBeGreaterThan(5900000);
      expect(result.ok && result.amount).toBeLessThan(6100000);
      expect(result.ok && result.assumptions).toEqual(expect.arrayContaining([{ key: 'usefulLifeYears', value: 5 }]));
      expect(store.assetValuation).toHaveLength(0);
      expect(mockAudit).not.toHaveBeenCalled();
    });

    it('attributs manquants : ok false avec les clés (réponse métier, pas une erreur)', async () => {
      seedAsset({ id: 'a-car', assetClass: 'VEHICLE_EQUIPMENT', details: {} });
      const result = await service.suggestAssetValuation(TENANT_A, 'a-car', {});
      expect(result).toEqual({
        ok: false,
        missing: ['acquisitionCost', 'acquisitionDate', 'usefulLifeYears']
      });
    });

    it('épargne : part de la dernière valorisation ; immobilier lié : lignes du bien, ok false sans hypothèses', async () => {
      seedAsset({
        id: 'a-sav',
        assetClass: 'SAVINGS_INVESTMENT',
        details: { expectedRatePercent: 10 }
      });
      seedValuation({ assetId: 'a-sav', estimatedValue: 1000, valuatedAt: iso('2025-06-30') });
      const sav = await service.suggestAssetValuation(TENANT_A, 'a-sav', { asOf: '2026-06-30' });
      expect(sav).toMatchObject({ ok: true, method: 'ACCRUED_SAVINGS' });
      expect(sav.ok && sav.amount).toBeGreaterThanOrEqual(1099);
      expect(sav.ok && sav.amount).toBeLessThanOrEqual(1101);

      seedProperty('prop-1', TENANT_A);
      seedAsset({ id: 'a-re', assetClass: 'REAL_ESTATE', propertyId: 'prop-1', details: { legalStatus: 'AUTRE' } });
      seedValuation({ propertyId: 'prop-1', estimatedValue: 5, valuatedAt: iso('2026-01-01') });
      const re = await service.suggestAssetValuation(TENANT_A, 'a-re', {});
      expect(re).toEqual({ ok: false, missing: [] });
    });

    it('actif d’une autre agence ou inexistant : 404', async () => {
      seedAsset({ id: 'a-b', assetClass: 'CASH', tenantId: TENANT_B });
      await expect(service.suggestAssetValuation(TENANT_A, 'a-b', {})).rejects.toMatchObject({ statusCode: 404 });
      await expect(service.suggestAssetValuation(TENANT_A, 'nope', {})).rejects.toMatchObject({ statusCode: 404 });
    });

    it('date inexistante : erreur de validation', async () => {
      seedAsset({ id: 'a-car', assetClass: 'VEHICLE_EQUIPMENT' });
      await expect(service.suggestAssetValuation(TENANT_A, 'a-car', { asOf: '2026-02-30' })).rejects.toMatchObject({
        name: 'ValidationError'
      });
    });
  });
});

describe('méthode calculée vérifiée par le serveur (lot 2, relecture)', () => {
  const stockDetails = { quantity: 10, unitCost: 100 };
  const seedStock = () => seedAsset({ id: 'a-stock', name: 'Stock', assetClass: 'INVENTORY', details: stockDetails });
  // Date du jour : la fiabilité perd des niveaux à l'ancienneté, ce que ces tests n'examinent pas.
  const stockLine = { valuatedAt: new Date(), method: 'UNIT_COST' as const };

  it('montant retrouvé par le recalcul : la méthode est conservée, fiabilité moyenne (calculée)', async () => {
    seedStock();
    const dto = await service.createAssetValuation(TENANT_A, 'a-stock', { ...stockLine, estimatedValue: 1000 });
    expect(dto.method).toBe('UNIT_COST');
    expect(store.assetValuation[0]).toMatchObject({ method: 'UNIT_COST', reliability: 'MEDIUM' });
  });

  it('écart d’un franc toléré en XOF, refusé au-delà', async () => {
    seedStock();
    expect(
      (await service.createAssetValuation(TENANT_A, 'a-stock', { ...stockLine, estimatedValue: 1001 })).method
    ).toBe('UNIT_COST');
    expect(
      (await service.createAssetValuation(TENANT_A, 'a-stock', { ...stockLine, estimatedValue: 1002 })).method
    ).toBe('MANUAL');
  });

  it('montant retouché à la main : MANUAL, fiabilité calculée sur MANUAL (faible sans source)', async () => {
    seedStock();
    const dto = await service.createAssetValuation(TENANT_A, 'a-stock', { ...stockLine, estimatedValue: 1500 });
    expect(dto.method).toBe('MANUAL');
    expect(store.assetValuation[0]).toMatchObject({
      method: 'MANUAL',
      reliability: 'LOW',
      reliabilityReasons: ['METHOD_MANUAL_NO_SOURCE']
    });
  });

  it('suggestion ok:false (détails incomplets) : MANUAL', async () => {
    seedAsset({ id: 'a-stock', name: 'Stock', assetClass: 'INVENTORY', details: {} });
    const dto = await service.createAssetValuation(TENANT_A, 'a-stock', { ...stockLine, estimatedValue: 1000 });
    expect(dto.method).toBe('MANUAL');
  });

  it('méthode qui ne correspond pas à celle de la classe : MANUAL même si le montant est juste', async () => {
    seedStock();
    const dto = await service.createAssetValuation(TENANT_A, 'a-stock', {
      valuatedAt: iso('2026-01-01'),
      method: 'DISCOUNTED_CLAIM',
      estimatedValue: 1000
    });
    expect(dto.method).toBe('MANUAL');
  });

  it('devise étrangère : tolérance de 0,01', async () => {
    seedAsset({
      id: 'a-eur',
      name: 'Cheptel',
      assetClass: 'AGRICULTURE',
      currency: 'EUR',
      exchangeRateToXof: 655.957,
      details: { agricultureKind: 'LIVESTOCK', headcount: 1, unitValue: 1234.56 }
    });
    const base = { valuatedAt: iso('2026-01-01'), method: 'UNIT_VALUE' as const };
    expect((await service.createAssetValuation(TENANT_A, 'a-eur', { ...base, estimatedValue: 1234.56 })).method).toBe(
      'UNIT_VALUE'
    );
    expect((await service.createAssetValuation(TENANT_A, 'a-eur', { ...base, estimatedValue: 1234.58 })).method).toBe(
      'MANUAL'
    );
  });

  it('BALANCE, MANUAL, MARKET_ESTIMATE et EXPERT_APPRAISAL ne sont pas recalculées', async () => {
    seedAsset({ id: 'a-cash', name: 'Compte', assetClass: 'CASH' });
    for (const method of ['BALANCE', 'MARKET_ESTIMATE'] as const) {
      const dto = await service.createAssetValuation(TENANT_A, 'a-cash', {
        valuatedAt: iso('2026-01-01'),
        method,
        estimatedValue: 777
      });
      expect(dto.method).toBe(method);
    }
    const expert = await service.createAssetValuation(TENANT_A, 'a-cash', {
      valuatedAt: iso('2026-01-01'),
      method: 'EXPERT_APPRAISAL',
      source: 'Cabinet Diallo',
      estimatedValue: 777
    });
    expect(expert.method).toBe('EXPERT_APPRAISAL');
  });

  it('épargne : le recalcul part de la dernière valorisation antérieure', async () => {
    seedAsset({
      id: 'a-sav',
      name: 'Placement',
      assetClass: 'SAVINGS_INVESTMENT',
      details: { savingsKind: 'PLACEMENT', expectedRatePercent: 10 }
    });
    seedValuation({ assetId: 'a-sav', estimatedValue: 1000, valuatedAt: iso('2025-01-01') });
    const good = await service.createAssetValuation(TENANT_A, 'a-sav', {
      valuatedAt: iso('2026-01-01'),
      method: 'ACCRUED_SAVINGS',
      estimatedValue: 1100
    });
    expect(good.method).toBe('ACCRUED_SAVINGS');
    const bad = await service.createAssetValuation(TENANT_A, 'a-sav', {
      valuatedAt: iso('2026-01-01'),
      method: 'ACCRUED_SAVINGS',
      estimatedValue: 1200
    });
    expect(bad.method).toBe('MANUAL');
  });

  it('modification du montant d’une ligne calculée : stockée MANUAL', async () => {
    seedStock();
    const created = await service.createAssetValuation(TENANT_A, 'a-stock', { ...stockLine, estimatedValue: 1000 });
    const updated = await service.updateAssetValuation(TENANT_A, 'a-stock', created.id, { estimatedValue: 1300 });
    expect(updated.method).toBe('MANUAL');
    expect(store.assetValuation[0]).toMatchObject({ method: 'MANUAL', reliability: 'LOW' });
  });

  it('modification des seules notes : la méthode calculée est conservée', async () => {
    seedStock();
    const created = await service.createAssetValuation(TENANT_A, 'a-stock', { ...stockLine, estimatedValue: 1000 });
    store.asset[0].details = { quantity: 99, unitCost: 100 };
    const updated = await service.updateAssetValuation(TENANT_A, 'a-stock', created.id, { notes: 'inventaire' });
    expect(updated.method).toBe('UNIT_COST');
  });

  it('modification vers une méthode calculée avec le bon montant : conservée', async () => {
    seedStock();
    const created = await service.createAssetValuation(TENANT_A, 'a-stock', {
      valuatedAt: iso('2026-01-01'),
      estimatedValue: 1000
    });
    const updated = await service.updateAssetValuation(TENANT_A, 'a-stock', created.id, { method: 'UNIT_COST' });
    expect(updated.method).toBe('UNIT_COST');
  });

  it('valorisation initiale à la création de l’actif : méthode calculée vérifiée aussi', async () => {
    const dto = await service.createAsset(TENANT_A, {
      name: 'Stock',
      assetClass: 'INVENTORY',
      details: { designation: 'Riz', unit: 'sac', ...stockDetails },
      initialValuation: { valuatedAt: iso('2026-01-01'), estimatedValue: 1234, method: 'UNIT_COST' }
    } as never);
    expect(dto.currentValue).not.toBeNull();
    expect(store.assetValuation[0].method).toBe('MANUAL');
  });
});

describe('expertise et péremption (lot 2, relecture)', () => {
  it('modification : passer en expertise sans source finale est refusé (champ source)', async () => {
    seedAsset({ id: 'a-cash', name: 'Compte', assetClass: 'CASH' });
    seedValuation({ id: 'v-1', assetId: 'a-cash', estimatedValue: 5, valuatedAt: iso('2026-01-01') });
    await expect(
      service.updateAssetValuation(TENANT_A, 'a-cash', 'v-1', { method: 'EXPERT_APPRAISAL' })
    ).rejects.toMatchObject({ name: 'ValidationError', errors: [expect.objectContaining({ field: 'source' })] });
    expect(store.assetValuation[0].method).toBe('MANUAL');
  });

  it('modification : passer en expertise avec la source déjà présente, ou fournie, est accepté', async () => {
    seedAsset({ id: 'a-cash', name: 'Compte', assetClass: 'CASH' });
    seedValuation({
      id: 'v-1',
      assetId: 'a-cash',
      estimatedValue: 5,
      valuatedAt: iso('2026-01-01'),
      source: 'Notaire'
    });
    expect((await service.updateAssetValuation(TENANT_A, 'a-cash', 'v-1', { method: 'EXPERT_APPRAISAL' })).method).toBe(
      'EXPERT_APPRAISAL'
    );
    await expect(service.updateAssetValuation(TENANT_A, 'a-cash', 'v-1', { source: null })).rejects.toMatchObject({
      name: 'ValidationError'
    });
  });

  it('stale n’est vrai que pour un actif ACTIVE', async () => {
    seedAsset({ id: 'a-old', name: 'Vieux', assetClass: 'CASH' });
    seedAsset({ id: 'a-disp', name: 'Cédé', assetClass: 'CASH', status: 'DISPOSED', disposedAt: iso('2020-01-01') });
    seedAsset({ id: 'a-arch', name: 'Archivé', assetClass: 'CASH', status: 'ARCHIVED' });
    expect((await service.getAsset(TENANT_A, 'a-old')).stale).toBe(true);
    expect((await service.getAsset(TENANT_A, 'a-disp')).stale).toBe(false);
    expect((await service.getAsset(TENANT_A, 'a-arch')).stale).toBe(false);
  });
});

describe('suggestion : refus motivés (lot 2, relecture)', () => {
  it('quantité nulle : ok false avec reason ZERO_VALUE', async () => {
    seedAsset({ id: 'a-stock', name: 'Stock', assetClass: 'INVENTORY', details: { quantity: 0, unitCost: 100 } });
    expect(await service.suggestAssetValuation(TENANT_A, 'a-stock', { asOf: '2026-01-01' })).toEqual({
      ok: false,
      missing: [],
      reason: 'ZERO_VALUE'
    });
  });

  it('champ manquant : pas de reason', async () => {
    seedAsset({ id: 'a-stock', name: 'Stock', assetClass: 'INVENTORY', details: {} });
    expect(await service.suggestAssetValuation(TENANT_A, 'a-stock', { asOf: '2026-01-01' })).toEqual({
      ok: false,
      missing: ['quantity', 'unitCost']
    });
  });

  it('devise étrangère : 1 234,56 EUR reste 1 234,56', async () => {
    seedAsset({
      id: 'a-eur',
      name: 'Cheptel',
      assetClass: 'AGRICULTURE',
      currency: 'EUR',
      exchangeRateToXof: 655.957,
      details: { agricultureKind: 'LIVESTOCK', headcount: 1, unitValue: 1234.56 }
    });
    expect(await service.suggestAssetValuation(TENANT_A, 'a-eur', { asOf: '2026-01-01' })).toMatchObject({
      ok: true,
      amount: 1234.56,
      currency: 'EUR'
    });
  });
});

describe('palier gratuit (lot 4B)', () => {
  const limitMock = freeTier.getAssetCapacityLimit as jest.Mock;
  const lockMock = freeTier.lockTenantAssets as jest.Mock;
  const assertMock = freeTier.assertFreeTierCapacityTx as jest.Mock;
  const input = { name: 'Nouveau', assetClass: 'OTHER' as const, details: { label: 'x' } };

  beforeEach(() => {
    limitMock.mockClear();
    lockMock.mockClear();
    assertMock.mockClear();
  });

  it('pack sans capacité ACTIFS (agence) : ni verrou ni garde, comportement du lot 1', async () => {
    await service.createAsset(TENANT_A, input);
    expect(limitMock).toHaveBeenCalledWith(TENANT_A, { fresh: true });
    expect(lockMock).not.toHaveBeenCalled();
    expect(assertMock).not.toHaveBeenCalled();
  });

  it('pack avec ACTIFS : verrou puis contrôle DANS la transaction, avant l’écriture', async () => {
    limitMock.mockResolvedValueOnce(10);
    const order: string[] = [];
    lockMock.mockImplementationOnce(async () => void order.push('lock'));
    assertMock.mockImplementationOnce(async () => void order.push('assert'));
    const created = prismaMock.asset.create;
    created.mockImplementationOnce(async (args: Row) => {
      order.push('create');
      return created.getMockImplementation()?.(args);
    });
    await service.createAsset(TENANT_A, input);
    expect(order).toEqual(['lock', 'assert', 'create']);
    expect(lockMock).toHaveBeenCalledWith(prismaMock, TENANT_A);
    expect(assertMock).toHaveBeenCalledWith(prismaMock, TENANT_A, 10);
  });

  it('plafond atteint : FREE_TIER_LIMIT remonte et aucun actif n’est créé', async () => {
    limitMock.mockResolvedValueOnce(10);
    assertMock.mockRejectedValueOnce(
      new AppError('Limite atteinte.', 409, 'FREE_TIER_LIMIT', undefined, { limit: 10, used: 10 })
    );
    await expect(service.createAsset(TENANT_A, input)).rejects.toMatchObject({
      statusCode: 409,
      code: 'FREE_TIER_LIMIT',
      data: { limit: 10, used: 10 }
    });
    expect(store.asset).toHaveLength(0);
  });
});
