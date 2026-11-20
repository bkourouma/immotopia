/**
 * Revue fonctionnelle gestion locative (lot 3, territoire C) : une échéance en
 * devise à deux décimales réglée au centime près doit être « Payé ». En
 * virgule flottante, 0,1 + 0,2 = 0,30000000000000004 > 0,3 : l'écart de
 * 4e-17 laissait l'échéance « Partiel » avec un reste affiché 0,00.
 */
const findFirst = jest.fn();
jest.mock('../../src/utils/database', () => ({
  prisma: { rentalInstallment: { findFirst: (...a: any[]) => findFirst(...a) } }
}));
jest.mock('../../src/lib/finance/ledger', () => ({
  appendThirdPartyMovementTx: jest.fn(),
  getOrCreateTenantAccountTx: jest.fn()
}));
jest.mock('../../src/services/audit-service', () => ({ logAuditEvent: jest.fn() }));

import { getInstallmentById, statutEcheance } from '../../src/services/rental-installment-service';

function row(overrides: Record<string, any> = {}) {
  return {
    id: 'inst-1',
    status: 'DUE',
    due_date: new Date('2099-01-05T00:00:00.000Z'),
    amount_rent: '0.1',
    amount_service: '0.2',
    amount_other_fees: '0',
    penalty_amount: '0',
    amount_paid: '0.3',
    ...overrides
  };
}

describe("statut d'une échéance payée au centime près", () => {
  it('0,10 + 0,20 réglés 0,30 : PAID', () => {
    expect(statutEcheance(row() as any, new Date())).toBe('PAID');
  });

  it('loyer + charges + pénalité en devise décimale : PAID', () => {
    const e = row({ amount_rent: '1200.10', amount_service: '33.20', penalty_amount: '24.02', amount_paid: '1257.32' });
    expect(statutEcheance(e as any, new Date())).toBe('PAID');
  });

  it('un centime manquant reste PARTIAL', () => {
    expect(statutEcheance(row({ amount_paid: '0.29' }) as any, new Date())).toBe('PARTIAL');
  });

  it('le détail renvoie PAID', async () => {
    findFirst.mockResolvedValueOnce(row());
    await expect(getInstallmentById('t1', 'inst-1')).resolves.toMatchObject({ status: 'PAID' });
  });
});
