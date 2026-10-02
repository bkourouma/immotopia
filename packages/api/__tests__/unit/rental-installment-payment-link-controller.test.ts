/**
 * `controllers/rental-installment-payment-link-controller.ts` — lien de paiement
 * Mobile Money d'un loyer, côté agence (lot C5, spec 039). App Express minimale :
 * handlers réels, vrai `errorHandler`, services mockés à la frontière. Aucun jeton
 * réel, aucun message envoyé. La garde de permission de chaque route est vérifiée
 * sur le routeur réel (`routes/rental-routes.ts`).
 */

import express from 'express';
import request from 'supertest';

const createInstallmentPaymentLink = jest.fn();
const listInstallmentPaymentLinks = jest.fn();
const revokeInstallmentPaymentLink = jest.fn();
jest.mock('../../src/lib/payment-gateway/installment-payment-link', () => ({
  createInstallmentPaymentLink: (...a: any[]) => createInstallmentPaymentLink(...a),
  listInstallmentPaymentLinks: (...a: any[]) => listInstallmentPaymentLinks(...a),
  revokeInstallmentPaymentLink: (...a: any[]) => revokeInstallmentPaymentLink(...a)
}));

const sendInstallmentPaymentLink = jest.fn();
jest.mock('../../src/lib/payment-gateway/installment-payment-link-send', () => ({
  sendInstallmentPaymentLink: (...a: any[]) => sendInstallmentPaymentLink(...a)
}));

import {
  createInstallmentPaymentLinkHandler,
  listInstallmentPaymentLinksHandler,
  revokeInstallmentPaymentLinkHandler
} from '../../src/controllers/rental-installment-payment-link-controller';
import { NotFoundError, errorHandler } from '../../src/middleware/error-middleware';

const TENANT = 'ctx-tenant';
const INSTALLMENT = '11111111-1111-4111-8111-111111111111';
const BASE = `/tenants/URL-TENANT/rental/installments/${INSTALLMENT}`;
const SECRET_URL = 'https://app.test/payer#tok_SECRET';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).tenantContext = { tenantId: TENANT };
    (req as any).user = { userId: 'user-1' };
    next();
  });
  app.post('/tenants/:tenantId/rental/installments/:installmentId/payment-link', createInstallmentPaymentLinkHandler);
  app.get('/tenants/:tenantId/rental/installments/:installmentId/payment-links', listInstallmentPaymentLinksHandler);
  app.delete(
    '/tenants/:tenantId/rental/installments/:installmentId/payment-link/:linkId',
    revokeInstallmentPaymentLinkHandler
  );
  app.use(errorHandler);
  return app;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('POST /payment-link (COPY)', () => {
  const expiresAt = new Date('2026-10-14T00:00:00.000Z');

  it('201 : renvoie l’URL une seule fois, tenantId du contexte (jamais de l’URL), acteur transmis', async () => {
    createInstallmentPaymentLink.mockResolvedValue({
      link: { id: 'link-1', token: 'tok_SECRET', url: SECRET_URL, expiresAt },
      context: { amountDue: 150000, currency: 'FCFA', agencyName: 'A' }
    });

    const res = await request(buildApp()).post(`${BASE}/payment-link`).send({ delivery: 'COPY', ttlDays: 5 });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      success: true,
      data: {
        linkId: 'link-1',
        url: SECRET_URL,
        expiresAt: expiresAt.toISOString(),
        amountDue: 150000,
        currency: 'FCFA'
      }
    });
    expect(createInstallmentPaymentLink).toHaveBeenCalledWith(TENANT, INSTALLMENT, 'user-1', { ttlDays: 5 });
    expect(sendInstallmentPaymentLink).not.toHaveBeenCalled();
    // Le jeton n'est exposé que via l'URL, jamais comme champ séparé ni sous forme de hash.
    expect(Object.keys(res.body.data).sort()).toEqual(['amountDue', 'currency', 'expiresAt', 'linkId', 'url']);
  });

  it('404 : échéance d’une autre agence ou inexistante (refus du service)', async () => {
    createInstallmentPaymentLink.mockRejectedValue(new NotFoundError('Échéance introuvable.'));

    const res = await request(buildApp()).post(`${BASE}/payment-link`).send({ delivery: 'COPY' });

    expect(res.status).toBe(404);
  });
});

describe('POST /payment-link (SEND)', () => {
  it('201 : envoyé, sans URL dans la réponse', async () => {
    sendInstallmentPaymentLink.mockResolvedValue({
      sent: true,
      channel: 'EMAIL',
      linkId: 'link-1',
      expiresAt: '2026-10-14T00:00:00.000Z',
      amountDue: 150000,
      currency: 'FCFA'
    });

    const res = await request(buildApp()).post(`${BASE}/payment-link`).send({ delivery: 'SEND' });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      success: true,
      data: {
        sent: true,
        channel: 'EMAIL',
        linkId: 'link-1',
        expiresAt: '2026-10-14T00:00:00.000Z',
        amountDue: 150000,
        currency: 'FCFA'
      }
    });
    expect(sendInstallmentPaymentLink).toHaveBeenCalledWith(TENANT, INSTALLMENT, 'user-1', { ttlDays: undefined });
    expect(createInstallmentPaymentLink).not.toHaveBeenCalled();
  });

  it('200 : non envoyé, avec la raison seule', async () => {
    sendInstallmentPaymentLink.mockResolvedValue({ sent: false, channel: null, reason: 'NO_ELIGIBLE_CHANNEL' });

    const res = await request(buildApp()).post(`${BASE}/payment-link`).send({ delivery: 'SEND' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: { sent: false, reason: 'NO_ELIGIBLE_CHANNEL' } });
  });

  it('404 : échéance d’une autre agence', async () => {
    sendInstallmentPaymentLink.mockRejectedValue(new NotFoundError('Échéance introuvable.'));

    const res = await request(buildApp()).post(`${BASE}/payment-link`).send({ delivery: 'SEND' });

    expect(res.status).toBe(404);
  });
});

describe('POST /payment-link : corps strict', () => {
  it.each([
    ['sans corps', undefined],
    ['mode inconnu', { delivery: 'PRINT' }],
    ['champ inconnu', { delivery: 'COPY', foo: 1 }],
    ['tenantId dans le corps', { delivery: 'COPY', tenantId: 'autre' }],
    ['montant dans le corps', { delivery: 'COPY', amount: 1 }],
    ['destinataire dans le corps', { delivery: 'SEND', email: 'x@y.z' }],
    ['durée non entière', { delivery: 'COPY', ttlDays: 1.5 }],
    ['durée nulle', { delivery: 'COPY', ttlDays: 0 }],
    ['durée trop longue', { delivery: 'COPY', ttlDays: 31 }]
  ])('400 : %s', async (_label, body) => {
    const res = await request(buildApp())
      .post(`${BASE}/payment-link`)
      .send(body as any);

    expect(res.status).toBe(400);
    expect(createInstallmentPaymentLink).not.toHaveBeenCalled();
    expect(sendInstallmentPaymentLink).not.toHaveBeenCalled();
  });

  it('400 : identifiant d’échéance qui n’est pas un uuid', async () => {
    const res = await request(buildApp())
      .post('/tenants/URL-TENANT/rental/installments/pas-un-uuid/payment-link')
      .send({ delivery: 'COPY' });

    expect(res.status).toBe(400);
    expect(createInstallmentPaymentLink).not.toHaveBeenCalled();
  });
});

describe('GET /payment-links', () => {
  it('200 : résumés du service tels quels, tenantId du contexte, sans jeton/hash/URL', async () => {
    const summary = {
      id: 'link-1',
      createdAt: '2026-10-07T10:00:00.000Z',
      expiresAt: '2026-10-14T10:00:00.000Z',
      revokedAt: null,
      status: 'ACTIVE',
      viewCount: 2,
      lastViewedAt: null,
      createdByUserId: 'user-1',
      payment: { status: 'NONE', amount: null, updatedAt: null }
    };
    listInstallmentPaymentLinks.mockResolvedValue([summary]);

    const res = await request(buildApp()).get(`${BASE}/payment-links`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: [summary] });
    expect(listInstallmentPaymentLinks).toHaveBeenCalledWith(TENANT, INSTALLMENT);
    const text = JSON.stringify(res.body);
    expect(text).not.toMatch(/token|hash|url/i);
  });

  it('404 : échéance d’une autre agence', async () => {
    listInstallmentPaymentLinks.mockRejectedValue(new NotFoundError('Échéance introuvable.'));

    const res = await request(buildApp()).get(`${BASE}/payment-links`);

    expect(res.status).toBe(404);
  });
});

describe('DELETE /payment-link/:linkId', () => {
  it('200 : révoque, tenantId du contexte, acteur transmis', async () => {
    revokeInstallmentPaymentLink.mockResolvedValue(undefined);

    const res = await request(buildApp()).delete(`${BASE}/payment-link/link-1`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
    expect(revokeInstallmentPaymentLink).toHaveBeenCalledWith(TENANT, INSTALLMENT, 'link-1', 'user-1');
  });

  it('idempotent : un second appel répond encore 200', async () => {
    revokeInstallmentPaymentLink.mockResolvedValue(undefined);
    const app = buildApp();

    const first = await request(app).delete(`${BASE}/payment-link/link-1`);
    const second = await request(app).delete(`${BASE}/payment-link/link-1`);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
  });

  it('404 uniforme : lien d’une autre échéance ou d’une autre agence', async () => {
    revokeInstallmentPaymentLink.mockRejectedValue(new NotFoundError('Lien introuvable.'));

    const res = await request(buildApp()).delete(`${BASE}/payment-link/link-etranger`);

    expect(res.status).toBe(404);
  });
});

describe('routes/rental-routes.ts : gardes de permission', () => {
  it('POST et DELETE exigent RENTAL_PAYMENTS_CREATE, GET exige RENTAL_PAYMENTS_VIEW', () => {
    jest.isolateModules(() => {
      jest.doMock('../../src/middleware/auth-middleware', () => ({ authenticate: function authenticate() {} }));
      jest.doMock('../../src/middleware/tenant-middleware', () => ({
        requireTenantAccess: function requireTenantAccess() {}
      }));
      jest.doMock('../../src/middleware/tenant-isolation-middleware', () => ({
        enforceTenantIsolation: function enforceTenantIsolation() {}
      }));
      jest.doMock('../../src/middleware/rbac-middleware', () => ({
        requirePermission: (key: string) => Object.defineProperty(function guard() {}, 'name', { value: `perm:${key}` })
      }));
      const router = require('../../src/routes/rental-routes').default;
      const guardsOf = (method: string, path: string): string[] => {
        const layer = router.stack.find((l: any) => l.route && l.route.path === path && l.route.methods[method]);
        expect(layer).toBeDefined();
        return layer.route.stack.map((s: any) => s.handle.name);
      };
      const p = '/:tenantId/rental/installments/:installmentId';
      expect(guardsOf('post', `${p}/payment-link`)).toContain('perm:RENTAL_PAYMENTS_CREATE');
      expect(guardsOf('get', `${p}/payment-links`)).toContain('perm:RENTAL_PAYMENTS_VIEW');
      expect(guardsOf('delete', `${p}/payment-link/:linkId`)).toContain('perm:RENTAL_PAYMENTS_CREATE');
      expect(guardsOf('post', `${p}/payment-link`)).not.toContain('perm:RENTAL_PAYMENTS_VIEW');
    });
  }, 120000);
});
