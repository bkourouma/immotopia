/**
 * Tableau de bord : la file « À traiter » reçoit les alertes de stock ouvertes
 * (lot 040, spec B7-R5 ; contrat `/dashboard`).
 *
 * Nature `STOCK_ALERT` seulement pour un appelant qui détient
 * STOCK_ALERTS_VIEW ET STOCK_VALUES_VIEW, dans une agence qui a CONSTRUCTION
 * (mode `enforce`). Lien vers l'écran Contrôle ; titre neutre, jamais de nom
 * de personne ; une alerte traitée quitte la file (B7-2).
 */

type Row = Record<string, any>;

const getUserPermissions = jest.fn();
const getEntitlements = jest.fn();
const evaluateFeatureAccess = jest.fn();
let alerts: Row[] = [];

const stockAlertFindMany = jest.fn(async ({ where, take }: Row) =>
  alerts
    .filter(a => a.tenantId === where.tenantId && a.status === where.status && a.severity === where.severity)
    .sort((a, b) => a.raisedAt.getTime() - b.raisedAt.getTime())
    .slice(0, take)
);

function modelProxy(name: string): any {
  return new Proxy(
    {},
    {
      get: (_t, method: string) => {
        if (name === 'stockAlert' && method === 'findMany') return stockAlertFindMany;
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
  getEntitlements: (...a: any[]) => getEntitlements(...a)
}));
jest.mock('../../src/lib/subscription/feature-access', () => ({
  evaluateFeatureAccess: (...a: any[]) => evaluateFeatureAccess(...a)
}));

import { getTenantDashboard } from '../../src/services/dashboard-service';

const TENANT = 'tenant-A';

function alert(overrides: Row): Row {
  return {
    id: 'a-1',
    tenantId: TENANT,
    kind: 'LARGE_ISSUE',
    severity: 'WARNING',
    status: 'OPEN',
    amount: 600000,
    raisedAt: new Date('2026-09-30T10:00:00.000Z'),
    site: null,
    location: { label: 'Magasin central' },
    ...overrides
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  alerts = [
    alert({ id: 'a-warning' }),
    alert({
      id: 'a-info',
      severity: 'INFO',
      kind: 'RECEIPT_UNVALUED',
      amount: null,
      location: null,
      site: { name: 'Chantier Kaporo' }
    }),
    alert({ id: 'a-traitee', status: 'ACKNOWLEDGED' }),
    alert({ id: 'a-autre-agence', tenantId: 'tenant-B' })
  ];
  getEntitlements.mockResolvedValue({ enforcement: 'off' });
  evaluateFeatureAccess.mockReturnValue({ allowed: true });
});

describe('getTenantDashboard — alertes de stock (B7-R5)', () => {
  it('administrateur : tâches STOCK_ALERT ouvertes, lien vers Contrôle', async () => {
    getUserPermissions.mockResolvedValue(['STOCK_ALERTS_VIEW', 'STOCK_VALUES_VIEW']);
    const dashboard = await getTenantDashboard(TENANT, 'admin');
    const tasks = dashboard.workQueue.filter(task => task.kind === 'STOCK_ALERT');
    expect(tasks.map(task => task.id)).toEqual(['stock-alert:a-warning', 'stock-alert:a-info']);
    expect(tasks[0]).toMatchObject({
      title: 'Sortie importante',
      description: 'Magasin central',
      amount: 600000,
      severity: 'warning',
      occurredAt: '2026-09-30T10:00:00.000Z',
      href: `/tenant/${TENANT}/finance/stock/controle?alerte=a-warning`
    });
    expect(tasks[1]).toMatchObject({ severity: 'info', description: 'Chantier Kaporo', amount: null });
  });

  it('sans STOCK_VALUES_VIEW (ou sans STOCK_ALERTS_VIEW) : aucune alerte, rien n’est lu', async () => {
    getUserPermissions.mockResolvedValue(['STOCK_ALERTS_VIEW']);
    let dashboard = await getTenantDashboard(TENANT, 'role-modifie');
    expect(dashboard.workQueue.some(task => task.kind === 'STOCK_ALERT')).toBe(false);

    getUserPermissions.mockResolvedValue(['STOCK_VIEW', 'STOCK_VALUES_VIEW']);
    dashboard = await getTenantDashboard(TENANT, 'comptable');
    expect(dashboard.workQueue.some(task => task.kind === 'STOCK_ALERT')).toBe(false);
    expect(stockAlertFindMany).not.toHaveBeenCalled();
  });

  it('agence sans CONSTRUCTION (mode enforce) : aucune alerte', async () => {
    getUserPermissions.mockResolvedValue(['STOCK_ALERTS_VIEW', 'STOCK_VALUES_VIEW']);
    getEntitlements.mockResolvedValue({ enforcement: 'enforce' });
    evaluateFeatureAccess.mockImplementation((_e: unknown, feature: string) => ({
      allowed: feature !== 'CONSTRUCTION'
    }));
    const dashboard = await getTenantDashboard(TENANT, 'admin');
    expect(dashboard.workQueue.some(task => task.kind === 'STOCK_ALERT')).toBe(false);
    expect(stockAlertFindMany).not.toHaveBeenCalled();
  });

  it('une panne de lecture des alertes n’empêche pas le tableau de bord', async () => {
    getUserPermissions.mockResolvedValue(['STOCK_ALERTS_VIEW', 'STOCK_VALUES_VIEW']);
    stockAlertFindMany.mockRejectedValueOnce(new Error('base indisponible'));
    const dashboard = await getTenantDashboard(TENANT, 'admin');
    expect(dashboard.workQueue).toEqual([]);
  });
});
