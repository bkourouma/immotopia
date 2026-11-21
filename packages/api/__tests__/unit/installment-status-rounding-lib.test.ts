/**
 * Revue lot 3 : `computeInstallmentStatus` compare en virgule flottante.
 * 0,10 + 0,20 réglés 0,30 laissait l'échéance « Partiel » (écart de 4e-17).
 */
import { computeInstallmentStatus } from '../../src/lib/finance/installment-status';

const NOW = new Date('2026-01-10T12:00:00Z');

function row(over: Record<string, unknown> = {}) {
  return {
    status: 'DUE',
    due_date: new Date('2099-01-05T00:00:00Z'),
    amount_rent: '0.1',
    amount_service: '0.2',
    amount_other_fees: '0',
    penalty_amount: '0',
    amount_paid: '0.3',
    ...over
  } as any;
}

describe('computeInstallmentStatus — arrondi au centime', () => {
  it('0,10 + 0,20 réglés 0,30 : PAID', () => {
    expect(computeInstallmentStatus(row(), NOW)).toBe('PAID');
  });

  it('un centime manquant reste PARTIAL', () => {
    expect(computeInstallmentStatus(row({ amount_paid: '0.29' }), NOW)).toBe('PARTIAL');
  });

  it('FCFA entier : inchangé', () => {
    const e = row({ amount_rent: '150000', amount_service: '10000', amount_paid: '160000' });
    expect(computeInstallmentStatus(e, NOW)).toBe('PAID');
  });
});
