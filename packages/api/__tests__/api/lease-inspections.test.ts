import express from 'express';
import request from 'supertest';

/**
 * `/api/tenants/:tenantId/rental/leases/:leaseId/inspections` — états des
 * lieux d'entrée et de sortie, lot 5 (section B) de la gestion locative.
 *
 * Prisma simulé sur le modèle de `__tests__/api/settings.finance.test.ts` :
 * un `Map` en mémoire tient lieu de tables `rental_leases` et
 * `lease_inspections`. Quatre comportements fixés : la création refuse un
 * doublon de type (409), la mise à jour est refusée une fois finalisé (409),
 * la finalisation exige un signataire (400), et un bail d'une autre agence
 * n'existe pas pour l'appelant (404).
 */

const mockPermissionsAsked: string[] = [];

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

jest.mock('../../src/middleware/rbac-middleware', () => ({
  requirePermission: (key: string) => {
    mockPermissionsAsked.push(key);
    return (_req: any, _res: any, next: any) => next();
  }
}));

const mockLeases = new Map<string, { id: string; tenant_id: string }>();
const mockInspections = new Map<string, any>();
let mockInspectionSeq = 0;

function matchesWhere(row: any, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([key, value]) => row[key] === value);
}

jest.mock('../../src/utils/database', () => ({
  prisma: {
    rentalLease: {
      findFirst: jest.fn(async ({ where }: any) => {
        const lease = mockLeases.get(where.id as string);
        return lease && lease.tenant_id === where.tenant_id ? lease : null;
      })
    },
    leaseInspection: {
      findFirst: jest.fn(async ({ where }: any) => {
        return [...mockInspections.values()].find(row => matchesWhere(row, where)) ?? null;
      }),
      findMany: jest.fn(async ({ where }: any) => {
        return [...mockInspections.values()].filter(row => matchesWhere(row, where));
      }),
      create: jest.fn(async ({ data }: any) => {
        mockInspectionSeq += 1;
        const row = {
          id: `insp-${mockInspectionSeq}`,
          status: 'DRAFT',
          meters: null,
          keysCount: null,
          generalComment: null,
          tenantPresent: true,
          tenantSignatoryName: null,
          agentSignatoryName: null,
          finalizedAt: null,
          finalizedByUserId: null,
          createdAt: new Date('2026-09-01T10:00:00Z'),
          updatedAt: new Date('2026-09-01T10:00:00Z'),
          photos: [],
          ...data
        };
        mockInspections.set(row.id, row);
        return row;
      }),
      update: jest.fn(async ({ where, data }: any) => {
        const row = mockInspections.get(where.id);
        Object.assign(row, data);
        return row;
      }),
      delete: jest.fn(async ({ where }: any) => {
        mockInspections.delete(where.id);
        return {};
      })
    },
    leaseInspectionPhoto: {
      findFirst: jest.fn(async () => null),
      create: jest.fn(),
      delete: jest.fn()
    }
  }
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const routes = require('../../src/routes/lease-inspection-routes').default;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { errorHandler } = require('../../src/middleware/error-middleware');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api', routes);
  app.use(errorHandler);
  return app;
}

/** Évalue chaque élément (état GOOD ; quantité 1 pour un mobilier qui n'en a pas). */
function evaluateAll(rooms: any[]): void {
  for (const r of rooms) {
    for (const i of r.items) {
      i.condition = 'GOOD';
      if (i.kind === 'FURNITURE' && i.quantity == null) i.quantity = 1;
    }
  }
}

/** Corps complet d'un `PUT …/inspections/:id`. */
function putBody(rooms: unknown[]) {
  return {
    inspectionDate: '2026-09-01',
    rooms,
    meters: null,
    keysCount: null,
    generalComment: null,
    tenantPresent: false,
    tenantSignatoryName: null,
    agentSignatoryName: null,
    deductions: []
  };
}

describe('États des lieux', () => {
  const app = buildApp();

  beforeEach(() => {
    mockLeases.clear();
    mockInspections.clear();
    mockInspectionSeq = 0;
    jest.clearAllMocks();
    mockLeases.set('lease-1', { id: 'lease-1', tenant_id: 'tenant-1' });
  });

  it('porte la permission des baux sur chaque route, lecture ou écriture selon le cas', () => {
    // Les gardes sont posées une fois, à l'enregistrement des routes (import
    // du routeur), pas à chaque requête : cette liste reflète l'ordre des
    // `router.get/post/put/delete` dans `lease-inspection-routes.ts`.
    expect(mockPermissionsAsked).toEqual([
      'RENTAL_LEASES_VIEW', // GET /inspections
      'RENTAL_LEASES_EDIT', // POST /inspections
      'RENTAL_LEASES_VIEW', // GET /inspections/compare
      'RENTAL_LEASES_EDIT', // PUT /inspections/:id
      'RENTAL_LEASES_EDIT', // DELETE /inspections/:id
      'RENTAL_LEASES_EDIT', // POST /inspections/:id/finalize
      'RENTAL_LEASES_EDIT', // POST /inspections/:id/photos
      'RENTAL_LEASES_VIEW', // GET /inspections/:id/photos/:photoId/file
      'RENTAL_LEASES_EDIT' // DELETE /inspections/:id/photos/:photoId
    ]);
  });

  describe('création', () => {
    it("crée un état des lieux d'entrée avec le modèle de pièces par défaut", async () => {
      const res = await request(app)
        .post('/api/tenants/tenant-1/rental/leases/lease-1/inspections')
        .send({ type: 'ENTRY', inspectionDate: '2026-09-01' });

      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({ type: 'ENTRY', status: 'DRAFT', deductions: [] });
      expect(res.body.data.rooms.length).toBeGreaterThan(0);
      expect(res.body.data.rooms[0].name).toBe('Entrée/Séjour');
    });

    it('refuse un deuxième état des lieux du même type (409)', async () => {
      await request(app)
        .post('/api/tenants/tenant-1/rental/leases/lease-1/inspections')
        .send({ type: 'ENTRY', inspectionDate: '2026-09-01' });

      const res = await request(app)
        .post('/api/tenants/tenant-1/rental/leases/lease-1/inspections')
        .send({ type: 'ENTRY', inspectionDate: '2026-09-02' });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
    });

    it("reprend les pièces et éléments de l'entrée, avec les mêmes identifiants, pour la sortie", async () => {
      const entryRes = await request(app)
        .post('/api/tenants/tenant-1/rental/leases/lease-1/inspections')
        .send({ type: 'ENTRY', inspectionDate: '2026-09-01' });

      const exitRes = await request(app)
        .post('/api/tenants/tenant-1/rental/leases/lease-1/inspections')
        .send({ type: 'EXIT', inspectionDate: '2026-10-01' });

      expect(exitRes.status).toBe(201);
      expect(exitRes.body.data.rooms.map((r: any) => r.id)).toEqual(entryRes.body.data.rooms.map((r: any) => r.id));
      expect(exitRes.body.data.rooms[0].items[0].condition).toBeNull();
    });
  });

  describe('mise à jour', () => {
    it('refuse la mise à jour une fois finalisé (409)', async () => {
      const createRes = await request(app)
        .post('/api/tenants/tenant-1/rental/leases/lease-1/inspections')
        .send({ type: 'ENTRY', inspectionDate: '2026-09-01' });
      const inspectionId = createRes.body.data.id;

      // Finalisé directement en base simulée : le chemin de finalisation est
      // testé séparément plus bas.
      mockInspections.get(inspectionId).status = 'FINALIZED';

      const res = await request(app)
        .put(`/api/tenants/tenant-1/rental/leases/lease-1/inspections/${inspectionId}`)
        .send({
          inspectionDate: '2026-09-01',
          rooms: createRes.body.data.rooms,
          meters: null,
          keysCount: null,
          generalComment: null,
          tenantPresent: true,
          tenantSignatoryName: null,
          agentSignatoryName: null,
          deductions: []
        });

      expect(res.status).toBe(409);
    });

    it('accepte la mise à jour d’un brouillon et renvoie les champs modifiés', async () => {
      const createRes = await request(app)
        .post('/api/tenants/tenant-1/rental/leases/lease-1/inspections')
        .send({ type: 'ENTRY', inspectionDate: '2026-09-01' });
      const inspectionId = createRes.body.data.id;

      const res = await request(app)
        .put(`/api/tenants/tenant-1/rental/leases/lease-1/inspections/${inspectionId}`)
        .send({
          inspectionDate: '2026-09-01',
          rooms: createRes.body.data.rooms,
          meters: { electricity: '00123' },
          keysCount: 3,
          generalComment: 'RAS',
          tenantPresent: false,
          tenantSignatoryName: null,
          agentSignatoryName: 'Agent Test',
          deductions: []
        });

      expect(res.status).toBe(200);
      expect(res.body.data.keysCount).toBe(3);
      // Les compteurs non fournis sont normalisés à `null`, pas omis : le
      // corps envoyé porte toujours l'objet `meters` complet.
      expect(res.body.data.meters).toEqual({ electricity: '00123', water: null, gas: null });
    });
  });

  describe('finalisation', () => {
    it('refuse de finaliser sans signataire agence (400)', async () => {
      const createRes = await request(app)
        .post('/api/tenants/tenant-1/rental/leases/lease-1/inspections')
        .send({ type: 'ENTRY', inspectionDate: '2026-09-01' });
      const inspectionId = createRes.body.data.id;

      const res = await request(app).post(
        `/api/tenants/tenant-1/rental/leases/lease-1/inspections/${inspectionId}/finalize`
      );

      expect(res.status).toBe(400);
    });

    it('refuse de finaliser sans état renseigné sur au moins un élément (400)', async () => {
      const createRes = await request(app)
        .post('/api/tenants/tenant-1/rental/leases/lease-1/inspections')
        .send({ type: 'ENTRY', inspectionDate: '2026-09-01' });
      const inspectionId = createRes.body.data.id;
      mockInspections.get(inspectionId).agentSignatoryName = 'Agent Test';
      mockInspections.get(inspectionId).tenantPresent = false;

      const res = await request(app).post(
        `/api/tenants/tenant-1/rental/leases/lease-1/inspections/${inspectionId}/finalize`
      );

      expect(res.status).toBe(400);
    });

    it('finalise quand le signataire agence est renseigné et tous les éléments évalués', async () => {
      const createRes = await request(app)
        .post('/api/tenants/tenant-1/rental/leases/lease-1/inspections')
        .send({ type: 'ENTRY', inspectionDate: '2026-09-01' });
      const inspectionId = createRes.body.data.id;
      const row = mockInspections.get(inspectionId);
      row.agentSignatoryName = 'Agent Test';
      row.tenantPresent = false;
      evaluateAll(row.rooms);

      const res = await request(app).post(
        `/api/tenants/tenant-1/rental/leases/lease-1/inspections/${inspectionId}/finalize`
      );

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('FINALIZED');
      expect(res.body.data.finalizedAt).not.toBeNull();
    });

    it('refuse de finaliser une seconde fois (409)', async () => {
      const createRes = await request(app)
        .post('/api/tenants/tenant-1/rental/leases/lease-1/inspections')
        .send({ type: 'ENTRY', inspectionDate: '2026-09-01' });
      const inspectionId = createRes.body.data.id;
      mockInspections.get(inspectionId).status = 'FINALIZED';

      const res = await request(app).post(
        `/api/tenants/tenant-1/rental/leases/lease-1/inspections/${inspectionId}/finalize`
      );

      expect(res.status).toBe(409);
    });
  });

  describe('volet meublés (spec 040, M1 à M5)', () => {
    const BASE = '/api/tenants/tenant-1/rental/leases/lease-1/inspections';

    async function create(body: Record<string, unknown>) {
      return request(app)
        .post(BASE)
        .send({ inspectionDate: '2026-09-01', ...body });
    }

    async function finalizedEntry(template?: 'FURNISHED') {
      const res = await create({ type: 'ENTRY', ...(template ? { template } : {}) });
      const row = mockInspections.get(res.body.data.id);
      evaluateAll(row.rooms);
      row.status = 'FINALIZED';
      return row;
    }

    it('crée six pièces, bâti puis mobilier, avec le modèle FURNISHED', async () => {
      const res = await create({ type: 'ENTRY', template: 'FURNISHED' });
      expect(res.status).toBe(201);
      const rooms = res.body.data.rooms;
      expect(rooms).toHaveLength(6);
      expect(rooms[5].name).toBe('Équipements et divers');
      const sejour = rooms[0].items;
      expect(sejour[0]).toMatchObject({ kind: 'FIXTURE', quantity: null, replacementValue: null });
      const tv = sejour.find((i: any) => i.label === 'Téléviseur');
      expect(tv).toMatchObject({ kind: 'FURNITURE', quantity: 1, replacementValue: null, condition: null });
      const ids = rooms.flatMap((r: any) => r.items.map((i: any) => i.id));
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('garde le modèle actuel sans `template`, éléments normalisés en bâti', async () => {
      const res = await create({ type: 'ENTRY' });
      expect(res.body.data.rooms).toHaveLength(5);
      for (const r of res.body.data.rooms) {
        for (const i of r.items) expect(i).toMatchObject({ kind: 'FIXTURE', quantity: null, replacementValue: null });
      }
    });

    it('reprend nature et valeur de l’entrée pour la sortie, quantités vidées, `template` ignoré', async () => {
      const entryRes = await create({ type: 'ENTRY', template: 'FURNISHED' });
      const entryRow = mockInspections.get(entryRes.body.data.id);
      const tv = entryRow.rooms[0].items.find((i: any) => i.label === 'Téléviseur');
      tv.replacementValue = 150000;
      tv.quantity = 2;

      const exitRes = await create({ type: 'EXIT', template: 'STANDARD' });
      expect(exitRes.body.data.rooms).toHaveLength(6);
      const exitTv = exitRes.body.data.rooms[0].items.find((i: any) => i.id === tv.id);
      expect(exitTv).toMatchObject({ kind: 'FURNITURE', replacementValue: 150000, quantity: null, condition: null });
    });

    it('applique le modèle demandé à une sortie sans entrée, quantités vides', async () => {
      const res = await create({ type: 'EXIT', template: 'FURNISHED' });
      const furniture = res.body.data.rooms.flatMap((r: any) => r.items).filter((i: any) => i.kind === 'FURNITURE');
      expect(furniture.length).toBeGreaterThan(0);
      expect(furniture.every((i: any) => i.quantity === null)).toBe(true);
    });

    it('accepte un document ancien dont les éléments ignorent les nouveaux champs', async () => {
      const createRes = await create({ type: 'ENTRY' });
      const legacyRooms = createRes.body.data.rooms.map((r: any) => ({
        ...r,
        items: r.items.map(({ id, label, condition, comment }: any) => ({ id, label, condition, comment }))
      }));
      const res = await request(app).put(`${BASE}/${createRes.body.data.id}`).send(putBody(legacyRooms));
      expect(res.status).toBe(200);
      expect(res.body.data.rooms[0].items[0]).toMatchObject({
        kind: 'FIXTURE',
        quantity: null,
        replacementValue: null
      });
      expect(res.body.data.deductions).toEqual([]);
    });

    it('ramène à 0 la quantité d’un mobilier manquant et accepte MISSING sur le bâti', async () => {
      const createRes = await create({ type: 'ENTRY', template: 'FURNISHED' });
      const rooms = createRes.body.data.rooms;
      const tv = rooms[0].items.find((i: any) => i.label === 'Téléviseur');
      tv.condition = 'MISSING';
      tv.quantity = 3;
      rooms[0].items[0].condition = 'MISSING';
      const res = await request(app).put(`${BASE}/${createRes.body.data.id}`).send(putBody(rooms));
      expect(res.status).toBe(200);
      const saved = res.body.data.rooms[0].items;
      expect(saved.find((i: any) => i.id === tv.id)).toMatchObject({ condition: 'MISSING', quantity: 0 });
      expect(saved[0]).toMatchObject({ condition: 'MISSING', quantity: null });
    });

    it('refuse une quantité sur un élément de bâti (400)', async () => {
      const createRes = await create({ type: 'ENTRY' });
      const rooms = createRes.body.data.rooms;
      rooms[0].items[0].quantity = 2;
      const res = await request(app).put(`${BASE}/${createRes.body.data.id}`).send(putBody(rooms));
      expect(res.status).toBe(400);
      expect(res.body.errors.map((e: any) => e.message)).toContain('Seul un élément de mobilier porte une quantité.');
    });

    it('conserve source et montant proposé des retenues', async () => {
      const createRes = await create({ type: 'ENTRY' });
      const deductions = [
        {
          id: 'd1',
          label: 'Téléviseur',
          amount: 120000,
          roomId: null,
          itemId: 'x',
          source: 'MISSING',
          proposedAmount: 150000
        },
        { id: 'd2', label: 'Ménage', amount: 5000, roomId: null, itemId: null }
      ];
      const res = await request(app)
        .put(`${BASE}/${createRes.body.data.id}`)
        .send({ ...putBody(createRes.body.data.rooms), deductions });
      expect(res.status).toBe(200);
      expect(res.body.data.deductions[0]).toMatchObject({ source: 'MISSING', proposedAmount: 150000, amount: 120000 });
      expect(res.body.data.deductions[1]).toMatchObject({ source: 'MANUAL', proposedAmount: null });
    });

    it('refuse de retirer de la sortie un élément de l’entrée finalisée (400, data.removedItems)', async () => {
      await finalizedEntry('FURNISHED');
      const exitRes = await create({ type: 'EXIT' });
      const rooms = exitRes.body.data.rooms;
      const removed = rooms[0].items.pop();
      const res = await request(app).put(`${BASE}/${exitRes.body.data.id}`).send(putBody(rooms));
      expect(res.status).toBe(400);
      expect(res.body.message).toBe(
        "Un élément repris de l'état des lieux d'entrée ne peut pas être retiré de la sortie : indiquez « Manquant »."
      );
      expect(res.body.data.removedItems).toEqual([{ itemId: removed.id, label: removed.label }]);
    });

    it('tolère le retrait quand l’entrée est encore en brouillon', async () => {
      await create({ type: 'ENTRY', template: 'FURNISHED' });
      const exitRes = await create({ type: 'EXIT' });
      const rooms = exitRes.body.data.rooms;
      rooms[0].items.pop();
      const res = await request(app).put(`${BASE}/${exitRes.body.data.id}`).send(putBody(rooms));
      expect(res.status).toBe(200);
    });

    it('fige libellé, nature et valeur d’un élément repris de l’entrée finalisée', async () => {
      const entryRow = await finalizedEntry('FURNISHED');
      const entryTv = entryRow.rooms[0].items.find((i: any) => i.label === 'Téléviseur');
      entryTv.replacementValue = 150000;
      const exitRes = await create({ type: 'EXIT' });
      const rooms = exitRes.body.data.rooms;
      const tv = rooms[0].items.find((i: any) => i.id === entryTv.id);
      tv.label = 'Carton vide';
      tv.replacementValue = 1;
      const res = await request(app).put(`${BASE}/${exitRes.body.data.id}`).send(putBody(rooms));
      expect(res.status).toBe(200);
      expect(res.body.data.rooms[0].items.find((i: any) => i.id === entryTv.id)).toMatchObject({
        label: 'Téléviseur',
        kind: 'FURNITURE',
        replacementValue: 150000
      });
    });

    it('refuse de finaliser tant qu’un élément n’est pas évalué (400, data.unevaluatedItems)', async () => {
      const createRes = await create({ type: 'ENTRY', template: 'FURNISHED' });
      const row = mockInspections.get(createRes.body.data.id);
      row.agentSignatoryName = 'Agent Test';
      row.tenantPresent = false;
      evaluateAll(row.rooms);
      row.rooms[0].items[0].condition = null;
      const tv = row.rooms[0].items.find((i: any) => i.label === 'Téléviseur');
      tv.quantity = null;

      const res = await request(app).post(`${BASE}/${createRes.body.data.id}/finalize`);
      expect(res.status).toBe(400);
      expect(res.body.message).toBe('Tous les éléments doivent être évalués avant de finaliser.');
      expect(res.body.data.unevaluatedItems).toEqual([
        expect.objectContaining({ itemId: row.rooms[0].items[0].id, roomName: 'Entrée/Séjour', missing: 'CONDITION' }),
        expect.objectContaining({ itemId: tv.id, label: 'Téléviseur', missing: 'QUANTITY' })
      ]);
    });

    it('garde le refus historique pour un document sans aucun élément', async () => {
      const createRes = await create({ type: 'ENTRY' });
      const row = mockInspections.get(createRes.body.data.id);
      row.agentSignatoryName = 'Agent Test';
      row.tenantPresent = false;
      row.rooms = [];
      const res = await request(app).post(`${BASE}/${createRes.body.data.id}/finalize`);
      expect(res.status).toBe(400);
      expect(res.body.message).toBe('Au moins un élément doit avoir un état renseigné avant de finaliser.');
    });

    it('compare : manquants, baisses de quantité et synthèse des clés', async () => {
      const entryRow = await finalizedEntry('FURNISHED');
      entryRow.keysCount = 3;
      const entryItems = entryRow.rooms[0].items;
      const tv = entryItems.find((i: any) => i.label === 'Téléviseur');
      tv.replacementValue = 150000;
      const chairs = entryItems.find((i: any) => i.label === 'Chaises');
      chairs.quantity = 6;

      const exitRes = await create({ type: 'EXIT' });
      const exitRow = mockInspections.get(exitRes.body.data.id);
      evaluateAll(exitRow.rooms);
      exitRow.keysCount = 2;
      exitRow.rooms[0].items.find((i: any) => i.id === tv.id).condition = 'MISSING';
      exitRow.rooms[0].items.find((i: any) => i.id === chairs.id).quantity = 4;

      const res = await request(app).get(`${BASE}/compare`);
      expect(res.status).toBe(200);
      const rows = res.body.data.rows;
      expect(rows.find((r: any) => r.itemId === tv.id)).toMatchObject({ missing: true, missingValue: 150000 });
      expect(rows.find((r: any) => r.itemId === chairs.id)).toMatchObject({ quantityDecrease: 2, missingQuantity: 2 });
      expect(res.body.data.summary.keys).toEqual({ entry: 3, exit: 2, missing: 1 });
      expect(res.body.data.summary).toMatchObject({
        missingCount: 1,
        quantityDecreaseCount: 1,
        missingValueTotal: 150000
      });
    });
  });

  describe('isolation multi-tenant', () => {
    it("un bail d'une autre agence n'existe pas pour l'appelant (404)", async () => {
      const res = await request(app).get('/api/tenants/tenant-2/rental/leases/lease-1/inspections');
      expect(res.status).toBe(404);
    });

    it("un bail d'une autre agence renvoie 404 même à la création", async () => {
      const res = await request(app)
        .post('/api/tenants/tenant-2/rental/leases/lease-1/inspections')
        .send({ type: 'ENTRY', inspectionDate: '2026-09-01' });
      expect(res.status).toBe(404);
    });
  });
});
