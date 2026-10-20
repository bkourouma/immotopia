/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Gardes de /api/signatures (audit 2026-10-19, tâche 7) : collaborateur
 * obligatoire (un client de l'agence est refusé en 403) et espace PARTICULIER
 * refusé (403 PERSONAL_SPACE_ROUTE_FORBIDDEN, liste blanche à défaut refusé).
 * Le vrai routeur et la vraie garde de type sont montés ; identité, accès à
 * l'agence (contexte posé par l'en-tête x-ctx), RBAC et contrôleurs sont simulés.
 */
import express from 'express';
import request from 'supertest';

jest.mock('../../src/middleware/auth-middleware', () => ({
  authenticate: (req: any, _res: any, next: any) => {
    req.user = { userId: 'u1', globalRole: 'USER' };
    next();
  }
}));
jest.mock('../../src/middleware/tenant-middleware', () => ({
  requireTenantAccess: (req: any, _res: any, next: any) => {
    req.tenantContext = { tenantId: 't1', ...JSON.parse(String(req.headers['x-ctx'] ?? '{}')) };
    next();
  },
  // Même corps que le vrai middleware : refuse (403) un non-collaborateur.
  requireTenantCollaborator: (req: any, res: any, next: any) =>
    req.tenantContext?.isCollaborator ? next() : res.status(403).json({ success: false })
}));
jest.mock('../../src/middleware/signature-tenant-middleware', () => ({
  resolveSignatureTenant: (_req: any, _res: any, next: any) => next()
}));
jest.mock('../../src/middleware/signature-access-middleware', () => ({
  requireSignatureKindAccess: () => (_req: any, _res: any, next: any) => next()
}));
jest.mock('../../src/services/subscription-v2-service', () => ({ getEntitlements: jest.fn() }));
jest.mock('../../src/controllers/signature-controller', () => {
  const ok = (_req: any, res: any) => res.json({ ok: true });
  return {
    cancelSignatureHandler: ok,
    createSignatureHandler: ok,
    getSignatureHandler: ok,
    listSignaturesHandler: ok,
    reissueInPersonTokenHandler: ok,
    remindSignatureHandler: ok,
    signatureFileHandler: ok,
    signatureSummaryHandler: ok,
    signatureTargetContextHandler: ok
  };
});

import signatureRoutes from '../../src/routes/signature-routes';
import { errorHandler } from '../../src/middleware/error-middleware';
import { isRouteAllowedForParticulier } from '../../src/lib/subscription/particulier-routes';

const app = express();
app.use(express.json());
app.use('/api/signatures', signatureRoutes);
app.use(errorHandler);

const ctx = (value: object) => JSON.stringify(value);

describe('/api/signatures — gardes de contexte', () => {
  it('la liste blanche des espaces personnels n’autorise pas les signatures', () => {
    expect(isRouteAllowedForParticulier('/signatures')).toBe(false);
  });

  it('un client de l’agence (non collaborateur) : 403', async () => {
    const res = await request(app)
      .get('/api/signatures')
      .set('x-ctx', ctx({ isCollaborator: false, isClient: true }));
    expect(res.status).toBe(403);
    expect(
      (
        await request(app)
          .post('/api/signatures')
          .set('x-ctx', ctx({ isCollaborator: false }))
      ).status
    ).toBe(403);
  });

  it('un espace PARTICULIER (même collaborateur) : 403 PERSONAL_SPACE_ROUTE_FORBIDDEN, toutes routes', async () => {
    const h = ctx({ isCollaborator: true, tenantType: 'PARTICULIER' });
    for (const path of ['/api/signatures', '/api/signatures/summary', '/api/signatures/abc/file']) {
      const res = await request(app).get(path).set('x-ctx', h);
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('PERSONAL_SPACE_ROUTE_FORBIDDEN');
    }
    expect((await request(app).post('/api/signatures/abc/cancel').set('x-ctx', h)).status).toBe(403);
  });

  it('un collaborateur d’une agence : passe', async () => {
    const res = await request(app)
      .get('/api/signatures')
      .set('x-ctx', ctx({ isCollaborator: true, tenantType: 'AGENCY' }));
    expect(res.status).toBe(200);
    // Contexte sans type (ex. ancien jeton) : la garde ne bloque que le type PARTICULIER.
    expect(
      (
        await request(app)
          .get('/api/signatures/summary')
          .set('x-ctx', ctx({ isCollaborator: true }))
      ).status
    ).toBe(200);
  });
});
