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
    syndicChargeSchedule: {
      findFirst: jest.fn()
    },
    gMResolution: {
      findFirst: jest.fn()
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
  recomputeBudgetAllocationsByBudget,
  updateBudgetBySyndicate
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

  it('repartit un appel « ascenseur » par tantièmes spéciaux : 250 000 par lot A, 0 ailleurs (scénario F.5)', async () => {
    mockPrisma.syndicateBudget.findFirst.mockResolvedValue({
      id: 'budget-2',
      lines: [{ id: 'line-1', category: 'Travaux', amountForecast: 1000000, distributionKey: 'SPECIAL_SHARES' }]
    });
    // Lots du scénario 1.5 : tantièmes spéciaux saisis sur les seuls lots A.
    mockPrisma.syndicateLot.findMany.mockResolvedValue([
      { id: 'A101', lotNumber: 'A101', generalShares: 150, specialShares: 250 },
      { id: 'A102', lotNumber: 'A102', generalShares: 150, specialShares: 250 },
      { id: 'A201', lotNumber: 'A201', generalShares: 150, specialShares: 250 },
      { id: 'A202', lotNumber: 'A202', generalShares: 150, specialShares: 250 },
      { id: 'B01', lotNumber: 'B01', generalShares: 200, specialShares: null },
      { id: 'B02', lotNumber: 'B02', generalShares: 100, specialShares: null },
      { id: 'P01', lotNumber: 'P01', generalShares: 50, specialShares: null },
      { id: 'P02', lotNumber: 'P02', generalShares: 50, specialShares: null }
    ]);
    mockPrisma.budgetAllocation.findMany.mockResolvedValue([]);

    await recomputeBudgetAllocationsByBudget('tenant-1', 'syndic-1', 'budget-2');

    const rows = mockTx.budgetAllocation.createMany.mock.calls[0][0].data as Array<{
      lotId: string;
      totalAllocated: number;
    }>;
    const byLot = Object.fromEntries(rows.map(r => [r.lotId, r.totalAllocated]));
    expect(byLot).toEqual({
      A101: 250000,
      A102: 250000,
      A201: 250000,
      A202: 250000,
      B01: 0,
      B02: 0,
      P01: 0,
      P02: 0
    });
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

describe('Syndics budget status transitions - anomalie N.8-2', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.syndicate.findFirst.mockResolvedValue({ id: 'syndic-1' });
    mockPrisma.syndicChargeSchedule.findFirst.mockResolvedValue(null);
    mockPrisma.syndicateBudget.update.mockImplementation(async ({ where, data }: any) => ({
      id: where.id,
      ...data,
      lines: [],
      allocations: []
    }));
  });

  const mockBudget = (status: string) =>
    mockPrisma.syndicateBudget.findFirst.mockResolvedValue({ id: 'budget-1', status });

  it.each([
    ['DRAFT', 'APPROVED'],
    ['APPROVED', 'REVISED'],
    ['REVISED', 'APPROVED'],
    ['APPROVED', 'CLOSED'],
    ['REVISED', 'CLOSED']
  ])('autorise la transition %s -> %s', async (from, to) => {
    mockBudget(from);
    const result = await updateBudgetBySyndicate('tenant-1', 'syndic-1', 'budget-1', { status: to as any });
    expect(result.status).toBe(to);
    expect(mockPrisma.syndicateBudget.update).toHaveBeenCalled();
  });

  it.each([
    ['DRAFT', 'CLOSED'],
    ['DRAFT', 'REVISED'],
    ['CLOSED', 'DRAFT'],
    ['CLOSED', 'APPROVED']
  ])('refuse la transition %s -> %s (409)', async (from, to) => {
    mockBudget(from);
    await expect(
      updateBudgetBySyndicate('tenant-1', 'syndic-1', 'budget-1', { status: to as any })
    ).rejects.toMatchObject({ status: 409 });
    expect(mockPrisma.syndicateBudget.update).not.toHaveBeenCalled();
  });

  it('refuse toute modification (label, montant) d un budget clôturé', async () => {
    mockBudget('CLOSED');
    await expect(
      updateBudgetBySyndicate('tenant-1', 'syndic-1', 'budget-1', { label: 'Nouveau libellé' })
    ).rejects.toMatchObject({ status: 409 });
    expect(mockPrisma.syndicateBudget.update).not.toHaveBeenCalled();
  });

  it('refuse la clôture si une programmation active pointe sur le budget', async () => {
    mockBudget('APPROVED');
    mockPrisma.syndicChargeSchedule.findFirst.mockResolvedValue({ id: 'schedule-1' });
    await expect(
      updateBudgetBySyndicate('tenant-1', 'syndic-1', 'budget-1', { status: 'CLOSED' })
    ).rejects.toMatchObject({ status: 409 });
    expect(mockPrisma.syndicateBudget.update).not.toHaveBeenCalled();
    // Seules les programmations actives et non terminées bloquent.
    const where = mockPrisma.syndicChargeSchedule.findFirst.mock.calls[0][0].where;
    expect(where).toMatchObject({ tenantId: 'tenant-1', budgetId: 'budget-1', active: true });
    expect(where.OR).toEqual([{ endDate: null }, { endDate: { gte: expect.any(Date) } }]);
  });

  it('refuse le recalcul de répartition sur un budget clôturé', async () => {
    mockPrisma.syndicateBudget.findFirst.mockResolvedValue({ id: 'budget-1', status: 'CLOSED', lines: [] });
    await expect(recomputeBudgetAllocationsByBudget('tenant-1', 'syndic-1', 'budget-1')).rejects.toMatchObject({
      status: 409
    });
  });

  it('refuse la génération d appels sur un budget clôturé (deja bloque par le controle APPROVED)', async () => {
    mockPrisma.syndicateBudget.findFirst.mockResolvedValue({
      id: 'budget-1',
      status: 'CLOSED',
      totalAmount: 100000,
      currency: 'XOF',
      allocations: []
    });
    await expect(
      generateChargeCallsFromBudget('tenant-1', 'syndic-1', 'budget-1', {
        label: 'Appels',
        period: '2026-01',
        dueDate: new Date('2026-01-31T00:00:00.000Z'),
        batchType: 'REGULAR'
      })
    ).rejects.toMatchObject({ status: 422 });
  });

  it('isolation tenant : budget d une autre agence -> NotFound', async () => {
    mockPrisma.syndicateBudget.findFirst.mockResolvedValue(null);
    await expect(
      updateBudgetBySyndicate('tenant-1', 'syndic-1', 'budget-inconnu', { status: 'APPROVED' })
    ).rejects.toMatchObject({ status: 404 });
  });
});
