import express from 'express';
import request from 'supertest';

/**
 * `GET /api/tenants/:tenantId/work-programs` — endpoint agrégé du §8.4.
 *
 * Il remplace un N+1 : `PatrimoineOverviewPage` chargeait jusqu'à 100 biens
 * puis lançait une requête par bien, soit jusqu'à 101 requêtes au montage ;
 * `WorkProgramsPage` faisait de même avant de filtrer par statut **en
 * mémoire**, après avoir tout téléchargé.
 *
 * Ce test vérifie les trois propriétés qui rendent ce remplacement sûr :
 * l'isolation par agence, le filtrage et la pagination côté serveur, et le
 * refus d'un statut inconnu plutôt qu'un filtre silencieusement ignoré.
 */

jest.mock('../../src/middleware/auth-middleware', () => ({
  authenticate: (req: any, _res: any, next: any) => {
    req.user = { userId: 'user-1', globalRole: 'USER' };
    next();
  }
}));

jest.mock('../../src/middleware/tenant-middleware', () => ({
  requireTenantAccess: (req: any, _res: any, next: any) => {
    req.tenantContext = { tenantId: req.params.tenantId, isCollaborator: true, isClient: false };
    next();
  }
}));

jest.mock('../../src/middleware/tenant-isolation-middleware', () => ({
  enforcePropertyTenantIsolation: (_req: any, _res: any, next: any) => next()
}));

jest.mock('../../src/middleware/property-rbac-middleware', () => ({
  requireAnyPropertyPermission: () => (_req: any, _res: any, next: any) => next(),
  requirePropertyPermission: () => (_req: any, _res: any, next: any) => next()
}));

const TENANT_ID = 'tenant-1';
const TENANT_OTHER_ID = 'tenant-2';

type Program = {
  id: string;
  tenantId: string;
  propertyId: string;
  title: string;
  status: 'PLANNED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  plannedDate: string;
  property: { id: string; title: string; internalReference: string };
};

/** 7 programmes chez l'agence 1, 1 chez une autre : de quoi paginer et isoler. */
const PROGRAMS: Program[] = [
  ...Array.from({ length: 5 }, (_, i) => ({
    id: `p-${i}`,
    tenantId: TENANT_ID,
    propertyId: `prop-${i}`,
    title: `Travaux ${i}`,
    status: 'PLANNED' as const,
    plannedDate: `2026-0${i + 1}-01T00:00:00.000Z`,
    property: { id: `prop-${i}`, title: `Bien ${i}`, internalReference: `REF-${i}` }
  })),
  {
    id: 'p-done-1',
    tenantId: TENANT_ID,
    propertyId: 'prop-9',
    title: 'Travaux termines',
    status: 'COMPLETED',
    plannedDate: '2026-07-01T00:00:00.000Z',
    property: { id: 'prop-9', title: 'Bien 9', internalReference: 'REF-9' }
  },
  {
    id: 'p-done-2',
    tenantId: TENANT_ID,
    propertyId: 'prop-8',
    title: 'Autres travaux termines',
    status: 'COMPLETED',
    plannedDate: '2026-08-01T00:00:00.000Z',
    property: { id: 'prop-8', title: 'Bien 8', internalReference: 'REF-8' }
  },
  {
    id: 'p-other-tenant',
    tenantId: TENANT_OTHER_ID,
    propertyId: 'prop-x',
    title: "Travaux d'une autre agence",
    status: 'PLANNED',
    plannedDate: '2026-01-01T00:00:00.000Z',
    property: { id: 'prop-x', title: 'Bien X', internalReference: 'REF-X' }
  }
];

jest.mock('../../src/utils/database', () => ({
  prisma: {
    workProgram: {
      findMany: jest.fn(async ({ where, skip = 0, take = 25 }: any) => {
        const rows = PROGRAMS.filter(
          p => p.tenantId === where.tenantId && (!where.status || p.status === where.status)
        ).sort((a, b) => a.plannedDate.localeCompare(b.plannedDate));
        return rows.slice(skip, skip + take);
      }),
      count: jest.fn(
        async ({ where }: any) =>
          PROGRAMS.filter(p => p.tenantId === where.tenantId && (!where.status || p.status === where.status)).length
      )
    }
  }
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const patrimoineRoutes = require('../../src/routes/patrimoine-routes').default;

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api', patrimoineRoutes);
  return app;
}

describe('GET /api/tenants/:tenantId/work-programs', () => {
  const app = buildApp();

  it('rend les programmes de toute l’agence en une seule requête', async () => {
    const res = await request(app).get(`/api/tenants/${TENANT_ID}/work-programs`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    // 7 chez cette agence : 5 planifies + 2 termines.
    expect(res.body.data.total).toBe(7);
    expect(res.body.data.items).toHaveLength(7);
  });

  it('n’expose jamais les programmes d’une autre agence', async () => {
    const res = await request(app).get(`/api/tenants/${TENANT_ID}/work-programs`);
    const ids = res.body.data.items.map((i: Program) => i.id);
    expect(ids).not.toContain('p-other-tenant');
  });

  it('filtre par statut côté serveur', async () => {
    const res = await request(app).get(`/api/tenants/${TENANT_ID}/work-programs?status=COMPLETED`);
    expect(res.status).toBe(200);
    expect(res.body.data.total).toBe(2);
    expect(res.body.data.items.every((i: Program) => i.status === 'COMPLETED')).toBe(true);
  });

  it('pagine côté serveur', async () => {
    const page1 = await request(app).get(`/api/tenants/${TENANT_ID}/work-programs?page=1&limit=3`);
    expect(page1.body.data.items).toHaveLength(3);
    expect(page1.body.data.totalPages).toBe(3);

    const page3 = await request(app).get(`/api/tenants/${TENANT_ID}/work-programs?page=3&limit=3`);
    expect(page3.body.data.items).toHaveLength(1);

    // Aucun chevauchement entre les pages.
    const ids1 = page1.body.data.items.map((i: Program) => i.id);
    const ids3 = page3.body.data.items.map((i: Program) => i.id);
    expect(ids1.some((id: string) => ids3.includes(id))).toBe(false);
  });

  it('plafonne la taille de page à 100', async () => {
    // Une page plus large signale un appelant qui veut tout charger, ce que
    // cet endpoint remplace precisement.
    const res = await request(app).get(`/api/tenants/${TENANT_ID}/work-programs?limit=5000`);
    expect(res.body.data.limit).toBe(100);
  });

  it('refuse un statut inconnu plutôt que de l’ignorer', async () => {
    // Un filtre silencieusement ignore rendrait TOUTE la liste en la faisant
    // passer pour un resultat filtre.
    const res = await request(app).get(`/api/tenants/${TENANT_ID}/work-programs?status=INEXISTANT`);
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('joint le bien à chaque programme, pour éviter un second appel', async () => {
    const res = await request(app).get(`/api/tenants/${TENANT_ID}/work-programs?limit=1`);
    expect(res.body.data.items[0].property).toEqual(
      expect.objectContaining({ id: expect.any(String), title: expect.any(String) })
    );
  });
});
