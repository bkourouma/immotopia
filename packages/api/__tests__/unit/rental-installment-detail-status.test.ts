/**
 * BUG-2026-10-02-015 : le détail d'une échéance doit afficher le même statut
 * calculé que la liste (un Brouillon passé et non soldé est « En retard »).
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

import { getInstallmentById } from '../../src/services/rental-installment-service';

function row(overrides: Record<string, any> = {}) {
  return {
    id: 'inst-1',
    status: 'DRAFT',
    due_date: new Date('2020-01-05T00:00:00.000Z'),
    amount_rent: '100000',
    amount_service: '0',
    amount_other_fees: '0',
    penalty_amount: '0',
    amount_paid: '0',
    ...overrides
  };
}

describe('getInstallmentById : statut dérivé', () => {
  it('un brouillon passé et non soldé est renvoyé OVERDUE, comme la liste', async () => {
    findFirst.mockResolvedValueOnce(row());
    await expect(getInstallmentById('t1', 'inst-1')).resolves.toMatchObject({ status: 'OVERDUE' });
  });

  it('un brouillon à venir reste DRAFT', async () => {
    findFirst.mockResolvedValueOnce(row({ due_date: new Date('2099-01-05T00:00:00.000Z') }));
    await expect(getInstallmentById('t1', 'inst-1')).resolves.toMatchObject({ status: 'DRAFT' });
  });

  it('introuvable : null', async () => {
    findFirst.mockResolvedValueOnce(null);
    await expect(getInstallmentById('t1', 'x')).resolves.toBeNull();
  });
});
