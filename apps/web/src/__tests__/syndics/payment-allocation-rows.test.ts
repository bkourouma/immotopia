import { describe, expect, it } from 'vitest';
import { buildPaymentAllocationRows } from '../../components/syndics/finances/finance-rows';

describe('lignes des paiements affectés', () => {
  it('garde l’identifiant et le montant de chaque affectation, même pour un paiement réparti', () => {
    const sharedPayment = { paidAt: '2026-03-10T00:00:00.000Z', method: 'VIREMENT' };
    const lot = {
      lotNumber: 'A01',
      lotType: '',
      generalShares: 0,
      property: null,
      owner: { firstName: 'Awa', lastName: 'Koné', email: null }
    };
    const rows = buildPaymentAllocationRows([
      {
        id: 'allocation-1',
        amount: '30000',
        payment: sharedPayment,
        chargeCall: { id: '12345678-0000-4000-8000-000000000001', period: '2026-T1', lotId: 'lot-1', lot }
      },
      {
        id: 'allocation-2',
        amount: '70000',
        payment: sharedPayment,
        chargeCall: { id: '87654321-0000-4000-8000-000000000002', period: '2026-T2', lotId: 'lot-1', lot }
      }
    ]);
    expect(rows.map(row => ({ id: row.id, amount: row.amount, owner: row.ownerLabel }))).toEqual([
      { id: 'allocation-1', amount: 30000, owner: 'Awa Koné' },
      { id: 'allocation-2', amount: 70000, owner: 'Awa Koné' }
    ]);
    expect(rows[0].chargeReference).toContain('APPEL-12345678');
  });
});
