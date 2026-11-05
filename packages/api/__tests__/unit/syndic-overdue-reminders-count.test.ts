/**
 * Tableau de bord des retards : `remindersCount` par appel, compté côté serveur
 * (groupBy borné à l'agence et à la copropriété), 0 quand aucune relance.
 */

jest.mock('@prisma/client', () => {
  const prisma = {
    syndicate: { findFirst: jest.fn() },
    chargeCall: { findMany: jest.fn() },
    paymentReminder: { groupBy: jest.fn() }
  };
  return { PrismaClient: jest.fn(() => prisma), __mockPrisma: prisma };
});

import { listOverdueDashboardBySyndicate } from '../../src/lib/syndics/queries';

const { __mockPrisma: mockPrisma } = jest.requireMock('@prisma/client') as any;

const late = new Date('2026-01-15T00:00:00.000Z');
const call = (id: string, lotId: string) => ({
  id,
  lotId,
  lot: { id: lotId, lotNumber: lotId.toUpperCase(), owner: null, property: null },
  dueDate: late,
  status: 'PENDING',
  amount: 100000,
  allocations: []
});

describe('listOverdueDashboardBySyndicate : remindersCount', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.syndicate.findFirst.mockResolvedValue({ id: 's1' });
  });

  it('ajoute le nombre de relances par appel, 0 si absent', async () => {
    mockPrisma.chargeCall.findMany.mockResolvedValue([call('c1', 'a1'), call('c2', 'a2')]);
    mockPrisma.paymentReminder.groupBy.mockResolvedValue([{ chargeCallId: 'c1', _count: { _all: 4 } }]);

    const result = await listOverdueDashboardBySyndicate('t1', 's1');

    expect(result.items.map(i => [i.chargeCallId, i.remindersCount])).toEqual([
      ['c1', 4],
      ['c2', 0]
    ]);
    expect(result.totals).toEqual({ overdueCount: 2, overdueLotCount: 2, overdueAmount: 200000 });
  });

  it('borne le groupBy à l’agence et à la copropriété', async () => {
    mockPrisma.chargeCall.findMany.mockResolvedValue([call('c1', 'a1')]);
    mockPrisma.paymentReminder.groupBy.mockResolvedValue([]);

    await listOverdueDashboardBySyndicate('t1', 's1');

    expect(mockPrisma.paymentReminder.groupBy).toHaveBeenCalledWith({
      by: ['chargeCallId'],
      where: {
        chargeCallId: { in: ['c1'] },
        chargeCall: { syndicateId: 's1', syndicate: { tenantId: 't1' } }
      },
      _count: { _all: true }
    });
  });

  it('n’interroge pas les relances quand aucun appel n’est en retard', async () => {
    mockPrisma.chargeCall.findMany.mockResolvedValue([]);
    const result = await listOverdueDashboardBySyndicate('t1', 's1');
    expect(result.items).toEqual([]);
    expect(mockPrisma.paymentReminder.groupBy).not.toHaveBeenCalled();
  });
});
