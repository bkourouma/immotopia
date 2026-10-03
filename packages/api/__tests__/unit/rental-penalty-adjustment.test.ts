jest.mock('../../src/utils/database', () => ({ prisma: {} }));

import { presenterPenalite } from '../../src/services/rental-penalty-service';

describe('presenterPenalite (BUG-024)', () => {
  it("expose le montant calculé d'origine, le montant retenu et la raison d'une pénalité ajustée", () => {
    const out = presenterPenalite({
      amount: '4000',
      is_manual_override: true,
      override_reason: JSON.stringify({ reason: 'Panne réseau', calculatedAmount: 8000 })
    });
    expect(out.calculated_amount).toBe(8000);
    expect(out.adjusted_amount).toBe(4000);
    expect(out.adjustment_reason).toBe('Panne réseau');
  });

  it('lit une raison en texte brut (ancien format)', () => {
    const out = presenterPenalite({ amount: 0, is_manual_override: true, override_reason: 'Geste commercial' });
    expect(out.calculated_amount).toBeNull();
    expect(out.adjusted_amount).toBe(0);
    expect(out.adjustment_reason).toBe('Geste commercial');
  });

  it("n'expose aucun ajustement pour une pénalité calculée", () => {
    const out = presenterPenalite({ amount: 8000, is_manual_override: false, override_reason: null });
    expect(out.adjusted_amount).toBeNull();
    expect(out.calculated_amount).toBeNull();
  });
});
