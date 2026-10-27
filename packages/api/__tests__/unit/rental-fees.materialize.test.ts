jest.mock('../../src/utils/database', () => ({ prisma: {} }));

import { feeTermsApplyToAllocation } from '../../src/lib/rental-fees/materialize';

describe('feeTermsApplyToAllocation (BUG-029)', () => {
  const fixedAt = new Date('2026-09-28T23:00:00Z');

  it("n'applique pas un taux fixé après coup à un encaissement déjà enregistré", () => {
    expect(feeTermsApplyToAllocation(fixedAt, new Date('2026-09-28T22:00:00Z'))).toBe(false);
  });

  it("l'applique à un encaissement enregistré après", () => {
    expect(feeTermsApplyToAllocation(fixedAt, new Date('2026-09-28T23:30:00Z'))).toBe(true);
  });

  it('sans date de niveau, aucune borne', () => {
    expect(feeTermsApplyToAllocation(null, new Date())).toBe(true);
  });
});
