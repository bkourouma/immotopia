jest.mock('@prisma/client', () => {
  const tx = {
    chargeCall: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      create: jest.fn()
    },
    chargePayment: {
      create: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn()
    },
    // Lot S2 : le regle d'un appel se lit dans ses affectations.
    chargePaymentAllocation: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn()
    },
    syndicateLot: {
      findFirst: jest.fn()
    },
    // Lot S3 : identite figee et documents emis dans la transaction du paiement.
    syndicate: {
      findFirst: jest.fn()
    },
    tenant: {
      findUnique: jest.fn()
    },
    syndicChargeReceipt: {
      findMany: jest.fn(),
      create: jest.fn()
    },
    // Verrou consultatif du lot (affectation) : no-op sans Postgres.
    $executeRaw: jest.fn(),
    // Lot S3 : compteur des numeros de recus et quittances.
    $queryRaw: jest.fn()
  };

  const prisma = {
    ...tx,
    $transaction: jest.fn(async (callback: any) => callback(tx))
  };

  return {
    PrismaClient: jest.fn(() => prisma),
    __mockPrisma: prisma,
    __mockTx: tx
  };
});

import { createChargeCallAndUpdateStatus, recordChargePaymentWithStatusUpdate } from '../../src/lib/syndics/queries';

type MockModel = Record<string, jest.Mock>;
const { __mockPrisma: mockPrisma, __mockTx: mockTx } = jest.requireMock('@prisma/client') as {
  __mockPrisma: { $transaction: jest.Mock };
  __mockTx: {
    chargeCall: MockModel;
    chargePayment: MockModel;
    chargePaymentAllocation: MockModel;
    syndicateLot: MockModel;
    syndicate: MockModel;
    syndicChargeReceipt: MockModel;
    $executeRaw: jest.Mock;
    $queryRaw: jest.Mock;
  };
};

/** Un appel du lot tel que relu par l'affectation (lot S2). */
function lotCall(id: string, amount: number) {
  return {
    id,
    period: '2026-Q2',
    periodStart: null,
    periodEnd: null,
    dueDate: new Date('2099-06-15T00:00:00.000Z'),
    createdAt: new Date('2026-04-01T00:00:00.000Z'),
    amount,
    currency: 'XOF',
    status: 'PENDING'
  };
}

/** Prepare un paiement sur un appel deja regle de `alreadyPaid`. */
function arrangePayment(callId: string, amount: number, alreadyPaid: number) {
  mockTx.chargeCall.findFirst.mockResolvedValue({ id: callId, lotId: 'lot-1', syndicateId: 'syndic-1' });
  mockTx.chargeCall.findMany.mockResolvedValue([lotCall(callId, amount)]);
  // Affectations relues : celles d'avant ce paiement, plus celles qu'il cree.
  mockTx.chargePaymentAllocation.findMany.mockImplementation(async () => [
    ...(alreadyPaid > 0
      ? [{ chargeCallId: callId, amount: alreadyPaid, paymentId: 'payment-0', createdAt: new Date('2026-04-01') }]
      : []),
    ...mockTx.chargePaymentAllocation.create.mock.calls.map(([args]: any) => ({ ...args.data, createdAt: new Date() }))
  ]);
  // Lot S3 : identite du lot et de la copropriete figee dans les documents.
  mockTx.syndicateLot.findFirst.mockResolvedValue({
    lotNumber: 'A-01',
    lotType: 'APARTMENT',
    owner: null,
    coowner: null
  });
  mockTx.chargePayment.create.mockImplementation(async ({ data }: any) => ({ id: 'payment-1', ...data }));
  // Avances du lot relues apres affectation : celle du paiement en cours s'il en laisse une.
  mockTx.chargePayment.findMany.mockImplementation(async () => {
    const created = mockTx.chargePayment.create.mock.calls[0]?.[0]?.data;
    return created && created.unallocatedAmount > 0
      ? [
          {
            id: 'payment-1',
            paidAt: created.paidAt,
            createdAt: new Date(),
            unallocatedAmount: created.unallocatedAmount
          }
        ]
      : [];
  });
}

describe('Syndics charges queries - US2', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockPrisma.$transaction.mockImplementation(async (callback: any) => callback(mockTx));
    // Lot S3 : aucun document existant ; numero et creation simules.
    mockTx.syndicate.findFirst.mockResolvedValue({ name: 'Residence', address: 'Abidjan', mandatingAgencyId: null });
    mockTx.syndicChargeReceipt.findMany.mockResolvedValue([]);
    mockTx.syndicChargeReceipt.create.mockImplementation(async ({ data }: any) => ({
      id: `doc-${data.number}`,
      kind: data.kind,
      number: data.number
    }));
    mockTx.$queryRaw.mockResolvedValue([{ last_value: 1 }]);
  });

  it('creates a charge call when lot belongs to tenant syndicate', async () => {
    mockTx.syndicateLot.findFirst.mockResolvedValue({ id: 'lot-1' });
    mockTx.chargePayment.findMany.mockResolvedValue([]);
    mockTx.chargeCall.create.mockResolvedValue({
      id: 'call-1',
      syndicateId: 'syndic-1',
      lotId: 'lot-1',
      period: '2026-Q1',
      amount: 120000,
      status: 'PENDING'
    });

    const result = await createChargeCallAndUpdateStatus('tenant-a', {
      syndicateId: 'syndic-1',
      lotId: 'lot-1',
      period: '2026-Q1',
      amount: 120000,
      currency: 'XOF',
      dueDate: new Date('2026-04-15T00:00:00.000Z')
    });

    expect(mockTx.syndicateLot.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'lot-1',
        syndicateId: 'syndic-1',
        syndicate: { tenantId: 'tenant-a' }
      },
      select: { id: true }
    });
    // Lot S2 : bornes deduites du libelle « 2026-Q1 ».
    expect(mockTx.chargeCall.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        periodStart: new Date('2026-01-01T00:00:00.000Z'),
        periodEnd: new Date('2026-03-31T00:00:00.000Z')
      })
    });
    expect(result.id).toBe('call-1');
  });

  it('updates charge status to PARTIAL when payment is below amount', async () => {
    arrangePayment('call-1', 100000, 30000);

    await recordChargePaymentWithStatusUpdate('tenant-a', {
      chargeCallId: 'call-1',
      amount: 30000,
      paidAt: new Date('2026-04-10T00:00:00.000Z'),
      method: 'VIREMENT',
      reference: 'PAY-001'
    });

    expect(mockTx.chargeCall.update).toHaveBeenCalledWith({
      where: { id: 'call-1' },
      data: { status: 'PARTIAL' }
    });
    expect(mockTx.chargePaymentAllocation.create).toHaveBeenCalledWith({
      data: { paymentId: 'payment-1', chargeCallId: 'call-1', amount: 30000, source: 'PAYMENT' }
    });
  });

  it('updates charge status to PAID when total paid reaches amount', async () => {
    // 30000 deja regle avant ce paiement de 70000 : le total atteint
    // exactement le montant de l'appel (100000), d'ou le statut PAID.
    arrangePayment('call-2', 100000, 30000);

    await recordChargePaymentWithStatusUpdate('tenant-a', {
      chargeCallId: 'call-2',
      amount: 70000,
      paidAt: new Date('2026-04-11T00:00:00.000Z'),
      method: 'VIREMENT',
      reference: 'PAY-002'
    });

    expect(mockTx.chargeCall.update).toHaveBeenCalledWith({
      where: { id: 'call-2' },
      data: { status: 'PAID' }
    });
    expect(mockTx.chargePayment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ amount: 70000, unallocatedAmount: 0, chargeCallId: 'call-2' })
    });
  });

  it('accepts an overpayment: the excess becomes a lot advance (no more 422, lot S2)', async () => {
    // Deja 80000 regles : le reste du est 20000. Avant le lot S2, un paiement
    // de 25000 etait refuse en 422 (FR-005) ; l'excedent devient desormais une
    // avance du lot, imputee sur les appels suivants.
    arrangePayment('call-3', 100000, 80000);

    const result = await recordChargePaymentWithStatusUpdate('tenant-a', {
      chargeCallId: 'call-3',
      amount: 25000,
      paidAt: new Date('2026-04-12T00:00:00.000Z'),
      method: 'VIREMENT'
    });

    expect(mockTx.chargePayment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ amount: 25000, unallocatedAmount: 5000, chargeCallId: 'call-3' })
    });
    expect(mockTx.chargePaymentAllocation.create).toHaveBeenCalledWith({
      data: { paymentId: 'payment-1', chargeCallId: 'call-3', amount: 20000, source: 'PAYMENT' }
    });
    expect(mockTx.chargeCall.update).toHaveBeenCalledWith({ where: { id: 'call-3' }, data: { status: 'PAID' } });
    expect(result.advance).toBe(5000);
    expect(result.lotAdvanceBalance).toBe(5000);
    // Lot S3 : appel solde -> quittance ; excedent en avance -> recu.
    expect(result.documents).toEqual([
      { id: 'doc-Q-2026-000001', kind: 'QUITTANCE', number: 'Q-2026-000001' },
      { id: 'doc-R-2026-000001', kind: 'RECEIPT', number: 'R-2026-000001' }
    ]);
  });

  it('rejects payment when charge call is outside tenant scope', async () => {
    mockTx.chargeCall.findFirst.mockResolvedValue(null);

    await expect(
      recordChargePaymentWithStatusUpdate('tenant-a', {
        chargeCallId: 'call-other-tenant',
        amount: 15000,
        paidAt: new Date('2026-04-11T00:00:00.000Z')
      })
    ).rejects.toMatchObject({ status: 404 });

    expect(mockTx.chargePayment.create).not.toHaveBeenCalled();
    expect(mockTx.chargeCall.update).not.toHaveBeenCalled();
  });
});
