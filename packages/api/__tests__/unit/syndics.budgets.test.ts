jest.mock('@prisma/client', () => {
  const tx = {
    budgetAllocation: {
      deleteMany: jest.fn(),
      createMany: jest.fn()
    },
    chargeCallBatch: {
      create: jest.fn(),
      findUnique: jest.fn(),
      // Lot S4 : garde anti-doublon de période (aucun lot existant par défaut).
      findFirst: jest.fn()
    },
    chargeCall: {
      createMany: jest.fn(),
      // `generateChargeCallsFromBudget` cree desormais chaque ChargeCall un
      // par un (au lieu d'un `createMany` groupe) pour recuperer son
      // identifiant et l'accrocher a une ecriture de compte de lot — voir
      // le commentaire dans queries.ts (constat de recette, module 7 du
      // scenario). Ce mock ne definit pas `tx.ownerAccount` : le debit du
      // grand livre se no-op donc silencieusement (supportsOwnerAccount),
      // seul `create` importe pour ce test.
      create: jest.fn()
    },
    // Lot S2 : chaque appel cree impute l'avance du lot (applyLotAdvanceTx),
    // sous un verrou consultatif. Aucune avance ici : lecture vide, verrou no-op.
    chargePayment: {
      findMany: jest.fn().mockResolvedValue([])
    },
    $executeRaw: jest.fn()
  };

  const prisma = {
    syndicate: {
      findFirst: jest.fn()
    },
    chartOfAccount: {
      count: jest.fn()
    },
    syndicateBudget: {
      findMany: jest.fn(),
      create: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      findUnique: jest.fn()
    },
    syndicateLot: {
      findMany: jest.fn()
    },
    budgetAllocation: {
      deleteMany: jest.fn(),
      createMany: jest.fn(),
      findMany: jest.fn()
    },
    chargeCallBatch: {
      findMany: jest.fn(),
      create: jest.fn()
    },
    chargeCall: {
      createMany: jest.fn()
    },
    $transaction: jest.fn(async (callback: any) => callback(tx))
  };

  return {
    PrismaClient: jest.fn(() => prisma),
    __mockPrisma: prisma,
    __mockTx: tx
  };
});

import {
  createChargeCallBatchBySyndicate,
  generateChargeCallsFromBudget,
  recomputeBudgetAllocationsByBudget
} from '../../src/lib/syndics/queries';

const { __mockPrisma: mockPrisma, __mockTx: mockTx } = jest.requireMock('@prisma/client') as {
  __mockPrisma: any;
  __mockTx: any;
};

describe('Syndics budget queries - US4', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.syndicate.findFirst.mockResolvedValue({ id: 'syndic-1' });
  });

  it('recomputes budget allocations by lots', async () => {
    mockPrisma.syndicateBudget.findFirst.mockResolvedValue({
      id: 'budget-1',
      lines: [{ id: 'line-1', category: 'Maintenance', amountForecast: 100000, distributionKey: 'GENERAL_SHARES' }]
    });
    mockPrisma.syndicateLot.findMany.mockResolvedValue([
      { id: 'lot-1', lotNumber: 'A-01', generalShares: 100, specialShares: 0 },
      { id: 'lot-2', lotNumber: 'A-02', generalShares: 300, specialShares: 0 }
    ]);
    mockPrisma.budgetAllocation.findMany.mockResolvedValue([
      { id: 'alloc-1', lotId: 'lot-1', totalAllocated: 25000, lot: { lotNumber: 'A-01' } },
      { id: 'alloc-2', lotId: 'lot-2', totalAllocated: 75000, lot: { lotNumber: 'A-02' } }
    ]);

    const allocations = await recomputeBudgetAllocationsByBudget('tenant-1', 'syndic-1', 'budget-1');
    expect(mockTx.budgetAllocation.createMany).toHaveBeenCalled();
    expect(allocations).toHaveLength(2);
  });

  it('creates standalone charge call batch', async () => {
    mockPrisma.chargeCallBatch.create.mockResolvedValue({ id: 'batch-1', label: 'Batch Mars' });
    const batch = await createChargeCallBatchBySyndicate('tenant-1', 'syndic-1', {
      label: 'Batch Mars',
      period: '2026-03',
      dueDate: new Date('2026-03-31T00:00:00.000Z'),
      batchType: 'REGULAR',
      totalAmount: 500000
    });
    expect(batch.id).toBe('batch-1');
  });

  it('generates charge calls from approved budget', async () => {
    mockPrisma.syndicateBudget.findFirst.mockResolvedValue({
      id: 'budget-1',
      status: 'APPROVED',
      totalAmount: 100000,
      currency: 'XOF',
      allocations: [
        { lotId: 'lot-1', totalAllocated: 40000 },
        { lotId: 'lot-2', totalAllocated: 60000 }
      ]
    });
    mockTx.chargeCallBatch.create.mockResolvedValue({ id: 'batch-1' });
    mockTx.chargeCallBatch.findUnique.mockResolvedValue({ id: 'batch-1', chargeCalls: [{ id: 'c1' }, { id: 'c2' }] });
    mockTx.chargeCall.create
      .mockResolvedValueOnce({ id: 'c1', lotId: 'lot-1' })
      .mockResolvedValueOnce({ id: 'c2', lotId: 'lot-2' });

    const result = await generateChargeCallsFromBudget('tenant-1', 'syndic-1', 'budget-1', {
      label: 'Appels Q2',
      period: '2026-Q2',
      dueDate: new Date('2026-04-30T00:00:00.000Z'),
      batchType: 'REGULAR'
    });

    // Un ChargeCall par lot, cree individuellement (pas de createMany) pour
    // recuperer son identifiant et debiter le compte du lot correspondant.
    expect(mockTx.chargeCall.create).toHaveBeenCalledTimes(2);
    expect(result?.id).toBe('batch-1');

    // Lot S2 : bornes deduites du libelle « 2026-Q2 » (trimestre), sur le lot
    // d'appels comme sur chaque appel.
    const bounds = {
      periodStart: new Date('2026-04-01T00:00:00.000Z'),
      periodEnd: new Date('2026-06-30T00:00:00.000Z')
    };
    expect(mockTx.chargeCallBatch.create).toHaveBeenCalledWith({ data: expect.objectContaining(bounds) });
    expect(mockTx.chargeCall.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ ...bounds, batchId: 'batch-1', lotId: 'lot-1', amount: 40000 })
    });
    // Verrou du lot pris pour chaque appel, par identifiant de lot croissant
    // (ordre global : pas d'interblocage entre deux generations concurrentes).
    expect(mockTx.$executeRaw).toHaveBeenCalled();
  });

  it('prend les verrous de lot par identifiant croissant, quel que soit l ordre des allocations', async () => {
    mockPrisma.syndicateBudget.findFirst.mockResolvedValue({
      id: 'budget-1',
      status: 'APPROVED',
      totalAmount: 100000,
      currency: 'XOF',
      allocations: [
        { lotId: 'lot-b', totalAllocated: 60000 },
        { lotId: 'lot-a', totalAllocated: 40000 }
      ]
    });
    mockTx.chargeCallBatch.create.mockResolvedValue({ id: 'batch-1' });
    mockTx.chargeCallBatch.findUnique.mockResolvedValue({ id: 'batch-1', chargeCalls: [] });
    mockTx.chargeCall.create.mockImplementation(async ({ data }: any) => ({ id: `call-${data.lotId}`, ...data }));
    mockTx.$executeRaw.mockClear();

    await generateChargeCallsFromBudget('tenant-1', 'syndic-1', 'budget-1', {
      label: 'Appels Q2',
      period: '2026-Q2',
      dueDate: new Date('2026-04-30T00:00:00.000Z'),
      batchType: 'REGULAR'
    });

    const lockedLots = mockTx.$executeRaw.mock.calls
      .map((call: any[]) => String(call[1]))
      .filter((key: string) => key.startsWith('syndic-lot-allocation:'))
      .map((key: string) => key.slice('syndic-lot-allocation:'.length))
      .filter((lotId: string, index: number, all: string[]) => index === 0 || all[index - 1] !== lotId);
    expect(lockedLots).toEqual(['lot-a', 'lot-b']);
  });
});
