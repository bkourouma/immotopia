/**
 * Tests API de POST /api/admin/tenants (lot F2 — creation d'agence en un clic).
 *
 * Modele : `__tests__/api/finance.test.ts` — middlewares d'authentification et
 * de droits remplaces par des passe-plats, `services/tenant-provisioning-service.ts`
 * simule (la logique de provisioning a deja ses tests dans
 * `__tests__/unit/tenant-provisioning-service.test.ts`) : ce fichier verifie
 * le CONTRAT HTTP — validation 400, code 201/200, forme de la reponse,
 * en-tete Idempotency-Key transmis — pas le domaine.
 */

jest.mock('../../src/middleware/auth-middleware', () => ({
  authenticate: (req: any, _res: any, next: any) => {
    req.user = { userId: 'super-admin-1', globalRole: 'SUPER_ADMIN' };
    next();
  }
}));

jest.mock('../../src/middleware/rbac-middleware', () => ({
  requirePermission: () => (_req: any, _res: any, next: any) => next()
}));

const provisionTenantMock = jest.fn();
jest.mock('../../src/services/tenant-provisioning-service', () => ({
  provisionTenant: (...args: any[]) => provisionTenantMock(...args)
}));

// `tenant-service.ts` porte 5 des ~93 erreurs TypeScript preexistantes du
// paquet (voir AGENTS.md) ; `tenant-controller.ts` (route reellement testee)
// l'importe. Le mocker evite que ts-jest tente de le compiler — ce test ne
// verifie que le contrat HTTP de la route de provisioning, aucune de ces
// fonctions n'est appelee par elle.
jest.mock('../../src/services/tenant-service', () => ({
  getTenantById: jest.fn(),
  getTenantBySlug: jest.fn(),
  getTenantClients: jest.fn(),
  getUserTenantMemberships: jest.fn(),
  listActiveTenants: jest.fn(),
  updateTenantClientDetails: jest.fn(),
  removeTenantClient: jest.fn(),
  updateTenant: jest.fn(),
  listTenants: jest.fn(),
  getTenantStats: jest.fn(),
  suspendTenant: jest.fn(),
  activateTenant: jest.fn(),
  uploadTenantLogo: jest.fn()
}));

import express from 'express';
import request from 'supertest';
import { errorHandler } from '../../src/middleware/error-middleware';
import { authenticate } from '../../src/middleware/auth-middleware';
import { requirePermission } from '../../src/middleware/rbac-middleware';
import { provisionTenantHandler } from '../../src/controllers/tenant-controller';

// Route montee directement (comme `portalRouter` dans `__tests__/api/finance.test.ts`)
// plutot que d'importer `routes/admin-routes.ts` : ce fichier monte aussi
// `subscription-controller.ts`, `statistics-controller.ts` et
// `audit-controller.ts`, dont certains portent des erreurs TypeScript
// preexistantes sans rapport avec ce lot (voir AGENTS.md, ~93 erreurs
// connues) — les importer ferait echouer la compilation de ce fichier de
// test. La route montee ci-dessous est exactement celle d'admin-routes.ts :
// `authenticate`, `requirePermission('PLATFORM_TENANTS_CREATE')`, puis le
// meme `provisionTenantHandler`.
const app = express();
app.use(express.json());
app.post('/api/admin/tenants', authenticate, requirePermission('PLATFORM_TENANTS_CREATE'), provisionTenantHandler);
app.use(errorHandler);

function sampleResult(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    tenant: { id: 'tenant-1', name: 'Agence Kipe', slug: 'agence-kipe', type: 'AGENCY', status: 'ACTIVE' },
    modules: ['MODULE_AGENCY'],
    subscription: { planKey: 'PRO', billingCycle: 'MONTHLY', status: 'TRIALING', currentPeriodEnd: new Date().toISOString() },
    admin: { userId: 'user-1', email: 'admin@example.com', fullName: 'Awa Diallo', existingUser: false },
    invitation: { id: 'invitation-1', expiresAt: new Date().toISOString(), acceptUrl: 'http://localhost:3000/auth/accept-invite?token=abc' },
    emailSent: true,
    ...overrides
  };
}

beforeEach(() => {
  provisionTenantMock.mockReset();
});

describe('POST /api/admin/tenants — validation (400)', () => {
  it('refuse un corps sans name/adminFullName/adminEmail', async () => {
    const res = await request(app).post('/api/admin/tenants').send({});
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(Array.isArray(res.body.errors)).toBe(true);
    expect(provisionTenantMock).not.toHaveBeenCalled();
  });

  it('refuse un adminEmail mal forme', async () => {
    const res = await request(app)
      .post('/api/admin/tenants')
      .send({ name: 'Agence Kipe', adminFullName: 'Awa Diallo', adminEmail: 'pas-un-email' });
    expect(res.status).toBe(400);
    expect(provisionTenantMock).not.toHaveBeenCalled();
  });

  it('refuse un name trop court', async () => {
    const res = await request(app)
      .post('/api/admin/tenants')
      .send({ name: 'A', adminFullName: 'Awa Diallo', adminEmail: 'admin@example.com' });
    expect(res.status).toBe(400);
  });

  it('refuse un brandingPrimaryColor hors format #RRGGBB', async () => {
    const res = await request(app).post('/api/admin/tenants').send({
      name: 'Agence Kipe',
      adminFullName: 'Awa Diallo',
      adminEmail: 'admin@example.com',
      brandingPrimaryColor: 'bleu'
    });
    expect(res.status).toBe(400);
  });

  it("refuse un tableau modules vide", async () => {
    const res = await request(app).post('/api/admin/tenants').send({
      name: 'Agence Kipe',
      adminFullName: 'Awa Diallo',
      adminEmail: 'admin@example.com',
      modules: []
    });
    expect(res.status).toBe(400);
  });

  it("refuse un en-tete Idempotency-Key de plus de 100 caracteres", async () => {
    const res = await request(app)
      .post('/api/admin/tenants')
      .set('Idempotency-Key', 'x'.repeat(101))
      .send({ name: 'Agence Kipe', adminFullName: 'Awa Diallo', adminEmail: 'admin@example.com' });
    expect(res.status).toBe(400);
    expect(provisionTenantMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/admin/tenants — creation', () => {
  it('201 + { success: true, data } a la premiere creation', async () => {
    const expected = sampleResult();
    provisionTenantMock.mockResolvedValueOnce({ result: expected, replay: false });

    const res = await request(app)
      .post('/api/admin/tenants')
      .send({ name: 'Agence Kipe', adminFullName: 'Awa Diallo', adminEmail: 'admin@example.com' });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ success: true, data: expected });
    expect(provisionTenantMock).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Agence Kipe', adminFullName: 'Awa Diallo', adminEmail: 'admin@example.com' }),
      'super-admin-1',
      undefined
    );
  });

  it('transmet Idempotency-Key au service, et renvoie 200 sur un rejeu', async () => {
    provisionTenantMock.mockResolvedValueOnce({ result: sampleResult(), replay: true });

    const res = await request(app)
      .post('/api/admin/tenants')
      .set('Idempotency-Key', 'clic-du-super-admin-1')
      .send({ name: 'Agence Kipe', adminFullName: 'Awa Diallo', adminEmail: 'admin@example.com' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(provisionTenantMock).toHaveBeenCalledWith(expect.anything(), 'super-admin-1', 'clic-du-super-admin-1');
  });

  it('accepte les champs optionnels (planKey, billingCycle, type, modules, branding...)', async () => {
    provisionTenantMock.mockResolvedValueOnce({ result: sampleResult(), replay: false });

    const res = await request(app).post('/api/admin/tenants').send({
      name: 'Agence Kipe',
      adminFullName: 'Awa Diallo',
      adminEmail: 'admin@example.com',
      planKey: 'ELITE',
      billingCycle: 'ANNUAL',
      type: 'OPERATOR',
      modules: ['MODULE_AGENCY', 'MODULE_SYNDIC'],
      legalName: 'Agence Kipe SARL',
      contactEmail: 'contact@agence-kipe.example.com',
      contactPhone: '+224600000000',
      country: 'Guinée',
      city: 'Conakry',
      address: 'Kipe, Conakry',
      website: 'https://agence-kipe.example.com',
      brandingPrimaryColor: '#1E90FF'
    });

    expect(res.status).toBe(201);
    expect(provisionTenantMock).toHaveBeenCalledWith(
      expect.objectContaining({ planKey: 'ELITE', billingCycle: 'ANNUAL', type: 'OPERATOR', brandingPrimaryColor: '#1E90FF' }),
      'super-admin-1',
      undefined
    );
  });
});
