/**
 * Lot 5 (H3) — FCFA : jamais de décimales dans les parts de budget, les appels
 * programmés, la répartition des fonds et le montant du paiement en ligne.
 */
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
    syndicateBudget: { findFirst: jest.fn() },
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

import { generateChargeCallsFromBudget, recomputeBudgetAllocationsByBudget } from '../../src/lib/syndics/queries';
import { annualShareForPeriod, distributeFixedAmount } from '../../src/lib/syndics/charge-schedule-periods';
import { allocationPrecisionFor } from '../../src/lib/syndics/charge-allocation-methods';
import { splitCents } from '../../src/lib/syndics/fund-credits';
import { onlineAmountDue, outstandingCoversPayment } from '../../src/lib/syndics/online-payment/online-amount';

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);
const shares = (annual: number, periods: number, currency?: string | null) =>
  Array.from({ length: periods }, (_, index) => annualShareForPeriod(annual, periods, index + 1, currency));

describe('annualShareForPeriod en FCFA', () => {
  it.each([
    [100001, 3],
    [1000001, 4],
    [8000.05, 12],
    [1000, 12]
  ])('annuel %p sur %p périodes : entiers, somme exacte, dernière période absorbe', (annual, periods) => {
    const parts = shares(annual, periods, 'XOF');
    expect(parts.every(Number.isInteger)).toBe(true);
    expect(sum(parts)).toBe(Math.round(annual));
    const base = Math.floor(Math.round(annual) / periods);
    expect(parts.slice(0, -1).every(part => part === base)).toBe(true);
    expect(parts[periods - 1]).toBeGreaterThanOrEqual(base);
  });

  it('1000 sur 12 : 83 puis 87 pour la dernière', () => {
    const parts = shares(1000, 12, 'XOF');
    expect(parts.slice(0, 11).every(part => part === 83)).toBe(true);
    expect(parts[11]).toBe(87);
  });

  it('reconnaît FCFA et XAF comme devises sans sous-unité', () => {
    expect(allocationPrecisionFor('FCFA')).toBe('UNIT');
    expect(shares(1000, 3, 'FCFA')).toEqual([333, 333, 334]);
    expect(shares(1000, 3, 'XAF')).toEqual([333, 333, 334]);
  });

  it('autre devise (EUR) : centimes conservés ; devise absente : comportement historique', () => {
    expect(shares(1000, 3, 'EUR')).toEqual([333.33, 333.33, 333.34]);
    expect(shares(1000, 3)).toEqual([333.33, 333.33, 333.34]);
    expect(shares(1000, 3, null)).toEqual([333.33, 333.33, 333.34]);
  });
});

describe('distributeFixedAmount en FCFA', () => {
  const lot = (id: string, lotNumber: string, generalShares: number) => ({
    id,
    lotNumber,
    lotType: 'APARTMENT',
    generalShares
  });
  const lots = [lot('a', 'A-01', 1), lot('b', 'A-02', 1), lot('c', 'A-03', 1)];

  it('parts entières, le dernier lot absorbe le reste', () => {
    expect(distributeFixedAmount(1000, lots, 'XOF').map(item => item.amount)).toEqual([333, 333, 334]);
  });

  it('montant fractionnaire arrondi au franc ; somme égale au total arrondi', () => {
    const result = distributeFixedAmount(1000.4, lots, 'XOF');
    expect(result.every(item => Number.isInteger(item.amount))).toBe(true);
    expect(sum(result.map(item => item.amount))).toBe(1000);
  });

  it('autre devise : centimes conservés', () => {
    expect(distributeFixedAmount(1000, lots, 'EUR').map(item => item.amount)).toEqual([333.33, 333.33, 333.34]);
  });
});

describe('splitCents (fonds) en FCFA', () => {
  const two = [
    { fundId: 'a', ratio: 0.5 },
    { fundId: 'b', ratio: 0.5 }
  ];

  it('répartit en francs entiers (multiples de 100 centimes), somme égale au montant', () => {
    const parts = splitCents(100100, two, 'XOF');
    expect(parts.every(part => part % 100 === 0)).toBe(true);
    expect(sum(parts)).toBe(100100);
  });

  it('autre devise : au centime', () => {
    expect(sum(splitCents(100001, two, 'EUR'))).toBe(100001);
  });
});

describe('montant du paiement en ligne', () => {
  it('reste dû arrondi au franc : 1000,60 -> 1001 ; 1000,40 -> 1000', () => {
    expect(onlineAmountDue(100060)).toBe(1001);
    expect(onlineAmountDue(100040)).toBe(1000);
  });

  it('tolérance strictement inférieure à 1 franc au règlement', () => {
    expect(outstandingCoversPayment(100060, 100100)).toBe(true);
    expect(outstandingCoversPayment(100000, 100099)).toBe(true);
    expect(outstandingCoversPayment(100000, 100100)).toBe(false);
    expect(outstandingCoversPayment(0, 100)).toBe(false);
  });
});

const { __mockPrisma: mockPrisma, __mockTx: mockTx } = jest.requireMock('@prisma/client') as {
  __mockPrisma: any;
  __mockTx: any;
};

describe('devises sans sous-unité : liste unique, insensible à la casse', () => {
  it.each(['XOF', 'xaf', 'FCFA', 'cfa', 'CFA', 'XPF', 'GNF', 'KMF', 'DJF', 'BIF', 'RWF'])(
    '%p est sans sous-unité',
    code => {
      expect(allocationPrecisionFor(code)).toBe('UNIT');
    }
  );

  it('EUR et devise absente restent au centime', () => {
    expect(allocationPrecisionFor('EUR')).toBe('CENT');
    expect(allocationPrecisionFor(null)).toBe('CENT');
  });
});

describe('répartition d un poste en devise entière (distributeLineAmount)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.syndicate.findFirst.mockResolvedValue({ id: 'syndic-1' });
    mockPrisma.budgetAllocation.findMany.mockResolvedValue([]);
  });

  it('2 FCFA sur 4 lots égaux : aucune part négative, somme exacte, dernier lot absorbe', async () => {
    mockPrisma.syndicateBudget.findFirst.mockResolvedValue({
      id: 'budget-1',
      status: 'DRAFT',
      currency: 'FCFA',
      lines: [{ id: 'l1', category: 'X', amountForecast: 2, distributionKey: 'EQUAL' }]
    });
    mockPrisma.syndicateLot.findMany.mockResolvedValue(
      [1, 2, 3, 4].map(n => ({ id: `lot-${n}`, lotNumber: String(n), generalShares: 1 }))
    );
    await recomputeBudgetAllocationsByBudget('tenant-1', 'syndic-1', 'budget-1');
    const rows = mockTx.budgetAllocation.createMany.mock.calls[0][0].data as Array<{ totalAllocated: number }>;
    expect(rows.map(r => r.totalAllocated)).toEqual([0, 0, 0, 2]);
    expect(rows.every(r => r.totalAllocated >= 0)).toBe(true);
  });
});

describe('generateChargeCallsFromBudget : écart d arrondi', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.syndicate.findFirst.mockResolvedValue({ id: 'syndic-1' });
  });

  it('le dernier lot absorbe l écart pour que les appels égalent le total du budget', async () => {
    mockPrisma.syndicateBudget.findFirst.mockResolvedValue({
      id: 'budget-1',
      status: 'APPROVED',
      totalAmount: 1000,
      currency: 'XOF',
      allocations: [
        { lotId: 'lot-a', totalAllocated: 333.4 },
        { lotId: 'lot-b', totalAllocated: 333.4 },
        { lotId: 'lot-c', totalAllocated: 333.2 }
      ]
    });
    mockPrisma.syndicateLot.findMany.mockResolvedValue(
      ['a', 'b', 'c'].map(s => ({ id: `lot-${s}`, generalShares: 1 }))
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

    const amounts = mockTx.chargeCall.create.mock.calls.map((c: any[]) => c[0].data.amount);
    expect(amounts).toEqual([333, 333, 334]);
    expect(amounts.reduce((a: number, b: number) => a + b, 0)).toBe(1000);
  });
});
