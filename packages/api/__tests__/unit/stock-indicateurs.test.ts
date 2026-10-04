/**
 * Indicateurs du stock (lot 040, spec B8 ; contrat `IndicatorsView`).
 *
 * L'assemblage est pur et se teste sans base ; les requêtes d'agrégation
 * (`$queryRaw`) sont vérifiées sur leur forme : chacune porte l'agence en
 * paramètre lié (`tenant_id = $n`, B8-R3), jamais concaténée, et aucune ne
 * groupe par personne (B8-R1). Leur exécution réelle et l'étanchéité entre
 * agences relèvent du bloc « Stock » de `isolation.test.ts`.
 */

const queryRaw = jest.fn();
const findManyLocations = jest.fn();
const findFirstLocation = jest.fn();

jest.mock('../../src/utils/database', () => ({
  prisma: {
    $queryRaw: (...args: any[]) => queryRaw(...args),
    stockLocation: {
      findMany: (...args: any[]) => findManyLocations(...args),
      findFirst: (...args: any[]) => findFirstLocation(...args)
    }
  }
}));

import {
  assembleIndicators,
  buildIndicatorQueries,
  getStockIndicators,
  monthsBetween
} from '../../src/lib/finance/stock-indicateurs';
import type { CountAggregate, MovementAggregate, LineAggregate } from '../../src/lib/finance/stock-indicateurs';

const TENANT = 'tenant-1';
const LOC = '11111111-1111-4111-8111-111111111111';
const LOC2 = '22222222-2222-4222-8222-222222222222';

function count(overrides: Partial<CountAggregate> = {}): CountAggregate {
  return {
    locationId: LOC,
    month: '2026-09',
    countsValidated: 1,
    countsWithoutFrozenValues: 0,
    countedValue: 1_000_000,
    varianceValueGross: 30_000,
    setAsideVarianceValue: 0,
    countsValidatedByOther: 1,
    ...overrides
  };
}

function movement(overrides: Partial<MovementAggregate> = {}): MovementAggregate {
  return {
    locationId: LOC,
    month: '2026-09',
    issuesCount: 0,
    issuesWithTaker: 0,
    issueValue: 0,
    scrapValue: 0,
    supplierReturnValue: 0,
    movementsCount: 0,
    entryLagSum: 0,
    sameDayCount: 0,
    ...overrides
  };
}

const NO_LINES: LineAggregate[] = [];

describe('monthsBetween', () => {
  it('liste les mois inclus', () => {
    expect(monthsBetween('2026-11', '2027-02')).toEqual(['2026-11', '2026-12', '2027-01', '2027-02']);
  });
  it('24 mois au plus ; période inversée refusée', () => {
    expect(monthsBetween('2025-01', '2026-12')).toHaveLength(24);
    expect(() => monthsBetween('2025-01', '2027-01')).toThrow(/24 mois/);
    expect(() => monthsBetween('2026-10', '2026-09')).toThrow(/précéder/);
    expect(() => monthsBetween('2026-13', '2026-09')).toThrow(/AAAA-MM/);
  });
});

describe('assembleIndicators (B8)', () => {
  const locations = [{ id: LOC, label: 'Magasin central' }];

  it('B8-1 : inventaire validé de 1 000 000, écart brut 30 000 → taux 0,03', () => {
    const view = assembleIndicators('2026-09', '2026-09', ['2026-09'], locations, {
      counts: [count()],
      lines: NO_LINES,
      movements: []
    });
    expect(view.rows).toHaveLength(1);
    expect(view.rows[0]).toMatchObject({ locationId: LOC, locationLabel: 'Magasin central', varianceRate: 0.03 });
    expect(view.totals[0]).toMatchObject({ locationId: null, varianceRate: 0.03 });
  });

  it('B8-2 : 10 sorties dont 7 avec preneur → 0,7', () => {
    const view = assembleIndicators('2026-09', '2026-09', ['2026-09'], locations, {
      counts: [],
      lines: NO_LINES,
      movements: [movement({ issuesCount: 10, issuesWithTaker: 7 })]
    });
    expect(view.rows[0].takerShare).toBe(0.7);
    expect(view.rows[0].varianceRate).toBeNull();
  });

  it('B8-3 : écart ajusté 30 000 et ligne écartée 20 000 → taux 0,05, setAsideVarianceValue 20 000', () => {
    const view = assembleIndicators('2026-09', '2026-09', ['2026-09'], locations, {
      counts: [count({ setAsideVarianceValue: 20_000 })],
      lines: NO_LINES,
      movements: []
    });
    expect(view.rows[0].varianceRate).toBe(0.05);
    expect(view.rows[0].setAsideVarianceValue).toBe(20_000);
  });

  it('B8-R2 : un inventaire sans valeurs figées est compté à part et n’entre pas dans le taux', () => {
    const view = assembleIndicators('2026-09', '2026-09', ['2026-09'], locations, {
      counts: [count({ countsValidated: 2, countsWithoutFrozenValues: 1 })],
      lines: NO_LINES,
      movements: []
    });
    expect(view.rows[0]).toMatchObject({ countsValidated: 2, countsWithoutFrozenValues: 1, varianceRate: 0.03 });
    const onlyOld = assembleIndicators('2026-09', '2026-09', ['2026-09'], locations, {
      counts: [count({ countsWithoutFrozenValues: 1, countedValue: 0, varianceValueGross: 0 })],
      lines: NO_LINES,
      movements: []
    });
    expect(onlyOld.rows[0].varianceRate).toBeNull();
  });

  it('B8-R2 : la part validée par une autre personne exclut les inventaires sans valeurs figées', () => {
    // 3 inventaires validés, dont 1 d'avant le lot (sans valeurs figées) ; des 2 autres, 1 validé par un tiers.
    const view = assembleIndicators('2026-09', '2026-09', ['2026-09'], locations, {
      counts: [count({ countsValidated: 3, countsWithoutFrozenValues: 1, countsValidatedByOther: 1 })],
      lines: NO_LINES,
      movements: []
    });
    expect(view.rows[0].otherValidatorShare).toBe(0.5);
    expect(view.totals[0].otherValidatorShare).toBe(0.5);

    // Seulement des inventaires d'avant le lot : aucune part, comme le taux d'écart.
    const onlyOld = assembleIndicators('2026-09', '2026-09', ['2026-09'], locations, {
      counts: [
        count({ countsWithoutFrozenValues: 1, countsValidatedByOther: 0, countedValue: 0, varianceValueGross: 0 })
      ],
      lines: NO_LINES,
      movements: []
    });
    expect(onlyOld.rows[0]).toMatchObject({ otherValidatorShare: null, varianceRate: null });
  });

  it('mois sans activité à zéro ; parts du total recalculées sur les sommes ; rebuts et délai', () => {
    const view = assembleIndicators(
      '2026-08',
      '2026-09',
      ['2026-08', '2026-09'],
      [
        { id: LOC, label: 'Magasin central' },
        { id: LOC2, label: 'Chantier Kaporo' }
      ],
      {
        counts: [
          count({ countsValidatedByOther: 0 }),
          count({ locationId: LOC2, countedValue: 3_000_000, varianceValueGross: 30_000 })
        ],
        lines: [{ locationId: LOC, month: '2026-09', uncountedLines: 2, blindLines: 3, linesWithBlindFlag: 4 }],
        movements: [
          movement({
            issueValue: 700_000,
            scrapValue: 200_000,
            supplierReturnValue: 100_000,
            movementsCount: 4,
            entryLagSum: 6,
            sameDayCount: 1
          })
        ]
      }
    );
    expect(view.rows).toHaveLength(4);
    const august = view.rows.filter(row => row.month === '2026-08');
    expect(august.every(row => row.countsValidated === 0 && row.varianceRate === null && row.takerShare === null)).toBe(
      true
    );
    const septemberTotal = view.totals.find(row => row.month === '2026-09');
    // (30 000 + 30 000) ÷ (1 000 000 + 3 000 000) = 0,015 — pas la moyenne des taux (0,02).
    expect(septemberTotal?.varianceRate).toBe(0.015);
    expect(septemberTotal?.otherValidatorShare).toBe(0.5);
    const magasin = view.rows.find(row => row.month === '2026-09' && row.locationId === LOC);
    expect(magasin).toMatchObject({
      uncountedLines: 2,
      blindLineShare: 0.75,
      scrapValue: 200_000,
      scrapShare: 0.2,
      averageEntryLagDays: 1.5,
      sameDayShare: 0.25
    });
    // Tri par libellé : le chantier avant le magasin.
    expect(view.rows.filter(row => row.month === '2026-09').map(row => row.locationLabel)).toEqual([
      'Chantier Kaporo',
      'Magasin central'
    ]);
  });
});

describe('buildIndicatorQueries (B8-R1, B8-R3)', () => {
  it('chaque requête porte l’agence en paramètre lié, aucune ne groupe par personne', () => {
    const queries = buildIndicatorQueries(
      "tenant-1' OR '1'='1",
      new Date('2026-09-01T00:00:00.000Z'),
      new Date('2026-10-01T00:00:00.000Z'),
      LOC
    );
    // La part validée par un tiers ne compte que les inventaires à valeurs figées (B8-R2).
    expect(queries.counts.sql).toMatch(/self_validated = false AND c\.counted_value IS NOT NULL/);
    for (const query of [queries.counts, queries.lines, queries.movements]) {
      expect(query.text).toMatch(/tenant_id = \$\d/);
      expect(query.sql).not.toContain("tenant-1'");
      expect(query.values).toContain("tenant-1' OR '1'='1");
      expect(query.values).toContain(LOC);
      expect(query.sql).not.toMatch(
        /created_by_user_id|counted_by_user_id|validated_by_user_id|taker_id\s*,|GROUP BY[^\n]*user/i
      );
    }
  });
});

describe('getStockIndicators', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    queryRaw.mockResolvedValue([]);
    findManyLocations.mockResolvedValue([{ id: LOC, label: 'Magasin central' }]);
  });

  it('lit trois agrégats et convertit BigInt et décimaux', async () => {
    queryRaw
      .mockResolvedValueOnce([
        {
          locationId: LOC,
          month: '2026-09',
          countsValidated: BigInt(1),
          countsWithoutFrozenValues: BigInt(0),
          countedValue: '1000000.00',
          varianceValueGross: '30000.00',
          setAsideVarianceValue: '0',
          countsValidatedByOther: BigInt(1)
        }
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    const view = await getStockIndicators(TENANT, { from: '2026-09', to: '2026-09' });
    expect(queryRaw).toHaveBeenCalledTimes(3);
    expect(view.rows[0].varianceRate).toBe(0.03);
    expect(view.from).toBe('2026-09');
  });

  it('un lieu d’une autre agence : 404', async () => {
    findFirstLocation.mockResolvedValue(null);
    await expect(
      getStockIndicators(TENANT, { from: '2026-09', to: '2026-09', locationId: LOC2 })
    ).rejects.toMatchObject({
      statusCode: 404
    });
    expect(queryRaw).not.toHaveBeenCalled();
  });
});
