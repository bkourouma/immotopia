import { toInstallmentOverview } from '../../src/utils/installment-overview';

describe('toInstallmentOverview (BUG-027)', () => {
  it("affiche le reste dû d'une échéance partiellement payée", () => {
    const out = toInstallmentOverview({
      id: 'i1',
      period_year: 2026,
      period_month: 10,
      due_date: new Date('2026-10-05'),
      status: 'PARTIAL',
      amount_rent: 160000,
      amount_service: 0,
      amount_other_fees: 0,
      penalty_amount: 0,
      amount_paid: 36000
    });
    expect(out.amount).toBe(124000);
    expect(out.totalAmount).toBe(160000);
    expect(out.amountPaid).toBe(36000);
    expect(out.period).toBe('2026-10');
  });
});
