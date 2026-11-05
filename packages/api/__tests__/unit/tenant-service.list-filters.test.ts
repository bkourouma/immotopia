/**
 * Liste des agences (super-admin) : recherche libre étendue, filtre
 * « proches de la limite » appliqué AVANT la pagination, validation (400).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockPrisma: Record<string, any> = {
  tenant: { findMany: jest.fn(), count: jest.fn() }
};
const selectNearLimitTenantIds = jest.fn();

jest.mock('../../src/utils/database', () => ({ prisma: mockPrisma }));
jest.mock('../../src/services/audit-service', () => ({
  logAuditEvent: jest.fn(),
  recordAuditEvent: jest.fn(),
  AuditActionKey: {}
}));
jest.mock('../../src/middleware/session-invalidation', () => ({ revokeTenantSessions: jest.fn() }));
jest.mock('../../src/services/subscription-admin-extras-service', () => ({
  selectNearLimitTenantIds: (...a: unknown[]) => selectNearLimitTenantIds(...a)
}));

import express from 'express';
import request from 'supertest';
import { listTenants } from '../../src/services/tenant-service';
import { listTenantsHandler } from '../../src/controllers/tenant-controller';

beforeEach(() => {
  jest.clearAllMocks();
  mockPrisma.tenant.findMany.mockResolvedValue([]);
  mockPrisma.tenant.count.mockResolvedValue(0);
});

describe('listTenants : recherche libre', () => {
  it('cherche dans le nom, le slug, le nom légal, le courriel et la ville (insensible à la casse)', async () => {
    await listTenants({ search: 'abid' });
    const where = mockPrisma.tenant.findMany.mock.calls[0][0].where;
    const contains = { contains: 'abid', mode: 'insensitive' };
    expect(where.OR).toEqual([
      { name: contains },
      { slug: contains },
      { legalName: contains },
      { contactEmail: contains },
      { city: contains }
    ]);
    expect(selectNearLimitTenantIds).not.toHaveBeenCalled();
  });
});

describe('listTenants : proches de la limite', () => {
  it('filtre sur toutes les agences correspondantes AVANT la pagination et le total', async () => {
    mockPrisma.tenant.findMany
      .mockResolvedValueOnce([{ id: 'a' }, { id: 'b' }, { id: 'c' }]) // identifiants candidats
      .mockResolvedValueOnce([{ id: 'c' }]); // page
    mockPrisma.tenant.count.mockResolvedValue(1);
    selectNearLimitTenantIds.mockResolvedValue(['c']);

    const result = await listTenants({ status: 'ACTIVE' as never, nearLimit: true, page: 2, limit: 10 });

    // 1re requête : identifiants seulement, avec les AUTRES filtres.
    expect(mockPrisma.tenant.findMany.mock.calls[0][0]).toMatchObject({
      where: { status: 'ACTIVE' },
      select: { id: true }
    });
    expect(selectNearLimitTenantIds).toHaveBeenCalledWith(['a', 'b', 'c']);
    // 2e requête : la page, restreinte aux agences proches de la limite.
    const page = mockPrisma.tenant.findMany.mock.calls[1][0];
    expect(page).toMatchObject({ skip: 10, take: 10, where: { status: 'ACTIVE', AND: [{ id: { in: ['c'] } }] } });
    expect(mockPrisma.tenant.count).toHaveBeenCalledWith({
      where: { status: 'ACTIVE', AND: [{ id: { in: ['c'] } }] }
    });
    expect(result.pagination).toEqual({ page: 2, limit: 10, total: 1, totalPages: 1 });
  });

  it('aucune agence proche de la limite : la page est vide (jamais « toutes »)', async () => {
    mockPrisma.tenant.findMany.mockResolvedValueOnce([{ id: 'a' }]).mockResolvedValueOnce([]);
    selectNearLimitTenantIds.mockResolvedValue([]);
    await listTenants({ nearLimit: true });
    expect(mockPrisma.tenant.findMany.mock.calls[1][0].where).toEqual({ AND: [{ id: { in: [] } }] });
  });
});

describe('GET /admin/tenants : paramètres', () => {
  const app = express();
  // Le contrôleur lit l'utilisateur authentifié.
  app.use((req, _res, next) => {
    (req as unknown as { user: { userId: string } }).user = { userId: 'su' };
    next();
  });
  app.get('/tenants', listTenantsHandler);

  it('lit nearLimit=true et le transmet au service', async () => {
    selectNearLimitTenantIds.mockResolvedValue([]);
    const res = await request(app).get('/tenants?nearLimit=true&status=SUSPENDED&search=%20abc%20');
    expect(res.status).toBe(200);
    expect(selectNearLimitTenantIds).toHaveBeenCalled();
    expect(mockPrisma.tenant.findMany.mock.calls[0][0].where).toMatchObject({ status: 'SUSPENDED' });
  });

  it('sans nearLimit, aucun calcul d’abonnement', async () => {
    const res = await request(app).get('/tenants?nearLimit=false');
    expect(res.status).toBe(200);
    expect(selectNearLimitTenantIds).not.toHaveBeenCalled();
  });

  it.each(['?status=NOPE', '?type=NOPE', '?nearLimit=oui', `?search=${'x'.repeat(121)}`])(
    'valeur invalide refusée en 400 : %s',
    async query => {
      const res = await request(app).get(`/tenants${query}`);
      expect(res.status).toBe(400);
      expect(mockPrisma.tenant.findMany).not.toHaveBeenCalled();
    }
  );
});
