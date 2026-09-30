/**
 * BUG-2026-09-30-047 : la synthese des appels de charges (cartes de l'ecran) est
 * un agregat serveur sur TOUS les appels filtres — pas sur la premiere page —
 * avec les memes filtres que la liste, et cloisonne par agence.
 */

type Call = {
  id: string;
  syndicateId: string;
  period: string;
  amount: number;
  status: 'PENDING' | 'PARTIAL' | 'PAID' | 'OVERDUE';
  dueDate: Date;
};

jest.mock('@prisma/client', () => {
  const calls: Call[] = [];
  const syndicates = [
    { id: 's1', tenantId: 'tenant-a' },
    { id: 's2', tenantId: 'tenant-b' }
  ];

  // Interprete le sous-ensemble de filtres Prisma utilise par la synthese.
  const matches = (call: Call, where: any): boolean => {
    if (!where) return true;
    if (where.AND && !where.AND.every((w: any) => matches(call, w))) return false;
    if (where.syndicateId && call.syndicateId !== where.syndicateId) return false;
    if (where.syndicate?.tenantId) {
      const owner = syndicates.find(s => s.id === call.syndicateId);
      if (owner?.tenantId !== where.syndicate.tenantId) return false;
    }
    if (where.period && call.period !== where.period) return false;
    if (where.status) {
      if (where.status.in && !where.status.in.includes(call.status)) return false;
      if (where.status.not && call.status === where.status.not) return false;
      if (typeof where.status === 'string' && call.status !== where.status) return false;
    }
    if (where.dueDate) {
      if (where.dueDate.lt && !(call.dueDate < where.dueDate.lt)) return false;
      if (where.dueDate.gte && !(call.dueDate >= where.dueDate.gte)) return false;
    }
    return true;
  };

  const prisma: any = {
    __calls: calls,
    syndicate: {
      findFirst: jest.fn(
        async ({ where }: any) => syndicates.find(s => s.id === where.id && s.tenantId === where.tenantId) ?? null
      )
    },
    chargeCall: {
      aggregate: jest.fn(async ({ where }: any) => {
        const rows = calls.filter(c => matches(c, where));
        return { _sum: { amount: rows.reduce((sum, c) => sum + c.amount, 0) }, _count: { _all: rows.length } };
      }),
      count: jest.fn(async ({ where }: any) => calls.filter(c => matches(c, where)).length)
    }
  };
  return { PrismaClient: jest.fn(() => prisma), __mockPrisma: prisma };
});

import { summarizeChargeCallsBySyndicate } from '../../src/lib/syndics/queries';

const { __mockPrisma: mockPrisma } = jest.requireMock('@prisma/client') as { __mockPrisma: any };

const DAY = 24 * 60 * 60 * 1000;
const past = new Date(Date.now() - 30 * DAY);
const future = new Date(Date.now() + 30 * DAY);

function seed(): void {
  mockPrisma.__calls.length = 0;
  let n = 0;
  const add = (over: Partial<Call>) =>
    mockPrisma.__calls.push({
      id: `c${++n}`,
      syndicateId: 's1',
      period: 'T1 2026',
      amount: 100000,
      status: 'PENDING',
      dueDate: future,
      ...over
    });
  // 25 appels a venir de 100 000 (au-dela d'une page de 20)
  for (let i = 0; i < 25; i += 1) add({});
  // 3 appels partiels a venir de 50 000, 10 en retard de 200 000, 2 soldes de 300 000
  for (let i = 0; i < 3; i += 1) add({ status: 'PARTIAL', amount: 50000, period: 'Ravalement' });
  for (let i = 0; i < 10; i += 1) add({ status: 'PENDING', amount: 200000, dueDate: past, period: 'Ravalement' });
  for (let i = 0; i < 2; i += 1) add({ status: 'PAID', amount: 300000, dueDate: past });
  // Une autre agence : ne doit jamais entrer dans les totaux de tenant-a.
  add({ syndicateId: 's2', amount: 9999999, dueDate: past });
}

describe('summarizeChargeCallsBySyndicate (BUG-047)', () => {
  beforeEach(seed);

  it('agrege tous les appels (40), pas la premiere page de 20', async () => {
    const summary = await summarizeChargeCallsBySyndicate('tenant-a', 's1');
    expect(summary).toEqual({
      totalCount: 40,
      // 25x100 000 + 3x50 000 + 10x200 000 + 2x300 000
      totalAmount: 5250000,
      pendingCount: 28,
      overdueCount: 10
    });
  });

  it('applique le filtre de periode de la liste', async () => {
    const summary = await summarizeChargeCallsBySyndicate('tenant-a', 's1', { period: 'Ravalement' });
    expect(summary).toEqual({ totalCount: 13, totalAmount: 2150000, pendingCount: 3, overdueCount: 10 });
  });

  it('applique le filtre de statut de la liste', async () => {
    const overdue = await summarizeChargeCallsBySyndicate('tenant-a', 's1', { status: 'OVERDUE' });
    expect(overdue).toEqual({ totalCount: 10, totalAmount: 2000000, pendingCount: 0, overdueCount: 10 });

    const paid = await summarizeChargeCallsBySyndicate('tenant-a', 's1', { status: 'PAID' });
    expect(paid).toEqual({ totalCount: 2, totalAmount: 600000, pendingCount: 0, overdueCount: 0 });
  });

  it("refuse une copropriete d'une autre agence (meme NotFoundError qu'un objet inexistant)", async () => {
    await expect(summarizeChargeCallsBySyndicate('tenant-a', 's2')).rejects.toThrow(/introuvable/);
    const own = await summarizeChargeCallsBySyndicate('tenant-b', 's2');
    expect(own.totalAmount).toBe(9999999);
    expect(own.totalCount).toBe(1);
  });
});
