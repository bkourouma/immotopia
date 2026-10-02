import express from 'express';
import request from 'supertest';

/**
 * Permissions PATRIMOINE_PERSONAL_VIEW / PATRIMOINE_PERSONAL_EDIT (donnees
 * personnelles du patrimoine d'un particulier), route par route.
 *
 * Vrais routeurs et vraies gardes (`requirePermission`, `requirePropertyPermission`) ;
 * seuls `authenticate`, le contexte d'agence, l'isolation, le calcul des
 * permissions (`permission-service`) et les contrôleurs sont simulés. Les
 * permissions de l'utilisateur viennent de `currentPerms`.
 */

let currentPerms: string[] = [];

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
  enforcePropertyTenantIsolation: (req: any, _res: any, next: any) => {
    req.propertyTenantId = req.tenantContext.tenantId;
    next();
  }
}));
jest.mock('../../src/middleware/rate-limit-middleware', () => ({
  patrimoineProjectionRateLimiter: (_req: any, _res: any, next: any) => next()
}));
jest.mock('../../src/services/permission-service', () => ({
  hasPermission: async (_userId: string, key: string) => currentPerms.includes(key)
}));

const okHandlers = () => new Proxy({}, { get: () => (_req: any, res: any) => res.status(200).json({ ok: true }) });
jest.mock('../../src/controllers/patrimoine-assets-controller', () => okHandlers());
jest.mock('../../src/controllers/personal-space-controller', () => okHandlers());
jest.mock('../../src/controllers/patrimoine-entities-controller', () => okHandlers());
jest.mock('../../src/controllers/patrimoine-tax-controller', () => okHandlers());
jest.mock('../../src/controllers/patrimoine-projections-controller', () => okHandlers());

/* eslint-disable @typescript-eslint/no-var-requires */
const assetsRoutes = require('../../src/routes/patrimoine-assets-routes').default;
const entitiesRoutes = require('../../src/routes/patrimoine-entities-routes').default;
const projectionsRoutes = require('../../src/routes/patrimoine-projections-routes').default;
/* eslint-enable @typescript-eslint/no-var-requires */

const app = express();
app.use(express.json());
app.use('/api', assetsRoutes);
app.use('/api', entitiesRoutes);
app.use('/api', projectionsRoutes);

const B = '/api/tenants/t1/patrimoine';
type Kind = 'VIEW' | 'EDIT' | 'PROPERTIES_VIEW' | 'PROPERTIES_EDIT';
type Row = [string, string, Kind];
const R = (method: string, path: string, kind: Kind): Row => [method, `${B}${path}`, kind];

/** Données personnelles : garde dédiée. */
const PERSONAL_ROUTES: Row[] = [
  R('get', '/usage', 'VIEW'),
  R('get', '/net-worth', 'VIEW'),
  R('get', '/net-worth/history', 'VIEW'),
  R('get', '/assets', 'VIEW'),
  R('post', '/assets', 'EDIT'),
  R('get', '/assets/a1', 'VIEW'),
  R('patch', '/assets/a1', 'EDIT'),
  R('post', '/assets/a1/dispose', 'EDIT'),
  R('post', '/assets/a1/archive', 'EDIT'),
  R('get', '/assets/a1/valuations', 'VIEW'),
  R('post', '/assets/a1/valuations/suggest', 'VIEW'),
  R('post', '/assets/a1/valuations', 'EDIT'),
  R('patch', '/assets/a1/valuations/v1', 'EDIT'),
  R('delete', '/assets/a1/valuations/v1', 'EDIT'),
  R('get', '/assets/a1/holdings', 'VIEW'),
  R('put', '/assets/a1/holdings/e1', 'EDIT'),
  R('delete', '/assets/a1/holdings/e1', 'EDIT'),
  R('get', '/debts', 'VIEW'),
  R('post', '/debts', 'EDIT'),
  R('patch', '/debts/d1', 'EDIT'),
  R('delete', '/debts/d1', 'EDIT'),
  R('get', '/entities', 'VIEW'),
  R('post', '/entities', 'EDIT'),
  R('get', '/entities/e1', 'VIEW'),
  R('patch', '/entities/e1', 'EDIT'),
  R('delete', '/entities/e1', 'EDIT'),
  R('post', '/entities/e1/holdings', 'EDIT'),
  R('patch', '/entities/e1/holdings/h1', 'EDIT'),
  R('delete', '/entities/e1/holdings/h1', 'EDIT'),
  R('get', '/entities/e1/consolidation', 'VIEW'),
  R('get', '/entities/e1/tax-estimate', 'VIEW'),
  R('post', '/projections', 'VIEW'),
  R('get', '/scenarios', 'VIEW'),
  R('post', '/scenarios', 'EDIT'),
  R('get', '/scenarios/s1', 'VIEW'),
  R('patch', '/scenarios/s1', 'EDIT'),
  R('delete', '/scenarios/s1', 'EDIT'),
  R('post', '/scenarios/s1/run', 'VIEW')
];

/** Routes immobilières / référentiel : restent sous PROPERTIES_*. */
const PROPERTY_ROUTES: Row[] = [
  R('get', '/properties/p1/holdings', 'PROPERTIES_VIEW'),
  R('put', '/properties/p1/holdings', 'PROPERTIES_EDIT'),
  R('get', '/properties/p1/tax-profile', 'PROPERTIES_VIEW'),
  R('put', '/properties/p1/tax-profile', 'PROPERTIES_EDIT'),
  R('get', '/properties/p1/tax-estimate', 'PROPERTIES_VIEW'),
  R('get', '/tax-parameters', 'PROPERTIES_VIEW')
];

const send = (method: string, path: string, perms: string[]) => {
  currentPerms = perms;
  return (request(app) as any)[method](path).send({});
};

const AGENCY_ADMIN = [
  'PROPERTIES_VIEW',
  'PROPERTIES_CREATE',
  'PROPERTIES_EDIT',
  'PROPERTIES_DELETE',
  'TENANT_SETTINGS_VIEW'
];
const PERSONAL_OWNER = [...AGENCY_ADMIN, 'PATRIMOINE_PERSONAL_VIEW', 'PATRIMOINE_PERSONAL_EDIT'];

describe('données personnelles du patrimoine : PATRIMOINE_PERSONAL_VIEW / _EDIT', () => {
  it.each(PERSONAL_ROUTES)('%s %s : sans aucune permission -> 403', async (method, path) => {
    expect((await send(method, path, [])).status).toBe(403);
  });

  it.each(PERSONAL_ROUTES)(
    '%s %s : administrateur d’agence (PROPERTIES_* sans PATRIMOINE_PERSONAL_*) -> 403',
    async (method, path) => {
      const res = await send(method, path, AGENCY_ADMIN);
      expect(res.status).toBe(403);
      expect(res.body.message).toMatch(/PATRIMOINE_PERSONAL_(VIEW|EDIT)/);
    }
  );

  it.each(PERSONAL_ROUTES)('%s %s : propriétaire d’espace personnel -> 200', async (method, path) => {
    expect((await send(method, path, PERSONAL_OWNER)).status).toBe(200);
  });

  it.each(PERSONAL_ROUTES)('%s %s : la permission requise est celle du contrat', async (method, path, kind) => {
    const view = await send(method, path, ['PATRIMOINE_PERSONAL_VIEW']);
    const edit = await send(method, path, ['PATRIMOINE_PERSONAL_EDIT']);
    // Lecture : VIEW suffit, EDIT seul ne suffit pas ; écriture : EDIT suffit, VIEW seul ne suffit pas.
    expect(view.status).toBe(kind === 'VIEW' ? 200 : 403);
    expect(edit.status).toBe(kind === 'EDIT' ? 200 : 403);
  });
});

describe('routes immobilières et référentiel du patrimoine : inchangées (PROPERTIES_*)', () => {
  it.each(PROPERTY_ROUTES)('%s %s : administrateur d’agence -> 200', async (method, path) => {
    expect((await send(method, path, AGENCY_ADMIN)).status).toBe(200);
  });

  it.each(PROPERTY_ROUTES)('%s %s : PATRIMOINE_PERSONAL_* seul ne remplace pas PROPERTIES_*', async (method, path) => {
    expect((await send(method, path, ['PATRIMOINE_PERSONAL_VIEW', 'PATRIMOINE_PERSONAL_EDIT'])).status).toBe(403);
  });
});
