/**
 * Tests du service de projection (lot 3). Prisma est remplacé par un magasin en
 * mémoire : aucune base requise. Chiffres vérifiés à la main (années pleines,
 * croissance composée, arrondi au franc).
 */

type Row = Record<string, any>;

const TENANT_A = 'tenant-a';
const TENANT_B = 'tenant-b';
const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const store = { asset: [] as Row[], assetValuation: [] as Row[], propertyLoan: [] as Row[] };

function matches(row: Row, where: Row): boolean {
  return Object.entries(where).every(([key, expected]) => {
    if (key === 'OR') return (expected as Row[]).some(w => matches(row, w));
    const actual = row[key] === undefined ? null : row[key];
    if (expected && typeof expected === 'object' && !(expected instanceof Date)) {
      if ('in' in expected) return expected.in.includes(actual);
    }
    return actual === expected;
  });
}

const findMany = (name: keyof typeof store) =>
  jest.fn(async ({ where }: Row = {}) => store[name].filter(r => matches(r, where ?? {})).map(r => ({ ...r })));

const prismaMock: Row = {
  asset: { findMany: findMany('asset') },
  assetValuation: { findMany: findMany('assetValuation') },
  propertyLoan: { findMany: findMany('propertyLoan') },
  // Toute écriture fait échouer le test : la projection est en lecture seule.
  patrimonyScenario: {}
};
const writeSpy = jest.fn();
for (const delegateName of ['asset', 'assetValuation', 'propertyLoan']) {
  for (const method of ['create', 'update', 'updateMany', 'delete', 'deleteMany', 'upsert', 'createMany']) {
    prismaMock[delegateName][method] = writeSpy;
  }
}
prismaMock.$transaction = writeSpy;

jest.mock('../../src/utils/database', () => ({ prisma: prismaMock }));
const mockAudit = jest.fn();
jest.mock('../../src/services/audit-service', () => ({ logAuditEvent: (entry: unknown) => mockAudit(entry) }));

// `projectNetWorth` compté au niveau du service (la simulation appelle sa propre copie du domaine).
jest.mock('../../src/lib/patrimoine/projection', () => {
  const actual = jest.requireActual('../../src/lib/patrimoine/projection');
  return { ...actual, projectNetWorth: jest.fn(actual.projectNetWorth) };
});

import * as projectionDomain from '../../src/lib/patrimoine/projection';
import { suggestValuation } from '../../src/lib/patrimoine/assets';
import { computeProjection, runProjection } from '../../src/services/patrimoine-projections/projection-service';
import { ValidationError } from '../../src/middleware/error-middleware';

const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000);
const years = (n: number) => new Date(Date.now() + n * 365.25 * 86_400_000);

function seedAsset(row: Row): Row {
  const asset = {
    tenantId: TENANT_A,
    status: 'ACTIVE',
    currency: 'XOF',
    exchangeRateToXof: null,
    disposedAt: null,
    propertyId: null,
    details: {},
    ...row
  };
  store.asset.push(asset);
  return asset;
}

function seedValuation(row: Row) {
  store.assetValuation.push({
    tenantId: TENANT_A,
    currency: 'XOF',
    method: 'MANUAL',
    source: null,
    assetId: null,
    propertyId: null,
    reliability: 'HIGH',
    valuatedAt: daysAgo(10),
    ...row
  });
}

function seedLoan(row: Row) {
  store.propertyLoan.push({
    id: ID(900 + store.propertyLoan.length),
    tenantId: TENANT_A,
    currency: 'XOF',
    status: 'ACTIVE',
    assetId: null,
    propertyId: null,
    interestRate: 0,
    monthlyPayment: 0,
    endDate: years(10),
    ...row
  });
}

const base = { horizonYears: 2, baseScenario: 'CENTRAL' as const };

beforeEach(() => {
  store.asset = [];
  store.assetValuation = [];
  store.propertyLoan = [];
  writeSpy.mockClear();
  mockAudit.mockClear();
});

describe('projection de base', () => {
  it('projette un actif immobilier au taux central (4 %) sur 2 ans', async () => {
    seedAsset({ id: ID(1), name: 'Villa', assetClass: 'REAL_ESTATE' });
    seedValuation({
      assetId: ID(1),
      estimatedValue: 10_000_000,
      method: 'EXPERT_APPRAISAL',
      source: 'Cabinet d’expertise'
    });
    const result = await runProjection(TENANT_A, base);
    expect(result.base.points.map(p => p.assets)).toEqual([10_000_000, 10_400_000, 10_816_000]);
    expect(result.base.points[2].netWorth).toBe(10_816_000);
    expect(result.assumptionsUsed.growthPercentByClass.REAL_ESTATE).toBe(4);
    expect(result.simulated).toBeUndefined();
    expect(result.delta).toBeUndefined();
    expect(result.byScenario).toBeUndefined();
    expect(result.base.warnings).toEqual([]);
  });

  it('utilise les valorisations du bien pour un actif immobilier lié à un bien', async () => {
    seedAsset({ id: ID(1), name: 'Villa', assetClass: 'REAL_ESTATE', propertyId: 'prop-1' });
    seedValuation({ propertyId: 'prop-1', estimatedValue: 5_000_000 });
    const result = await runProjection(TENANT_A, base);
    expect(result.base.points[0].assets).toBe(5_000_000);
  });

  it('convertit un actif en devise étrangère au taux de l’actif', async () => {
    seedAsset({ id: ID(1), name: 'Compte EUR', assetClass: 'CASH', currency: 'EUR', exchangeRateToXof: 655.957 });
    seedValuation({ assetId: ID(1), estimatedValue: 1000, currency: 'EUR' });
    const result = await runProjection(TENANT_A, base);
    expect(result.base.points[0].assets).toBe(655_957);
  });

  it('signale un actif sans valeur ou sans taux, sans le compter', async () => {
    seedAsset({ id: ID(1), name: 'Sans valeur', assetClass: 'MOVABLE' });
    seedAsset({ id: ID(2), name: 'Sans taux', assetClass: 'CASH', currency: 'EUR' });
    seedValuation({ assetId: ID(2), estimatedValue: 100, currency: 'EUR' });
    const result = await runProjection(TENANT_A, base);
    expect(result.base.points[0].assets).toBe(0);
    expect(result.base.warnings).toEqual(
      expect.arrayContaining([
        { code: 'ASSET_WITHOUT_VALUE', assetId: ID(1) },
        { code: 'ASSET_WITHOUT_VALUE', assetId: ID(2) }
      ])
    );
  });

  it('ne compte pas un actif archivé ou cédé', async () => {
    seedAsset({ id: ID(1), name: 'Archivé', assetClass: 'CASH', status: 'ARCHIVED' });
    seedAsset({ id: ID(2), name: 'Cédé', assetClass: 'CASH', status: 'DISPOSED', disposedAt: daysAgo(5) });
    seedValuation({ assetId: ID(1), estimatedValue: 100 });
    seedValuation({ assetId: ID(2), estimatedValue: 100 });
    const result = await runProjection(TENANT_A, base);
    expect(result.base.points[0].assets).toBe(0);
    expect(result.base.warnings).toEqual([]);
  });

  it('projette une dette adossée à un actif (échéancier mensuel)', async () => {
    seedAsset({ id: ID(1), name: 'Villa', assetClass: 'REAL_ESTATE' });
    seedValuation({ assetId: ID(1), estimatedValue: 10_000_000 });
    seedLoan({ assetId: ID(1), remainingCapital: 1_200_000, interestRate: 0, monthlyPayment: 100_000 });
    const result = await runProjection(TENANT_A, base);
    expect(result.base.points.map(p => p.debts)).toEqual([1_200_000, 0, 0]);
    expect(result.base.points[0].netWorth).toBe(8_800_000);
  });

  it('compte la dette d’un bien lié à un actif, une dette personnelle, mais pas le prêt d’un bien sans actif', async () => {
    seedAsset({ id: ID(1), name: 'Villa', assetClass: 'REAL_ESTATE', propertyId: 'prop-1' });
    seedValuation({ propertyId: 'prop-1', estimatedValue: 1_000_000 });
    seedLoan({ propertyId: 'prop-1', remainingCapital: 100_000, monthlyPayment: 10_000 });
    seedLoan({ remainingCapital: 50_000, monthlyPayment: 5_000 });
    seedLoan({ propertyId: 'prop-orphelin', remainingCapital: 999_999, monthlyPayment: 1 });
    const result = await runProjection(TENANT_A, base);
    expect(result.base.points[0].debts).toBe(150_000);
  });

  it('convertit une dette en devise au taux de l’actif, exclut celle sans taux et la personnelle en devise', async () => {
    seedAsset({ id: ID(1), name: 'Bien EUR', assetClass: 'REAL_ESTATE', currency: 'EUR', exchangeRateToXof: 600 });
    seedAsset({ id: ID(2), name: 'Bien USD', assetClass: 'REAL_ESTATE', currency: 'USD' });
    seedLoan({ assetId: ID(1), currency: 'EUR', remainingCapital: 100, monthlyPayment: 10 });
    seedLoan({ assetId: ID(2), currency: 'USD', remainingCapital: 100, monthlyPayment: 10 });
    seedLoan({ currency: 'EUR', remainingCapital: 100, monthlyPayment: 10 });
    const result = await runProjection(TENANT_A, base);
    expect(result.base.points[0].debts).toBe(60_000);
  });

  it('avertit quand la mensualité ne couvre pas les intérêts', async () => {
    const loanId = ID(950);
    seedLoan({ id: loanId, remainingCapital: 1_000_000, interestRate: 12, monthlyPayment: 1_000 });
    const result = await runProjection(TENANT_A, base);
    expect(result.base.warnings).toContainEqual({ code: 'LOAN_PAYMENT_TOO_LOW', loanId });
  });

  it('avertit d’une valeur de départ peu fiable', async () => {
    seedAsset({ id: ID(1), name: 'Villa', assetClass: 'REAL_ESTATE' });
    seedValuation({ assetId: ID(1), estimatedValue: 1_000_000, reliability: 'LOW' });
    const result = await runProjection(TENANT_A, base);
    expect(result.base.warnings).toContainEqual({ code: 'LOW_RELIABILITY_START', sharePercent: 100 });
  });

  it('ne charge que les données de l’agence', async () => {
    seedAsset({ id: ID(1), name: 'Mien', assetClass: 'CASH' });
    seedValuation({ assetId: ID(1), estimatedValue: 100 });
    seedAsset({ id: ID(2), tenantId: TENANT_B, name: 'Autre', assetClass: 'CASH' });
    seedValuation({ assetId: ID(2), tenantId: TENANT_B, estimatedValue: 9_999 });
    seedLoan({ tenantId: TENANT_B, remainingCapital: 5_000, monthlyPayment: 1_000 });
    const result = await runProjection(TENANT_A, base);
    expect(result.base.points[0]).toMatchObject({ assets: 100, debts: 0 });
    for (const delegate of ['asset', 'assetValuation', 'propertyLoan']) {
      for (const [{ where }] of prismaMock[delegate].findMany.mock.calls) expect(where.tenantId).toBe(TENANT_A);
    }
  });

  it('fait un nombre constant de requêtes (pas de N+1)', async () => {
    for (let i = 1; i <= 20; i += 1) {
      seedAsset({ id: ID(i), name: `A${i}`, assetClass: 'CASH' });
      seedValuation({ assetId: ID(i), estimatedValue: 10 });
    }
    prismaMock.asset.findMany.mockClear();
    prismaMock.assetValuation.findMany.mockClear();
    prismaMock.propertyLoan.findMany.mockClear();
    await runProjection(TENANT_A, base);
    expect(prismaMock.asset.findMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.assetValuation.findMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.propertyLoan.findMany).toHaveBeenCalledTimes(1);
  });
});

describe('simulation', () => {
  beforeEach(() => {
    seedAsset({ id: ID(1), name: 'Villa', assetClass: 'REAL_ESTATE' });
    seedValuation({ assetId: ID(1), estimatedValue: 10_000_000 });
  });

  it('vend un actif à sa valeur projetée : delta nul l’année de la vente, aucune écriture', async () => {
    const result = await runProjection(TENANT_A, {
      ...base,
      operations: [{ type: 'SELL_ASSET', year: 1, assetId: ID(1) }]
    });
    expect(result.simulated?.points[1]).toMatchObject({ assets: 10_400_000, netWorth: 10_400_000 });
    expect(result.simulated?.points[1].byClass).toEqual([{ assetClass: 'CASH', value: 10_400_000 }]);
    // Le produit de la vente dort en trésorerie (0 %) : il ne suit plus la croissance de l'immobilier (4 %).
    expect(result.delta).toEqual([
      { year: 0, netWorth: 0 },
      { year: 1, netWorth: 0 },
      { year: 2, netWorth: -416_000 }
    ]);
    expect(writeSpy).not.toHaveBeenCalled();
    expect(mockAudit).not.toHaveBeenCalled();
  });

  it('épargne mensuelle : 100 000 par mois pendant 2 ans', async () => {
    const result = await runProjection(TENANT_A, {
      ...base,
      operations: [{ type: 'MONTHLY_SAVING', fromYear: 1, amount: 100_000 }]
    });
    expect(result.delta?.map(d => d.netWorth)).toEqual([0, 1_200_000, 2_400_000]);
  });

  it('un emprunt crédite la trésorerie et alourdit la dette', async () => {
    const result = await runProjection(TENANT_A, {
      ...base,
      operations: [{ type: 'TAKE_LOAN', year: 1, amount: 1_000_000, annualRatePercent: 0, termYears: 1 }]
    });
    expect(result.simulated?.points[1]).toMatchObject({ debts: 1_000_000, assets: 11_400_000 });
    expect(result.delta?.[1].netWorth).toBe(0);
  });

  it('rembourse par anticipation une dette existante', async () => {
    seedLoan({ id: ID(950), assetId: ID(1), remainingCapital: 2_400_000, monthlyPayment: 100_000 });
    seedValuation({ assetId: ID(1), estimatedValue: 10_000_000 });
    const result = await runProjection(TENANT_A, {
      ...base,
      horizonYears: 1,
      operations: [{ type: 'PREPAY_LOAN', year: 1, loanId: ID(950), amount: 500_000 }]
    });
    expect(result.base.points[1].debts).toBe(1_200_000);
    expect(result.simulated?.points[1].debts).toBe(700_000);
    expect(result.simulated?.warnings).toContainEqual({ code: 'NEGATIVE_CASH', year: 1 });
  });

  it('refuse une opération avec le champ fautif : operations.<index>.<champ>', async () => {
    const failure = await runProjection(TENANT_A, {
      ...base,
      operations: [
        { type: 'MONTHLY_SAVING', fromYear: 1, amount: 10 },
        { type: 'PREPAY_LOAN', year: 1, loanId: ID(777), amount: 10 }
      ]
    }).catch(error => error);
    expect(failure).toBeInstanceOf(ValidationError);
    expect(failure.statusCode).toBe(422);
    expect(failure.errors).toEqual([{ field: 'operations.1.loanId', message: 'Dette introuvable' }]);
  });

  it('refuse la vente d’un actif déjà vendu par une autre opération', async () => {
    const failure = await runProjection(TENANT_A, {
      ...base,
      operations: [
        { type: 'SELL_ASSET', year: 1, assetId: ID(1) },
        { type: 'SELL_ASSET', year: 2, assetId: ID(1) }
      ]
    }).catch(error => error);
    expect(failure.errors[0].field).toBe('operations.1.assetId');
  });

  it('refuse la vente d’un actif cédé ou archivé (422, ASSET_NOT_ACTIVE)', async () => {
    seedAsset({ id: ID(2), name: 'Cédé', assetClass: 'CASH', status: 'DISPOSED', disposedAt: daysAgo(5) });
    const failure = await runProjection(TENANT_A, {
      ...base,
      operations: [{ type: 'SELL_ASSET', year: 1, assetId: ID(2) }]
    }).catch(error => error);
    expect(failure.statusCode).toBe(422);
    expect(failure.errors[0]).toMatchObject({ field: 'operations.0.assetId' });
    expect(failure.errors[0].message).toMatch(/n'est plus actif/);
  });

  it('refuse un remboursement supérieur au restant dû projeté', async () => {
    seedLoan({ id: ID(950), assetId: ID(1), remainingCapital: 100_000, monthlyPayment: 10_000 });
    const failure = await runProjection(TENANT_A, {
      ...base,
      operations: [{ type: 'PREPAY_LOAN', year: 1, loanId: ID(950), amount: 5_000_000 }]
    }).catch(error => error);
    expect(failure.errors[0].field).toBe('operations.0.amount');
  });

  it('un actif ou une dette d’une autre agence donne la même réponse qu’un identifiant inexistant', async () => {
    seedAsset({ id: ID(2), tenantId: TENANT_B, name: 'Autre', assetClass: 'CASH' });
    seedValuation({ assetId: ID(2), tenantId: TENANT_B, estimatedValue: 100 });
    seedLoan({ id: ID(951), tenantId: TENANT_B, remainingCapital: 100, monthlyPayment: 10 });
    const attempt = (operations: any[]) =>
      runProjection(TENANT_A, { ...base, operations }).then(
        () => null,
        error => ({ status: error.statusCode, message: error.message, errors: error.errors })
      );
    const foreignAsset = await attempt([{ type: 'SELL_ASSET', year: 1, assetId: ID(2) }]);
    const missingAsset = await attempt([{ type: 'SELL_ASSET', year: 1, assetId: ID(3) }]);
    expect(foreignAsset).not.toBeNull();
    expect(foreignAsset).toEqual(missingAsset);
    const foreignLoan = await attempt([{ type: 'PREPAY_LOAN', year: 1, loanId: ID(951), amount: 1 }]);
    const missingLoan = await attempt([{ type: 'PREPAY_LOAN', year: 1, loanId: ID(952), amount: 1 }]);
    expect(foreignLoan).not.toBeNull();
    expect(foreignLoan).toEqual(missingLoan);
  });

  it('mode indulgent : une référence disparue devient OPERATION_NOT_APPLICABLE', async () => {
    const result = await computeProjection(
      TENANT_A,
      { ...base, operations: [{ type: 'SELL_ASSET', year: 1, assetId: ID(404) }] },
      { lenientReferences: true }
    );
    expect(result.simulated?.warnings).toContainEqual({
      code: 'OPERATION_NOT_APPLICABLE',
      index: 0,
      reason: 'ASSET_NOT_FOUND'
    });
  });
});

describe('comparaison des scénarios', () => {
  it('calcule les trois scénarios avec les mêmes surcharges, sans opérations', async () => {
    seedAsset({ id: ID(1), name: 'Villa', assetClass: 'REAL_ESTATE' });
    seedValuation({ assetId: ID(1), estimatedValue: 10_000_000 });
    const result = await runProjection(TENANT_A, {
      ...base,
      horizonYears: 1,
      compareScenarios: true,
      assumptions: { inflationPercent: 0 },
      operations: [{ type: 'MONTHLY_SAVING', fromYear: 1, amount: 1 }]
    });
    expect(Object.keys(result.byScenario ?? {}).sort()).toEqual(['CENTRAL', 'OPTIMISTIC', 'PRUDENT']);
    expect(result.byScenario?.PRUDENT.points[1].assets).toBe(10_200_000);
    expect(result.byScenario?.CENTRAL.points[1].assets).toBe(10_400_000);
    expect(result.byScenario?.OPTIMISTIC.points[1].assets).toBe(10_600_000);
    expect(result.byScenario?.PRUDENT.points[1].realNetWorth).toBe(10_200_000);
    expect(result.assumptionsUsed.inflationPercent).toBe(0);
  });
});

describe('amortissement des véhicules (annuité et résiduelle dérivées du coût d’acquisition)', () => {
  const VEHICLE = ID(7);
  const at = (results: { points: { assets: number }[] }) => results.points.map(p => p.assets);

  function seedVehicle(details: Row, valuation: number, extra: Row = {}) {
    seedAsset({
      id: VEHICLE,
      name: 'Camion',
      assetClass: 'VEHICLE_EQUIPMENT',
      acquisitionCost: 5_000_000,
      details,
      ...extra
    });
    seedValuation({ assetId: VEHICLE, estimatedValue: valuation, currency: extra.currency ?? 'XOF' });
  }

  it('linéaire : annuité constante depuis le coût, plancher = 10 % du coût (et non de la valeur courante)', async () => {
    seedVehicle({ usefulLifeYears: 5, residualValuePercent: 10 }, 4_000_000);
    const result = await runProjection(TENANT_A, { ...base, horizonYears: 6 });
    // annuité = (5 000 000 − 500 000) / 5 = 900 000 ; plancher 500 000.
    expect(at(result.base)).toEqual([4_000_000, 3_100_000, 2_200_000, 1_300_000, 500_000, 500_000, 500_000]);
  });

  it('sans coût d’acquisition : repli inchangé (durée de vie depuis la valeur courante)', async () => {
    seedVehicle({ usefulLifeYears: 5, residualValuePercent: 10 }, 4_000_000, { acquisitionCost: null });
    const result = await runProjection(TENANT_A, { ...base, horizonYears: 2 });
    // annuité = (4 000 000 − 400 000) / 5 = 720 000.
    expect(at(result.base)).toEqual([4_000_000, 3_280_000, 2_560_000]);
  });

  it('sans durée d’utilité : valeur constante, même avec un coût', async () => {
    seedVehicle({}, 4_000_000);
    const result = await runProjection(TENANT_A, { ...base, horizonYears: 2 });
    expect(at(result.base)).toEqual([4_000_000, 4_000_000, 4_000_000]);
  });

  it('n’écrase pas une clé déjà présente dans les details', async () => {
    seedVehicle(
      { usefulLifeYears: 5, residualValuePercent: 10, residualValueXof: 1_000_000, annuityXof: 1_500_000 },
      4_000_000
    );
    const result = await runProjection(TENANT_A, { ...base, horizonYears: 3 });
    expect(at(result.base)).toEqual([4_000_000, 2_500_000, 1_000_000, 1_000_000]);
  });

  it('dégressif : seule la résiduelle est dérivée (plancher = 10 % du coût)', async () => {
    seedVehicle({ depreciationMethod: 'DECLINING', decliningRatePercent: 20, residualValuePercent: 10 }, 4_000_000);
    const result = await runProjection(TENANT_A, { ...base, horizonYears: 10 });
    expect(at(result.base)[1]).toBe(3_200_000);
    expect(at(result.base)[2]).toBe(2_560_000);
    expect(at(result.base)[10]).toBe(500_000);
  });

  it('coût en devise étrangère : converti en XOF au taux de l’actif', async () => {
    seedVehicle({ usefulLifeYears: 4 }, 800, {
      acquisitionCost: 1000,
      currency: 'EUR',
      exchangeRateToXof: 600
    });
    const result = await runProjection(TENANT_A, { ...base, horizonYears: 4 });
    // valeur 480 000 XOF ; annuité = 600 000 / 4 = 150 000 ; plancher 0.
    expect(at(result.base)).toEqual([480_000, 330_000, 180_000, 30_000, 0]);
  });

  it('acheté il y a 2 ans : même trajectoire que la suggestion de valorisation du lot 2', async () => {
    const DAY = 86_400_000;
    const now = Date.now();
    const acquisitionDate = new Date(now - 2 * 365.25 * DAY);
    const details = { usefulLifeYears: 5, residualValuePercent: 10 };
    const suggestionAt = (elapsedYears: number) => {
      const result = suggestValuation(
        { assetClass: 'VEHICLE_EQUIPMENT', details, acquisitionCost: 5_000_000, acquisitionDate, lastValuation: null },
        new Date(acquisitionDate.getTime() + elapsedYears * 365.25 * DAY)
      );
      if (!result.ok) throw new Error('suggestion refusée');
      return result.amount;
    };
    seedVehicle(details, suggestionAt(2), { acquisitionDate });
    const result = await runProjection(TENANT_A, { ...base, horizonYears: 5 });
    expect(at(result.base)).toEqual([0, 1, 2, 3, 4, 5].map(t => suggestionAt(2 + t)));
    expect(at(result.base)[0]).toBe(3_200_000);
  });
});

describe('chargement borné', () => {
  const ARCHIVED = ID(60);

  const assetWhere = () => prismaMock.asset.findMany.mock.calls.slice(-1)[0][0].where;

  it('ne lit que les actifs ACTIVE et ceux cités par une opération (UUID valides)', async () => {
    await runProjection(TENANT_A, {
      ...base,
      operations: [
        { type: 'SELL_ASSET', year: 1, assetId: ARCHIVED },
        { type: 'SELL_ASSET', year: 2, assetId: 'pas-un-uuid' }
      ]
    }).catch(() => undefined);
    expect(assetWhere()).toEqual({ tenantId: TENANT_A, OR: [{ status: 'ACTIVE' }, { id: { in: [ARCHIVED] } }] });
  });

  it('sans opération : seuls les actifs ACTIVE sont demandés', async () => {
    await runProjection(TENANT_A, base);
    expect(assetWhere()).toEqual({ tenantId: TENANT_A, OR: [{ status: 'ACTIVE' }] });
  });

  it('un actif archivé non cité n’est pas chargé, un actif archivé cité reste distinguable', async () => {
    seedAsset({ id: ARCHIVED, name: 'Vieux', assetClass: 'MOVABLE', status: 'ARCHIVED' });
    seedAsset({ id: ID(61), name: 'Autre archivé', assetClass: 'MOVABLE', status: 'ARCHIVED' });
    await runProjection(TENANT_A, base);
    const cited = await runProjection(TENANT_A, {
      ...base,
      operations: [{ type: 'SELL_ASSET', year: 1, assetId: ARCHIVED }]
    }).catch(error => error);
    expect(cited.errors[0].message).toMatch(/n'est plus actif/);
  });

  it('les dettes sont chargées avec un plafond et un tri stable', async () => {
    await runProjection(TENANT_A, base);
    const args = prismaMock.propertyLoan.findMany.mock.calls.slice(-1)[0][0];
    expect(args.take).toBe(2000);
    expect(args.orderBy).toEqual([{ createdAt: 'asc' }, { id: 'asc' }]);
    expect(args.where).toEqual({ tenantId: TENANT_A, status: 'ACTIVE' });
  });

  it('une dette adossée à un actif archivé reste comptée, comme dans la valeur nette', async () => {
    seedAsset({ id: ARCHIVED, name: 'Vieux', assetClass: 'MOVABLE', status: 'ARCHIVED' });
    seedLoan({ assetId: ARCHIVED, remainingCapital: 300_000, monthlyPayment: 10_000 });
    const result = await runProjection(TENANT_A, base);
    expect(result.base.points[0].debts).toBe(300_000);
    expect(result.base.points[0].assets).toBe(0);
  });
});

describe('pas de calcul redondant de la base', () => {
  const projectNetWorth = projectionDomain.projectNetWorth as unknown as jest.Mock;

  beforeEach(() => {
    seedAsset({ id: ID(1), name: 'Villa', assetClass: 'REAL_ESTATE' });
    seedValuation({ assetId: ID(1), estimatedValue: 10_000_000 });
    projectNetWorth.mockClear();
  });

  it('sans opération : la base est calculée une fois', async () => {
    await runProjection(TENANT_A, base);
    expect(projectNetWorth).toHaveBeenCalledTimes(1);
  });

  it('avec opérations : la base vient de la simulation, le service ne la recalcule pas', async () => {
    const result = await runProjection(TENANT_A, {
      ...base,
      operations: [{ type: 'MONTHLY_SAVING', fromYear: 1, amount: 1 }]
    });
    expect(projectNetWorth).not.toHaveBeenCalled();
    expect(result.base.points).toHaveLength(3);
    expect(result.delta).toHaveLength(3);
  });

  it('avec opérations et comparaison : seulement les trois scénarios', async () => {
    await runProjection(TENANT_A, {
      ...base,
      compareScenarios: true,
      operations: [{ type: 'MONTHLY_SAVING', fromYear: 1, amount: 1 }]
    });
    expect(projectNetWorth).toHaveBeenCalledTimes(3);
  });
});

describe('vente : messages distincts (service)', () => {
  const failure = (assetId: string) =>
    runProjection(TENANT_A, { ...base, operations: [{ type: 'SELL_ASSET', year: 1, assetId }] }).catch(error => error);

  it('compte de trésorerie, actif sans valeur, actif archivé : trois messages', async () => {
    seedAsset({ id: ID(1), name: 'Banque', assetClass: 'CASH' });
    seedValuation({ assetId: ID(1), estimatedValue: 1_000 });
    seedAsset({ id: ID(2), name: 'Terrain', assetClass: 'REAL_ESTATE' });
    seedAsset({ id: ID(3), name: 'Vieux', assetClass: 'MOVABLE', status: 'ARCHIVED' });
    const cash = await failure(ID(1));
    const empty = await failure(ID(2));
    const archived = await failure(ID(3));
    expect(cash.errors).toEqual([
      {
        field: 'operations.0.assetId',
        message: 'Un compte de trésorerie ne se vend pas : utilisez un retrait ou une épargne mensuelle.'
      }
    ]);
    expect(empty.errors[0].message).toBe("Cet actif n'a pas de valeur : ajoutez-en une avant de le vendre.");
    expect(archived.errors[0].message).toMatch(/n'est plus actif/);
  });
});

describe('avertissement de dette échue (service)', () => {
  it('dette échue avec un restant dû : avertissement et valeur constante', async () => {
    const loanId = ID(950);
    seedLoan({
      id: loanId,
      remainingCapital: 5_000_000,
      monthlyPayment: 100_000,
      endDate: new Date('2025-06-01T00:00:00Z')
    });
    const result = await runProjection(TENANT_A, base);
    expect(result.base.warnings).toContainEqual({ code: 'LOAN_MATURED_WITH_BALANCE', loanId });
    expect(result.base.points.map(p => p.debts)).toEqual([5_000_000, 5_000_000, 5_000_000]);
  });
});
