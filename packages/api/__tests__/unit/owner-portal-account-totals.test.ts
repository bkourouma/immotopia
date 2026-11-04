/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * BUG-2026-11-04-003 — « Mon compte » propriétaire : les indicateurs doivent
 * expliquer le solde. La retenue à la source (débit) et le dépôt de garantie
 * conservé (crédit) rejoignent les totaux de la réponse.
 */

const mockDb = {
  tenantClient: { findFirst: jest.fn() },
  thirdPartyAccount: { findUnique: jest.fn() },
  thirdPartyMovement: { findMany: jest.fn() },
  ownerPayout: { findMany: jest.fn() },
  rentalLease: { findMany: jest.fn() },
  user: { findMany: jest.fn() }
};

jest.mock('../../src/utils/database', () => ({ prisma: mockDb }));
jest.mock('../../src/lib/finance/accounting', () => ({}));
jest.mock('../../src/lib/finance/ledger', () => ({}));
jest.mock('../../src/lib/rental-fees/materialize', () => ({}));
jest.mock('../../src/lib/settings/finance-settings', () => ({}));
jest.mock('../../src/lib/treasury/accounts', () => ({}));
jest.mock('../../src/lib/owner-account/accounts', () => ({}));
jest.mock('../../src/lib/owner-account/sync', () => ({
  OWNER_SOURCE: {
    RENT: 'OWNER_ALLOCATION',
    FEE: 'OWNER_FEE',
    FEE_VAT: 'OWNER_FEE_VAT',
    EXPENSE: 'OWNER_EXPENSE',
    PAYOUT: 'OWNER_PAYOUT',
    WITHHOLDING: 'OWNER_WITHHOLDING',
    DEPOSIT_RETAINED: 'OWNER_DEPOSIT_RETAINED'
  },
  syncOwnerAccount: jest.fn(async () => undefined),
  getOrCreateOwnerAccountTx: jest.fn(),
  listAgencyOwners: jest.fn(),
  reverseDocumentEntryTx: jest.fn()
}));

import { getOwnerAccount } from '../../src/lib/owner-account/service';

let seq = 0;
const move = (sourceType: string, debit: number, credit: number, type: string) => ({
  id: `m${++seq}`,
  sourceType,
  type,
  label: type,
  debit,
  credit,
  leaseId: null,
  movementDate: new Date(2026, 0, seq),
  createdAt: new Date(2026, 0, seq)
});

describe('getOwnerAccount — totaux', () => {
  it('les indicateurs retombent exactement sur le solde', async () => {
    mockDb.tenantClient.findFirst.mockResolvedValue({ id: 'o1', user: { fullName: 'Moussa', email: 'm@x' } });
    // Solde stocké au sens comptable : négatif quand l'agence doit.
    mockDb.thirdPartyAccount.findUnique.mockResolvedValue({ id: 'a1', balance: -276000 });
    mockDb.thirdPartyMovement.findMany.mockResolvedValue([
      move('OWNER_ALLOCATION', 0, 16505000, 'RENT_COLLECTED'),
      move('OWNER_PAYOUT', 14139000, 0, 'PAYOUT'),
      move('OWNER_WITHHOLDING', 2136000, 0, 'WITHHOLDING_TAX'),
      move('OWNER_DEPOSIT_RETAINED', 0, 46000, 'DEPOSIT_RETAINED')
    ]);
    mockDb.ownerPayout.findMany.mockResolvedValue([]);
    mockDb.rentalLease.findMany.mockResolvedValue([]);
    mockDb.user.findMany.mockResolvedValue([]);

    const account: any = await getOwnerAccount('t1', 'o1');
    const t = account.totals;
    expect(t.rentCollected).toBe(16505000);
    expect(t.payouts).toBe(14139000);
    expect(t.withholdingTax).toBe(2136000);
    expect(t.depositRetained).toBe(46000);
    expect(t.otherMovements).toBe(0);

    const recomputed =
      t.rentCollected -
      t.fees -
      t.vat -
      t.expenses -
      t.payouts -
      t.withholdingTax +
      t.depositRetained +
      t.otherMovements;
    expect(recomputed).toBe(account.balance);
    expect(account.balance).toBe(276000);
  });
});
