/**
 * Tableau de bord syndic : le taux de recouvrement compte ce qui a réellement
 * été encaissé sur les appels PARTIAL, et les retards se dérivent de
 * `dueDate` (le statut OVERDUE n'est jamais stocké).
 */
const chargeCallGroupBy = jest.fn();
const allocationAggregate = jest.fn();
const getUserPermissions = jest.fn();

function modelProxy(name: string): any {
  return new Proxy(
    {},
    {
      get: (_t, method: string) => {
        if (name === 'chargeCall' && method === 'groupBy') return chargeCallGroupBy;
        if (name === 'chargePaymentAllocation' && method === 'aggregate') return allocationAggregate;
        return async () => {
          if (method === 'count') return 0;
          if (method === 'aggregate') return { _sum: {}, _count: { _all: 0 } };
          if (method === 'findFirst' || method === 'findUnique') return null;
          return [];
        };
      }
    }
  );
}

jest.mock('../../src/utils/database', () => ({
  prisma: new Proxy({}, { get: (_t, name: string) => (name === '$queryRaw' ? async () => [] : modelProxy(name)) })
}));
jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }
}));
jest.mock('../../src/services/permission-service', () => ({
  getUserPermissions: (...a: any[]) => getUserPermissions(...a)
}));
jest.mock('../../src/services/subscription-v2-service', () => ({
  getEntitlements: jest.fn().mockResolvedValue({ enforcement: 'off' })
}));

import { getTenantDashboard } from '../../src/services/dashboard-service';

const group = (status: string, count: number, amount: number) => ({
  status,
  _count: { _all: count },
  _sum: { amount }
});

beforeEach(() => {
  jest.clearAllMocks();
  getUserPermissions.mockResolvedValue(['SYNDIC_VIEW']);
});

describe('getTenantDashboard — recouvrement syndic', () => {
  it('compte la part payée des appels PARTIAL, sans gonfler au montant entier', async () => {
    // 1000 appelés : 400 PAID, 400 PARTIAL (dont 100 payés), 200 PENDING non échu.
    chargeCallGroupBy.mockImplementation(async (args: any) =>
      args.where.dueDate ? [] : [group('PAID', 1, 400), group('PARTIAL', 1, 400), group('PENDING', 1, 200)]
    );
    allocationAggregate.mockResolvedValue({ _sum: { amount: 100 } });

    const dashboard = await getTenantDashboard('tenant-A', 'u1');

    expect(dashboard.syndic?.recoveryRate).toBe(50); // (400 + 100) / 1000
    expect(allocationAggregate).toHaveBeenCalledWith({
      where: { chargeCall: { syndicate: { tenantId: 'tenant-A' }, status: 'PARTIAL' } },
      _sum: { amount: true }
    });
  });

  it('dérive OVERDUE de dueDate < maintenant sur les appels non soldés', async () => {
    const before = Date.now();
    chargeCallGroupBy.mockImplementation(async (args: any) =>
      args.where.dueDate ? [group('PENDING', 1, 200)] : [group('PAID', 1, 400), group('PENDING', 2, 600)]
    );
    allocationAggregate.mockResolvedValue({ _sum: { amount: null } });

    const dashboard = await getTenantDashboard('tenant-A', 'u1');

    const overdueCall = chargeCallGroupBy.mock.calls.map(c => c[0]).find(a => a.where.dueDate);
    expect(overdueCall.where.status).toEqual({ in: ['PENDING', 'PARTIAL'] });
    expect(overdueCall.where.dueDate.lt.getTime()).toBeGreaterThanOrEqual(before);
    expect(overdueCall.where.amount).toEqual({ gt: 0 });

    const byKey = Object.fromEntries(dashboard.syndic!.chargeCallsByStatus.map(b => [b.key, b]));
    expect(byKey.OVERDUE).toMatchObject({ count: 1, amount: 200 });
    expect(byKey.PENDING).toMatchObject({ count: 1, amount: 400 });
    expect(dashboard.syndic?.recoveryRate).toBe(40); // 400 / 1000
  });
});
