/**
 * BUG-2026-09-30-096 — le module Syndic et les relevés de gérance ont leurs
 * propres droits (SYNDIC_*, OWNER_STATEMENTS_*) ; un Agent (TENANT_AGENT) n'en
 * détient aucun, l'administrateur et le gestionnaire les ont tous.
 *
 * Les vrais routeurs sont montés avec les vraies gardes de permission ; seuls
 * l'authentification, le contexte d'agence, les contrôleurs et le service de
 * permissions (table de droits par rôle ET par agence) sont simulés.
 */
import fs from 'fs';
import path from 'path';
import express from 'express';
import request from 'supertest';

jest.mock('../../src/middleware/auth-middleware', () => ({
  authenticate: (req: any, _res: any, next: any) => {
    req.user = { userId: String(req.headers['x-role'] ?? 'none'), globalRole: 'USER' };
    next();
  }
}));
jest.mock('../../src/middleware/tenant-middleware', () => ({
  requireTenantAccess: (req: any, _res: any, next: any) => {
    req.tenantContext = {
      tenantId: /\/tenants\/([^/]+)/.exec(req.originalUrl)?.[1],
      isCollaborator: true,
      isClient: false
    };
    next();
  }
}));
jest.mock('../../src/middleware/tenant-isolation-middleware', () => ({
  enforcePropertyTenantIsolation: (_req: any, _res: any, next: any) => next()
}));
jest.mock('../../src/services/own-assets-barrier-service', () => ({
  requireThirdPartyAllowed: () => (_req: any, _res: any, next: any) => next()
}));
jest.mock('../../src/middleware/upload-middleware', () => ({
  uploadDocument: { single: () => (_req: any, _res: any, next: any) => next() }
}));

// Tout contrôleur est remplacé par un handler qui répond 200 « reached ».
jest.mock('../../src/controllers/syndic-controller', () => stubModule());
jest.mock('../../src/controllers/owner-statements-controller', () => stubModule());
jest.mock('../../src/controllers/syndic-fund-assignment-controller', () => stubModule());
jest.mock('../../src/controllers/syndic-coowner-portal-controller', () => stubModule());
jest.mock('../../src/controllers/syndic-charge-schedules-controller', () => stubModule());
jest.mock('../../src/controllers/syndic-lot-payments-controller', () => stubModule());
jest.mock('../../src/controllers/syndic-provider-invoice-controller', () => stubModule());
jest.mock('../../src/controllers/syndic-receipts-controller', () => stubModule());
jest.mock('../../src/controllers/document-branding-controller', () => stubModule());
jest.mock('../../src/middleware/branding-upload-middleware', () => ({
  brandingImageUpload: { single: () => (_req: any, _res: any, next: any) => next() }
}));

function stubModule() {
  const handler = (_req: any, res: any) => res.status(200).json({ reached: true });
  return new Proxy({}, { get: (_t, key) => (key === '__esModule' ? false : handler) });
}

// Droits par (rôle, agence) : « multi » est administrateur de A, simple Agent de B.
const ALL = ['SYNDIC_VIEW', 'SYNDIC_CREATE', 'SYNDIC_EDIT', 'OWNER_STATEMENTS_VIEW', 'OWNER_STATEMENTS_EDIT'];
const AGENT = ['PROPERTIES_VIEW', 'PROPERTIES_CREATE', 'PROPERTIES_EDIT', 'TENANT_SETTINGS_VIEW'];
const GRANTS: Record<string, Record<string, string[]>> = {
  admin: { '*': [...ALL, 'PROPERTIES_VIEW', 'PROPERTIES_EDIT', 'USERS_VIEW'] },
  agent: { '*': AGENT },
  accountant: { '*': ['BILLING_VIEW'] },
  multi: { 'tenant-A': ALL, 'tenant-B': AGENT }
};
jest.mock('../../src/services/permission-service', () => ({
  hasPermission: jest.fn(async (userId: string, key: string, tenantId?: string) => {
    const byTenant = GRANTS[userId] ?? {};
    return (byTenant[tenantId ?? ''] ?? byTenant['*'] ?? []).includes(key);
  }),
  hasAnyPermission: jest.fn(),
  hasAllPermissions: jest.fn()
}));

import syndicRoutes from '../../src/routes/syndic-routes';
import lotPaymentsRoutes from '../../src/routes/syndic-lot-payments-routes';
import receiptsRoutes from '../../src/routes/syndic-receipts-routes';
import schedulesRoutes from '../../src/routes/syndic-charge-schedules-routes';
import invoiceRoutes from '../../src/routes/syndic-provider-invoice-routes';
import ownerStatementsRoutes from '../../src/routes/owner-statements-routes';
import brandingRoutes from '../../src/routes/document-branding-routes';
import { AGENT_REVOKED_KEYS, SYNDIC_ALL_KEYS, SYNDIC_ROLE_GRANTS } from '../../prisma/seeds/syndic-permissions-seed';

const app = express();
app.use(express.json());
for (const router of [
  syndicRoutes,
  lotPaymentsRoutes,
  receiptsRoutes,
  schedulesRoutes,
  invoiceRoutes,
  ownerStatementsRoutes,
  brandingRoutes
]) {
  app.use('/api', router);
}

const S = '11111111-1111-4111-8111-111111111111';
const base = (t: string) => `/api/tenants/${t}`;

type Method = 'get' | 'post' | 'patch' | 'delete';
const cases: Array<{ name: string; method: Method; url: (t: string) => string }> = [
  { name: 'liste des copropriétés', method: 'get', url: t => `${base(t)}/syndics` },
  { name: 'création de copropriété', method: 'post', url: t => `${base(t)}/syndics` },
  { name: 'modification de copropriété', method: 'patch', url: t => `${base(t)}/syndics/${S}` },
  { name: 'lots', method: 'get', url: t => `${base(t)}/syndics/${S}/lots` },
  { name: 'création de lot', method: 'post', url: t => `${base(t)}/syndics/${S}/lots` },
  { name: 'appels de charges', method: 'get', url: t => `${base(t)}/syndics/${S}/charges` },
  { name: 'création appel', method: 'post', url: t => `${base(t)}/syndics/${S}/charges` },
  { name: 'relances', method: 'get', url: t => `${base(t)}/syndics/${S}/relances` },
  { name: 'fonds', method: 'get', url: t => `${base(t)}/syndics/${S}/fonds` },
  { name: 'prestataires', method: 'get', url: t => `${base(t)}/syndics/${S}/prestataires` },
  { name: 'assemblées', method: 'get', url: t => `${base(t)}/syndics/${S}/assemblees` },
  { name: 'budgets', method: 'get', url: t => `${base(t)}/syndics/${S}/budgets` },
  { name: 'documents', method: 'get', url: t => `${base(t)}/syndics/${S}/documents` },
  { name: 'incidents', method: 'get', url: t => `${base(t)}/syndics/${S}/incidents` },
  { name: 'comptabilité', method: 'get', url: t => `${base(t)}/syndics/${S}/comptabilite/balance` },
  { name: 'suivi mensuel', method: 'get', url: t => `${base(t)}/syndics/${S}/suivi-mensuel` },
  { name: 'quittances', method: 'get', url: t => `${base(t)}/syndics/${S}/quittances` },
  { name: 'programmations', method: 'get', url: t => `${base(t)}/syndics/${S}/programmations` },
  { name: 'factures prestataires', method: 'get', url: t => `${base(t)}/syndics/${S}/factures-prestataires` },
  { name: 'relevés de gérance (liste)', method: 'get', url: t => `${base(t)}/owner-statements` },
  { name: 'relevés de gérance (création)', method: 'post', url: t => `${base(t)}/owner-statements` },
  { name: 'relevé de gérance (envoi)', method: 'post', url: t => `${base(t)}/owner-statements/${S}/send` },
  { name: 'agences mandantes (liste)', method: 'get', url: t => `${base(t)}/syndic-mandating-agencies` },
  { name: 'agences mandantes (création)', method: 'post', url: t => `${base(t)}/syndic-mandating-agencies` },
  { name: 'agence mandante (modification)', method: 'patch', url: t => `${base(t)}/syndic-mandating-agencies/${S}` },
  { name: 'agence mandante (suppression)', method: 'delete', url: t => `${base(t)}/syndic-mandating-agencies/${S}` },
  {
    name: 'signature du mandant (lecture)',
    method: 'get',
    url: t => `${base(t)}/syndic-mandating-agencies/${S}/images/signature`
  },
  { name: 'logo de copropriété (lecture)', method: 'get', url: t => `${base(t)}/syndics/${S}/logo` }
];

describe('droits du module Syndic et des relevés de gérance', () => {
  it.each(cases)('Agent refusé (403) : $name', async ({ method, url }) => {
    const res = await request(app)[method](url('tenant-A')).set('x-role', 'agent').send({});
    expect(res.status).toBe(403);
    expect(res.body.reached).toBeUndefined();
  });

  it.each(cases)('Comptable refusé (403) : $name', async ({ method, url }) => {
    const res = await request(app)[method](url('tenant-A')).set('x-role', 'accountant').send({});
    expect(res.status).toBe(403);
  });

  it.each(cases)('administrateur autorisé : $name', async ({ method, url }) => {
    const res = await request(app)[method](url('tenant-A')).set('x-role', 'admin').send({});
    expect(res.status).toBe(200);
    expect(res.body.reached).toBe(true);
  });

  it('les droits sont évalués par agence : administrateur de A, refusé dans B', async () => {
    const inA = await request(app)
      .post(`${base('tenant-A')}/syndics`)
      .set('x-role', 'multi')
      .send({});
    const inB = await request(app)
      .post(`${base('tenant-B')}/syndics`)
      .set('x-role', 'multi')
      .send({});
    const statementsInB = await request(app)
      .get(`${base('tenant-B')}/owner-statements`)
      .set('x-role', 'multi');
    expect(inA.status).toBe(200);
    expect(inB.status).toBe(403);
    expect(statementsInB.status).toBe(403);
  });

  it('les droits PROPERTIES_* ne suffisent plus à créer une copropriété', async () => {
    const res = await request(app)
      .post(`${base('tenant-A')}/syndics`)
      .set('x-role', 'agent')
      .send({ name: 'Copro Agent Test', address: 'x' });
    expect(res.status).toBe(403);
    expect(res.body.message).toContain('SYNDIC_CREATE');
  });
});

describe('seed RBAC : attribution des droits', () => {
  it('seuls administrateur, gestionnaire et super-admin reçoivent les droits Syndic', () => {
    expect(Object.keys(SYNDIC_ROLE_GRANTS).sort()).toEqual(['PLATFORM_SUPER_ADMIN', 'TENANT_ADMIN', 'TENANT_MANAGER']);
    for (const keys of Object.values(SYNDIC_ROLE_GRANTS)) expect(keys).toEqual(SYNDIC_ALL_KEYS);
  });

  it('l’Agent ne reçoit plus la liste des collaborateurs (USERS_VIEW)', () => {
    expect(AGENT_REVOKED_KEYS.TENANT_AGENT).toContain('USERS_VIEW');
    const seed = fs.readFileSync(path.join(__dirname, '../../prisma/seeds/rbac-seed.ts'), 'utf8');
    const start = seed.indexOf('Assigning permissions to TENANT_AGENT');
    const end = seed.indexOf('agentPropertyPerms');
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    expect(seed.slice(start, end)).not.toMatch(/in:\s*\[[^\]]*'USERS_VIEW'/);
  });
});
