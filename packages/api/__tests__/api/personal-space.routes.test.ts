import express from 'express';
import request from 'supertest';

/**
 * Lot 4B : routes POST /api/personal-space et GET /tenants/:tenantId/patrimoine/usage
 * (supertest). `authenticate` et les gardes tenant/RBAC sont des passe-plats ;
 * seuls les services sont simulés : contrôleur, validation zod et
 * gestionnaire d'erreurs sont les vrais.
 */

let authUser: { userId: string } | null = { userId: 'user-from-token' };

jest.mock('../../src/middleware/auth-middleware', () => ({
  authenticate: (req: any, res: any, next: any) => {
    if (!authUser) return res.status(401).json({ message: 'Non authentifié' });
    req.user = { ...authUser, globalRole: 'USER' };
    return next();
  }
}));
jest.mock('../../src/middleware/tenant-middleware', () => ({
  requireTenantAccess: (req: any, _res: any, next: any) => {
    req.tenantContext = { tenantId: req.params.tenantId, isCollaborator: true, isClient: false };
    next();
  }
}));
jest.mock('../../src/middleware/tenant-isolation-middleware', () => ({
  enforcePropertyTenantIsolation: (req: any, _res: any, next: any) => {
    req.propertyTenantId = req.tenantContext.tenantId;
    next();
  }
}));
// Garde réelle remplacée par une lecture de l'en-tête x-perms (le calcul des permissions est testé ailleurs).
const guard = (key: string) => (req: any, res: any, next: any) =>
  String(req.headers['x-perms'] ?? '')
    .split(',')
    .includes(key)
    ? next()
    : res.status(403).json({ message: 'Refusé' });
jest.mock('../../src/middleware/patrimoine-rbac-middleware', () => ({
  requirePatrimoinePersonalView: guard('PATRIMOINE_PERSONAL_VIEW'),
  requirePatrimoinePersonalEdit: guard('PATRIMOINE_PERSONAL_EDIT')
}));

const mockCreate = jest.fn();
jest.mock('../../src/services/personal-space/create-personal-space', () => ({
  createPersonalSpace: (...a: unknown[]) => mockCreate(...a)
}));
const mockUsage = jest.fn();
jest.mock('../../src/services/personal-space/free-tier', () => ({
  getAssetUsage: (...a: unknown[]) => mockUsage(...a)
}));
jest.mock(
  '../../src/controllers/patrimoine-assets-controller',
  () => new Proxy({}, { get: () => (_req: any, res: any) => res.json({ data: 'asset-route' }) })
);

// eslint-disable-next-line @typescript-eslint/no-var-requires
const personalSpaceRoutes = require('../../src/routes/personal-space-routes').default;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const assetsRoutes = require('../../src/routes/patrimoine-assets-routes').default;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { errorHandler, AppError } = require('../../src/middleware/error-middleware');

const app = express();
app.use(express.json());
app.use('/api', personalSpaceRoutes);
app.use('/api', assetsRoutes);
app.use(errorHandler);

const RESULT = { tenantId: 't-new', slug: 'awa-abc123', name: 'Awa' };
const BODY = { displayName: 'Awa', country: 'CI' };

beforeEach(() => {
  jest.clearAllMocks();
  authUser = { userId: 'user-from-token' };
  mockCreate.mockResolvedValue({ result: RESULT, replay: false });
});

describe('POST /api/personal-space', () => {
  it('sans jeton -> 401, rien n’est créé', async () => {
    authUser = null;
    const res = await request(app).post('/api/personal-space').send(BODY);
    expect(res.status).toBe(401);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('201 { data: { tenantId, slug, name } } ; l’utilisateur vient du jeton', async () => {
    const res = await request(app).post('/api/personal-space').send(BODY);
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ data: RESULT });
    expect(mockCreate).toHaveBeenCalledWith('user-from-token', BODY, undefined);
  });

  it('un userId dans le corps est refusé (400) : jamais lu', async () => {
    const res = await request(app)
      .post('/api/personal-space')
      .send({ ...BODY, userId: 'someone-else' });
    expect(res.status).toBe(400);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it.each([
    [{ ...BODY, displayName: '' }],
    [{ ...BODY, displayName: 'x'.repeat(121) }],
    [{ ...BODY, country: 'FR' }],
    [{ ...BODY, phone: '0712345678' }],
    [{ displayName: 'Awa' }],
    [{ ...BODY, type: 'AGENCY' }]
  ])('corps invalide %j -> 400 avec errors par champ', async body => {
    const res = await request(app).post('/api/personal-space').send(body);
    expect(res.status).toBe(400);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('corps absent -> 400', async () => {
    const res = await request(app).post('/api/personal-space');
    expect(res.status).toBe(400);
  });

  it('transmet Idempotency-Key ; un rejeu répond 201 avec le marqueur Idempotent-Replayed', async () => {
    mockCreate.mockResolvedValue({ result: RESULT, replay: true });
    const res = await request(app).post('/api/personal-space').set('Idempotency-Key', 'abc').send(BODY);
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ data: RESULT });
    expect(res.headers['idempotent-replayed']).toBe('true');
    expect(mockCreate).toHaveBeenCalledWith('user-from-token', BODY, 'abc');
  });

  it('Idempotency-Key de plus de 100 caractères -> 400', async () => {
    const res = await request(app).post('/api/personal-space').set('Idempotency-Key', 'k'.repeat(101)).send(BODY);
    expect(res.status).toBe(400);
  });

  it('409 PERSONAL_SPACE_EXISTS renvoie data.tenantId', async () => {
    mockCreate.mockRejectedValue(
      new AppError('Vous avez déjà un espace personnel.', 409, 'PERSONAL_SPACE_EXISTS', undefined, {
        tenantId: 't-old'
      })
    );
    const res = await request(app).post('/api/personal-space').send(BODY);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('PERSONAL_SPACE_EXISTS');
    expect(res.body.data).toEqual({ tenantId: 't-old' });
  });

  it.each([
    [403, 'EMAIL_NOT_VERIFIED'],
    [503, 'SIGNUP_UNAVAILABLE']
  ])('propage %i %s', async (status, code) => {
    mockCreate.mockRejectedValue(new AppError('x', status, code));
    const res = await request(app).post('/api/personal-space').send(BODY);
    expect(res.status).toBe(status);
    expect(res.body.code).toBe(code);
  });

  it('un nom à balises est stocké tel quel et la réponse reste du JSON (jamais rendu en HTML)', async () => {
    const name = '<script>alert(1)</script>';
    mockCreate.mockResolvedValue({ result: { ...RESULT, name }, replay: false });
    const res = await request(app)
      .post('/api/personal-space')
      .send({ ...BODY, displayName: name });
    expect(res.status).toBe(201);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(mockCreate.mock.calls[0][1].displayName).toBe(name);
  });
});

describe('GET /api/tenants/:tenantId/patrimoine/usage', () => {
  const USAGE = { plan: 'FREE', limit: 10, used: 3, canAdd: true, upgrade: null };

  it('lecture PATRIMOINE_PERSONAL_VIEW : { data } du service, pour le tenant du contexte', async () => {
    mockUsage.mockResolvedValue(USAGE);
    const res = await request(app)
      .get('/api/tenants/tenant-1/patrimoine/usage')
      .set('x-perms', 'PATRIMOINE_PERSONAL_VIEW');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: USAGE });
    expect(mockUsage).toHaveBeenCalledWith('tenant-1');
  });

  it('sans permission -> 403', async () => {
    const res = await request(app).get('/api/tenants/tenant-1/patrimoine/usage');
    expect(res.status).toBe(403);
    expect(mockUsage).not.toHaveBeenCalled();
  });

  it("PROPERTIES_VIEW seul (rôle d'agence) -> 403", async () => {
    const res = await request(app)
      .get('/api/tenants/tenant-1/patrimoine/usage')
      .set('x-perms', 'PROPERTIES_VIEW,PROPERTIES_EDIT');
    expect(res.status).toBe(403);
    expect(mockUsage).not.toHaveBeenCalled();
  });

  it('la route statique passe avant les routes paramétrées', async () => {
    mockUsage.mockResolvedValue(USAGE);
    const res = await request(app)
      .get('/api/tenants/tenant-1/patrimoine/usage')
      .set('x-perms', 'PATRIMOINE_PERSONAL_VIEW');
    expect(res.body.data).not.toBe('asset-route');
  });
});
