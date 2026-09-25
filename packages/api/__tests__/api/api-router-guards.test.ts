import express from 'express';
import request from 'supertest';

/**
 * Les routeurs montés sur `/api` tout entier ne posent leurs gardes que sur
 * les chemins qu'ils servent.
 *
 * Un `router.use(authenticate)` sans chemin s'exécute pour TOUTE requête
 * `/api/*` qui atteint le routeur, même quand aucune de ses routes ne
 * correspond : Express passe ensuite au routeur suivant, mais la requête a
 * déjà traversé les gardes — et un garde qui refuse l'arrête là. Le
 * 23 septembre 2026, `GET /api/portal/owner/account`, montée sur `/api` après
 * le routeur des relevés, répondait « Tenant ID requis. ». Une route publique
 * montée au même endroit aurait exigé une connexion.
 *
 * Ce test monte les routeurs concernés dans l'ordre de `src/index.ts`, puis
 * une route témoin après eux, et vérifie deux choses : la route témoin ne
 * traverse aucun garde, et les routes des routeurs restent gardées.
 */

const mockGuardCalls: string[] = [];

jest.mock('../../src/middleware/auth-middleware', () => ({
  authenticate: (req: any, res: any, next: any) => {
    mockGuardCalls.push('authenticate');
    if (!req.headers.authorization) {
      res.status(401).json({ success: false, message: 'Authentification requise.' });
      return;
    }
    req.user = { userId: 'user-1', globalRole: 'USER' };
    next();
  }
}));

// Le vrai garde retombe sur l'URL quand `req.params.tenantId` manque ; celui-ci
// ne lit que le paramètre, pour prouver que le chemin posé sur le garde le
// lui transmet bien.
jest.mock('../../src/middleware/tenant-middleware', () => ({
  requireTenantAccess: (req: any, res: any, next: any) => {
    mockGuardCalls.push('requireTenantAccess');
    if (!req.params.tenantId) {
      res.status(400).json({ success: false, message: 'Tenant ID requis.' });
      return;
    }
    req.tenantContext = { tenantId: req.params.tenantId, isCollaborator: true, isClient: false };
    next();
  }
}));

jest.mock('../../src/middleware/tenant-isolation-middleware', () => ({
  // Dernier garde commun aux trois routeurs : il répond lui-même, pour que le
  // test n'aille pas jusqu'aux permissions ni aux contrôleurs.
  enforcePropertyTenantIsolation: (req: any, res: any) => {
    mockGuardCalls.push('enforcePropertyTenantIsolation');
    res.status(200).json({ guardedTenantId: req.tenantContext?.tenantId });
  }
}));

jest.mock('../../src/middleware/property-rbac-middleware', () => ({
  requireAnyPropertyPermission: () => (_req: any, _res: any, next: any) => next(),
  requirePropertyPermission: () => (_req: any, _res: any, next: any) => next()
}));

/* eslint-disable @typescript-eslint/no-var-requires */
const whatsappWebhookRoutes = require('../../src/routes/whatsapp.webhook.route').default;
const syndicRoutes = require('../../src/routes/syndic-routes').default;
const patrimoineRoutes = require('../../src/routes/patrimoine-routes').default;
const ownerStatementsRoutes = require('../../src/routes/owner-statements-routes').default;
/* eslint-enable @typescript-eslint/no-var-requires */

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api', whatsappWebhookRoutes);
  app.use('/api', syndicRoutes);
  app.use('/api', patrimoineRoutes);
  app.use('/api', ownerStatementsRoutes);

  // Route témoin montée APRÈS eux, comme le serait une route publique.
  app.all('/api/probe', (req, res) => {
    res.status(200).json({ reached: true, body: req.body ?? null });
  });
  return app;
}

describe('routeurs montés sur /api : gardes posés avec leur chemin', () => {
  beforeEach(() => {
    mockGuardCalls.length = 0;
  });

  it('une route montée après eux ne traverse aucun garde', async () => {
    const res = await request(buildApp()).get('/api/probe');

    expect(res.status).toBe(200);
    expect(res.body.reached).toBe(true);
    expect(mockGuardCalls).toEqual([]);
  });

  it('le webhook WhatsApp ne décode plus les formulaires des autres routes', async () => {
    // Seul `express.json()` est monté au niveau de l'application : un corps
    // urlencoded n'est décodé que si le parseur du webhook s'est appliqué.
    const res = await request(buildApp()).post('/api/probe').type('form').send('a=1');

    expect(res.status).toBe(200);
    expect(res.body.body).toEqual({});
  });

  it.each([
    ['relevés des propriétaires', '/api/tenants/tenant-1/owner-statements'],
    ['copropriétés', '/api/tenants/tenant-1/syndics'],
    ['vue d’ensemble du patrimoine', '/api/tenants/tenant-1/patrimoine/overview'],
    ['programmes de travaux', '/api/tenants/tenant-1/work-programs'],
    ['estimations d’un bien', '/api/tenants/tenant-1/properties/prop-1/valuations']
  ])('%s : la route reste gardée', async (_label, path) => {
    const anonymous = await request(buildApp()).get(path);
    expect(anonymous.status).toBe(401);

    mockGuardCalls.length = 0;
    const authenticated = await request(buildApp()).get(path).set('Authorization', 'Bearer x');

    expect(authenticated.status).toBe(200);
    // Le paramètre du chemin parvient au garde du tenant.
    expect(authenticated.body.guardedTenantId).toBe('tenant-1');
    expect(mockGuardCalls).toEqual(['authenticate', 'requireTenantAccess', 'enforcePropertyTenantIsolation']);
  });

  it('les autres chemins d’un bien restent à property-routes', async () => {
    const res = await request(buildApp()).get('/api/tenants/tenant-1/properties/prop-1');

    expect(res.status).toBe(404);
    expect(mockGuardCalls).toEqual([]);
  });
});
