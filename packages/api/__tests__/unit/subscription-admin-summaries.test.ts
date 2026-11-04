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

import {
  listSubscriptionSummaries,
  selectNearLimitTenantIds
} from '../../src/services/subscription-admin-extras-service';

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

describe('selectNearLimitTenantIds : filtre « proches de la limite » de la liste des agences', () => {
  const override = (tenantId: string, delta: number) => ({
    tenantId,
    capacityKey: 'ACTIFS',
    delta,
    startsAt: new Date('2020-01-01'),
    expiresAt: null,
    revokedAt: null
  });

  it("garde les agences dont une capacité atteint 80 % de sa limite (même règle que le résumé), dans l'ordre reçu", async () => {
    // t1 : 7 actifs sur 8 (87,5 %) ; t2 : 1 sur 100 ; t3 : aucune limite (jamais « proche »).
    (mockPrisma.capacityOverride.findMany as jest.Mock).mockResolvedValueOnce([override('t1', 8), override('t2', 100)]);
    expect(await selectNearLimitTenantIds(['t3', 't2', 't1'])).toEqual(['t1']);
  });

  it('exactement 80 % et plus compte ; en dessous non', async () => {
    // t1 : 7 sur 9 (77,8 %) ; t2 : 1 sur 1 (100 %).
    (mockPrisma.capacityOverride.findMany as jest.Mock).mockResolvedValueOnce([override('t1', 9), override('t2', 1)]);
    expect(await selectNearLimitTenantIds(['t1', 't2'])).toEqual(['t2']);
  });

  it('calcule les résumés par lots de 100 agences', async () => {
    const ids = Array.from({ length: 250 }, (_, i) => `x${i}`);
    (mockPrisma.subscription.findMany as jest.Mock).mockClear();
    expect(await selectNearLimitTenantIds(ids)).toEqual([]);
    expect(mockPrisma.subscription.findMany).toHaveBeenCalledTimes(3);
  });

  it('liste vide : aucune requête', async () => {
    (mockPrisma.subscription.findMany as jest.Mock).mockClear();
    expect(await selectNearLimitTenantIds([])).toEqual([]);
    expect(mockPrisma.subscription.findMany).not.toHaveBeenCalled();
  });
});
