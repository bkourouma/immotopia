/**
 * BUG-2026-09-30-078 : un lot saisi par erreur se supprime (sans mouvement) ou
 * se desactive (tantiemes a 0) : il sort de la cle de repartition, de la
 * reserve de lots et des appels futurs ; l'historique reste intact.
 */

jest.mock('@prisma/client', () => {
  const counts: Record<string, number> = {};
  const count = (name: string) => jest.fn(async () => counts[name] ?? 0);
  const tx: any = {
    __counts: counts,
    $executeRaw: jest.fn(),
    chargeCall: { count: count('chargeCall') },
    chargePayment: { count: count('chargePayment') },
    syndicChargeReceipt: { count: count('syndicChargeReceipt') },
    journalEntryLine: { count: count('journalEntryLine') },
    gMVote: { count: count('gMVote') },
    syndicateIncident: { count: count('syndicateIncident') },
    incidentCostImputation: { count: count('incidentCostImputation') },
    paymentReminder: { count: count('paymentReminder') },
    latePaymentPenalty: { count: count('latePaymentPenalty') },
    paymentSchedule: { count: count('paymentSchedule') },
    ownerAccountTransaction: { count: count('ownerAccountTransaction') },
    budgetAllocation: { deleteMany: jest.fn(), createMany: jest.fn() },
    lotOwnerProfile: { deleteMany: jest.fn() },
    lotTenantProfile: { deleteMany: jest.fn() },
    lotTenantAssignment: { deleteMany: jest.fn() },
    ownerAccount: { deleteMany: jest.fn() },
    syndicateLot: { delete: jest.fn(), count: jest.fn(async () => 6), update: jest.fn() },
    syndicate: { update: jest.fn() }
  };
  const prisma: any = {
    syndicate: { findFirst: jest.fn(async () => ({ id: 's1' })) },
    syndicateLot: { findFirst: jest.fn(), findMany: jest.fn() },
    syndicateBudget: { findFirst: jest.fn(), findMany: jest.fn(async () => []) },
    budgetAllocation: { findMany: jest.fn(async () => []) },
    $transaction: jest.fn(async (cb: any) => cb(tx))
  };
  return { PrismaClient: jest.fn(() => prisma), __mockPrisma: prisma, __mockTx: tx };
});

jest.mock('../../src/services/lot-registry-service', () => ({
  syncLotActivationsTx: jest.fn(async () => ({ activated: [], deactivated: [] })),
  assertCapacityTx: jest.fn(),
  resolveLotScope: jest.fn(),
  ACTIVE_SYNDICATE_STATUSES: ['ACTIVE', 'IN_DISPUTE'],
  LOT_QUOTA_REACHED_REASON: 'Quota de lots atteint'
}));

import {
  deleteSyndicateLotByTenant,
  recomputeBudgetAllocationsByBudget,
  updateSyndicateLotByTenant
} from '../../src/lib/syndics/queries';
import { ConflictError } from '../../src/middleware/error-middleware';
import { updateLotSchema, createLotSchema } from '../../src/lib/syndics/schemas';

const { __mockPrisma: mockPrisma, __mockTx: mockTx } = jest.requireMock('@prisma/client') as any;
const registry = jest.requireMock('../../src/services/lot-registry-service') as { syncLotActivationsTx: jest.Mock };

describe("Suppression d'un lot (BUG-078)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    for (const key of Object.keys(mockTx.__counts)) delete mockTx.__counts[key];
    mockPrisma.syndicateLot.findFirst.mockResolvedValue({ id: 'lot-p01', propertyId: null, lotNumber: 'P01' });
  });

  it('supprime un lot sans mouvement, ses rattachements vides, et libere la jauge', async () => {
    await deleteSyndicateLotByTenant('t1', 's1', 'lot-p01');

    expect(mockTx.budgetAllocation.deleteMany).toHaveBeenCalledWith({ where: { lotId: 'lot-p01' } });
    expect(mockTx.syndicateLot.delete).toHaveBeenCalledWith({ where: { id: 'lot-p01' } });
    expect(registry.syncLotActivationsTx).toHaveBeenCalledWith(
      mockTx,
      't1',
      expect.objectContaining({ syndicateLotIds: ['lot-p01'] }),
      expect.objectContaining({ reason: 'LOT_DELETED' })
    );
  });

  it.each(['chargeCall', 'chargePayment', 'syndicChargeReceipt', 'ownerAccountTransaction'])(
    'refuse (409) un lot qui a des mouvements : %s',
    async movement => {
      mockTx.__counts[movement] = 2;
      const error = await deleteSyndicateLotByTenant('t1', 's1', 'lot-p01').catch(e => e);
      expect(error).toBeInstanceOf(ConflictError);
      expect(error.statusCode).toBe(409);
      expect(error.message).toContain('Désactivez-le');
      expect(mockTx.syndicateLot.delete).not.toHaveBeenCalled();
    }
  );

  it("un lot d'une autre agence est introuvable", async () => {
    mockPrisma.syndicateLot.findFirst.mockResolvedValue(null);
    await expect(deleteSyndicateLotByTenant('t2', 's1', 'lot-p01')).rejects.toThrow(/introuvable/);
    expect(mockPrisma.syndicateLot.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ syndicate: { tenantId: 't2' } }) })
    );
  });

  it('accepte 0 tantieme (lot desactive) a la creation comme a la modification', () => {
    expect(updateLotSchema.safeParse({ tantiemes: 0 }).success).toBe(true);
    expect(updateLotSchema.safeParse({ tantiemes: -1 }).success).toBe(false);
    expect(
      createLotSchema.safeParse({
        syndicateId: '11111111-1111-4111-8111-111111111111',
        lotNumber: 'P01',
        lotType: 'PARKING',
        tantiemes: 0
      }).success
    ).toBe(true);
  });
});

describe('Cle de repartition sans le lot desactive (BUG-078)', () => {
  const lots = (parkingShares: number) => [
    ...['A1', 'A2', 'A3', 'A4', 'A5', 'A6'].map((n, i) => ({
      id: `lot-${n}`,
      lotNumber: n,
      generalShares: i < 2 ? 200 : 150,
      specialShares: null
    })),
    { id: 'lot-p01', lotNumber: 'P01', generalShares: parkingShares, specialShares: null }
  ];

  const allocate = async (parkingShares: number) => {
    mockPrisma.syndicateBudget.findFirst.mockResolvedValue({
      id: 'b1',
      status: 'DRAFT',
      lines: [{ id: 'l1', category: 'Ascenseur', amountForecast: 1060000, distributionKey: 'GENERAL_SHARES' }]
    });
    mockPrisma.syndicateLot.findMany.mockResolvedValue(lots(parkingShares));
    mockTx.budgetAllocation.createMany.mockClear();
    await recomputeBudgetAllocationsByBudget('t1', 's1', 'b1');
    const rows = mockTx.budgetAllocation.createMany.mock.calls[0][0].data as Array<{
      lotId: string;
      totalAllocated: number;
    }>;
    return Object.fromEntries(rows.map(row => [row.lotId, row.totalAllocated]));
  };

  it('avec le parking (50 tantiemes) : les 6 appartements (1 000) ne portent que 1 000/1 050 du budget', async () => {
    const before = await allocate(50);
    // 1 060 000 x 200 / 1 050 = 201 904,76 ; le parking recoit 50 476,19.
    expect(before['lot-A1']).toBeCloseTo(201904.76, 1);
    expect(before['lot-p01']).toBeCloseTo(50476.19, 1);
  });

  it('parking ramene a 0 : les 6 appartements portent 100 % du budget, le parking 0, sans division par zero', async () => {
    const after = await allocate(0);
    // 1 060 000 x 200 / 1 000 = 212 000 ; 150 -> 159 000.
    expect(after['lot-A1']).toBe(212000);
    expect(after['lot-A3']).toBe(159000);
    expect(after['lot-p01']).toBe(0);
    const total = Object.values(after).reduce((sum, value) => sum + value, 0);
    expect(Math.round(total)).toBe(1060000);
  });
});

describe('Desactivation / suppression d un lot : repartition des budgets ouverts recalculee (M1)', () => {
  const lots = [
    ...['A1', 'A2', 'A3', 'A4', 'A5', 'A6'].map((n, i) => ({
      id: `lot-${n}`,
      lotNumber: n,
      generalShares: i < 2 ? 200 : 150,
      specialShares: null
    })),
    { id: 'lot-p01', lotNumber: 'P01', generalShares: 0, specialShares: null }
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.syndicateLot.findFirst.mockResolvedValue({ id: 'lot-p01', propertyId: null, lotNumber: 'P01' });
    mockTx.syndicateLot.update.mockResolvedValue({ id: 'lot-p01', propertyId: null });
    mockPrisma.syndicateLot.findMany.mockResolvedValue(lots);
    mockPrisma.syndicateBudget.findMany.mockResolvedValue([{ id: 'b1' }]);
    mockPrisma.syndicateBudget.findFirst.mockResolvedValue({
      id: 'b1',
      status: 'APPROVED',
      lines: [{ id: 'l1', category: 'Ascenseur', amountForecast: 1060000, distributionKey: 'GENERAL_SHARES' }]
    });
  });

  const recomputed = () => {
    const rows = mockTx.budgetAllocation.createMany.mock.calls[0][0].data as Array<{
      lotId: string;
      totalAllocated: number;
    }>;
    return Object.fromEntries(rows.map(row => [row.lotId, row.totalAllocated]));
  };

  it('lot ramene a 0 tantieme : les budgets non clotures repartis sont recalcules, le lot n est plus appele', async () => {
    await updateSyndicateLotByTenant('t1', 's1', 'lot-p01', { tantiemes: 0 });

    expect(mockPrisma.syndicateBudget.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ syndicateId: 's1', status: { not: 'CLOSED' }, allocations: { some: {} } })
      })
    );
    const after = recomputed();
    expect(after['lot-p01']).toBe(0);
    expect(after['lot-A1']).toBe(212000);
    expect(Object.values(after).reduce((sum, value) => sum + value, 0)).toBe(1060000);
  });

  it('une modification sans tantieme ne touche pas aux repartitions', async () => {
    await updateSyndicateLotByTenant('t1', 's1', 'lot-p01', { surface: 12 });
    expect(mockPrisma.syndicateBudget.findMany).not.toHaveBeenCalled();
  });

  it('suppression d un lot sans mouvement : les allocations restantes somment de nouveau au budget', async () => {
    await deleteSyndicateLotByTenant('t1', 's1', 'lot-p01');
    expect(mockPrisma.syndicateBudget.findMany).toHaveBeenCalled();
    expect(Object.values(recomputed()).reduce((sum, value) => sum + value, 0)).toBe(1060000);
  });
});
