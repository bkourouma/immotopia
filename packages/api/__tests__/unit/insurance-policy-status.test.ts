import {
  daysToExpiry,
  derivePolicyStatus,
  policyStatusWhere,
  type PolicyStatus
} from '../../src/lib/patrimoine/insurance/policy-status';

const NOW = new Date('2026-10-01T15:30:00.000Z');
const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

describe('derivePolicyStatus', () => {
  it('UPCOMING quand la police commence demain, ACTIVE le jour même', () => {
    expect(derivePolicyStatus({ startDate: d('2026-10-02'), endDate: d('2027-10-01') }, NOW)).toBe('UPCOMING');
    expect(derivePolicyStatus({ startDate: d('2026-10-01'), endDate: d('2027-10-01') }, NOW)).toBe('ACTIVE');
  });

  it('EXPIRED le lendemain de la fin, pas la veille ni le jour même', () => {
    expect(derivePolicyStatus({ startDate: d('2025-01-01'), endDate: d('2026-09-30') }, NOW)).toBe('EXPIRED');
    expect(derivePolicyStatus({ startDate: d('2025-01-01'), endDate: d('2026-10-01') }, NOW)).toBe('EXPIRING_SOON');
    expect(derivePolicyStatus({ startDate: d('2025-01-01'), endDate: d('2026-10-02') }, NOW)).toBe('EXPIRING_SOON');
  });

  it('J-30 expire bientôt, J-31 reste active', () => {
    expect(derivePolicyStatus({ startDate: d('2025-01-01'), endDate: d('2026-10-31') }, NOW)).toBe('EXPIRING_SOON');
    expect(derivePolicyStatus({ startDate: d('2025-01-01'), endDate: d('2026-11-01') }, NOW)).toBe('ACTIVE');
  });

  it('compare par jour calendaire UTC, pas par heure', () => {
    const lateNow = new Date('2026-10-01T23:59:59.000Z');
    expect(derivePolicyStatus({ startDate: d('2026-10-01'), endDate: d('2026-10-01') }, lateNow)).toBe('EXPIRING_SOON');
  });
});

describe('daysToExpiry', () => {
  it('compte les jours calendaires, négatif si échue', () => {
    expect(daysToExpiry({ endDate: d('2026-10-31') }, NOW)).toBe(30);
    expect(daysToExpiry({ endDate: d('2026-10-01') }, NOW)).toBe(0);
    expect(daysToExpiry({ endDate: d('2026-09-28') }, NOW)).toBe(-3);
  });
});

describe('policyStatusWhere : cohérence avec derivePolicyStatus', () => {
  type Range = { gte?: Date; lt?: Date } | undefined;
  const inRange = (date: Date, range: Range): boolean =>
    !range || ((!range.gte || date >= range.gte) && (!range.lt || date < range.lt));

  const STATUSES: PolicyStatus[] = ['UPCOMING', 'ACTIVE', 'EXPIRING_SOON', 'EXPIRED'];
  const offsets = [-40, -2, -1, 0, 1, 2, 29, 30, 31, 32, 90];
  const shift = (days: number, hours = 0) => new Date(NOW.getTime() + days * 86400000 + hours * 3600000);

  it('chaque couple (début, fin) correspond à exactement un statut, le même des deux côtés', () => {
    for (const startOffset of offsets) {
      for (const endOffset of offsets.filter(o => o >= startOffset)) {
        for (const hours of [-15, 0, 8]) {
          const policy = { startDate: shift(startOffset, hours), endDate: shift(endOffset, hours) };
          const derived = derivePolicyStatus(policy, NOW);
          const matching = STATUSES.filter(status => {
            const where = policyStatusWhere(status, NOW);
            return inRange(policy.startDate, where.startDate) && inRange(policy.endDate, where.endDate);
          });
          expect(matching).toEqual([derived]);
        }
      }
    }
  });
});
