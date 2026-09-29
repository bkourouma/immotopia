import express from 'express';
import request from 'supertest';

/**
 * Tests bout en bout (supertest) des routes du patrimoine multi-actifs (lot 1).
 * `authenticate`/`requireTenantAccess`/la garde RBAC sont remplacés par des
 * passe-plats ; la garde RBAC lit les permissions dans l'en-tête `x-perms`
 * pour vérifier qu'une lecture seule n'écrit pas. Seul le service est simulé.
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

const mockService = {
  createAsset: jest.fn(),
  listAssets: jest.fn(async () => []),
  getAsset: jest.fn(async () => ({})),
  updateAsset: jest.fn(async () => ({})),
  disposeAsset: jest.fn(async () => ({})),
  archiveAsset: jest.fn(async () => ({})),
  listAssetValuations: jest.fn(async () => []),
  createAssetValuation: jest.fn(async () => ({})),
  updateAssetValuation: jest.fn(async () => ({})),
  deleteAssetValuation: jest.fn(async () => undefined),
  listDebts: jest.fn(async () => []),
  createDebt: jest.fn(async () => ({})),
  updateDebt: jest.fn(async () => ({})),
  deleteDebt: jest.fn(async () => undefined),
  listAssetHoldings: jest.fn(async () => []),
  setAssetHolding: jest.fn(async () => ({})),
  deleteAssetHolding: jest.fn(async () => undefined),
  getNetWorth: jest.fn(async () => ({ netWorth: 1 })),
  getNetWorthHistory: jest.fn(async () => [])
};

jest.mock('../../src/services/patrimoine-assets-service', () => mockService);

// eslint-disable-next-line @typescript-eslint/no-var-requires
const routes = require('../../src/routes/patrimoine-assets-routes').default;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { errorHandler, NotFoundError } = require('../../src/middleware/error-middleware');

const app = express();
app.use(express.json());
app.use('/api', routes);
app.use(errorHandler);

const TENANT = 'tenant-1';
const BASE = `/api/tenants/${TENANT}/patrimoine`;
const ASSET = '11111111-1111-4111-8111-111111111111';
const VAL = '22222222-2222-4222-8222-222222222222';
const READ = 'PROPERTIES_VIEW';
const WRITE = 'PROPERTIES_VIEW,PROPERTIES_EDIT';

beforeEach(() => {
  Object.values(mockService).forEach(fn => fn.mockClear());
});

describe('permissions', () => {
  const writes: Array<[string, string]> = [
    ['post', `${BASE}/assets`],
    ['patch', `${BASE}/assets/${ASSET}`],
    ['post', `${BASE}/assets/${ASSET}/dispose`],
    ['post', `${BASE}/assets/${ASSET}/archive`],
    ['post', `${BASE}/assets/${ASSET}/valuations`],
    ['patch', `${BASE}/assets/${ASSET}/valuations/${VAL}`],
    ['delete', `${BASE}/assets/${ASSET}/valuations/${VAL}`],
    ['put', `${BASE}/assets/${ASSET}/holdings/${VAL}`],
    ['delete', `${BASE}/assets/${ASSET}/holdings/${VAL}`],
    ['post', `${BASE}/debts`],
    ['patch', `${BASE}/debts/${VAL}`],
    ['delete', `${BASE}/debts/${VAL}`]
  ];
  const reads = [
    `${BASE}/assets`,
    `${BASE}/assets/${ASSET}`,
    `${BASE}/assets/${ASSET}/valuations`,
    `${BASE}/assets/${ASSET}/holdings`,
    `${BASE}/debts`,
    `${BASE}/net-worth`,
    `${BASE}/net-worth/history`
  ];

  it.each(writes)('%s %s : refusé (403) en lecture seule, service non appelé', async (method, path) => {
    const res = await (request(app) as any)[method](path).set('x-perms', READ).send({});
    expect(res.status).toBe(403);
    Object.values(mockService).forEach(fn => expect(fn).not.toHaveBeenCalled());
  });

  it.each(reads)('GET %s : refusé sans PROPERTIES_VIEW, accepté avec', async path => {
    expect((await request(app).get(path).set('x-perms', '')).status).toBe(403);
    expect((await request(app).get(path).set('x-perms', READ)).status).toBe(200);
  });
});

describe('contrat des réponses', () => {
  it('POST /assets : 201 { data } et le tenant vient de l’URL', async () => {
    mockService.createAsset.mockResolvedValue({ id: ASSET });
    const res = await request(app)
      .post(`${BASE}/assets`)
      .set('x-perms', WRITE)
      .send({ name: 'Compte', assetClass: 'CASH', details: { institution: 'B', cashKind: 'BANK' }, tenantId: 'x' });
    expect(res.status).toBe(400);
    const ok = await request(app)
      .post(`${BASE}/assets`)
      .set('x-perms', WRITE)
      .send({ name: 'Compte', assetClass: 'CASH', details: { institution: 'B', cashKind: 'BANK' } });
    expect(ok.status).toBe(201);
    expect(ok.body).toEqual({ data: { id: ASSET } });
    expect(mockService.createAsset).toHaveBeenCalledWith(TENANT, expect.objectContaining({ name: 'Compte' }), 'user-1');
  });

  it('POST /assets : classe inconnue -> 400', async () => {
    const res = await request(app).post(`${BASE}/assets`).set('x-perms', WRITE).send({ name: 'X', assetClass: 'NOPE' });
    expect(res.status).toBe(400);
    expect(mockService.createAsset).not.toHaveBeenCalled();
  });

  it('PATCH /assets/:id refuse assetClass et propertyId (champs non modifiables)', async () => {
    for (const body of [{ assetClass: 'CASH' }, { propertyId: 'p' }, {}]) {
      const res = await request(app).patch(`${BASE}/assets/${ASSET}`).set('x-perms', WRITE).send(body);
      expect(res.status).toBe(400);
    }
    expect(mockService.updateAsset).not.toHaveBeenCalled();
  });

  it('un identifiant de chemin mal formé -> 400', async () => {
    const res = await request(app).get(`${BASE}/assets/pas-un-uuid`).set('x-perms', READ);
    expect(res.status).toBe(400);
  });

  it('une NotFoundError du service devient 404', async () => {
    mockService.getAsset.mockRejectedValueOnce(new NotFoundError('Actif introuvable.'));
    const res = await request(app).get(`${BASE}/assets/${ASSET}`).set('x-perms', READ);
    expect(res.status).toBe(404);
  });

  it('DELETE valorisation et dette -> 204', async () => {
    expect((await request(app).delete(`${BASE}/assets/${ASSET}/valuations/${VAL}`).set('x-perms', WRITE)).status).toBe(
      204
    );
    expect((await request(app).delete(`${BASE}/debts/${VAL}`).set('x-perms', WRITE)).status).toBe(204);
  });

  it('POST /dispose exige disposedAt', async () => {
    expect((await request(app).post(`${BASE}/assets/${ASSET}/dispose`).set('x-perms', WRITE).send({})).status).toBe(
      400
    );
    const ok = await request(app)
      .post(`${BASE}/assets/${ASSET}/dispose`)
      .set('x-perms', WRITE)
      .send({ disposedAt: '2026-03-01' });
    expect(ok.status).toBe(200);
    expect(mockService.disposeAsset).toHaveBeenCalledWith(TENANT, ASSET, new Date('2026-03-01'), 'user-1');
  });

  it('POST /debts : dette personnelle sans assetId, montants validés', async () => {
    const body = {
      lender: 'Banque',
      capitalAmount: 100,
      remainingCapital: 80,
      interestRate: 5,
      monthlyPayment: 2,
      startDate: '2025-01-01',
      endDate: '2030-01-01'
    };
    expect((await request(app).post(`${BASE}/debts`).set('x-perms', WRITE).send(body)).status).toBe(201);
    const bad = await request(app)
      .post(`${BASE}/debts`)
      .set('x-perms', WRITE)
      .send({ ...body, capitalAmount: -1 });
    expect(bad.status).toBe(400);
  });

  it('PUT holdings : sharePercent dans (0, 100]', async () => {
    const path = `${BASE}/assets/${ASSET}/holdings/${VAL}`;
    for (const sharePercent of [0, 101]) {
      expect((await request(app).put(path).set('x-perms', WRITE).send({ sharePercent })).status).toBe(400);
    }
    expect((await request(app).put(path).set('x-perms', WRITE).send({ sharePercent: 100 })).status).toBe(200);
  });

  it('net-worth et history : requêtes transmises, route statique avant paramétrée', async () => {
    await request(app).get(`${BASE}/net-worth?asOf=2026-06-30`).set('x-perms', READ);
    expect(mockService.getNetWorth).toHaveBeenCalledWith(TENANT, { asOf: '2026-06-30' });
    const history = await request(app)
      .get(`${BASE}/net-worth/history?from=2026-01-01&to=2026-06-30&step=month`)
      .set('x-perms', READ);
    expect(history.status).toBe(200);
    expect(mockService.getNetWorthHistory).toHaveBeenCalledWith(TENANT, {
      from: '2026-01-01',
      to: '2026-06-30',
      step: 'month'
    });
    expect((await request(app).get(`${BASE}/net-worth?asOf=hier`).set('x-perms', READ)).status).toBe(400);
  });

  it('dates, montants et tailles hors bornes : 400 avec la liste { field, message }, service jamais appelé', async () => {
    const path = `${BASE}/assets/${ASSET}/valuations`;
    const bad: Record<string, unknown>[] = [
      { valuatedAt: null, estimatedValue: 1 },
      { valuatedAt: 0, estimatedValue: 1 },
      { valuatedAt: true, estimatedValue: 1 },
      { valuatedAt: '2026-02-30', estimatedValue: 1 },
      { valuatedAt: '1800-01-01', estimatedValue: 1 },
      { valuatedAt: '2026-01-01', estimatedValue: 1e13 },
      { valuatedAt: '2026-01-01', estimatedValue: 1, notes: 'n'.repeat(2001) }
    ];
    for (const body of bad) {
      const res = await request(app).post(path).set('x-perms', WRITE).send(body);
      expect(res.status).toBe(400);
      expect(res.body.errors).toEqual(
        expect.arrayContaining([{ field: expect.any(String), message: expect.any(String) }])
      );
    }
    expect(mockService.createAssetValuation).not.toHaveBeenCalled();
  });
});
