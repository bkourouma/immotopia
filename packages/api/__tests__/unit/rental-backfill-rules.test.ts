/**
 * Rattrapage des créances d'échéances (`scripts/backfill-rental-deposits.ts`) :
 * règle pure de sélection des échéances à débiter.
 */

import { RentalInstallmentStatus, RentalLeaseStatus } from '@prisma/client';
import { repricedInstallmentIds, selectInstallmentsToDebit } from '../../src/lib/finance/rental-backfill-rules';

const NOW = new Date(2026, 8, 30, 10, 0, 0);

const installment = (index: number, extra: Record<string, unknown> = {}) => {
  const due = new Date(2026, 3 + index, 5);
  return {
    id: `inst-${index}`,
    lease_id: 'lease-1',
    lease: { status: RentalLeaseStatus.ACTIVE },
    status: RentalInstallmentStatus.DRAFT,
    due_date: due,
    amount_rent: 480000,
    amount_service: 0,
    amount_other_fees: 0,
    penalty_amount: 0,
    amount_paid: 0,
    ...extra
  };
};

describe('selectInstallmentsToDebit', () => {
  it('24 échéances dont 18 futures : 6 débits, aucun débit futur', () => {
    const all = Array.from({ length: 24 }, (_, i) => installment(i));

    const { toDebit } = selectInstallmentsToDebit(all, NOW, { debited: new Set(), repriced: new Set() });

    expect(toDebit).toHaveLength(6);
    expect(toDebit.every(i => i.due_date <= NOW)).toBe(true);
  });

  it('ignore les baux brouillon ou annulés', () => {
    const all = [
      installment(0, { lease: { status: RentalLeaseStatus.DRAFT } }),
      installment(1, { lease: { status: RentalLeaseStatus.CANCELED } }),
      installment(2)
    ];
    const { toDebit } = selectInstallmentsToDebit(all, NOW, { debited: new Set(), repriced: new Set() });
    expect(toDebit.map(i => i.id)).toEqual(['inst-2']);
  });

  it('ne débite pas une échéance déjà débitée, ni une échéance repricée par une révision', () => {
    const all = [installment(0), installment(1), installment(2)];
    const { toDebit, skippedRepriced } = selectInstallmentsToDebit(all, NOW, {
      debited: new Set(['inst-0']),
      repriced: repricedInstallmentIds(['inst-1:event-9'])
    });
    expect(toDebit.map(i => i.id)).toEqual(['inst-2']);
    expect(skippedRepriced.map(i => i.id)).toEqual(['inst-1']);
  });
});
