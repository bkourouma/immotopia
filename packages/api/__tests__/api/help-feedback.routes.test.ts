import express from 'express';
import request from 'supertest';

/**
 * Avis d'aide, de bout en bout sur le vrai routeur et le vrai contrôleur. `authenticate`,
 * `requireTenantAccess`, `requirePermission`, `requireSuperAdmin` et les limiteurs sont remplacés
 * par des passe-plats pilotés par des en-têtes de test ; seul le service est simulé
 * (modèle : `finance.suppliers.test.ts`).
 */

jest.mock('../../src/middleware/auth-middleware', () => ({
  authenticate: (req: any, res: any, next: any) => {
    const userId = req.headers['x-test-user'];
    if (!userId) return res.status(401).json({ success: false });
    req.user = { userId, globalRole: 'USER' };
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
  requirePermission: (key: string) =>
    Object.assign(
      (req: any, res: any, next: any) => {
        const granted = String(req.headers['x-test-perms'] ?? '').split(',');
        if (!granted.includes(key)) return res.status(403).json({ success: false, required: key });
        next();
      },
      { permissionKey: key }
    )
}));

jest.mock('../../src/middleware/super-admin-middleware', () => ({
  requireSuperAdmin: (req: any, res: any, next: any) => {
    if (req.headers['x-test-super'] !== '1') return res.status(403).json({ success: false });
    next();
  }
}));

jest.mock('../../src/middleware/rate-limit-middleware', () => ({
  helpFeedbackRateLimiter: (_req: any, _res: any, next: any) => next(),
  helpFeedbackDailyLimiter: (_req: any, _res: any, next: any) => next()
}));

const mockResolve = jest.fn();
const mockCreate = jest.fn();
const mockList = jest.fn();
jest.mock('../../src/services/help-feedback-service', () => ({
  resolveFeedbackTenantId: (...a: any[]) => mockResolve(...a),
  createHelpFeedback: (...a: any[]) => mockCreate(...a),
  listHelpFeedbackSummary: (...a: any[]) => mockList(...a)
}));

import helpFeedbackRoutes, { helpFeedbackTenantRoutes } from '../../src/routes/help-feedback-routes';
import { errorHandler } from '../../src/middleware/error-middleware';

const TENANT_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const TENANT_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const app = express();
app.use(express.json());
app.use('/api', helpFeedbackRoutes);
app.use('/api', helpFeedbackTenantRoutes);
app.use(errorHandler);

beforeEach(() => {
  jest.resetAllMocks();
  mockList.mockResolvedValue({ items: [] });
});

describe('POST /api/help/feedback', () => {
  const body = { helpId: 'properties.list', useful: true, locale: 'fr', path: `/tenant/${TENANT_A}/properties` };

  it('401 sans jeton', async () => {
    const res = await request(app).post('/api/help/feedback').send(body);
    expect(res.status).toBe(401);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('201 { id } pour tout utilisateur authentifié, sans permission particulière', async () => {
    mockResolve.mockResolvedValue(TENANT_A);
    mockCreate.mockResolvedValue({ id: 'f1' });
    const res = await request(app).post('/api/help/feedback').set('x-test-user', 'u1').send(body);
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ id: 'f1' });
    expect(mockCreate).toHaveBeenCalledWith('u1', expect.objectContaining({ helpId: 'properties.list' }), TENANT_A);
  });

  it('400 sur un corps invalide ou un champ inconnu (tenantId du corps refusé)', async () => {
    const bad = await request(app)
      .post('/api/help/feedback')
      .set('x-test-user', 'u1')
      .send({ ...body, tenantId: TENANT_B });
    expect(bad.status).toBe(400);
    const empty = await request(app).post('/api/help/feedback').set('x-test-user', 'u1').send({});
    expect(empty.status).toBe(400);
    expect(mockCreate).not.toHaveBeenCalled();
  });
});

describe('GET /api/tenants/:tenantId/help-feedback', () => {
  it('403 pour un membre sans TENANT_AUDIT_VIEW', async () => {
    const res = await request(app)
      .get(`/api/tenants/${TENANT_A}/help-feedback`)
      .set('x-test-user', 'u1')
      .set('x-test-perms', 'TENANT_SETTINGS_VIEW');
    expect(res.status).toBe(403);
    expect(mockList).not.toHaveBeenCalled();
  });

  it('200 { items } et le service reçoit toujours le tenantId du contexte, jamais celui de la query', async () => {
    const res = await request(app)
      .get(`/api/tenants/${TENANT_A}/help-feedback?days=7&tenantId=${TENANT_B}`)
      .set('x-test-user', 'u1')
      .set('x-test-perms', 'TENANT_AUDIT_VIEW');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ items: [] });
    expect(mockList).toHaveBeenCalledWith({ days: 7, tenantId: TENANT_A });
  });

  it('400 quand days est hors bornes', async () => {
    const res = await request(app)
      .get(`/api/tenants/${TENANT_A}/help-feedback?days=400`)
      .set('x-test-user', 'u1')
      .set('x-test-perms', 'TENANT_AUDIT_VIEW');
    expect(res.status).toBe(400);
  });
});

describe('GET /api/admin/help-feedback', () => {
  it('403 sans PLATFORM_TENANTS_VIEW', async () => {
    const res = await request(app).get('/api/admin/help-feedback').set('x-test-user', 'u1').set('x-test-super', '1');
    expect(res.status).toBe(403);
    expect(mockList).not.toHaveBeenCalled();
  });

  it('403 pour un non super-admin même avec la permission', async () => {
    const res = await request(app)
      .get('/api/admin/help-feedback')
      .set('x-test-user', 'u1')
      .set('x-test-perms', 'PLATFORM_TENANTS_VIEW');
    expect(res.status).toBe(403);
    expect(mockList).not.toHaveBeenCalled();
  });

  it('200 pour le super-admin, sans filtre d agence même si la query en propose un', async () => {
    const res = await request(app)
      .get(`/api/admin/help-feedback?tenantId=${TENANT_B}`)
      .set('x-test-user', 'u1')
      .set('x-test-perms', 'PLATFORM_TENANTS_VIEW')
      .set('x-test-super', '1');
    expect(res.status).toBe(200);
    expect(mockList).toHaveBeenCalledWith({ days: 30 });
  });
});
