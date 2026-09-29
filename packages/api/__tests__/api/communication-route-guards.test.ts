/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Correctif de sécurité : les routes de communication (newsletter, notifications
 * WhatsApp, envoi de groupe) et le rattrapage des propriétaires
 * (`POST /tenants/:id/clients/sync-owners`) n'exigeaient que
 * `requireTenantCollaborator` : un Comptable ou tout collaborateur sans droit
 * pouvait envoyer une newsletter, diffuser dans le groupe WhatsApp de la
 * plateforme ou provoquer des écritures CRM.
 *
 * Les routeurs réels sont montés avec leurs VRAIES gardes de permission ; seuls
 * l'authentification, le contexte d'agence, la résolution des permissions et
 * les contrôleurs sont simulés.
 */

const PERMISSIONS: Record<string, string[]> = {
  admin: ['TENANT_ADMIN', 'COMMUNICATION_VIEW', 'CRM_CONTACTS_EDIT'],
  agent: ['COMMUNICATION_VIEW', 'CRM_CONTACTS_EDIT'],
  comptable: ['FINANCE_VIEW']
};
const permsOf = (userId: string) => PERMISSIONS[userId] ?? [];

jest.mock('../../src/services/permission-service', () => ({
  hasPermission: async (userId: string, key: string) => permsOf(userId).includes(key),
  hasAnyPermission: async (userId: string, keys: string[]) => keys.some(k => permsOf(userId).includes(k)),
  hasAllPermissions: async (userId: string, keys: string[]) => keys.every(k => permsOf(userId).includes(k))
}));
jest.mock('../../src/services/subscription-service', () => ({ checkSubscriptionAccess: jest.fn() }));
jest.mock('../../src/middleware/auth-middleware', () => ({
  authenticate: (req: any, _res: any, next: any) => {
    req.user = { userId: req.headers['x-actor'], email: 'x@x.ci' };
    next();
  }
}));
jest.mock('../../src/middleware/tenant-middleware', () => ({
  requireTenantAccess: (req: any, _res: any, next: any) => {
    req.tenantContext = { tenantId: req.params.tenantId };
    next();
  },
  requireTenantCollaborator: (_req: any, _res: any, next: any) => next()
}));
jest.mock('../../src/middleware/tenant-isolation-middleware', () => ({
  enforceTenantIsolation: (_req: any, _res: any, next: any) => next()
}));
jest.mock('../../src/middleware/logo-upload-middleware', () => ({
  logoUpload: { single: () => (_r: any, _s: any, n: any) => n() }
}));
jest.mock('./../../src/routes/platform-invoice-routes', () => ({
  platformInvoiceTenantRouter: require('express').Router()
}));

const ok = (_req: any, res: any) => res.status(200).json({ success: true });
const everyHandler = () =>
  new Proxy({}, { get: (_t, key) => (key === '__esModule' ? true : ok) }) as Record<string, unknown>;
jest.mock('../../src/controllers/newsletter-controller', () => everyHandler());
jest.mock('../../src/controllers/whatsapp-notification-config-controller', () => everyHandler());
jest.mock('../../src/controllers/tenant-controller', () => everyHandler());
jest.mock('../../src/controllers/invitation-controller', () => everyHandler());
jest.mock('../../src/controllers/membership-controller', () => everyHandler());
jest.mock('../../src/controllers/subscription-v2-controller', () => everyHandler());
jest.mock('../../src/controllers/platform-billing-controller', () => everyHandler());

import express from 'express';
import request from 'supertest';
import newsletterRoutes from '../../src/routes/newsletter-routes';
import whatsappRoutes from '../../src/routes/whatsapp-notification-config-routes';
import tenantRoutes from '../../src/routes/tenant-routes';

const app = express();
app.use(express.json());
app.use('/api/tenants/:tenantId/newsletter', newsletterRoutes);
app.use('/api/tenants/:tenantId/whatsapp-notifications', whatsappRoutes);
app.use('/api/tenants', tenantRoutes);

const T = '/api/tenants/t1';

describe('newsletter : permission de communication', () => {
  it.each([
    ['get', '/newsletter/lists'],
    ['post', '/newsletter/campaigns'],
    ['post', '/newsletter/campaigns/c1/send'],
    ['patch', '/newsletter/templates/tpl1']
  ])('%s %s : 403 sans COMMUNICATION_VIEW', async (method, path) => {
    const res = await (request(app) as any)[method](`${T}${path}`).set('x-actor', 'comptable').send({});
    expect(res.status).toBe(403);
  });

  it('un agent avec COMMUNICATION_VIEW passe', async () => {
    const res = await request(app).get(`${T}/newsletter/lists`).set('x-actor', 'agent');
    expect(res.status).toBe(200);
  });
});

describe('notifications WhatsApp : permission de communication', () => {
  it.each([
    ['get', '/whatsapp-notifications'],
    ['post', '/whatsapp-notifications/test-send'],
    ['patch', '/whatsapp-notifications/KEY'],
    ['post', '/whatsapp-notifications/KEY/reset'],
    ['post', '/whatsapp-notifications/group-invite/send-all'],
    ['post', '/whatsapp-notifications/group-broadcast/send']
  ])('%s %s : 403 pour un comptable', async (method, path) => {
    const res = await (request(app) as any)[method](`${T}${path}`).set('x-actor', 'comptable').send({});
    expect(res.status).toBe(403);
  });

  it.each(['/whatsapp-notifications/group-invite/send-all', '/whatsapp-notifications/group-broadcast/send'])(
    "%s : refusé à un agent (cible unique de la plateforme), accepté à l'administrateur",
    async path => {
      const agent = await request(app).post(`${T}${path}`).set('x-actor', 'agent').send({});
      expect(agent.status).toBe(403);
      const admin = await request(app).post(`${T}${path}`).set('x-actor', 'admin').send({});
      expect(admin.status).toBe(200);
    }
  );

  it('un agent peut lire la configuration', async () => {
    const res = await request(app).get(`${T}/whatsapp-notifications`).set('x-actor', 'agent');
    expect(res.status).toBe(200);
  });
});

describe('POST /tenants/:id/clients/sync-owners : CRM_CONTACTS_EDIT', () => {
  it('403 sans CRM_CONTACTS_EDIT', async () => {
    const res = await request(app).post(`${T}/clients/sync-owners`).set('x-actor', 'comptable');
    expect(res.status).toBe(403);
  });

  it('passe avec CRM_CONTACTS_EDIT', async () => {
    const res = await request(app).post(`${T}/clients/sync-owners`).set('x-actor', 'agent');
    expect(res.status).toBe(200);
  });
});
