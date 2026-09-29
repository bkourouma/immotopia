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

jest.mock('../../src/utils/database', () => ({ prisma: prismaMock }));
const mockAudit = jest.fn();
jest.mock('../../src/services/audit-service', () => ({ logAuditEvent: (entry: unknown) => mockAudit(entry) }));

import * as service from '../../src/services/patrimoine-assets-service';

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
