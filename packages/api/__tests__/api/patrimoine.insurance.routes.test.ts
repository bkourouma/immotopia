import express from 'express';
import request from 'supertest';

/**
 * Routes assurances / sinistres / carnet d'entretien (lot B1, spec 032).
 * Authentification et tenant sont des passe-plats ; la garde RBAC est
 * reproduite pour vérifier VIEW (lecture) contre EDIT (écriture). Les modules
 * de domaine sont simulés.
 */

const granted = new Set<string>(['PROPERTIES_VIEW', 'PROPERTIES_EDIT']);

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
jest.mock('../../src/middleware/property-rbac-middleware', () => ({
  requirePropertyPermission: (key: string) => (_req: any, res: any, next: any) =>
    granted.has(key) ? next() : res.status(403).json({ success: false })
}));

const policyService = {
  listPolicies: jest.fn(async () => []),
  getPolicy: jest.fn(async () => ({})),
  createPolicy: jest.fn(async () => ({ id: 'pol-1' })),
  updatePolicy: jest.fn(async () => ({})),
  deletePolicy: jest.fn(async () => undefined)
};
const claimService = {
  listClaims: jest.fn(async () => []),
  getClaim: jest.fn(async () => ({})),
  createClaim: jest.fn(async () => ({ id: 'cl-1' })),
  updateClaim: jest.fn(async () => ({})),
  deleteClaim: jest.fn(async () => undefined),
  transitionClaim: jest.fn(async () => ({})),
  attachClaimDocument: jest.fn(async () => ({ id: 'link-1' })),
  detachClaimDocument: jest.fn(async () => undefined)
};
jest.mock('../../src/lib/patrimoine/insurance/policy-service', () => policyService);
jest.mock('../../src/lib/patrimoine/insurance/claim-service', () => claimService);

// Le carnet d'entretien (autre agent) : seuls les gardes de routes nous intéressent ici.
jest.mock('../../src/controllers/patrimoine-maintenance-log-controller', () => {
  const ok = (_req: any, res: any) => res.json({ success: true, data: [] });
  return {
    listMaintenanceLogHandler: ok,
    exportMaintenanceLogHandler: ok,
    createMaintenanceLogHandler: (_req: any, res: any) => res.status(201).json({ success: true, data: {} }),
    updateMaintenanceLogHandler: ok,
    deleteMaintenanceLogHandler: (_req: any, res: any) => res.status(204).send()
  };
});

/* eslint-disable @typescript-eslint/no-var-requires */
const insuranceRoutes = require('../../src/routes/patrimoine-insurance-routes').default;
const { errorHandler } = require('../../src/middleware/error-middleware');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api', insuranceRoutes);
  app.use(errorHandler);
  return app;
}

const BASE = '/api/tenants/tenant-a/patrimoine';
const POL = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
const CL = '3f2504e0-4f89-41d3-9a0c-0305e82c3302';
const LINK = '3f2504e0-4f89-41d3-9a0c-0305e82c3303';
const validPolicy = {
  propertyId: 'prop-a',
  insurer: 'NSIA',
  policyNumber: 'P1',
  coverageType: 'MULTIRISK_HOME',
  startDate: '2026-01-01',
  endDate: '2026-12-31'
};
const validClaim = {
  propertyId: 'prop-a',
  policyId: POL,
  occurredAt: '2026-09-01',
  cause: 'FIRE',
  description: 'Incendie',
  claimedAmount: 5000
};

beforeEach(() => {
  jest.clearAllMocks();
  granted.clear();
  granted.add('PROPERTIES_VIEW');
  granted.add('PROPERTIES_EDIT');
});

describe('permissions : VIEW pour lire, EDIT pour écrire', () => {
  const reads: Array<[string, string]> = [
    ['/insurance/policies', 'get'],
    [`/insurance/policies/${POL}`, 'get'],
    ['/insurance/claims', 'get'],
    [`/insurance/claims/${CL}`, 'get'],
    ['/maintenance-log?propertyId=p', 'get'],
    ['/maintenance-log/export?propertyId=p', 'get']
  ];
  const writes: Array<[string, 'post' | 'patch' | 'delete', object]> = [
    ['/insurance/policies', 'post', validPolicy],
    [`/insurance/policies/${POL}`, 'patch', {}],
    [`/insurance/policies/${POL}`, 'delete', {}],
    ['/insurance/claims', 'post', validClaim],
    [`/insurance/claims/${CL}`, 'patch', {}],
    [`/insurance/claims/${CL}`, 'delete', {}],
    [`/insurance/claims/${CL}/status`, 'post', { toStatus: 'INSURER_NOTIFIED' }],
    [`/insurance/claims/${CL}/documents`, 'post', { documentId: 'd', kind: 'QUOTE' }],
    [`/insurance/claims/${CL}/documents/${LINK}`, 'delete', {}],
    ['/maintenance-log', 'post', {}],
    ['/maintenance-log/e-1', 'patch', {}],
    ['/maintenance-log/e-1', 'delete', {}]
  ];

  it.each(reads)('lecture %s : VIEW suffit, EDIT seul ne suffit pas', async path => {
    granted.delete('PROPERTIES_EDIT');
    expect((await request(buildApp()).get(`${BASE}${path}`)).status).toBe(200);
    granted.clear();
    granted.add('PROPERTIES_EDIT');
    expect((await request(buildApp()).get(`${BASE}${path}`)).status).toBe(403);
  });

  it.each(writes)('écriture %s %s : refusée sans EDIT', async (path, method, body) => {
    granted.delete('PROPERTIES_EDIT');
    const res = await (request(buildApp()) as any)[method](`${BASE}${path}`).send(body);
    expect(res.status).toBe(403);
    expect(
      Object.values(policyService)
        .concat(Object.values(claimService))
        .every(fn => fn.mock.calls.length === 0)
    ).toBe(true);
  });
});

describe('contrôleurs', () => {
  it('crée une police : 201, agence de l’URL et auteur de la session', async () => {
    const res = await request(buildApp()).post(`${BASE}/insurance/policies`).send(validPolicy);
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ success: true, data: { id: 'pol-1' } });
    expect(policyService.createPolicy).toHaveBeenCalledWith(
      'tenant-a',
      expect.objectContaining({ insurer: 'NSIA' }),
      'user-1'
    );
  });

  it('refuse un champ inconnu (schéma strict) : tenantId, createdByUserId, outOfPocketAmount', async () => {
    for (const extra of [{ tenantId: 'x' }, { createdByUserId: 'x' }]) {
      const res = await request(buildApp())
        .post(`${BASE}/insurance/policies`)
        .send({ ...validPolicy, ...extra });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    }
    const claim = await request(buildApp())
      .post(`${BASE}/insurance/claims`)
      .send({ ...validClaim, outOfPocketAmount: 5 });
    expect(claim.status).toBeGreaterThanOrEqual(400);
    const patch = await request(buildApp()).patch(`${BASE}/insurance/claims/${CL}`).send({ indemnifiedAmount: 5 });
    expect(patch.status).toBeGreaterThanOrEqual(400);
    expect(claimService.createClaim).not.toHaveBeenCalled();
    expect(claimService.updateClaim).not.toHaveBeenCalled();
  });

  it('transition : transmet agence, sinistre, corps et auteur', async () => {
    const res = await request(buildApp())
      .post(`${BASE}/insurance/claims/${CL}/status`)
      .send({ toStatus: 'SETTLED', indemnifiedAmount: 100 });
    expect(res.status).toBe(200);
    expect(claimService.transitionClaim).toHaveBeenCalledWith(
      'tenant-a',
      CL,
      expect.objectContaining({ toStatus: 'SETTLED', indemnifiedAmount: 100 }),
      'user-1'
    );
  });

  it('transition vers un statut inconnu -> erreur de validation', async () => {
    const res = await request(buildApp()).post(`${BASE}/insurance/claims/${CL}/status`).send({ toStatus: 'NOPE' });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(claimService.transitionClaim).not.toHaveBeenCalled();
  });

  it('liste des sinistres : limit > 500 refusée', async () => {
    const res = await request(buildApp()).get(`${BASE}/insurance/claims?limit=501`);
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect((await request(buildApp()).get(`${BASE}/insurance/claims?limit=500&status=SETTLED`)).status).toBe(200);
    expect(claimService.listClaims).toHaveBeenCalledWith('tenant-a', { limit: 500, status: 'SETTLED' });
  });

  it('suppressions : 204 sans corps', async () => {
    const policy = await request(buildApp()).delete(`${BASE}/insurance/policies/${POL}`);
    const claim = await request(buildApp()).delete(`${BASE}/insurance/claims/${CL}`);
    const link = await request(buildApp()).delete(`${BASE}/insurance/claims/${CL}/documents/${LINK}`);
    expect([policy.status, claim.status, link.status]).toEqual([204, 204, 204]);
    expect(claimService.detachClaimDocument).toHaveBeenCalledWith('tenant-a', CL, LINK);
  });

  it.each([
    ['get', `/insurance/policies/pas-un-uuid`],
    ['patch', `/insurance/policies/pas-un-uuid`],
    ['delete', `/insurance/policies/pas-un-uuid`],
    ['get', `/insurance/claims/pas-un-uuid`],
    ['patch', `/insurance/claims/pas-un-uuid`],
    ['delete', `/insurance/claims/pas-un-uuid`],
    ['post', `/insurance/claims/pas-un-uuid/status`],
    ['post', `/insurance/claims/pas-un-uuid/documents`],
    ['delete', `/insurance/claims/${CL}/documents/pas-un-uuid`]
  ])('identifiant d’URL non UUID : %s %s -> 404, service jamais appelé', async (method, path) => {
    const body = path.endsWith('/status')
      ? { toStatus: 'INSURER_NOTIFIED' }
      : path.endsWith('/documents')
        ? { documentId: 'd', kind: 'QUOTE' }
        : {};
    const res = await (request(buildApp()) as any)[method](`${BASE}${path}`).send(body);
    expect(res.status).toBe(404);
    expect(
      Object.values(policyService)
        .concat(Object.values(claimService))
        .every(fn => fn.mock.calls.length === 0)
    ).toBe(true);
  });

  it('corps : policyId non UUID -> 400 avant tout service', async () => {
    const res = await request(buildApp())
      .post(`${BASE}/insurance/claims`)
      .send({ ...validClaim, policyId: 'pol-1' });
    expect(res.status).toBe(400);
    expect(claimService.createClaim).not.toHaveBeenCalled();
  });

  it('pièce : 201', async () => {
    const res = await request(buildApp())
      .post(`${BASE}/insurance/claims/${CL}/documents`)
      .send({ documentId: 'doc-1', kind: 'EXPERT_REPORT' });
    expect(res.status).toBe(201);
  });
});
