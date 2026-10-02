/**
 * Resume super-admin des abonnements : la consommation ACTIFS suit la meme
 * definition que `countActiveAssets` (actifs non archives + biens non archives
 * sans actif lie), par groupBy filtre par tenantId.
 */

const groupBy = (rows: unknown[]) => jest.fn(async () => rows);
const mockPrisma = {
  subscription: { findMany: jest.fn(async () => []) },
  subscriptionItem: { findMany: jest.fn(async () => []) },
  capacityOverride: { findMany: jest.fn(async () => []) },
  tenantModule: { findMany: jest.fn(async () => []) },
  lotActivation: { groupBy: groupBy([]) },
  syndicate: { groupBy: groupBy([]) },
  constructionSite: { groupBy: groupBy([]) },
  subscriptionExtensionRequest: { groupBy: groupBy([]) },
  asset: { groupBy: groupBy([{ tenantId: 't1', _count: { _all: 4 } }]) },
  property: {
    groupBy: groupBy([
      { tenantId: 't1', _count: { _all: 3 } },
      { tenantId: 't2', _count: { _all: 1 } }
    ])
  }
};

jest.mock('../../src/utils/database', () => ({ prisma: mockPrisma }));
jest.mock('../../src/services/audit-service', () => ({ logAuditEvent: jest.fn(), AuditActionKey: {} }));

import { listSubscriptionSummaries } from '../../src/services/subscription-admin-extras-service';

describe('listSubscriptionSummaries : ACTIFS', () => {
  it('additionne actifs non archives et biens sans actif lie, chaque groupBy filtre par tenantId', async () => {
    const summaries = await listSubscriptionSummaries(['t1', 't2']);
    expect(summaries.t1.capacities.ACTIFS.used).toBe(7);
    expect(summaries.t2.capacities.ACTIFS.used).toBe(1);
    expect(mockPrisma.asset.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        by: ['tenantId'],
        where: { tenantId: { in: ['t1', 't2'] }, status: { not: 'ARCHIVED' } }
      })
    );
    expect(mockPrisma.property.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        by: ['tenantId'],
        where: { tenantId: { in: ['t1', 't2'] }, status: { not: 'ARCHIVED' }, asset: { is: null } }
      })
    );
  });
});
