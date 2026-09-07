jest.mock('@prisma/client', () => {
  const tx = {
    budgetAllocation: {
      deleteMany: jest.fn(),
      createMany: jest.fn(),
    },
    chargeCallBatch: {
      create: jest.fn(),
      findUnique: jest.fn(),
    },
    chargeCall: {
      createMany: jest.fn(),
    },
  };

  const prisma = {
    syndicate: {
      findFirst: jest.fn(),
    },
    chartOfAccount: {
      count: jest.fn(),
    },
    syndicateBudget: {
      findMany: jest.fn(),
      create: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      findUnique: jest.fn(),
    },
    syndicateLot: {
      findMany: jest.fn(),
    },
    budgetAllocation: {
      deleteMany: jest.fn(),
      createMany: jest.fn(),
      findMany: jest.fn(),
    },
    chargeCallBatch: {
      findMany: jest.fn(),
      create: jest.fn(),
    },
    chargeCall: {
      createMany: jest.fn(),
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
  createChargeCallBatchBySyndicate,
  generateChargeCallsFromBudget,
  recomputeBudgetAllocationsByBudget,
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
      lines: [
        { id: 'line-1', category: 'Maintenance', amountForecast: 100000, distributionKey: 'GENERAL_SHARES' },
      ],
    });
    mockPrisma.syndicateLot.findMany.mockResolvedValue([
      { id: 'lot-1', lotNumber: 'A-01', generalShares: 100, specialShares: 0 },
      { id: 'lot-2', lotNumber: 'A-02', generalShares: 300, specialShares: 0 },
    ]);
    mockPrisma.budgetAllocation.findMany.mockResolvedValue([
      { id: 'alloc-1', lotId: 'lot-1', totalAllocated: 25000, lot: { lotNumber: 'A-01' } },
      { id: 'alloc-2', lotId: 'lot-2', totalAllocated: 75000, lot: { lotNumber: 'A-02' } },
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
      totalAmount: 500000,
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
        { lotId: 'lot-2', totalAllocated: 60000 },
      ],
    });
    mockTx.chargeCallBatch.create.mockResolvedValue({ id: 'batch-1' });
    mockTx.chargeCallBatch.findUnique.mockResolvedValue({ id: 'batch-1', chargeCalls: [{ id: 'c1' }, { id: 'c2' }] });

    const result = await generateChargeCallsFromBudget('tenant-1', 'syndic-1', 'budget-1', {
      label: 'Appels Q2',
      period: '2026-Q2',
      dueDate: new Date('2026-04-30T00:00:00.000Z'),
      batchType: 'REGULAR',
    });

    expect(mockTx.chargeCall.createMany).toHaveBeenCalled();
    expect(result?.id).toBe('batch-1');
  });
});

