/**
 * Tableau de bord : la section Syndic exige `SYNDIC_VIEW`, comme la route
 * dédiée. Un Agent (PROPERTIES_VIEW seul) ne reçoit plus le nombre de
 * copropriétés, de lots ni le taux de recouvrement.
 */
const syndicateCount = jest.fn().mockResolvedValue(3);
const getUserPermissions = jest.fn();

function modelProxy(name: string): any {
  return new Proxy(
    {},
    {
      get: (_t, method: string) => {
        if (name === 'syndicate' && method === 'count') return syndicateCount;
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

beforeEach(() => jest.clearAllMocks());

describe('getTenantDashboard — section Syndic', () => {
  it('un Agent (PROPERTIES_VIEW sans SYNDIC_VIEW) reçoit syndic = null et rien n’est lu', async () => {
    getUserPermissions.mockResolvedValue(['PROPERTIES_VIEW', 'CRM_CONTACTS_VIEW']);
    const dashboard = await getTenantDashboard('tenant-A', 'agent-1');
    expect(dashboard.syndic).toBeNull();
    expect(syndicateCount).not.toHaveBeenCalled();
  });

  it('SYNDIC_VIEW ouvre la section, sans exiger PROPERTIES_VIEW', async () => {
    getUserPermissions.mockResolvedValue(['SYNDIC_VIEW']);
    const dashboard = await getTenantDashboard('tenant-A', 'gestionnaire-1');
    expect(dashboard.syndic).not.toBeNull();
    expect(dashboard.syndic?.syndicates).toBe(3);
  });
});
