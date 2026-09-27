jest.mock('@prisma/client', () => {
  const tx = {
    chargeCall: {
      findFirst: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
    },
    chargePayment: {
      create: jest.fn(),
      aggregate: jest.fn(),
    },
    syndicateLot: {
      findFirst: jest.fn(),
    },
  };

  const prisma = {
    ...tx,
    $transaction: jest.fn(async (callback: any) => callback(tx)),
  };

  return {
    PrismaClient: jest.fn(() => prisma),
    __mockPrisma: prisma,
    __mockTx: tx,
  };
});

import { createChargeCallAndUpdateStatus, recordChargePaymentWithStatusUpdate } from '../../src/lib/syndics/queries';

const { __mockPrisma: mockPrisma, __mockTx: mockTx } = jest.requireMock('@prisma/client') as {
  __mockPrisma: {
    $transaction: jest.Mock;
  };
  __mockTx: {
    chargeCall: {
      findFirst: jest.Mock;
      update: jest.Mock;
      create: jest.Mock;
    };
    chargePayment: {
      create: jest.Mock;
      aggregate: jest.Mock;
    };
    syndicateLot: {
      findFirst: jest.Mock;
    };
  };
};

describe('Syndics charges queries - US2', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates a charge call when lot belongs to tenant syndicate', async () => {
    mockPrisma.$transaction.mockImplementationOnce(async (callback: any) => callback(mockTx));
    mockTx.syndicateLot.findFirst.mockResolvedValue({ id: 'lot-1' });
    mockTx.chargeCall.create.mockResolvedValue({
      id: 'call-1',
      syndicateId: 'syndic-1',
      lotId: 'lot-1',
      period: '2026-Q1',
      amount: 120000,
      status: 'PENDING',
    });

    const result = await createChargeCallAndUpdateStatus('tenant-a', {
      syndicateId: 'syndic-1',
      lotId: 'lot-1',
      period: '2026-Q1',
      amount: 120000,
      currency: 'XOF',
      dueDate: new Date('2026-04-15T00:00:00.000Z'),
    });

    expect(mockTx.syndicateLot.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'lot-1',
        syndicateId: 'syndic-1',
        syndicate: { tenantId: 'tenant-a' },
      },
      select: { id: true },
    });
    expect(mockTx.chargeCall.create).toHaveBeenCalled();
    expect(result.id).toBe('call-1');
  });

  it('updates charge status to PARTIAL when payment is below amount', async () => {
    mockPrisma.$transaction.mockImplementationOnce(async (callback: any) => callback(mockTx));
    mockTx.chargeCall.findFirst.mockResolvedValue({
      id: 'call-1',
      amount: 100000,
      status: 'PENDING',
    });
    mockTx.chargePayment.create.mockResolvedValue({ id: 'payment-1' });
    mockTx.chargePayment.aggregate.mockResolvedValue({ _sum: { amount: 30000 } });
    mockTx.chargeCall.update.mockResolvedValue({ id: 'call-1', status: 'PARTIAL' });

    await recordChargePaymentWithStatusUpdate('tenant-a', {
      chargeCallId: 'call-1',
      amount: 30000,
      paidAt: new Date('2026-04-10T00:00:00.000Z'),
      method: 'VIREMENT',
      reference: 'PAY-001',
    });

    expect(mockTx.chargeCall.update).toHaveBeenCalledWith({
      where: { id: 'call-1' },
      data: { status: 'PARTIAL' },
    });
  });

  it('updates charge status to PAID when total paid reaches amount', async () => {
    mockPrisma.$transaction.mockImplementationOnce(async (callback: any) => callback(mockTx));
    mockTx.chargeCall.findFirst.mockResolvedValue({
      id: 'call-2',
      amount: 100000,
      currency: 'XOF',
      status: 'PENDING',
    });
    mockTx.chargePayment.create.mockResolvedValue({ id: 'payment-2' });
    // 30000 deja regle avant ce paiement de 70000 : le total attendu atteint
    // exactement le montant de l'appel (100000), d'ou le statut PAID.
    mockTx.chargePayment.aggregate.mockResolvedValue({ _sum: { amount: 30000 } });
    mockTx.chargeCall.update.mockResolvedValue({ id: 'call-2', status: 'PAID' });

    await recordChargePaymentWithStatusUpdate('tenant-a', {
      chargeCallId: 'call-2',
      amount: 70000,
      paidAt: new Date('2026-04-11T00:00:00.000Z'),
      method: 'VIREMENT',
      reference: 'PAY-002',
    });

    expect(mockTx.chargeCall.update).toHaveBeenCalledWith({
      where: { id: 'call-2' },
      data: { status: 'PAID' },
    });
  });

  it('rejects a payment that exceeds the outstanding balance (no overpayment)', async () => {
    mockPrisma.$transaction.mockImplementationOnce(async (callback: any) => callback(mockTx));
    mockTx.chargeCall.findFirst.mockResolvedValue({
      id: 'call-3',
      amount: 100000,
      currency: 'XOF',
      status: 'PARTIAL',
    });
    // Deja 80000 regles : le reste du est 20000, un paiement de 25000 doit
    // etre refuse plutot qu'accepte comme trop-percu (FR-005).
    mockTx.chargePayment.aggregate.mockResolvedValue({ _sum: { amount: 80000 } });

    await expect(
      recordChargePaymentWithStatusUpdate('tenant-a', {
        chargeCallId: 'call-3',
        amount: 25000,
        paidAt: new Date('2026-04-12T00:00:00.000Z'),
        method: 'VIREMENT',
      })
    ).rejects.toMatchObject({ status: 422 });

    expect(mockTx.chargePayment.create).not.toHaveBeenCalled();
    expect(mockTx.chargeCall.update).not.toHaveBeenCalled();
  });

  it('rejects payment when charge call is outside tenant scope', async () => {
    mockPrisma.$transaction.mockImplementationOnce(async (callback: any) => callback(mockTx));
    mockTx.chargeCall.findFirst.mockResolvedValue(null);

    await expect(
      recordChargePaymentWithStatusUpdate('tenant-a', {
        chargeCallId: 'call-other-tenant',
        amount: 15000,
        paidAt: new Date('2026-04-11T00:00:00.000Z'),
      })
    ).rejects.toMatchObject({ status: 404 });

    expect(mockTx.chargePayment.create).not.toHaveBeenCalled();
    expect(mockTx.chargeCall.update).not.toHaveBeenCalled();
  });
});
