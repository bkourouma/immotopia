jest.mock('@prisma/client', () => {
  const tx = {
    chargeCall: {
      create: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    chargePayment: {
      create: jest.fn(),
      aggregate: jest.fn(),
    },
    syndicateLot: {
      findFirst: jest.fn(),
    },
    ownerAccount: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    ownerAccountTransaction: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
  };

  const prisma = {
    ...tx,
    syndicate: {
      findFirst: jest.fn(),
    },
    ownerAccount: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    ownerAccountTransaction: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
    $transaction: jest.fn(async (callback: any) => callback(tx)),
  };

  return {
    PrismaClient: jest.fn(() => prisma),
    __mockPrisma: prisma,
    __mockTx: tx,
  };
});

import {
  createChargeCallAndUpdateStatus,
  createOwnerAccountAdjustmentByLot,
  getOwnerAccountByLot,
  getOwnerAccountStatementByLot,
  recordChargePaymentWithStatusUpdate,
} from '../../src/lib/syndics/queries';

const { __mockPrisma: mockPrisma, __mockTx: mockTx } = jest.requireMock('@prisma/client') as {
  __mockPrisma: any;
  __mockTx: any;
};

describe('Syndics owner accounts queries - US2', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.syndicate.findFirst.mockResolvedValue({ id: 'syndic-1' });
  });

  it('synchronizes lot account on charge creation (debit)', async () => {
    mockPrisma.$transaction.mockImplementationOnce(async (callback: any) => callback(mockTx));
    mockTx.syndicateLot.findFirst.mockResolvedValue({ id: 'lot-1', ownerContactId: 'owner-1' });
    mockTx.chargeCall.create.mockResolvedValue({ id: 'charge-1', lotId: 'lot-1', period: '2026-Q2' });
    mockTx.ownerAccount.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'acc-1', balance: 0 });
    mockTx.ownerAccount.create.mockResolvedValue({ id: 'acc-1', balance: 0 });
    mockTx.ownerAccountTransaction.create.mockResolvedValue({ id: 'tx-1' });
    mockTx.ownerAccount.update.mockResolvedValue({ id: 'acc-1' });

    await createChargeCallAndUpdateStatus('tenant-1', {
      syndicateId: 'syndic-1',
      lotId: 'lot-1',
      period: '2026-Q2',
      amount: 120000,
      currency: 'XOF',
      dueDate: new Date('2026-06-15T00:00:00.000Z'),
    });

    expect(mockTx.ownerAccountTransaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: 'CHARGE_CALL',
          debit: 120000,
        }),
      })
    );
  });

  it('synchronizes lot account on payment (credit)', async () => {
    mockPrisma.$transaction.mockImplementationOnce(async (callback: any) => callback(mockTx));
    mockTx.chargeCall.findFirst.mockResolvedValue({
      id: 'charge-1',
      lotId: 'lot-1',
      syndicateId: 'syndic-1',
      amount: 100000,
    });
    mockTx.chargePayment.create.mockResolvedValue({ id: 'pay-1' });
    mockTx.chargePayment.aggregate.mockResolvedValue({ _sum: { amount: 40000 } });
    mockTx.chargeCall.update.mockResolvedValue({ id: 'charge-1', status: 'PARTIAL' });
    mockTx.syndicateLot.findFirst.mockResolvedValue({ id: 'lot-1', ownerContactId: 'owner-1' });
    mockTx.ownerAccount.findUnique.mockResolvedValue({ id: 'acc-1', balance: 120000 });
    mockTx.ownerAccountTransaction.create.mockResolvedValue({ id: 'tx-2' });
    mockTx.ownerAccount.update.mockResolvedValue({ id: 'acc-1' });

    await recordChargePaymentWithStatusUpdate('tenant-1', {
      chargeCallId: 'charge-1',
      amount: 40000,
      paidAt: new Date('2026-06-01T00:00:00.000Z'),
      method: 'VIREMENT',
    });

    expect(mockTx.ownerAccountTransaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: 'PAYMENT',
          credit: 40000,
        }),
      })
    );
  });

  it('creates manual adjustment transaction on lot account', async () => {
    mockPrisma.ownerAccount.findFirst.mockResolvedValue({
      id: 'acc-1',
      syndicateId: 'syndic-1',
      lotId: 'lot-1',
      balance: 20000,
    });
    mockPrisma.$transaction.mockImplementationOnce(async (callback: any) => callback(mockTx));
    mockTx.ownerAccount.findUnique.mockResolvedValue({ id: 'acc-1', balance: 20000 });
    mockTx.ownerAccountTransaction.create.mockResolvedValue({ id: 'tx-adj-1', type: 'ADJUSTMENT' });
    mockTx.ownerAccount.update.mockResolvedValue({ id: 'acc-1', balance: 25000 });

    const result = await createOwnerAccountAdjustmentByLot('tenant-1', 'syndic-1', 'lot-1', {
      direction: 'DEBIT',
      amount: 5000,
      label: 'Regularisation debit',
    });

    expect(result.id).toBe('tx-adj-1');
    expect(mockTx.ownerAccountTransaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: 'ADJUSTMENT',
          debit: 5000,
        }),
      })
    );
  });

  it('returns account statement with opening and closing balances', async () => {
    mockPrisma.ownerAccount.findFirst.mockResolvedValue({
      id: 'acc-1',
      balance: 30000,
      currency: 'XOF',
      syndicate: { name: 'Residence Demo' },
      lot: { lotNumber: 'A-01' },
      contact: { firstName: 'Awa', lastName: 'Diop' },
    });
    mockPrisma.ownerAccountTransaction.findMany.mockResolvedValue([
      {
        id: 'tx-1',
        transactionDate: new Date('2026-01-10T00:00:00.000Z'),
        debit: 10000,
        credit: null,
        balanceAfter: 20000,
        label: 'Appel',
        type: 'CHARGE_CALL',
      },
      {
        id: 'tx-2',
        transactionDate: new Date('2026-01-20T00:00:00.000Z'),
        debit: null,
        credit: 5000,
        balanceAfter: 15000,
        label: 'Paiement',
        type: 'PAYMENT',
      },
    ]);

    const statement = await getOwnerAccountStatementByLot('tenant-1', 'syndic-1', 'lot-1');

    expect(statement.summary.openingBalance).toBe(10000);
    expect(statement.summary.closingBalance).toBe(15000);
  });

  it('returns account details for a lot', async () => {
    mockPrisma.ownerAccount.findFirst.mockResolvedValue({
      id: 'acc-1',
      lotId: 'lot-1',
      balance: 25000,
      lot: { lotNumber: 'A-01' },
      contact: { firstName: 'Awa', lastName: 'Diop' },
    });

    const account = await getOwnerAccountByLot('tenant-1', 'syndic-1', 'lot-1');
    expect(account.id).toBe('acc-1');
  });
});
