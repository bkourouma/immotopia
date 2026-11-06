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

describe('getOwnerAccount — variante portail des reversements', () => {
  const payout = {
    id: 'p1',
    year: 2026,
    sequence: 3,
    amount: 50000,
    paidAt: new Date('2026-02-01'),
    method: 'BANK_TRANSFER',
    treasuryAccountId: 'treso-1',
    reference: 'VIR-1',
    notes: 'note interne agence',
    statementId: null,
    status: 'VOIDED',
    voidReason: 'erreur de saisie',
    voidedAt: new Date('2026-02-02'),
    createdAt: new Date('2026-02-01'),
    createdByUserId: 'u1'
  };

  beforeEach(() => {
    mockDb.tenantClient.findFirst.mockResolvedValue({ id: 'o1', user: { fullName: 'Moussa', email: 'm@x' } });
    mockDb.thirdPartyAccount.findUnique.mockResolvedValue({ id: 'a1', balance: 0 });
    mockDb.thirdPartyMovement.findMany.mockResolvedValue([]);
    mockDb.ownerPayout.findMany.mockResolvedValue([payout]);
    mockDb.rentalLease.findMany.mockResolvedValue([]);
    mockDb.user.findMany.mockResolvedValue([{ id: 'u1', fullName: 'Agent Awa', email: 'a@x' }]);
  });

  it('le portail ne reçoit ni notes, ni compte de trésorerie, ni motif d’annulation, ni nom de l’agent', async () => {
    const account: any = await getOwnerAccount('t1', 'o1', { portal: true });
    const dto = account.payouts[0];
    expect(dto).toMatchObject({ number: expect.any(String), amount: 50000, reference: 'VIR-1', status: 'VOIDED' });
    for (const key of ['notes', 'treasuryAccountId', 'voidReason', 'createdByName', 'createdByUserId']) {
      expect(dto).not.toHaveProperty(key);
    }
  });

  it('la vue agence garde le DTO complet', async () => {
    const account: any = await getOwnerAccount('t1', 'o1');
    expect(account.payouts[0]).toMatchObject({
      notes: 'note interne agence',
      treasuryAccountId: 'treso-1',
      voidReason: 'erreur de saisie',
      createdByName: 'Agent Awa'
    });
  });
});
