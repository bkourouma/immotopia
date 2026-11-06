/**
 * Reversements et relevés de gérance (recette GL-10-017/018) : rattachement
 * au relevé du même propriétaire, règlement partiel, annulation.
 */
const statementFindFirst = jest.fn();
const clientFindFirst = jest.fn();
const payoutRows = jest.fn();
const tx: any = {
  $queryRaw: jest.fn(async () => [{ id: 'acc-1' }]),
  thirdPartyAccount: { findUnique: jest.fn(async () => ({ balance: -500000 })) },
  ownerPayout: {
    findFirst: jest.fn(async (args: any) => {
      if (args.select?.sequence) return null;
      return {
        id: 'po-1',
        accountId: 'acc-1',
        status: 'VALIDATED',
        year: 2026,
        sequence: 1,
        amount: 100000,
        statementId: ST,
        createdByUserId: null
      };
    }),
    findMany: jest.fn(async () => payoutRows()),
    create: jest.fn(async (args: any) => ({
      id: 'po-2',
      year: 2026,
      sequence: 1,
      amount: args.data.amount,
      paidAt: args.data.paidAt,
      method: 'CASH',
      createdByUserId: null,
      status: 'VALIDATED',
      createdAt: new Date()
    })),
    update: jest.fn(async () => ({
      id: 'po-1',
      year: 2026,
      sequence: 1,
      amount: 100000,
      createdByUserId: null,
      paidAt: new Date(),
      createdAt: new Date(),
      method: 'CASH',
      status: 'VOIDED'
    }))
  },
  ownerStatement: {
    findFirst: jest.fn(async (a: any) => statementFindFirst(a)),
    update: jest.fn(),
    updateMany: jest.fn()
  }
};

jest.mock('../../src/utils/database', () => ({
  prisma: {
    $transaction: (fn: any) => fn(tx),
    user: { findMany: jest.fn().mockResolvedValue([]) },
    ownerStatement: { findFirst: (a: any) => statementFindFirst(a) },
    tenantClient: { findFirst: (a: any) => clientFindFirst(a) }
  }
}));
jest.mock('../../src/lib/finance/accounting', () => ({ postDocumentEntryTx: jest.fn() }));
jest.mock('../../src/lib/finance/ledger', () => ({ appendThirdPartyMovementTx: jest.fn() }));
jest.mock('../../src/lib/rental-fees/materialize', () => ({ materializeManagementFees: jest.fn() }));
jest.mock('../../src/lib/settings/finance-settings', () => ({
  getAgencyFinanceSettings: jest.fn().mockResolvedValue({})
}));
jest.mock('../../src/lib/treasury/accounts', () => ({
  assertTreasuryAccountUsableTx: jest.fn(),
  resolveTreasuryAccountTx: jest.fn().mockResolvedValue({ journal: 'CASH', chartOfAccountId: 'c1' })
}));
jest.mock('../../src/lib/owner-account/accounts', () => ({
  ensureRentalAccountsTx: jest.fn().mockResolvedValue({ ownerFunds: 'f1' }),
  journalResolver: jest.fn(() => jest.fn().mockResolvedValue('j1'))
}));
jest.mock('../../src/lib/owner-account/sync', () => ({
  getOrCreateOwnerAccountTx: jest.fn(async () => ({ id: 'acc-1' })),
  listAgencyOwners: jest.fn(),
  OWNER_SOURCE: { PAYOUT: 'OWNER_PAYOUT' },
  reverseDocumentEntryTx: jest.fn(),
  syncOwnerAccount: jest.fn()
}));

import { createOwnerPayout, voidOwnerPayout } from '../../src/lib/owner-account/service';

const TENANT = 'tenant-A';
const ST = '11111111-1111-4111-8111-111111111111';
const body = (amount: number) => ({ amount, paidAt: '2026-01-05', method: 'CASH', statementId: ST });

beforeEach(() => {
  jest.clearAllMocks();
  clientFindFirst.mockResolvedValue({ id: 'owner-1', details: { crmContactId: 'contact-A' } });
  statementFindFirst.mockResolvedValue({
    id: ST,
    ownerContactId: 'contact-A',
    netAmount: 234320,
    status: 'SENT'
  });
  payoutRows.mockReturnValue([]);
});

describe('createOwnerPayout : relevé rattaché', () => {
  it("refuse le relevé d'un autre propriétaire (NotFound, comme un relevé inexistant)", async () => {
    statementFindFirst.mockResolvedValue({
      id: ST,
      ownerContactId: 'contact-B',
      netAmount: 234320,
      status: 'SENT'
    });
    await expect(createOwnerPayout(TENANT, 'owner-1', body(1000), 'u1')).rejects.toMatchObject({ status: 404 });
    expect(tx.ownerPayout.create).not.toHaveBeenCalled();
  });

  it('un reversement partiel ne passe pas le relevé à PAID', async () => {
    payoutRows.mockReturnValue([{ amount: 1000 }]);
    await createOwnerPayout(TENANT, 'owner-1', body(1000), 'u1');
    expect(tx.ownerStatement.update).not.toHaveBeenCalled();
  });

  it('un reversement qui couvre le net (avec les précédents) passe le relevé à PAID', async () => {
    payoutRows.mockReturnValue([{ amount: 34320 }, { amount: 200000 }]);
    await createOwnerPayout(TENANT, 'owner-1', body(200000), 'u1');
    expect(tx.ownerStatement.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'PAID' }) })
    );
  });
});

describe('voidOwnerPayout', () => {
  it("l'annulation ramène un relevé PAID non couvert à SENT", async () => {
    payoutRows.mockReturnValue([]);
    statementFindFirst.mockResolvedValue({ id: ST, netAmount: 100000, status: 'PAID' });
    await voidOwnerPayout(TENANT, 'owner-1', 'po-1', { reason: 'Erreur de saisie' }, 'u1');
    expect(tx.ownerStatement.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'SENT' }) })
    );
  });

  it('un relevé encore couvert par les autres reversements reste PAID', async () => {
    payoutRows.mockReturnValue([{ amount: 100000 }]);
    statementFindFirst.mockResolvedValue({ id: ST, netAmount: 100000, status: 'PAID' });
    await voidOwnerPayout(TENANT, 'owner-1', 'po-1', { reason: 'Erreur de saisie' }, 'u1');
    expect(tx.ownerStatement.updateMany).not.toHaveBeenCalled();
  });
});
