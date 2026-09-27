/**
 * Lot S4 — calculs purs des programmations d'appels de charges : périodes
 * civiles, dates d'émission et d'échéance, date de fin, quote-part du budget
 * par période et répartition d'un montant fixe par tantièmes.
 */

import {
  annualShareForPeriod,
  describePeriod,
  distributeFixedAmount,
  firstPeriod,
  firstPeriodIssuedOnOrAfter,
  followingPeriod,
  periodAt,
  periodContaining,
  periodsPerYearOf,
  type ScheduleTiming
} from '../../src/lib/syndics/charge-schedule-periods';

const d = (value: string) => new Date(`${value}T00:00:00.000Z`);
const day = (value: Date | null | undefined) => (value ? value.toISOString().slice(0, 10) : null);

function timing(overrides: Partial<ScheduleTiming> = {}): ScheduleTiming {
  return {
    frequency: 'MONTHLY',
    issueDay: 1,
    dueOffsetDays: 15,
    startDate: d('2026-01-01'),
    endDate: null,
    ...overrides
  };
}

function summary(t: ScheduleTiming, count: number) {
  const out: Array<[string, string | null, string | null, string | null, string | null]> = [];
  for (let index = 0; index < count; index += 1) {
    const period = periodAt(t, index);
    if (!period) break;
    out.push([
      period.label,
      day(period.periodStart),
      day(period.periodEnd),
      day(period.issueDate),
      day(period.dueDate)
    ]);
  }
  return out;
}

describe('periodes civiles', () => {
  it('mensuelle : un mois civil, emission au jour choisi, echeance decalee', () => {
    expect(summary(timing({ issueDay: 5, dueOffsetDays: 10 }), 3)).toEqual([
      ['Janvier 2026', '2026-01-01', '2026-01-31', '2026-01-05', '2026-01-15'],
      ['Février 2026', '2026-02-01', '2026-02-28', '2026-02-05', '2026-02-15'],
      ['Mars 2026', '2026-03-01', '2026-03-31', '2026-03-05', '2026-03-15']
    ]);
  });

  it('trimestrielle : trimestre civil qui contient la date de debut', () => {
    expect(summary(timing({ frequency: 'QUARTERLY', startDate: d('2026-11-15'), dueOffsetDays: 30 }), 3)).toEqual([
      ['T4 2026', '2026-10-01', '2026-12-31', '2026-10-01', '2026-10-31'],
      ['T1 2027', '2027-01-01', '2027-03-31', '2027-01-01', '2027-01-31'],
      ['T2 2027', '2027-04-01', '2027-06-30', '2027-04-01', '2027-05-01']
    ]);
  });

  it('semestrielle et annuelle', () => {
    expect(summary(timing({ frequency: 'SEMIANNUAL', startDate: d('2026-03-10') }), 2).map(p => p.slice(0, 3))).toEqual(
      [
        ['S1 2026', '2026-01-01', '2026-06-30'],
        ['S2 2026', '2026-07-01', '2026-12-31']
      ]
    );
    expect(summary(timing({ frequency: 'ANNUAL', startDate: d('2026-06-01') }), 2).map(p => p.slice(0, 3))).toEqual([
      ['2026', '2026-01-01', '2026-12-31'],
      ['2027', '2027-01-01', '2027-12-31']
    ]);
  });

  it('fin de mois : fevrier bissextile, echeance qui franchit la fin du mois et de l annee', () => {
    const leap = summary(timing({ startDate: d('2028-02-10'), issueDay: 28, dueOffsetDays: 3 }), 1)[0];
    expect(leap).toEqual(['Février 2028', '2028-02-01', '2028-02-29', '2028-02-28', '2028-03-02']);
    const december = summary(timing({ startDate: d('2026-12-01'), issueDay: 28, dueOffsetDays: 10 }), 2);
    expect(december[0].slice(3)).toEqual(['2026-12-28', '2027-01-07']);
    expect(december[1][0]).toBe('Janvier 2027');
  });

  it('date de fin : une periode qui commence apres la fin n existe pas', () => {
    const t = timing({ frequency: 'QUARTERLY', endDate: d('2026-07-15') });
    expect(summary(t, 10).map(p => p[0])).toEqual(['T1 2026', 'T2 2026', 'T3 2026']);
    expect(periodContaining(t, d('2026-10-02'))).toBeNull();
    expect(firstPeriod(timing({ startDate: d('2026-05-01'), endDate: d('2026-04-01') }))).toBeNull();
  });

  it('periodContaining : null avant la premiere periode', () => {
    const t = timing({ startDate: d('2026-03-01') });
    expect(periodContaining(t, d('2026-02-27'))).toBeNull();
    expect(periodContaining(t, d('2026-03-20'))?.label).toBe('Mars 2026');
  });

  it('prochaine emission : aujourd hui compris, periodes deja traitees sautees', () => {
    const t = timing({ issueDay: 10 });
    expect(day(firstPeriodIssuedOnOrAfter(t, d('2026-09-10'))?.issueDate)).toBe('2026-09-10');
    expect(day(firstPeriodIssuedOnOrAfter(t, d('2026-09-11'))?.issueDate)).toBe('2026-10-10');
    const done = new Set([d('2026-10-01').getTime()]);
    expect(day(firstPeriodIssuedOnOrAfter(t, d('2026-09-11'), start => done.has(start.getTime()))?.issueDate)).toBe(
      '2026-11-10'
    );
    // Avant le debut : la premiere periode.
    expect(day(firstPeriodIssuedOnOrAfter(timing({ startDate: d('2027-01-01') }), d('2026-09-27'))?.issueDate)).toBe(
      '2027-01-01'
    );
    // Apres la fin : plus rien.
    expect(firstPeriodIssuedOnOrAfter(timing({ endDate: d('2026-06-30') }), d('2026-09-27'))).toBeNull();
  });

  it('followingPeriod et describePeriod restent coherents', () => {
    const t = timing({ frequency: 'QUARTERLY' });
    const q4 = describePeriod(t, d('2026-10-01'));
    expect(q4.indexInYear).toBe(4);
    expect(q4.periodsPerYear).toBe(4);
    expect(followingPeriod(t, q4)?.label).toBe('T1 2027');
    expect([periodsPerYearOf('MONTHLY'), periodsPerYearOf('SEMIANNUAL'), periodsPerYearOf('ANNUAL')]).toEqual([
      12, 2, 1
    ]);
  });
});

describe('quote-part du budget par periode', () => {
  it('divise la quote-part annuelle, la derniere periode absorbe l arrondi', () => {
    const monthly = Array.from({ length: 12 }, (_, index) => annualShareForPeriod(1000, 12, index + 1));
    expect(monthly.slice(0, 11).every(amount => amount === 83.33)).toBe(true);
    expect(monthly[11]).toBe(83.37);
    expect(Math.round(monthly.reduce((sum, amount) => sum + amount, 0) * 100)).toBe(100000);

    const quarterly = [1, 2, 3, 4].map(index => annualShareForPeriod(100000.01, 4, index));
    expect(quarterly).toEqual([25000, 25000, 25000, 25000.01]);
    expect(annualShareForPeriod(1234.56, 1, 1)).toBe(1234.56);
  });

  it('refuse un rang hors bornes', () => {
    expect(() => annualShareForPeriod(100, 4, 5)).toThrow(RangeError);
    expect(() => annualShareForPeriod(100, 0, 1)).toThrow(RangeError);
  });
});

describe('montant fixe reparti par tantiemes', () => {
  const lots = [
    { id: 'l1', lotNumber: 'A-01', lotType: 'APARTMENT', generalShares: 300 },
    { id: 'l2', lotNumber: 'A-02', lotType: 'APARTMENT', generalShares: 700 },
    { id: 'p1', lotNumber: 'P-01', lotType: 'PARKING', generalShares: 50 }
  ];

  it('entre les seuls lots principaux, somme exacte', () => {
    expect(distributeFixedAmount(1000, lots)).toEqual([
      { lotId: 'l1', amount: 300 },
      { lotId: 'l2', amount: 700 }
    ]);
    const odd = distributeFixedAmount(100, [
      { id: 'a', lotNumber: '1', lotType: 'OFFICE', generalShares: 1 },
      { id: 'b', lotNumber: '2', lotType: 'OFFICE', generalShares: 1 },
      { id: 'c', lotNumber: '10', lotType: 'OFFICE', generalShares: 1 }
    ]);
    expect(odd).toEqual([
      { lotId: 'a', amount: 33.33 },
      { lotId: 'b', amount: 33.33 },
      { lotId: 'c', amount: 33.34 }
    ]);
  });

  it('sans lot principal : tous les lots ; sans tantieme : parts egales', () => {
    expect(distributeFixedAmount(90, [lots[2]])).toEqual([{ lotId: 'p1', amount: 90 }]);
    expect(
      distributeFixedAmount(90, [
        { id: 'x', lotNumber: 'X', lotType: 'APARTMENT', generalShares: 0 },
        { id: 'y', lotNumber: 'Y', lotType: 'APARTMENT', generalShares: 0 }
      ])
    ).toEqual([
      { lotId: 'x', amount: 45 },
      { lotId: 'y', amount: 45 }
    ]);
    expect(distributeFixedAmount(90, [])).toEqual([]);
  });
});
