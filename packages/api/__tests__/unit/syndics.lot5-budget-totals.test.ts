jest.mock('@prisma/client', () => {
  const tx = {
    budgetAllocation: { deleteMany: jest.fn(), createMany: jest.fn() },
    chargeCallBatch: { create: jest.fn(), findUnique: jest.fn(), findFirst: jest.fn(async () => null) },
    chargeCall: { create: jest.fn() },
    chargePayment: { findMany: jest.fn().mockResolvedValue([]) },
    $executeRaw: jest.fn()
  };
  const prisma = {
    syndicate: { findFirst: jest.fn() },
    chartOfAccount: { count: jest.fn() },
    syndicateBudget: {
      findMany: jest.fn(),
      create: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      findUnique: jest.fn(),
      delete: jest.fn()
    },
    syndicateLot: { findMany: jest.fn() },
    syndicChargeSchedule: { findFirst: jest.fn() },
    gMResolution: { findFirst: jest.fn() },
    budgetAllocation: { deleteMany: jest.fn(), createMany: jest.fn(), findMany: jest.fn() },
    chargeCallBatch: { findMany: jest.fn(), findFirst: jest.fn(async () => null), create: jest.fn() },
    chargeCall: { createMany: jest.fn(), findFirst: jest.fn() },
    $transaction: jest.fn(async (callback: any) => callback(tx))
  };
  return { PrismaClient: jest.fn(() => prisma), __mockPrisma: prisma, __mockTx: tx };
});

import {
  createBudgetBySyndicate,
  generateChargeCallsFromBudget,
  listChargeCallBatchesBySyndicate,
  recomputeBudgetAllocationsByBudget,
  updateBudgetBySyndicate
} from '../../src/lib/syndics/queries';
import { computeLatePenalty, roundMoneyForCurrency } from '../../src/lib/syndics/finance-utils';
import { createBudgetSchema } from '../../src/lib/syndics/schemas';

const { __mockPrisma: mockPrisma, __mockTx: mockTx } = jest.requireMock('@prisma/client') as {
  __mockPrisma: any;
  __mockTx: any;
};

const lines = [
  { category: 'A', description: 'Poste A', amountForecast: 600000, distributionKey: 'EQUAL' as const },
  { category: 'B', description: 'Poste B', amountForecast: 400000, distributionKey: 'EQUAL' as const }
];

describe('Lot 5 - totaux de budget (H2)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.syndicate.findFirst.mockResolvedValue({ id: 'syndic-1' });
    mockPrisma.syndicateBudget.create.mockResolvedValue({ id: 'budget-1' });
    mockPrisma.syndicateBudget.findUnique.mockResolvedValue({ id: 'budget-1' });
    mockPrisma.syndicateBudget.findFirst.mockResolvedValue({
      id: 'budget-1',
      status: 'DRAFT',
      currency: 'XOF',
      lines: []
    });
    mockPrisma.syndicateLot.findMany.mockResolvedValue([{ id: 'lot-1', lotNumber: '1', generalShares: 1 }]);
    mockPrisma.budgetAllocation.findMany.mockResolvedValue([]);
  });

  it('le schema accepte un budget sans totalAmount', () => {
    const parsed = createBudgetSchema.safeParse({
      syndicateId: '11111111-1111-4111-8111-111111111111',
      fiscalYear: 2026,
      label: 'Budget',
      lines
    });
    expect(parsed.success).toBe(true);
  });

  it('refuse (422) un total fourni different de la somme des lignes', async () => {
    await expect(
      createBudgetBySyndicate('tenant-1', 'syndic-1', {
        fiscalYear: 2026,
        label: 'Budget',
        totalAmount: 1200000,
        currency: 'XOF',
        lines
      })
    ).rejects.toMatchObject({ status: 422 });
    expect(mockPrisma.syndicateBudget.create).not.toHaveBeenCalled();
  });

  it('calcule le total quand il est absent : somme des lignes', async () => {
    await createBudgetBySyndicate('tenant-1', 'syndic-1', { fiscalYear: 2026, label: 'Budget', lines });
    expect(mockPrisma.syndicateBudget.create.mock.calls[0][0].data.totalAmount).toBe(1000000);
  });

  it('accepte un total fourni egal a la somme et arrondit les lignes XOF au franc', async () => {
    await createBudgetBySyndicate('tenant-1', 'syndic-1', {
      fiscalYear: 2026,
      label: 'Budget',
      totalAmount: 1000,
      currency: 'XOF',
      lines: [
        { ...lines[0], amountForecast: 333.33 },
        { ...lines[1], amountForecast: 666.67 }
      ]
    });
    const data = mockPrisma.syndicateBudget.create.mock.calls[0][0].data;
    expect(data.totalAmount).toBe(1000);
    expect(data.lines.create.map((l: any) => l.amountForecast)).toEqual([333, 667]);
  });

  it('refuse (422) la mise a jour d un total different de la somme des lignes existantes', async () => {
    mockPrisma.syndicateBudget.findFirst.mockResolvedValue({
      id: 'budget-1',
      status: 'DRAFT',
      currency: 'XOF',
      lines: [{ amountForecast: 600000 }, { amountForecast: 400000 }]
    });
    await expect(
      updateBudgetBySyndicate('tenant-1', 'syndic-1', 'budget-1', { totalAmount: 900000 })
    ).rejects.toMatchObject({ status: 422 });
    expect(mockPrisma.syndicateBudget.update).not.toHaveBeenCalled();
  });

  it('accepte la mise a jour d un total egal a la somme et ne reecrit jamais le total', async () => {
    mockPrisma.syndicateBudget.findFirst.mockResolvedValue({
      id: 'budget-1',
      status: 'DRAFT',
      currency: 'XOF',
      lines: [{ amountForecast: 600000 }, { amountForecast: 400000 }]
    });
    mockPrisma.syndicateBudget.update.mockResolvedValue({ id: 'budget-1' });
    await updateBudgetBySyndicate('tenant-1', 'syndic-1', 'budget-1', { totalAmount: 1000000, label: 'N' });
    expect(mockPrisma.syndicateBudget.update.mock.calls[0][0].data.totalAmount).toBeUndefined();
  });
});

describe('Lot 5 - repartition en francs entiers (H3)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.syndicate.findFirst.mockResolvedValue({ id: 'syndic-1' });
    mockPrisma.budgetAllocation.findMany.mockResolvedValue([]);
  });

  it('repartit 100000 XOF entre 3 lots egaux en entiers, le dernier lot absorbe le reste', async () => {
    mockPrisma.syndicateBudget.findFirst.mockResolvedValue({
      id: 'budget-1',
      status: 'DRAFT',
      currency: 'XOF',
      lines: [{ id: 'l1', category: 'X', amountForecast: 100000, distributionKey: 'EQUAL' }]
    });
    mockPrisma.syndicateLot.findMany.mockResolvedValue([
      { id: 'lot-1', lotNumber: '1', generalShares: 1 },
      { id: 'lot-2', lotNumber: '2', generalShares: 1 },
      { id: 'lot-3', lotNumber: '3', generalShares: 1 }
    ]);
    await recomputeBudgetAllocationsByBudget('tenant-1', 'syndic-1', 'budget-1');
    const rows = mockTx.budgetAllocation.createMany.mock.calls[0][0].data as Array<{ totalAllocated: number }>;
    expect(rows.map(r => r.totalAllocated)).toEqual([33333, 33333, 33334]);
    expect(rows.every(r => Number.isInteger(r.totalAllocated))).toBe(true);
    expect(rows.reduce((s, r) => s + r.totalAllocated, 0)).toBe(100000);
  });

  it('garde le centime pour une devise avec sous-unite', async () => {
    mockPrisma.syndicateBudget.findFirst.mockResolvedValue({
      id: 'budget-1',
      status: 'DRAFT',
      currency: 'EUR',
      lines: [{ id: 'l1', category: 'X', amountForecast: 100, distributionKey: 'EQUAL' }]
    });
    mockPrisma.syndicateLot.findMany.mockResolvedValue([
      { id: 'lot-1', lotNumber: '1', generalShares: 1 },
      { id: 'lot-2', lotNumber: '2', generalShares: 1 },
      { id: 'lot-3', lotNumber: '3', generalShares: 1 }
    ]);
    await recomputeBudgetAllocationsByBudget('tenant-1', 'syndic-1', 'budget-1');
    const rows = mockTx.budgetAllocation.createMany.mock.calls[0][0].data as Array<{ totalAllocated: number }>;
    expect(rows.map(r => r.totalAllocated)).toEqual([33.33, 33.33, 33.34]);
  });

  it('penalite XOF entiere, au centime sinon, plafonnee au reste du', () => {
    expect(computeLatePenalty(100001, 3, 7, 'XOF')).toBe(700);
    expect(Number.isInteger(computeLatePenalty(123457, 2.5, 11, 'XOF'))).toBe(true);
    expect(computeLatePenalty(100001, 3, 7)).toBe(700.01);
    expect(computeLatePenalty(100, 10, 1000, 'XOF')).toBe(100);
    expect(roundMoneyForCurrency(-0.4, 'XOF')).toBe(0);
    expect(Object.is(roundMoneyForCurrency(-0.4, 'XOF'), -0)).toBe(false);
  });
});

describe('Lot 5 - total du lot d appels = somme des appels (H2)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.syndicate.findFirst.mockResolvedValue({ id: 'syndic-1' });
  });

  it('le total du lot est la somme des appels crees (hors lots a montant nul)', async () => {
    mockPrisma.syndicateBudget.findFirst.mockResolvedValue({
      id: 'budget-1',
      status: 'APPROVED',
      totalAmount: 999999,
      currency: 'XOF',
      allocations: [
        { lotId: 'lot-a', totalAllocated: 33333 },
        { lotId: 'lot-b', totalAllocated: 33333 },
        { lotId: 'lot-c', totalAllocated: 0 },
        { lotId: 'lot-d', totalAllocated: 33334 }
      ]
    });
    mockPrisma.syndicateLot.findMany.mockResolvedValue(
      ['a', 'b', 'c', 'd'].map(s => ({ id: `lot-${s}`, generalShares: 1 }))
    );
    mockTx.chargeCallBatch.create.mockResolvedValue({ id: 'batch-1' });
    mockTx.chargeCallBatch.findUnique.mockResolvedValue({ id: 'batch-1', chargeCalls: [] });
    mockTx.chargeCall.create.mockImplementation(async ({ data }: any) => ({ id: `call-${data.lotId}`, ...data }));

    await generateChargeCallsFromBudget('tenant-1', 'syndic-1', 'budget-1', {
      label: 'Appels',
      period: '2026-EXC',
      dueDate: new Date('2026-04-30T00:00:00.000Z'),
      batchType: 'EXCEPTIONAL'
    });

    expect(mockTx.chargeCall.create).toHaveBeenCalledTimes(3);
    const created = mockTx.chargeCall.create.mock.calls.reduce((s: number, c: any[]) => s + c[0].data.amount, 0);
    expect(mockTx.chargeCallBatch.create.mock.calls[0][0].data.totalAmount).toBe(created);
    expect(created).toBe(100000);
  });

  it('la liste des lots affiche la somme des appels, meme sur donnees historiques', async () => {
    mockPrisma.chargeCallBatch.findMany.mockResolvedValue([
      { id: 'b1', currency: 'XOF', totalAmount: 5000000, chargeCalls: [{ amount: 100.4 }, { amount: 200.4 }] },
      { id: 'b2', currency: 'XOF', totalAmount: 777, chargeCalls: [] }
    ]);
    const result = await listChargeCallBatchesBySyndicate('tenant-1', 'syndic-1');
    expect(result[0].totalAmount).toBe(301);
    expect(result[1].totalAmount).toBe(777);
  });
});
