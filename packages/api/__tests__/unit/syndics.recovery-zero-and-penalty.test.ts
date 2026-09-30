/**
 * BUG-2026-09-30-050 : un appel de 0 FCFA n'est ni du ni en retard (tableau des
 * retards, relances, compteurs). BUG-2026-09-30-053 : la penalite de retard est
 * mensuelle, proratisee au jour, plafonnee au reste du.
 */

jest.mock('@prisma/client', () => {
  const tx = { paymentReminder: { count: jest.fn(), create: jest.fn() } };
  const prisma = {
    syndicate: { findFirst: jest.fn() },
    chargeCall: { findMany: jest.fn() },
    $transaction: jest.fn(async (callback: any) => callback(tx))
  };
  return { PrismaClient: jest.fn(() => prisma), __mockPrisma: prisma, __mockTx: tx };
});

import { listOverdueDashboardBySyndicate, runReminderBatchForSyndicate } from '../../src/lib/syndics/queries';
import { computeLatePenalty, MAX_MONTHLY_PENALTY_RATE } from '../../src/lib/syndics/finance-utils';
import { createPenaltyRequestSchema } from '../../src/lib/syndics/schemas';

const { __mockPrisma: mockPrisma } = jest.requireMock('@prisma/client') as any;

const lot = (id: string, lotNumber: string) => ({ id, lotNumber, owner: null, property: null });
const late = new Date('2026-01-15T00:00:00.000Z');

describe('Recouvrement : appels de montant nul (BUG-050)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.syndicate.findFirst.mockResolvedValue({ id: 's1' });
  });

  it('interroge uniquement les appels de montant positif', async () => {
    mockPrisma.chargeCall.findMany.mockResolvedValue([]);
    await listOverdueDashboardBySyndicate('t1', 's1');
    expect(mockPrisma.chargeCall.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ amount: { gt: 0 } }) })
    );
  });

  it('compte un lot une fois et ignore un appel deja couvert (reste 0)', async () => {
    mockPrisma.chargeCall.findMany.mockResolvedValue([
      {
        id: 'c1',
        lotId: 'b02',
        lot: lot('b02', 'B02'),
        dueDate: late,
        status: 'PENDING',
        amount: 300000,
        allocations: []
      },
      {
        id: 'c2',
        lotId: 'b02',
        lot: lot('b02', 'B02'),
        dueDate: late,
        status: 'PENDING',
        amount: 400000,
        allocations: []
      },
      // couvert par une avance : plus rien de du
      {
        id: 'c3',
        lotId: 'b01',
        lot: lot('b01', 'B01'),
        dueDate: late,
        status: 'PENDING',
        amount: 50000,
        allocations: [{ amount: 50000 }]
      }
    ]);

    const result = await listOverdueDashboardBySyndicate('t1', 's1');

    expect(result.items.map(item => item.chargeCallId)).toEqual(['c1', 'c2']);
    expect(result.totals).toEqual({ overdueCount: 2, overdueLotCount: 1, overdueAmount: 700000 });
  });

  it('les relances groupees ne visent que les appels de montant positif', async () => {
    mockPrisma.chargeCall.findMany.mockResolvedValue([]);
    await runReminderBatchForSyndicate('t1', 's1');
    expect(mockPrisma.chargeCall.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ amount: { gt: 0 } }) })
    );
  });
});

describe('Penalite de retard (BUG-053)', () => {
  it('taux mensuel au prorata des jours : 300 000 a 10 % pendant 15 jours = 15 000', () => {
    expect(computeLatePenalty(300000, 10, 15)).toBe(15000);
  });

  it('un mois complet de 30 jours a 10 % = 10 % de la dette', () => {
    expect(computeLatePenalty(300000, 10, 30)).toBe(30000);
  });

  it('258 jours a 10 % = 258 000 (regle inchangee), au moins un jour compte', () => {
    expect(computeLatePenalty(300000, 10, 258)).toBe(258000);
    expect(computeLatePenalty(300000, 10, 0)).toBe(1000);
  });

  it('ne depasse jamais le reste du', () => {
    expect(computeLatePenalty(300000, 10, 400)).toBe(300000);
  });

  it('le taux mensuel est plafonne a la saisie', () => {
    expect(MAX_MONTHLY_PENALTY_RATE).toBe(10);
    expect(createPenaltyRequestSchema.safeParse({ penaltyRate: 10 }).success).toBe(true);
    expect(createPenaltyRequestSchema.safeParse({ penaltyRate: 10.5 }).success).toBe(false);
    expect(createPenaltyRequestSchema.safeParse({ penaltyRate: 100 }).success).toBe(false);
  });
});
