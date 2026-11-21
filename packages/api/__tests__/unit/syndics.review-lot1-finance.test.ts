/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Revue fonctionnelle du noyau financier Syndic (lot 1) : non-regression des
 * anomalies corrigees.
 *  - remise de penalite rejouee = double credit du compte du lot ;
 *  - penalite creee deja remise = debit sans remise ;
 *  - contrat de maintenance : prestataire d'une autre agence, fin avant debut ;
 *  - budget cree puis erreur de repartition = budget orphelin ;
 *  - echeance des appels recurrents (fin de mois) ;
 *  - releve de compte : borne `to` en jour seul inclusive ;
 *  - liste des lots d'appels : statut inconnu refuse.
 */
jest.mock('../../src/lib/syndics/owner-account-tx', () => ({
  ensureCrmRoleForContact: jest.fn(),
  ensureOwnerAccountForLotTx: jest.fn(async () => ({ id: 'account-1' }))
}));
jest.mock('../../src/lib/finance/ledger', () => ({
  appendOwnerAccountTransactionTx: jest.fn(async () => ({ id: 'ledger-1' }))
}));
jest.mock('@prisma/client', () => {
  const tx = {
    latePaymentPenalty: {
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn()
    }
  };
  const prisma = {
    syndicate: { findFirst: jest.fn() },
    chargeCall: { findFirst: jest.fn() },
    latePaymentPenalty: { findFirst: jest.fn() },
    maintenanceContract: { findFirst: jest.fn(), update: jest.fn(), create: jest.fn() },
    serviceProvider: { findFirst: jest.fn() },
    syndicateBudget: { create: jest.fn(), delete: jest.fn(), findFirst: jest.fn() },
    syndicateLot: { findMany: jest.fn() },
    chargeCallBatch: { findFirst: jest.fn(), create: jest.fn() },
    $transaction: jest.fn(async (callback: any) => callback(tx))
  };
  return { PrismaClient: jest.fn(() => prisma), __mockPrisma: prisma, __mockTx: tx };
});

import {
  createChargeCallBatchBySyndicate,
  createBudgetBySyndicate,
  createLatePaymentPenaltyForChargeCall,
  shiftChargeDueDate,
  updateMaintenanceContractByTenant,
  waiveLatePaymentPenaltyByTenant
} from '../../src/lib/syndics/queries';
import { chargeCallBatchListQuerySchema, ownerAccountStatementQuerySchema } from '../../src/lib/syndics/schemas';
import { appendOwnerAccountTransactionTx } from '../../src/lib/finance/ledger';

const { __mockPrisma: prisma, __mockTx: tx } = jest.requireMock('@prisma/client') as {
  __mockPrisma: Record<string, Record<string, jest.Mock>> & { $transaction: jest.Mock };
  __mockTx: { latePaymentPenalty: Record<string, jest.Mock> };
};
const appendLedger = appendOwnerAccountTransactionTx as unknown as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  prisma.syndicate.findFirst.mockResolvedValue({ id: 'syndic-1' });
});

describe('remise de penalite', () => {
  it('refuse de remettre deux fois la meme penalite (un seul credit au compte du lot)', async () => {
    prisma.latePaymentPenalty.findFirst.mockResolvedValue({
      id: 'pen-1',
      penaltyAmount: 5000,
      lotId: 'lot-1',
      waived: true
    });

    await expect(
      waiveLatePaymentPenaltyByTenant('tenant-1', 'syndic-1', 'pen-1', 'Geste commercial')
    ).rejects.toMatchObject({
      status: 409
    });
    expect(tx.latePaymentPenalty.updateMany).not.toHaveBeenCalled();
    expect(appendLedger).not.toHaveBeenCalled();
  });

  it('une remise concurrente deja passee (count 0) ne recredite pas le compte', async () => {
    prisma.latePaymentPenalty.findFirst.mockResolvedValue({
      id: 'pen-1',
      penaltyAmount: 5000,
      lotId: 'lot-1',
      waived: false
    });
    tx.latePaymentPenalty.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      waiveLatePaymentPenaltyByTenant('tenant-1', 'syndic-1', 'pen-1', 'Geste commercial')
    ).rejects.toMatchObject({
      status: 409
    });
    expect(appendLedger).not.toHaveBeenCalled();
  });

  it('une premiere remise credite une fois le montant de la penalite', async () => {
    prisma.latePaymentPenalty.findFirst.mockResolvedValue({
      id: 'pen-1',
      penaltyAmount: 5000,
      lotId: 'lot-1',
      waived: false
    });
    tx.latePaymentPenalty.updateMany.mockResolvedValue({ count: 1 });
    tx.latePaymentPenalty.update.mockResolvedValue({ id: 'pen-1', waived: true });

    await waiveLatePaymentPenaltyByTenant('tenant-1', 'syndic-1', 'pen-1', 'Geste commercial');

    expect(tx.latePaymentPenalty.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'pen-1', waived: false } })
    );
    expect(appendLedger).toHaveBeenCalledTimes(1);
    expect(appendLedger).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ type: 'WAIVER', credit: 5000, sourceId: 'pen-1' })
    );
  });
});

describe('creation de penalite', () => {
  const call = {
    id: 'charge-1',
    lotId: 'lot-1',
    dueDate: new Date('2026-01-01T00:00:00.000Z'),
    amount: 100000,
    allocations: []
  };

  it('une penalite creee deja remise ne debite pas le compte du lot', async () => {
    prisma.chargeCall.findFirst.mockResolvedValue(call);
    tx.latePaymentPenalty.create.mockResolvedValue({ id: 'pen-9', penaltyAmount: 2000 });

    await createLatePaymentPenaltyForChargeCall('tenant-1', 'syndic-1', 'charge-1', {
      penaltyRate: 5,
      waived: true,
      waivedReason: 'Accord'
    });

    expect(tx.latePaymentPenalty.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ waived: true, waivedAt: expect.any(Date) }) })
    );
    expect(appendLedger).not.toHaveBeenCalled();
  });

  it('une penalite normale debite le compte du lot', async () => {
    prisma.chargeCall.findFirst.mockResolvedValue(call);
    tx.latePaymentPenalty.create.mockResolvedValue({ id: 'pen-10', penaltyAmount: 2000 });

    await createLatePaymentPenaltyForChargeCall('tenant-1', 'syndic-1', 'charge-1', { penaltyRate: 5 });

    expect(appendLedger).toHaveBeenCalledWith(tx, expect.objectContaining({ type: 'PENALTY', sourceId: 'pen-10' }));
  });
});

describe('contrat de maintenance', () => {
  it("refuse un prestataire d'une autre agence a la mise a jour (meme 404 qu'un inexistant)", async () => {
    prisma.maintenanceContract.findFirst.mockResolvedValue({
      id: 'c1',
      startDate: new Date('2026-01-01'),
      endDate: null
    });
    prisma.serviceProvider.findFirst.mockResolvedValue(null);

    await expect(
      updateMaintenanceContractByTenant('tenant-1', 'syndic-1', 'c1', { providerId: 'provider-autre-agence' })
    ).rejects.toMatchObject({ status: 404 });
    expect(prisma.serviceProvider.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'provider-autre-agence', tenantId: 'tenant-1' } })
    );
    expect(prisma.maintenanceContract.update).not.toHaveBeenCalled();
  });

  it('refuse une fin de contrat anterieure au debut deja enregistre', async () => {
    prisma.maintenanceContract.findFirst.mockResolvedValue({
      id: 'c1',
      startDate: new Date('2026-06-01'),
      endDate: null
    });

    await expect(
      updateMaintenanceContractByTenant('tenant-1', 'syndic-1', 'c1', { endDate: new Date('2026-01-01') })
    ).rejects.toMatchObject({ status: 422 });
    expect(prisma.maintenanceContract.update).not.toHaveBeenCalled();
  });

  it('accepte une mise a jour sans date ni prestataire', async () => {
    prisma.maintenanceContract.findFirst.mockResolvedValue({
      id: 'c1',
      startDate: new Date('2026-06-01'),
      endDate: null
    });
    prisma.maintenanceContract.update.mockResolvedValue({ id: 'c1', status: 'TERMINATED' });

    const result = await updateMaintenanceContractByTenant('tenant-1', 'syndic-1', 'c1', { status: 'TERMINATED' });
    expect(result.status).toBe('TERMINATED');
  });
});

describe('creation de budget', () => {
  it('supprime le budget cree quand la repartition echoue (copropriete sans lot)', async () => {
    prisma.syndicateBudget.create.mockResolvedValue({ id: 'budget-1' });
    // `recomputeBudgetAllocationsByBudget` : budget relu, puis aucun lot -> 422.
    prisma.syndicateBudget.findFirst.mockResolvedValue({ id: 'budget-1', status: 'DRAFT', lines: [] });
    prisma.syndicateLot.findMany.mockResolvedValue([]);

    await expect(
      createBudgetBySyndicate('tenant-1', 'syndic-1', {
        fiscalYear: 2026,
        label: 'Budget 2026',
        totalAmount: 1000,
        lines: [{ category: 'Eau', description: 'Eau commune', amountForecast: 1000, distributionKey: 'EQUAL' }]
      })
    ).rejects.toMatchObject({ status: 422 });
    expect(prisma.syndicateBudget.delete).toHaveBeenCalledWith({ where: { id: 'budget-1' } });
  });
});

describe("lot d'appels manuel", () => {
  const input = {
    label: 'Mars',
    period: '2026-03',
    dueDate: new Date('2026-03-31T00:00:00.000Z'),
    batchType: 'REGULAR' as const,
    totalAmount: 1000
  };

  it('refuse un second lot ordinaire sur la meme periode (meme regle que la generation)', async () => {
    prisma.chargeCallBatch.findFirst.mockResolvedValue({ id: 'batch-existant' });
    await expect(createChargeCallBatchBySyndicate('tenant-1', 'syndic-1', input)).rejects.toMatchObject({
      statusCode: 409
    });
    expect(prisma.chargeCallBatch.create).not.toHaveBeenCalled();
  });

  it('transmet les bornes de periode saisies', async () => {
    prisma.chargeCallBatch.findFirst.mockResolvedValue(null);
    prisma.chargeCallBatch.create.mockResolvedValue({ id: 'batch-1' });
    await createChargeCallBatchBySyndicate('tenant-1', 'syndic-1', {
      ...input,
      periodStart: new Date('2026-03-01T00:00:00.000Z'),
      periodEnd: new Date('2026-03-31T00:00:00.000Z')
    });
    expect(prisma.chargeCallBatch.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          periodStart: new Date('2026-03-01T00:00:00.000Z'),
          periodEnd: new Date('2026-03-31T00:00:00.000Z')
        })
      })
    );
  });

  it("un lot exceptionnel n'est pas controle", async () => {
    prisma.chargeCallBatch.create.mockResolvedValue({ id: 'batch-2' });
    await createChargeCallBatchBySyndicate('tenant-1', 'syndic-1', { ...input, batchType: 'EXCEPTIONAL' });
    expect(prisma.chargeCallBatch.findFirst).not.toHaveBeenCalled();
  });
});

describe('echeance des appels recurrents', () => {
  it('ramene le 31 janvier + 1 mois au dernier jour de fevrier', () => {
    const base = new Date(2026, 0, 31);
    const due = (index: number) => {
      const d = shiftChargeDueDate(base, 'MONTHLY', index);
      return [d.getFullYear(), d.getMonth() + 1, d.getDate()];
    };
    expect(due(0)).toEqual([2026, 1, 31]);
    expect(due(1)).toEqual([2026, 2, 28]);
    expect(due(2)).toEqual([2026, 3, 31]);
    expect(due(3)).toEqual([2026, 4, 30]);
  });

  it("gere le trimestriel et l'annuel (29 fevrier)", () => {
    const quarter = shiftChargeDueDate(new Date(2026, 10, 30), 'QUARTERLY', 1);
    expect([quarter.getFullYear(), quarter.getMonth() + 1, quarter.getDate()]).toEqual([2027, 2, 28]);
    const annual = shiftChargeDueDate(new Date(2028, 1, 29), 'ANNUAL', 1);
    expect([annual.getFullYear(), annual.getMonth() + 1, annual.getDate()]).toEqual([2029, 2, 28]);
  });
});

describe('schemas de requete', () => {
  it('releve de compte : `to` en jour seul couvre toute la journee', () => {
    const parsed = ownerAccountStatementQuerySchema.parse({ from: '2026-06-01', to: '2026-06-30' });
    expect(parsed.from?.toISOString()).toBe('2026-06-01T00:00:00.000Z');
    expect(parsed.to?.toISOString()).toBe('2026-06-30T23:59:59.999Z');
  });

  it('releve de compte : bornes vides ignorees, date impossible refusee', () => {
    expect(ownerAccountStatementQuerySchema.parse({ from: '', to: '' })).toEqual({});
    expect(() => ownerAccountStatementQuerySchema.parse({ to: '2026-02-31' })).toThrow();
  });

  it("liste des lots d'appels : statut inconnu refuse, statut valide accepte", () => {
    expect(() => chargeCallBatchListQuerySchema.parse({ status: 'WRONG' })).toThrow();
    expect(chargeCallBatchListQuerySchema.parse({ status: 'SENT', period: '' })).toEqual({ status: 'SENT' });
  });
});
