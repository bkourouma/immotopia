/**
 * Route `GET /api/tenants/:tenantId/audit` (ADR-006, niveau agence) : qui peut
 * la lire, quelle agence est lue, et ce qui est tracé.
 *
 * Le vrai routeur, les vraies gardes de permission et le vrai contrôleur sont
 * montés ; seuls l'authentification, le contexte d'agence, le service de
 * permissions, le lecteur et le journal sont simulés.
 */
import express from 'express';
import request from 'supertest';

jest.mock('../../src/middleware/auth-middleware', () => ({
  authenticate: (req: any, res: any, next: any) => {
    const role = req.headers['x-role'];
    if (!role) {
      res.status(401).json({ message: 'Jeton manquant' });
      return;
    }
    req.user = { userId: String(role), globalRole: 'USER' };
    next();
  }
}));
jest.mock('../../src/middleware/tenant-middleware', () => ({
  requireTenantAccess: (req: any, _res: any, next: any) => {
    req.tenantContext = {
      tenantId: /\/tenants\/([^/]+)/.exec(req.originalUrl)?.[1],
      isCollaborator: true,
      isClient: false
    };
    next();
  }
}));

const grants: Record<string, Record<string, string[]>> = {
  admin: { '*': ['TENANT_AUDIT_VIEW', 'TENANT_SETTINGS_VIEW'] },
  manager: { '*': ['TENANT_SETTINGS_VIEW', 'USERS_VIEW', 'PROPERTIES_VIEW'] },
  agent: { '*': ['PROPERTIES_VIEW'] },
  accountant: { '*': ['BILLING_VIEW'] },
  // administrateur de A, simple agent de B
  multi: { 'tenant-A': ['TENANT_AUDIT_VIEW'], 'tenant-B': ['PROPERTIES_VIEW'] }
};
jest.mock('../../src/services/permission-service', () => ({
  hasPermission: jest.fn(async (userId: string, key: string, tenantId?: string) => {
    const byTenant = grants[userId] ?? {};
    return (byTenant[tenantId ?? ''] ?? byTenant['*'] ?? []).includes(key);
  }),
  hasAnyPermission: jest.fn(),
  hasAllPermissions: jest.fn()
}));

const getTenantAuditLogs = jest.fn();
jest.mock('../../src/services/audit-read-service', () => ({
  getTenantAuditLogs: (...args: unknown[]) => getTenantAuditLogs(...args)
}));
const logAuditEvent = jest.fn();
jest.mock('../../src/services/audit-service', () => ({
  ...jest.requireActual('../../src/types/audit-types'),
  logAuditEvent: (...args: unknown[]) => logAuditEvent(...args)
}));

import tenantAuditRoutes from '../../src/routes/tenant-audit-routes';
import { errorHandler } from '../../src/middleware/error-middleware';

const app = express();
app.use(express.json());
app.use('/api', tenantAuditRoutes);
app.use(errorHandler);

const url = (tenant: string, query = '') => `/api/tenants/${tenant}/audit${query}`;

beforeEach(() => {
  getTenantAuditLogs.mockReset();
  logAuditEvent.mockReset();
  getTenantAuditLogs.mockResolvedValue({ logs: [], nextCursor: null });
});

describe('droit TENANT_AUDIT_VIEW', () => {
  it('sans session : 401', async () => {
    const res = await request(app).get(url('tenant-A'));
    expect(res.status).toBe(401);
    expect(getTenantAuditLogs).not.toHaveBeenCalled();
  });

  it.each(['manager', 'agent', 'accountant'])('%s : refusé (403), rien n’est lu', async role => {
    const res = await request(app).get(url('tenant-A')).set('x-role', role);
    expect(res.status).toBe(403);
    expect(res.body.message).toContain('TENANT_AUDIT_VIEW');
    expect(getTenantAuditLogs).not.toHaveBeenCalled();
  });

  it('administrateur : 200', async () => {
    const res = await request(app).get(url('tenant-A')).set('x-role', 'admin');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: { logs: [], nextCursor: null } });
  });

  it('le droit est évalué par agence : administrateur de A, refusé dans B', async () => {
    const inA = await request(app).get(url('tenant-A')).set('x-role', 'multi');
    const inB = await request(app).get(url('tenant-B')).set('x-role', 'multi');
    expect(inA.status).toBe(200);
    expect(inB.status).toBe(403);
    expect(getTenantAuditLogs).toHaveBeenCalledTimes(1);
    expect(getTenantAuditLogs.mock.calls[0][0]).toBe('tenant-A');
  });
});

describe('agence lue', () => {
  it('vient de l’URL, jamais de la requête : ?tenantId= est refusé en 400', async () => {
    const res = await request(app).get(url('tenant-A', '?tenantId=tenant-B')).set('x-role', 'admin');
    expect(res.status).toBe(400);
    expect(getTenantAuditLogs).not.toHaveBeenCalled();
  });

  it.each(['?visibility=PLATFORM_ONLY', '?scope=PLATFORM', '?inconnu=1', '?limit=0', '?limit=101', '?category=NOPE'])(
    'paramètre refusé en 400 : %s',
    async query => {
      const res = await request(app).get(url('tenant-A', query)).set('x-role', 'admin');
      expect(res.status).toBe(400);
      expect(getTenantAuditLogs).not.toHaveBeenCalled();
    }
  );

  it('transmet les filtres lus, dates comprises (fin de journée incluse)', async () => {
    await request(app)
      .get(url('tenant-A', '?category=SECURITY&outcome=DENIED&startDate=2026-09-01&endDate=2026-09-30&limit=20'))
      .set('x-role', 'admin');
    const [tenantId, filters] = getTenantAuditLogs.mock.calls[0];
    expect(tenantId).toBe('tenant-A');
    expect(filters).toMatchObject({ category: 'SECURITY', outcome: 'DENIED', limit: 20 });
    expect(filters.startDate.toISOString()).toBe('2026-09-01T00:00:00.000Z');
    expect(filters.endDate.toISOString()).toBe('2026-09-30T23:59:59.999Z');
  });

  it('une date illisible est une 400', async () => {
    const res = await request(app).get(url('tenant-A', '?startDate=hier')).set('x-role', 'admin');
    expect(res.status).toBe(400);
  });
});

describe('audit de l’audit', () => {
  it('trace la consultation sur la première page, sans le curseur ni la taille', async () => {
    await request(app).get(url('tenant-A', '?category=AUTH&limit=10')).set('x-role', 'admin');
    expect(logAuditEvent).toHaveBeenCalledTimes(1);
    expect(logAuditEvent.mock.calls[0][0]).toMatchObject({
      actionKey: 'AUDIT_VIEWED',
      entityType: 'AuditLog',
      entityId: 'tenant-A',
      payload: { level: 'TENANT', filters: { category: 'AUTH' } }
    });
    expect(logAuditEvent.mock.calls[0][0].payload.filters).not.toHaveProperty('limit');
  });

  it('ne trace pas « charger plus » (page avec curseur)', async () => {
    await request(app).get(url('tenant-A', '?cursor=abc')).set('x-role', 'admin');
    expect(logAuditEvent).not.toHaveBeenCalled();
  });

  it('ne trace rien quand l’accès est refusé', async () => {
    await request(app).get(url('tenant-A')).set('x-role', 'agent');
    expect(logAuditEvent).not.toHaveBeenCalled();
  });
});
