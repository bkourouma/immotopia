import express from 'express';
import request from 'supertest';

/**
 * Tests bout en bout (supertest) des routes projections et scénarios (lot 3).
 * `authenticate`/`requireTenantAccess`/la garde RBAC sont remplacés par des
 * passe-plats ; la garde RBAC lit les permissions dans l'en-tête `x-perms`.
 * Seuls les services sont simulés.
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

function hasPermission(req: any, keys: string[]): boolean {
  const granted = String(req.headers['x-perms'] ?? '').split(',');
  return keys.some(key => granted.includes(key));
}

jest.mock('../../src/middleware/property-rbac-middleware', () => ({
  requirePropertyPermission: (key: string) => (req: any, res: any, next: any) =>
    hasPermission(req, [key]) ? next() : res.status(403).json({ success: false, message: 'Refusé' }),
  requireAnyPropertyPermission: (keys: string[]) => (req: any, res: any, next: any) =>
    hasPermission(req, keys) ? next() : res.status(403).json({ success: false, message: 'Refusé' })
}));

const mockProjection = { runProjection: jest.fn(async () => ({ base: { points: [], warnings: [] } })) };
const mockScenarios = {
  listScenarios: jest.fn(async () => []),
  createScenario: jest.fn(async () => ({ id: 'x' })),
  getScenario: jest.fn(async () => ({ id: 'x' })),
  updateScenario: jest.fn(async () => ({ id: 'x' })),
  deleteScenario: jest.fn(async () => undefined),
  runScenario: jest.fn(async () => ({ base: { points: [], warnings: [] } }))
};

jest.mock('../../src/services/patrimoine-projections/projection-service', () => mockProjection);
jest.mock('../../src/services/patrimoine-projections/scenario-service', () => mockScenarios);

// eslint-disable-next-line @typescript-eslint/no-var-requires
const routes = require('../../src/routes/patrimoine-projections-routes').default;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const {
  errorHandler,
  NotFoundError,
  ValidationError,
  ConflictError
} = require('../../src/middleware/error-middleware');

/** `.send(undefined)` fait échouer superagent : n'envoie un corps que s'il y en a un. */
function call(method: string, path: string, perms?: string, payload?: object) {
  let req = (request(app) as any)[method](path);
  if (perms) req = req.set('x-perms', perms);
  return payload === undefined ? req : req.send(payload);
}

const app = express();
app.use(express.json());
app.use('/api', routes);
app.use(errorHandler);

const BASE = '/api/tenants/tenant-1/patrimoine';
const SCENARIO = '11111111-1111-4111-8111-111111111111';
const READ = 'PROPERTIES_VIEW';
const WRITE = 'PROPERTIES_VIEW,PROPERTIES_EDIT';
const projectionBody = { horizonYears: 10, baseScenario: 'CENTRAL' };
const scenarioBody = { name: 'Plan', horizonYears: 10, baseScenario: 'CENTRAL' };

beforeEach(() => {
  [...Object.values(mockProjection), ...Object.values(mockScenarios)].forEach(fn => fn.mockClear());
});

describe('permissions', () => {
  const writes: Array<[string, string, object?]> = [
    ['post', `${BASE}/scenarios`, scenarioBody],
    ['patch', `${BASE}/scenarios/${SCENARIO}`, { name: 'X' }],
    ['delete', `${BASE}/scenarios/${SCENARIO}`, undefined]
  ];
  const reads: Array<[string, string, object?]> = [
    ['post', `${BASE}/projections`, projectionBody],
    ['get', `${BASE}/scenarios`, undefined],
    ['get', `${BASE}/scenarios/${SCENARIO}`, undefined],
    ['post', `${BASE}/scenarios/${SCENARIO}/run`, {}]
  ];

  it.each(writes)('%s %s exige PROPERTIES_EDIT', async (method, path, payload) => {
    const denied = await call(method, path, READ, payload);
    expect(denied.status).toBe(403);
    const none = await call(method, path, undefined, payload);
    expect(none.status).toBe(403);
    const ok = await call(method, path, WRITE, payload);
    expect([200, 201, 204]).toContain(ok.status);
  });

  it.each(reads)('%s %s est en lecture (PROPERTIES_VIEW) et refuse sans permission', async (method, path, payload) => {
    const none = await call(method, path, undefined, payload);
    expect(none.status).toBe(403);
    const ok = await call(method, path, READ, payload);
    expect(ok.status).toBe(200);
  });

  it('un refus n’appelle aucun service', async () => {
    await request(app).post(`${BASE}/scenarios`).set('x-perms', READ).send(scenarioBody);
    await request(app).post(`${BASE}/projections`).send(projectionBody);
    expect(mockScenarios.createScenario).not.toHaveBeenCalled();
    expect(mockProjection.runProjection).not.toHaveBeenCalled();
  });
});

describe('POST /projections', () => {
  it('valide le corps par le schéma et passe l’agence au service', async () => {
    const res = await request(app)
      .post(`${BASE}/projections`)
      .set('x-perms', READ)
      .send({
        ...projectionBody,
        compareScenarios: true,
        operations: [{ type: 'MONTHLY_SAVING', fromYear: 1, amount: 5 }]
      });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: { base: { points: [], warnings: [] } } });
    expect(mockProjection.runProjection).toHaveBeenCalledWith(
      'tenant-1',
      expect.objectContaining({ horizonYears: 10, compareScenarios: true })
    );
  });

  it.each([
    ['champ inconnu (.strict())', { ...projectionBody, extra: 1 }, ''],
    ['horizon hors bornes', { ...projectionBody, horizonYears: 31 }, 'horizonYears'],
    ['scénario inconnu', { ...projectionBody, baseScenario: 'FOU' }, 'baseScenario'],
    [
      'année hors horizon',
      { ...projectionBody, operations: [{ type: 'PREPAY_LOAN', year: 11, loanId: 'l', amount: 1 }] },
      'operations.0.year'
    ],
    [
      'champ inconnu dans une opération',
      { ...projectionBody, operations: [{ type: 'MONTHLY_SAVING', fromYear: 1, amount: 1, x: 1 }] },
      'operations.0'
    ]
  ])('rejette en 400 : %s', async (_label, payload, field) => {
    const res = await request(app).post(`${BASE}/projections`).set('x-perms', READ).send(payload);
    expect(res.status).toBe(400);
    expect(res.body.errors.length).toBeGreaterThan(0);
    if (field) expect(res.body.errors.some((e: any) => e.field.startsWith(field))).toBe(true);
    expect(mockProjection.runProjection).not.toHaveBeenCalled();
  });

  it('rejette plus de 50 opérations', async () => {
    const operations = Array.from({ length: 51 }, () => ({ type: 'MONTHLY_SAVING', fromYear: 1, amount: 1 }));
    const res = await request(app)
      .post(`${BASE}/projections`)
      .set('x-perms', READ)
      .send({ ...projectionBody, operations });
    expect(res.status).toBe(400);
  });

  it('transmet le 422 du service avec le champ fautif', async () => {
    mockProjection.runProjection.mockRejectedValueOnce(
      new ValidationError('invalide', [{ field: 'operations.0.assetId', message: 'Actif introuvable' }])
    );
    const res = await request(app).post(`${BASE}/projections`).set('x-perms', READ).send(projectionBody);
    expect(res.status).toBe(422);
    expect(res.body.errors).toEqual([{ field: 'operations.0.assetId', message: 'Actif introuvable' }]);
  });
});

describe('scénarios', () => {
  it('POST crée (201) avec l’agence et l’auteur', async () => {
    const res = await request(app).post(`${BASE}/scenarios`).set('x-perms', WRITE).send(scenarioBody);
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ data: { id: 'x' } });
    expect(mockScenarios.createScenario).toHaveBeenCalledWith('tenant-1', scenarioBody, 'user-1');
  });

  it('POST rejette un champ inconnu, un nom vide ou trop long (400)', async () => {
    for (const payload of [
      { ...scenarioBody, extra: 1 },
      { ...scenarioBody, name: '  ' },
      { ...scenarioBody, name: 'x'.repeat(121) },
      { name: 'Plan' }
    ]) {
      const res = await request(app).post(`${BASE}/scenarios`).set('x-perms', WRITE).send(payload);
      expect(res.status).toBe(400);
    }
    expect(mockScenarios.createScenario).not.toHaveBeenCalled();
  });

  it('PATCH accepte des champs partiels et rejette un champ inconnu', async () => {
    const ok = await request(app)
      .patch(`${BASE}/scenarios/${SCENARIO}`)
      .set('x-perms', WRITE)
      .send({ name: 'Nouveau' });
    expect(ok.status).toBe(200);
    expect(mockScenarios.updateScenario).toHaveBeenCalledWith('tenant-1', SCENARIO, { name: 'Nouveau' }, 'user-1');
    const bad = await request(app).patch(`${BASE}/scenarios/${SCENARIO}`).set('x-perms', WRITE).send({ tenantId: 'x' });
    expect(bad.status).toBe(400);
  });

  it('DELETE répond 204 sans corps', async () => {
    const res = await request(app).delete(`${BASE}/scenarios/${SCENARIO}`).set('x-perms', WRITE);
    expect(res.status).toBe(204);
    expect(res.text).toBe('');
    expect(mockScenarios.deleteScenario).toHaveBeenCalledWith('tenant-1', SCENARIO, 'user-1');
  });

  it('run accepte { compareScenarios } et rejette un autre champ', async () => {
    const ok = await request(app)
      .post(`${BASE}/scenarios/${SCENARIO}/run`)
      .set('x-perms', READ)
      .send({ compareScenarios: true });
    expect(ok.status).toBe(200);
    expect(mockScenarios.runScenario).toHaveBeenCalledWith('tenant-1', SCENARIO, { compareScenarios: true });
    const bad = await request(app)
      .post(`${BASE}/scenarios/${SCENARIO}/run`)
      .set('x-perms', READ)
      .send({ horizonYears: 3 });
    expect(bad.status).toBe(400);
  });

  it('un identifiant non UUID donne 400 sans appeler le service', async () => {
    const calls: Array<[string, string, object?]> = [
      ['get', `${BASE}/scenarios/pas-un-uuid`],
      ['patch', `${BASE}/scenarios/pas-un-uuid`, { name: 'X' }],
      ['delete', `${BASE}/scenarios/pas-un-uuid`],
      ['post', `${BASE}/scenarios/pas-un-uuid/run`, {}]
    ];
    for (const [method, path, payload] of calls) {
      const res = await call(method, path, WRITE, payload);
      expect(res.status).toBe(400);
    }
    expect(mockScenarios.getScenario).not.toHaveBeenCalled();
    expect(mockScenarios.updateScenario).not.toHaveBeenCalled();
    expect(mockScenarios.deleteScenario).not.toHaveBeenCalled();
    expect(mockScenarios.runScenario).not.toHaveBeenCalled();
  });

  it('les chemins statiques ne sont pas pris pour un :scenarioId', async () => {
    const res = await request(app).get(`${BASE}/scenarios`).set('x-perms', READ);
    expect(res.status).toBe(200);
    expect(mockScenarios.listScenarios).toHaveBeenCalledWith('tenant-1');
    expect(mockScenarios.getScenario).not.toHaveBeenCalled();
  });

  it('traduit 404 et 409 des services', async () => {
    mockScenarios.getScenario.mockRejectedValueOnce(new NotFoundError('Scénario introuvable.'));
    const missing = await request(app).get(`${BASE}/scenarios/${SCENARIO}`).set('x-perms', READ);
    expect(missing.status).toBe(404);
    mockScenarios.createScenario.mockRejectedValueOnce(new ConflictError('Un scénario porte déjà ce nom.'));
    const conflict = await request(app).post(`${BASE}/scenarios`).set('x-perms', WRITE).send(scenarioBody);
    expect(conflict.status).toBe(409);
  });
});

describe('limiteur de calcul (30 par minute, par utilisateur et par agence)', () => {
  const LIMIT = 30;
  const url = (tenant: string) => `/api/tenants/${tenant}/patrimoine`;
  const project = (tenant: string, perms = READ) =>
    request(app)
      .post(`${url(tenant)}/projections`)
      .set('x-perms', perms)
      .send(projectionBody);

  it('le 31e appel de la minute reçoit 429, sans appeler le service', async () => {
    for (let i = 0; i < LIMIT; i += 1) expect((await project('tenant-rl-a')).status).toBe(200);
    expect(mockProjection.runProjection).toHaveBeenCalledTimes(LIMIT);
    const limited = await project('tenant-rl-a');
    expect(limited.status).toBe(429);
    expect(limited.body).toMatchObject({ success: false, code: 'RATE_LIMITED' });
    expect(limited.body.message).toBe('Trop de calculs de projection en peu de temps. Réessayez dans une minute.');
    expect(mockProjection.runProjection).toHaveBeenCalledTimes(LIMIT);
  });

  it('le budget est partagé avec l’exécution d’un scénario, et propre à chaque agence', async () => {
    // tenant-rl-a a épuisé son budget dans le test précédent (même minute).
    const run = await request(app)
      .post(`${url('tenant-rl-a')}/scenarios/${SCENARIO}/run`)
      .set('x-perms', READ)
      .send({});
    expect(run.status).toBe(429);
    expect(mockScenarios.runScenario).not.toHaveBeenCalled();
    expect((await project('tenant-rl-b')).status).toBe(200);
  });

  it('le limiteur passe avant les gardes de permission (un refus 403 consomme aussi le budget)', async () => {
    for (let i = 0; i < LIMIT; i += 1) expect((await project('tenant-rl-c', '')).status).toBe(403);
    expect((await project('tenant-rl-c', '')).status).toBe(429);
  });

  it('ne limite ni les lectures ni les écritures de scénarios', async () => {
    for (let i = 0; i < LIMIT + 5; i += 1) {
      const res = await request(app)
        .get(`${url('tenant-rl-d')}/scenarios`)
        .set('x-perms', READ);
      expect(res.status).toBe(200);
    }
  });
});
