import express from 'express';
import request from 'supertest';
import { randomUUID } from 'crypto';

/**
 * Regularisation fonciere (spec 033, lot B2), de bout en bout via supertest
 * sur le vrai routeur. Authentification, acces agence et permissions sont des
 * passe-plats ; Prisma est remplace par une base en memoire qui reproduit les
 * filtres `where` utilises par le service (id, tenantId, propertyId, status).
 * L'index unique partiel est couvert separement par la migration SQL ; ici,
 * une violation P2002 est simulee pour verifier sa traduction en 409.
 */

const mockState = {
  permissions: new Set<string>(['PROPERTIES_VIEW', 'PROPERTIES_EDIT']),
  failNextRegularizationCreateWithP2002: false
};

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
jest.mock('../../src/middleware/property-rbac-middleware', () => {
  const guard = (key: string) => (_req: any, res: any, next: any) =>
    mockState.permissions.has(key)
      ? next()
      : res.status(403).json({ success: false, message: `Permission denied: ${key}` });
  return {
    requireAnyPropertyPermission: (keys: string[]) => guard(keys[0]),
    requirePropertyPermission: (key: string) => guard(key)
  };
});

const mockAudit = jest.fn();
const mockEvents: string[] = [];
const mockWrites: Array<{ op: string; where: Record<string, unknown> }> = [];
const mockLocks: Array<{ sql: string; values: unknown[] }> = [];
jest.mock('../../src/services/audit-service', () => ({
  logAuditEvent: (...args: any[]) => mockAudit(...args),
  flushAuditEvents: jest.fn()
}));

type Row = Record<string, any>;
const mockDb = { properties: [] as Row[], documents: [] as Row[], regs: [] as Row[], steps: [] as Row[] };

jest.mock('../../src/utils/database', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { Prisma } = require('@prisma/client');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { randomUUID: uuid } = require('crypto');

  const matches = (row: Row, where: Row = {}) => Object.entries(where).every(([k, v]) => row[k] === v);
  const defined = (data: Row) => Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined));

  const withRelations = (reg: Row, args: Row) => {
    if (!args?.include) return reg;
    const property = mockDb.properties.find(p => p.id === reg.propertyId) as Row;
    const steps = mockDb.steps
      .filter(s => s.regularizationId === reg.id)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map(s => ({ ...s, document: mockDb.documents.find(d => d.id === s.documentId) ?? null }));
    return {
      ...reg,
      property: { id: property.id, internalReference: property.internalReference, title: property.title },
      steps
    };
  };

  const prisma: Row = {
    property: { findFirst: async ({ where }: Row) => mockDb.properties.find(p => matches(p, where)) ?? null },
    propertyDocument: { findFirst: async ({ where }: Row) => mockDb.documents.find(d => matches(d, where)) ?? null },
    landRegularization: {
      findFirst: async (args: Row) => {
        mockEvents.push('read');
        const row = mockDb.regs.find(r => matches(r, args.where));
        return row ? withRelations(row, args) : null;
      },
      findMany: async (args: Row) => mockDb.regs.filter(r => matches(r, args.where)).map(r => withRelations(r, args)),
      create: async ({ data }: Row) => {
        if (mockState.failNextRegularizationCreateWithP2002) {
          mockState.failNextRegularizationCreateWithP2002 = false;
          throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
        }
        const now = new Date();
        const row = {
          id: uuid(),
          status: 'EN_COURS',
          endedAt: null,
          notes: null,
          createdAt: now,
          updatedAt: now,
          ...defined(data)
        };
        mockDb.regs.push(row);
        return { id: row.id };
      },
      update: async ({ where, data }: Row) => {
        mockWrites.push({ op: 'landRegularization.update', where });
        const row = mockDb.regs.find(r => matches(r, where)) as Row;
        Object.assign(row, defined(data), { updatedAt: new Date() });
        return row;
      }
    },
    landRegularizationStep: {
      createMany: async ({ data }: Row) => {
        data.forEach((d: Row) => prisma.landRegularizationStep.create({ data: d }));
        return { count: data.length };
      },
      create: async ({ data }: Row) => {
        const now = new Date();
        const row = {
          id: uuid(),
          status: 'A_FAIRE',
          startedAt: null,
          completedAt: null,
          dueDate: null,
          notes: null,
          documentId: null,
          costXof: new Prisma.Decimal(0),
          createdAt: now,
          updatedAt: now,
          ...defined(data)
        };
        mockDb.steps.push(row);
        return { id: row.id };
      },
      update: async ({ where, data }: Row) => {
        mockWrites.push({ op: 'landRegularizationStep.update', where });
        const row = mockDb.steps.find(s => matches(s, where)) as Row;
        // `null` est une valeur (completedAt remis a zero) : seul `undefined` est ignore.
        Object.assign(row, defined(data), { updatedAt: new Date() });
        return row;
      },
      delete: async ({ where }: Row) => {
        mockWrites.push({ op: 'landRegularizationStep.delete', where });
        mockDb.steps.splice(
          mockDb.steps.findIndex(s => matches(s, where)),
          1
        );
      }
    },
    $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      mockEvents.push('lock');
      mockLocks.push({ sql: strings.join('?'), values });
      return [];
    },
    $transaction: async (fn: (tx: Row) => Promise<unknown>) => fn(prisma)
  };
  return { prisma };
});

// eslint-disable-next-line @typescript-eslint/no-var-requires
const landRoutes = require('../../src/routes/patrimoine-land-routes').default;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { errorHandler } = require('../../src/middleware/error-middleware');

const T1 = 'tenant-1';
const T2 = 'tenant-2';
const PROP_A = randomUUID();
const PROP_B = randomUUID();
const PROP_X = randomUUID();
const DOC_A = randomUUID();
const DOC_B = randomUUID();
const DOC_X = randomUUID();
const UNKNOWN = randomUUID();

function seed() {
  mockDb.properties = [
    { id: PROP_A, tenantId: T1, internalReference: 'REF-A', title: 'Terrain A' },
    { id: PROP_B, tenantId: T1, internalReference: 'REF-B', title: 'Terrain B' },
    { id: PROP_X, tenantId: T2, internalReference: 'REF-X', title: 'Terrain X' }
  ];
  mockDb.documents = [
    { id: DOC_A, tenantId: T1, propertyId: PROP_A, fileName: 'plan-a.pdf', documentType: 'PLAN' },
    { id: DOC_B, tenantId: T1, propertyId: PROP_B, fileName: 'plan-b.pdf', documentType: 'PLAN' },
    { id: DOC_X, tenantId: T2, propertyId: PROP_X, fileName: 'plan-x.pdf', documentType: 'PLAN' }
  ];
  mockDb.regs = [];
  mockDb.steps = [];
  mockAudit.mockClear();
  mockEvents.length = 0;
  mockWrites.length = 0;
  mockLocks.length = 0;
  mockState.permissions = new Set(['PROPERTIES_VIEW', 'PROPERTIES_EDIT']);
  mockState.failNextRegularizationCreateWithP2002 = false;
}

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api', landRoutes);
  app.use(errorHandler);
  return app;
}

const app = buildApp();
const base = (tenant = T1) => `/api/tenants/${tenant}/patrimoine`;
const regs = (tenant = T1) => `${base(tenant)}/land-regularizations`;

async function createCi(propertyId = PROP_A, tenant = T1) {
  const res = await request(app).post(regs(tenant)).send({ propertyId, track: 'CI_ACD' });
  expect(res.status).toBe(201);
  return res.body.data;
}

async function createCustom(steps: Array<Record<string, unknown>>, propertyId = PROP_A) {
  const res = await request(app).post(regs()).send({ propertyId, track: 'PERSONNALISEE', steps });
  expect(res.status).toBe(201);
  return res.body.data;
}

function stepStatus(regId: string, stepId: string, status: string, reason?: string) {
  return request(app).post(`${regs()}/${regId}/steps/${stepId}/status`).send({ status, reason });
}

async function completeAll(reg: any) {
  for (const step of reg.steps) {
    const res = await stepStatus(reg.id, step.id, 'TERMINEE');
    expect(res.status).toBe(200);
  }
}

beforeEach(seed);

describe('GET land-tracks', () => {
  it('rend la filiere CI_ACD (6 etapes ordonnees) et la filiere personnalisee', async () => {
    const res = await request(app).get(`${base()}/land-tracks`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const [ci, custom] = res.body.data;
    expect(ci).toMatchObject({ key: 'CI_ACD', country: 'CI', validationStatus: 'A_VALIDER' });
    expect(ci.validationNote).toEqual(expect.any(String));
    expect(ci.steps.map((s: any) => s.order)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(ci.steps[0]).toEqual({
      key: 'attestation_villageoise',
      order: 1,
      label: 'Attestation villageoise',
      required: true,
      indicativeDurationDays: null,
      suggestedDocumentType: 'OTHER'
    });
    expect(custom).toMatchObject({
      key: 'PERSONNALISEE',
      country: null,
      validationStatus: 'NON_APPLICABLE',
      steps: []
    });
  });
});

describe('creation', () => {
  it('cree un dossier CI_ACD avec ses 6 etapes, son resume et son audit', async () => {
    const data = await createCi();
    expect(data).toMatchObject({
      propertyId: PROP_A,
      property: { id: PROP_A, internalReference: 'REF-A', title: 'Terrain A' },
      track: 'CI_ACD',
      status: 'EN_COURS',
      validationStatus: 'A_VALIDER',
      feesXof: 0,
      overdueSteps: 0,
      nextDueDate: null,
      currentStepLabel: 'Attestation villageoise',
      progress: { total: 6, required: 6, completed: 0, completedRequired: 0, percent: 0 }
    });
    expect(data.validationNote).toMatch(/juriste local/);
    expect(data.steps.map((s: any) => s.stepKey)).toEqual([
      'attestation_villageoise',
      'dossier_technique_geometre',
      'bornage_contradictoire',
      'demande_acd',
      'acd',
      'titre_foncier'
    ]);
    expect(data.steps[0]).toMatchObject({
      order: 1,
      status: 'A_FAIRE',
      suggestedDocumentType: 'OTHER',
      costXof: 0,
      document: null,
      isOverdue: false,
      allowedTransitions: ['EN_COURS', 'BLOQUEE', 'TERMINEE']
    });
    expect(data.steps[1].allowedTransitions).toEqual(['EN_COURS', 'BLOQUEE']);
    expect(data.steps[4].suggestedDocumentType).toBe('LAND_CONCESSION');
    expect(mockAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: T1,
        actorUserId: 'user-1',
        actionKey: 'LAND_REGULARIZATION_CREATED',
        entityType: 'LandRegularization',
        entityId: data.id
      })
    );
  });

  it('cree un dossier personnalise : cles custom_<n>, type de piece OTHER', async () => {
    const data = await createCustom([{ label: 'Visite du terrain' }, { label: 'Depot en mairie', required: false }]);
    expect(data.track).toBe('PERSONNALISEE');
    expect(data.validationStatus).toBe('NON_APPLICABLE');
    expect(data.validationNote).toBeNull();
    expect(data.steps.map((s: any) => [s.stepKey, s.label, s.required, s.suggestedDocumentType])).toEqual([
      ['custom_1', 'Visite du terrain', true, 'OTHER'],
      ['custom_2', 'Depot en mairie', false, 'OTHER']
    ]);
  });

  it('refuse des steps sur CI_ACD, leur absence sur PERSONNALISEE, 0 ou 31 etapes et les champs inconnus (400)', async () => {
    const post = (body: object) => request(app).post(regs()).send(body);
    expect((await post({ propertyId: PROP_A, track: 'CI_ACD', steps: [{ label: 'x' }] })).status).toBe(400);
    expect((await post({ propertyId: PROP_A, track: 'PERSONNALISEE' })).status).toBe(400);
    expect((await post({ propertyId: PROP_A, track: 'PERSONNALISEE', steps: [] })).status).toBe(400);
    const tooMany = Array.from({ length: 31 }, (_, i) => ({ label: `Etape ${i}` }));
    expect((await post({ propertyId: PROP_A, track: 'PERSONNALISEE', steps: tooMany })).status).toBe(400);
    expect((await post({ propertyId: PROP_A, track: 'CI_ACD', surprise: true })).status).toBe(400);
    expect((await post({ propertyId: PROP_A, track: 'MALI' })).status).toBe(400);
    expect(mockDb.regs).toHaveLength(0);
  });

  it('accepte 30 etapes personnalisees', async () => {
    const thirty = Array.from({ length: 30 }, (_, i) => ({ label: `Etape ${i + 1}` }));
    const data = await createCustom(thirty);
    expect(data.steps).toHaveLength(30);
  });

  it('un seul dossier EN_COURS par bien : le second est refuse (409)', async () => {
    await createCi();
    const second = await request(app).post(regs()).send({ propertyId: PROP_A, track: 'CI_ACD' });
    expect(second.status).toBe(409);
    expect(mockDb.regs).toHaveLength(1);
    // Un autre bien reste libre.
    expect((await request(app).post(regs()).send({ propertyId: PROP_B, track: 'CI_ACD' })).status).toBe(201);
  });

  it('traduit une violation de l index unique partiel (P2002, course concurrente) en 409', async () => {
    mockState.failNextRegularizationCreateWithP2002 = true;
    const res = await request(app).post(regs()).send({ propertyId: PROP_A, track: 'CI_ACD' });
    expect(res.status).toBe(409);
  });

  it('autorise un nouveau dossier apres TERMINEE ou ABANDONNEE', async () => {
    const first = await createCi();
    expect((await request(app).post(`${regs()}/${first.id}/status`).send({ status: 'ABANDONNEE' })).status).toBe(200);
    const second = await createCustom([{ label: 'Une etape', required: false }]);
    expect(
      (await request(app).post(`${regs()}/${second.id}/status`).send({ status: 'TERMINEE' })).body.data.status
    ).toBe('TERMINEE');
    expect((await request(app).post(regs()).send({ propertyId: PROP_A, track: 'CI_ACD' })).status).toBe(201);
  });
});

describe('isolation par agence : meme 404 qu un objet inexistant', () => {
  it('bien d une autre agence ou inexistant a la creation', async () => {
    const foreign = await request(app).post(regs()).send({ propertyId: PROP_X, track: 'CI_ACD' });
    const missing = await request(app).post(regs()).send({ propertyId: UNKNOWN, track: 'CI_ACD' });
    expect(foreign.status).toBe(404);
    expect(foreign.body).toEqual(missing.body);
  });

  it('bien d une autre agence en filtre de liste', async () => {
    const foreign = await request(app).get(`${regs()}?propertyId=${PROP_X}`);
    const missing = await request(app).get(`${regs()}?propertyId=${UNKNOWN}`);
    expect(foreign.status).toBe(404);
    expect(foreign.body).toEqual(missing.body);
  });

  it('dossier et etape d une autre agence, pour chaque route', async () => {
    const foreignReg = await createCi(PROP_X, T2);
    const own = await createCi(PROP_A, T1);
    const foreignStep = foreignReg.steps[0].id;
    const calls: Array<[string, string, object?]> = [
      ['get', `${regs()}/${foreignReg.id}`],
      ['patch', `${regs()}/${foreignReg.id}`, { notes: 'x' }],
      ['post', `${regs()}/${foreignReg.id}/status`, { status: 'ABANDONNEE' }],
      ['post', `${regs()}/${foreignReg.id}/steps`, { label: 'x' }],
      ['patch', `${regs()}/${foreignReg.id}/steps/${foreignStep}`, { notes: 'x' }],
      ['post', `${regs()}/${foreignReg.id}/steps/${foreignStep}/status`, { status: 'EN_COURS' }],
      ['delete', `${regs()}/${foreignReg.id}/steps/${foreignStep}`],
      // Etape d'un autre dossier sous un dossier de l'agence.
      ['patch', `${regs()}/${own.id}/steps/${foreignStep}`, { notes: 'x' }],
      ['post', `${regs()}/${own.id}/steps/${foreignStep}/status`, { status: 'EN_COURS' }],
      ['delete', `${regs()}/${own.id}/steps/${foreignStep}`]
    ];
    for (const [method, url, body] of calls) {
      const foreign = await (request(app) as any)[method](url).send(body);
      const missingUrl = url.replace(foreignReg.id, UNKNOWN).replace(foreignStep, UNKNOWN);
      const missing = await (request(app) as any)[method](missingUrl).send(body);
      expect([method, url, foreign.status]).toEqual([method, url, 404]);
      expect(foreign.body.message).toBe(missing.body.message);
    }
    // Rien n'a ete modifie chez l'autre agence.
    expect(mockDb.regs.find(r => r.id === foreignReg.id)?.status).toBe('EN_COURS');
  });

  it('la liste ne montre que les dossiers de l agence', async () => {
    await createCi(PROP_A, T1);
    await createCi(PROP_X, T2);
    const res = await request(app).get(regs());
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].propertyId).toBe(PROP_A);
    expect(res.body.data[0]).not.toHaveProperty('steps');
  });
});

describe('liste et lecture', () => {
  it('filtre par bien et par statut', async () => {
    const a = await createCi(PROP_A);
    await createCi(PROP_B);
    await request(app).post(`${regs()}/${a.id}/status`).send({ status: 'ABANDONNEE' });
    expect((await request(app).get(`${regs()}?propertyId=${PROP_A}`)).body.data).toHaveLength(1);
    expect((await request(app).get(`${regs()}?status=EN_COURS`)).body.data).toHaveLength(1);
    expect((await request(app).get(`${regs()}?status=ABANDONNEE`)).body.data[0].id).toBe(a.id);
    expect((await request(app).get(`${regs()}?status=NIMPORTE`)).status).toBe(400);
  });

  it('PATCH met a jour notes et startDate ; refuse un corps vide ou inconnu', async () => {
    const reg = await createCi();
    const ok = await request(app)
      .patch(`${regs()}/${reg.id}`)
      .send({ notes: 'Dossier suivi', startDate: '2026-03-01' });
    expect(ok.status).toBe(200);
    expect(ok.body.data.notes).toBe('Dossier suivi');
    expect(ok.body.data.startDate).toBe('2026-03-01T00:00:00.000Z');
    expect((await request(app).patch(`${regs()}/${reg.id}`).send({})).status).toBe(400);
    expect((await request(app).patch(`${regs()}/${reg.id}`).send({ status: 'TERMINEE' })).status).toBe(400);
  });
});

describe('statut d etape', () => {
  it('refuse de terminer une etape hors ordre (409) et accepte dans l ordre', async () => {
    const reg = await createCi();
    const [s1, s2] = reg.steps;
    const early = await stepStatus(reg.id, s2.id, 'TERMINEE');
    expect(early.status).toBe(409);
    expect(early.body.message).toMatch(/obligatoire précédente/);
    const first = await stepStatus(reg.id, s1.id, 'TERMINEE');
    expect(first.status).toBe(200);
    const done = first.body.data.steps[0];
    expect(done.status).toBe('TERMINEE');
    expect(done.startedAt).toEqual(expect.any(String));
    expect(done.completedAt).toEqual(expect.any(String));
    expect(first.body.data.progress).toMatchObject({ completed: 1, completedRequired: 1, percent: 17 });
    expect(first.body.data.currentStepLabel).toBe('Dossier technique du géomètre');
    expect((await stepStatus(reg.id, s2.id, 'TERMINEE')).status).toBe(200);
    expect(mockAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        actionKey: 'LAND_STEP_STATUS_CHANGED',
        entityType: 'LandRegularizationStep',
        payload: expect.objectContaining({ from: 'A_FAIRE', to: 'TERMINEE', reopened: false })
      })
    );
  });

  it('une etape optionnelle precedente n empeche pas de terminer la suivante', async () => {
    const reg = await createCustom([{ label: 'Optionnelle', required: false }, { label: 'Obligatoire' }]);
    const res = await stepStatus(reg.id, reg.steps[1].id, 'TERMINEE');
    expect(res.status).toBe(200);
  });

  it('pose startedAt au premier passage EN_COURS et le conserve ensuite', async () => {
    const reg = await createCi();
    const id = reg.steps[0].id;
    const started = (await stepStatus(reg.id, id, 'EN_COURS')).body.data.steps[0];
    expect(started.startedAt).toEqual(expect.any(String));
    expect(started.completedAt).toBeNull();
    await stepStatus(reg.id, id, 'BLOQUEE');
    const back = (await stepStatus(reg.id, id, 'EN_COURS')).body.data.steps[0];
    expect(back.startedAt).toBe(started.startedAt);
  });

  it('refuse le meme statut (400) et un passage hors graphe (409)', async () => {
    const reg = await createCi();
    const id = reg.steps[0].id;
    expect((await stepStatus(reg.id, id, 'A_FAIRE')).status).toBe(400);
    await stepStatus(reg.id, id, 'BLOQUEE');
    expect((await stepStatus(reg.id, id, 'TERMINEE')).status).toBe(409);
    expect((await stepStatus(reg.id, id, 'INCONNU')).status).toBe(400);
  });

  it('reouverture : motif obligatoire (400), completedAt remis a null, audit reopened', async () => {
    const reg = await createCi();
    const id = reg.steps[0].id;
    await stepStatus(reg.id, id, 'TERMINEE');
    expect((await stepStatus(reg.id, id, 'EN_COURS')).status).toBe(400);
    const reopened = await stepStatus(reg.id, id, 'EN_COURS', 'Piece a corriger');
    expect(reopened.status).toBe(200);
    expect(reopened.body.data.steps[0]).toMatchObject({ status: 'EN_COURS', completedAt: null });
    expect(mockAudit).toHaveBeenLastCalledWith(
      expect.objectContaining({
        actionKey: 'LAND_STEP_STATUS_CHANGED',
        payload: expect.objectContaining({
          from: 'TERMINEE',
          to: 'EN_COURS',
          reason: 'Piece a corriger',
          reopened: true
        })
      })
    );
  });

  it('reouverture refusee (409) tant qu une etape suivante est terminee', async () => {
    const reg = await createCi();
    await stepStatus(reg.id, reg.steps[0].id, 'TERMINEE');
    await stepStatus(reg.id, reg.steps[1].id, 'TERMINEE');
    const res = await stepStatus(reg.id, reg.steps[0].id, 'EN_COURS', 'Erreur');
    expect(res.status).toBe(409);
    // Une fois la suivante rouverte, la premiere peut l'etre.
    expect((await stepStatus(reg.id, reg.steps[1].id, 'EN_COURS', 'Erreur')).status).toBe(200);
    expect((await stepStatus(reg.id, reg.steps[0].id, 'EN_COURS', 'Erreur')).status).toBe(200);
  });

  it('limite le motif a 500 caracteres', async () => {
    const reg = await createCi();
    expect((await stepStatus(reg.id, reg.steps[0].id, 'EN_COURS', 'x'.repeat(501))).status).toBe(400);
  });
});

describe('statut du dossier', () => {
  const changeStatus = (id: string, body: object) => request(app).post(`${regs()}/${id}/status`).send(body);

  it('TERMINEE exige toutes les etapes obligatoires terminees (409), puis reussit avec endedAt', async () => {
    const reg = await createCi();
    expect((await changeStatus(reg.id, { status: 'TERMINEE' })).status).toBe(409);
    await completeAll(reg);
    const done = await changeStatus(reg.id, { status: 'TERMINEE' });
    expect(done.status).toBe(200);
    expect(done.body.data).toMatchObject({ status: 'TERMINEE', endedAt: expect.any(String), currentStepLabel: null });
    expect(mockAudit).toHaveBeenLastCalledWith(
      expect.objectContaining({
        actionKey: 'LAND_REGULARIZATION_STATUS_CHANGED',
        payload: { from: 'EN_COURS', to: 'TERMINEE', reason: null, reopened: false }
      })
    );
  });

  it('TERMINEE ignore les etapes optionnelles non terminees', async () => {
    const reg = await createCustom([{ label: 'Obligatoire' }, { label: 'Optionnelle', required: false }]);
    await stepStatus(reg.id, reg.steps[0].id, 'TERMINEE');
    expect((await changeStatus(reg.id, { status: 'TERMINEE' })).status).toBe(200);
  });

  it('refuse le meme statut (400) et de terminer un dossier deja clos (409)', async () => {
    const reg = await createCi();
    expect((await changeStatus(reg.id, { status: 'EN_COURS' })).status).toBe(400);
    await changeStatus(reg.id, { status: 'ABANDONNEE', reason: 'Vente du terrain' });
    expect((await changeStatus(reg.id, { status: 'TERMINEE' })).status).toBe(409);
  });

  it('reouverture : motif obligatoire (400), refusee si un autre dossier est EN_COURS (409)', async () => {
    const reg = await createCi();
    await changeStatus(reg.id, { status: 'ABANDONNEE' });
    expect((await changeStatus(reg.id, { status: 'EN_COURS' })).status).toBe(400);
    const other = await createCi(PROP_A);
    const clash = await changeStatus(reg.id, { status: 'EN_COURS', reason: 'Reprise' });
    expect(clash.status).toBe(409);
    await changeStatus(other.id, { status: 'ABANDONNEE' });
    const reopened = await changeStatus(reg.id, { status: 'EN_COURS', reason: 'Reprise' });
    expect(reopened.status).toBe(200);
    expect(reopened.body.data).toMatchObject({ status: 'EN_COURS', endedAt: null });
    expect(mockAudit).toHaveBeenLastCalledWith(
      expect.objectContaining({ payload: { from: 'ABANDONNEE', to: 'EN_COURS', reason: 'Reprise', reopened: true } })
    );
  });

  it('un dossier non EN_COURS refuse toute modification (409) : dossier, etapes, ajout, suppression', async () => {
    const reg = await createCustom([{ label: 'A' }, { label: 'B' }]);
    await changeStatus(reg.id, { status: 'ABANDONNEE' });
    const stepId = reg.steps[0].id;
    const attempts = [
      request(app).patch(`${regs()}/${reg.id}`).send({ notes: 'x' }),
      request(app).patch(`${regs()}/${reg.id}/steps/${stepId}`).send({ notes: 'x' }),
      stepStatus(reg.id, stepId, 'EN_COURS'),
      request(app).post(`${regs()}/${reg.id}/steps`).send({ label: 'C' }),
      request(app).delete(`${regs()}/${reg.id}/steps/${stepId}`)
    ];
    const results = await Promise.all(attempts);
    expect(results.map(r => r.status)).toEqual([409, 409, 409, 409, 409]);
    const detail = (await request(app).get(`${regs()}/${reg.id}`)).body.data;
    expect(detail.steps.every((s: any) => s.allowedTransitions.length === 0)).toBe(true);
  });
});

describe('etapes personnalisees', () => {
  it('ajoute une etape en fin (custom_<n+1>) et la supprime', async () => {
    const reg = await createCustom([{ label: 'A' }, { label: 'B' }]);
    const added = await request(app)
      .post(`${regs()}/${reg.id}/steps`)
      .send({ label: 'C', required: false, dueDate: '2026-12-01' });
    expect(added.status).toBeLessThan(300);
    const steps = added.body.data.steps;
    expect(steps).toHaveLength(3);
    expect(steps[2]).toMatchObject({ stepKey: 'custom_3', order: 3, label: 'C', required: false });
    expect(steps[2].dueDate).toBe('2026-12-01T00:00:00.000Z');
    const removed = await request(app).delete(`${regs()}/${reg.id}/steps/${steps[2].id}`);
    expect(removed.status).toBe(200);
    expect(removed.body.data.steps).toHaveLength(2);
  });

  it('refuse l ajout au-dela de 30 etapes (400)', async () => {
    const reg = await createCustom(Array.from({ length: 30 }, (_, i) => ({ label: `E${i}` })));
    expect((await request(app).post(`${regs()}/${reg.id}/steps`).send({ label: 'E31' })).status).toBe(400);
  });

  it('refuse l ajout, la suppression et la modification du libelle sur CI_ACD (400)', async () => {
    const reg = await createCi();
    const stepId = reg.steps[0].id;
    expect((await request(app).post(`${regs()}/${reg.id}/steps`).send({ label: 'Extra' })).status).toBe(400);
    expect((await request(app).delete(`${regs()}/${reg.id}/steps/${stepId}`)).status).toBe(400);
    expect((await request(app).patch(`${regs()}/${reg.id}/steps/${stepId}`).send({ label: 'Autre' })).status).toBe(400);
    expect((await request(app).patch(`${regs()}/${reg.id}/steps/${stepId}`).send({ required: false })).status).toBe(
      400
    );
    expect(mockDb.steps.filter(s => s.regularizationId === reg.id)).toHaveLength(6);
  });

  it('modifie libelle et caractere obligatoire d une etape personnalisee', async () => {
    const reg = await createCustom([{ label: 'A' }]);
    const res = await request(app)
      .patch(`${regs()}/${reg.id}/steps/${reg.steps[0].id}`)
      .send({ label: 'A bis', required: false });
    expect(res.body.data.steps[0]).toMatchObject({ label: 'A bis', required: false });
  });

  it('refuse de supprimer une etape commencee, avec frais ou avec piece (409), et la derniere etape', async () => {
    const reg = await createCustom([{ label: 'A' }, { label: 'B' }, { label: 'C' }]);
    const [a, b, c] = reg.steps;
    await stepStatus(reg.id, a.id, 'EN_COURS');
    await request(app).patch(`${regs()}/${reg.id}/steps/${b.id}`).send({ costXof: 1000 });
    await request(app).patch(`${regs()}/${reg.id}/steps/${c.id}`).send({ documentId: DOC_A });
    for (const step of [a, b, c]) {
      expect((await request(app).delete(`${regs()}/${reg.id}/steps/${step.id}`)).status).toBe(409);
    }
    const single = await createCustom([{ label: 'Seule' }], PROP_B);
    expect((await request(app).delete(`${regs()}/${single.id}/steps/${single.steps[0].id}`)).status).toBe(409);
  });

  it('trace les ajouts, mises a jour et suppressions (LAND_STEP_UPDATED, sans donnee sensible)', async () => {
    const reg = await createCustom([{ label: 'A' }, { label: 'B' }]);
    await request(app).patch(`${regs()}/${reg.id}/steps/${reg.steps[0].id}`).send({ notes: 'Note privee', costXof: 5 });
    const call = mockAudit.mock.calls.map(c => c[0]).find(e => e.actionKey === 'LAND_STEP_UPDATED');
    expect(call.payload.regularizationId).toBe(reg.id);
    expect([...call.payload.fields].sort()).toEqual(['costXof', 'notes']);
    expect(JSON.stringify(call.payload)).not.toContain('Note privee');
  });
});

describe('pieces justificatives', () => {
  async function patchDoc(reg: any, documentId: string | null) {
    return request(app).patch(`${regs()}/${reg.id}/steps/${reg.steps[0].id}`).send({ documentId });
  }

  it('rattache une piece du meme bien et la restitue resumee ; null la detache', async () => {
    const reg = await createCi(PROP_A);
    const res = await patchDoc(reg, DOC_A);
    expect(res.status).toBe(200);
    expect(res.body.data.steps[0]).toMatchObject({
      documentId: DOC_A,
      document: { id: DOC_A, fileName: 'plan-a.pdf', documentType: 'PLAN' }
    });
    expect(res.body.data.steps[0].document).not.toHaveProperty('filePath');
    const cleared = await patchDoc(reg, null);
    expect(cleared.body.data.steps[0]).toMatchObject({ documentId: null, document: null });
  });

  it('refuse une piece d un autre bien de la meme agence (404)', async () => {
    const reg = await createCi(PROP_A);
    const foreignProperty = await patchDoc(reg, DOC_B);
    const missing = await patchDoc(reg, UNKNOWN);
    expect(foreignProperty.status).toBe(404);
    expect(foreignProperty.body.message).toBe(missing.body.message);
    expect(mockDb.steps.find(s => s.id === reg.steps[0].id)?.documentId).toBeNull();
  });

  it('refuse une piece d une autre agence (404 identique a une piece inexistante)', async () => {
    const reg = await createCi(PROP_A);
    const foreign = await patchDoc(reg, DOC_X);
    const missing = await patchDoc(reg, UNKNOWN);
    expect(foreign.status).toBe(404);
    expect(foreign.body.message).toBe(missing.body.message);
  });

  it('refuse un identifiant de piece mal forme (400)', async () => {
    const reg = await createCi(PROP_A);
    expect((await patchDoc(reg, 'pas-un-uuid')).status).toBe(400);
  });
});

describe('frais de regularisation', () => {
  it('feesXof somme les couts de toutes les etapes en Decimal, y compris hors etapes terminees', async () => {
    const reg = await createCi();
    const patchCost = (i: number, costXof: number) =>
      request(app).patch(`${regs()}/${reg.id}/steps/${reg.steps[i].id}`).send({ costXof });
    await patchCost(0, 0.1);
    await patchCost(1, 0.2);
    const last = await patchCost(3, 150000.5);
    expect(last.status).toBe(200);
    expect(last.body.data.feesXof).toBe(150000.8);
    expect(last.body.data.steps[0].costXof).toBe(0.1);
    expect(last.body.data.steps[2].costXof).toBe(0);
    const summary = (await request(app).get(regs())).body.data[0];
    expect(summary.feesXof).toBe(150000.8);
  });

  it('arrondit un cout saisi au centime et refuse un cout negatif', async () => {
    const reg = await createCi();
    const url = `${regs()}/${reg.id}/steps/${reg.steps[0].id}`;
    expect((await request(app).patch(url).send({ costXof: 10.005 })).body.data.steps[0].costXof).toBe(10.01);
    expect((await request(app).patch(url).send({ costXof: -1 })).status).toBe(400);
    expect((await request(app).patch(url).send({ costXof: 'abc' })).status).toBe(400);
  });
});

describe('echeances', () => {
  it('calcule nextDueDate, overdueSteps et isOverdue pour un dossier EN_COURS', async () => {
    const past = new Date(Date.now() - 5 * 86400000).toISOString();
    const future = new Date(Date.now() + 5 * 86400000).toISOString();
    const reg = await createCustom([
      { label: 'En retard', dueDate: past },
      { label: 'A venir', dueDate: future },
      { label: 'Sans echeance' }
    ]);
    expect(reg.overdueSteps).toBe(1);
    expect(reg.nextDueDate).toBe(past);
    expect(reg.steps.map((s: any) => s.isOverdue)).toEqual([true, false, false]);
    // Une etape terminee n'est plus en retard.
    const done = await stepStatus(reg.id, reg.steps[0].id, 'TERMINEE');
    expect(done.body.data.overdueSteps).toBe(0);
    expect(done.body.data.nextDueDate).toBe(future);
  });
});

describe('permissions', () => {
  it('lecture seule : GET autorises, toute ecriture refusee en 403 sans effet', async () => {
    const reg = await createCi();
    const stepId = reg.steps[0].id;
    mockState.permissions = new Set(['PROPERTIES_VIEW']);
    expect((await request(app).get(`${base()}/land-tracks`)).status).toBe(200);
    expect((await request(app).get(regs())).status).toBe(200);
    expect((await request(app).get(`${regs()}/${reg.id}`)).status).toBe(200);

    const writes = [
      request(app).post(regs()).send({ propertyId: PROP_B, track: 'CI_ACD' }),
      request(app).patch(`${regs()}/${reg.id}`).send({ notes: 'x' }),
      request(app).post(`${regs()}/${reg.id}/status`).send({ status: 'ABANDONNEE' }),
      request(app).post(`${regs()}/${reg.id}/steps`).send({ label: 'x' }),
      request(app).patch(`${regs()}/${reg.id}/steps/${stepId}`).send({ notes: 'x' }),
      request(app).post(`${regs()}/${reg.id}/steps/${stepId}/status`).send({ status: 'EN_COURS' }),
      request(app).delete(`${regs()}/${reg.id}/steps/${stepId}`)
    ];
    expect((await Promise.all(writes)).map(r => r.status)).toEqual([403, 403, 403, 403, 403, 403, 403]);
    expect(mockDb.regs).toHaveLength(1);
    expect(mockDb.regs[0].status).toBe('EN_COURS');
  });

  it('sans permission de lecture, meme les GET sont refuses (403)', async () => {
    mockState.permissions = new Set();
    expect((await request(app).get(`${base()}/land-tracks`)).status).toBe(403);
    expect((await request(app).get(regs())).status).toBe(403);
  });
});

describe('ecritures bornees par agence et verrou de ligne', () => {
  it('chaque update/delete par id porte aussi le tenantId dans son where', async () => {
    const reg = await createCustom([{ label: 'A' }, { label: 'B' }, { label: 'C' }]);
    const [a, , c] = reg.steps;
    mockWrites.length = 0;
    await request(app).patch(`${regs()}/${reg.id}`).send({ notes: 'n' });
    await request(app).patch(`${regs()}/${reg.id}/steps/${a.id}`).send({ notes: 'n' });
    await stepStatus(reg.id, a.id, 'EN_COURS');
    await request(app).delete(`${regs()}/${reg.id}/steps/${c.id}`);
    await request(app).post(`${regs()}/${reg.id}/status`).send({ status: 'ABANDONNEE' });
    expect([...new Set(mockWrites.map(w => w.op))].sort()).toEqual([
      'landRegularization.update',
      'landRegularizationStep.delete',
      'landRegularizationStep.update'
    ]);
    expect(mockWrites.length).toBeGreaterThanOrEqual(5);
    for (const write of mockWrites) {
      expect(write.where).toEqual(expect.objectContaining({ id: expect.any(String), tenantId: T1 }));
    }
  });

  it('chaque mutation prend le verrou FOR UPDATE (parametre) avant de relire le dossier', async () => {
    const reg = await createCustom([{ label: 'A' }, { label: 'B' }]);
    const [a, b] = reg.steps;
    const calls: Array<() => Promise<unknown>> = [
      () => request(app).patch(`${regs()}/${reg.id}`).send({ notes: 'n' }),
      () => request(app).post(`${regs()}/${reg.id}/steps`).send({ label: 'C' }),
      () => request(app).patch(`${regs()}/${reg.id}/steps/${a.id}`).send({ notes: 'n' }),
      () => stepStatus(reg.id, a.id, 'EN_COURS'),
      () => request(app).delete(`${regs()}/${reg.id}/steps/${b.id}`),
      () => request(app).post(`${regs()}/${reg.id}/status`).send({ status: 'ABANDONNEE' })
    ];
    for (const call of calls) {
      mockEvents.length = 0;
      mockLocks.length = 0;
      await call();
      expect(mockEvents[0]).toBe('lock');
      expect(mockEvents.indexOf('lock')).toBeLessThan(mockEvents.indexOf('read'));
      expect(mockLocks[0].sql).toContain('FOR UPDATE');
      expect(mockLocks[0].values).toEqual([reg.id, T1]);
    }
  });
});

describe('bord de l echeance (UTC)', () => {
  it('echeance aujourd hui : pas en retard ; hier : en retard', async () => {
    const now = new Date();
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const yesterday = new Date(today.getTime() - 86400000);
    const reg = await createCustom([
      { label: 'Aujourd hui', dueDate: today.toISOString() },
      { label: 'Hier', dueDate: yesterday.toISOString() }
    ]);
    expect(reg.steps.map((s: any) => s.isOverdue)).toEqual([false, true]);
    expect(reg.overdueSteps).toBe(1);
    expect(reg.nextDueDate).toBe(yesterday.toISOString());
  });
});

describe('dates saisies', () => {
  it.each([[null], [true], [0], ['1850-01-01'], ['2300-01-01'], ['pas une date'], ['']])(
    'refuse startDate = %p (400)',
    async startDate => {
      const post = await request(app).post(regs()).send({ propertyId: PROP_A, track: 'CI_ACD', startDate });
      expect(post.status).toBe(400);
      const reg = await createCi(PROP_B);
      const patch = await request(app).patch(`${regs()}/${reg.id}`).send({ startDate });
      expect(patch.status).toBe(400);
    }
  );

  it.each([[true], [0], ['1850-01-01'], ['2300-01-01'], ['']])('refuse dueDate = %p (400)', async dueDate => {
    const reg = await createCustom([{ label: 'A' }]);
    const stepUrl = `${regs()}/${reg.id}/steps/${reg.steps[0].id}`;
    expect((await request(app).patch(stepUrl).send({ dueDate })).status).toBe(400);
    expect((await request(app).post(`${regs()}/${reg.id}/steps`).send({ label: 'B', dueDate })).status).toBe(400);
  });

  it('dueDate null efface l echeance ; une date ISO valide est acceptee', async () => {
    const reg = await createCustom([{ label: 'A', dueDate: '2026-12-01' }]);
    const url = `${regs()}/${reg.id}/steps/${reg.steps[0].id}`;
    expect((await request(app).patch(url).send({ dueDate: null })).body.data.steps[0].dueDate).toBeNull();
    expect((await request(app).patch(`${regs()}/${reg.id}`).send({ startDate: '2026-01-15' })).status).toBe(200);
  });
});

describe('regles complementaires', () => {
  it('rendre obligatoire une etape optionnelle est refuse (409) si une etape suivante est terminee', async () => {
    const reg = await createCustom([{ label: 'A', required: false }, { label: 'B' }]);
    await stepStatus(reg.id, reg.steps[1].id, 'TERMINEE');
    const res = await request(app).patch(`${regs()}/${reg.id}/steps/${reg.steps[0].id}`).send({ required: true });
    expect(res.status).toBe(409);
    expect(mockDb.steps.find(s => s.id === reg.steps[0].id)?.required).toBe(false);
  });

  it('rendre obligatoire reste possible sans etape suivante terminee', async () => {
    const reg = await createCustom([{ label: 'A', required: false }, { label: 'B' }]);
    const res = await request(app).patch(`${regs()}/${reg.id}/steps/${reg.steps[0].id}`).send({ required: true });
    expect(res.status).toBe(200);
  });

  it('currentStepLabel = premiere etape non terminee par ordre, meme si une suivante est EN_COURS', async () => {
    const reg = await createCustom([{ label: 'A', required: false }, { label: 'B' }, { label: 'C' }]);
    await stepStatus(reg.id, reg.steps[1].id, 'TERMINEE');
    const res = await stepStatus(reg.id, reg.steps[2].id, 'EN_COURS');
    expect(res.body.data.currentStepLabel).toBe('A');
  });

  it('le plafond d etapes cite le maximum dans le message', async () => {
    const reg = await createCustom(Array.from({ length: 30 }, (_, i) => ({ label: `E${i}` })));
    const res = await request(app).post(`${regs()}/${reg.id}/steps`).send({ label: 'E31' });
    expect(res.status).toBe(400);
    expect(res.body.message).toContain('30');
  });
});
