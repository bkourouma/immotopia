/* eslint-disable @typescript-eslint/no-explicit-any */
import express from 'express';
import request from 'supertest';

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
  enforcePropertyTenantIsolation: (_req: any, _res: any, next: any) => next()
}));
jest.mock('../../src/middleware/property-rbac-middleware', () => ({
  requirePropertyPermission: () => (_req: any, _res: any, next: any) => next(),
  requireAnyPropertyPermission: () => (_req: any, _res: any, next: any) => next()
}));
jest.mock('../../src/middleware/rbac-middleware', () => ({
  requirePermission: () => (_req: any, _res: any, next: any) => next()
}));
jest.mock('../../src/middleware/rate-limit-middleware', () => {
  const pass = (_req: any, _res: any, next: any) => next();
  return {
    syndicGatewayTestRateLimiter: pass,
    syndicGatewayBalanceRateLimiter: pass,
    syndicGatewayWriteRateLimiter: pass
  };
});

const links = { create: jest.fn(), send: jest.fn() };
jest.mock('../../src/lib/syndics/online-payment/charge-call-link', () => ({
  createChargeCallPaymentLink: (...a: any[]) => links.create(...a),
  listChargeCallPaymentLinks: jest.fn(),
  revokeChargeCallPaymentLink: jest.fn()
}));
jest.mock('../../src/lib/syndics/online-payment/charge-call-link-send', () => ({
  sendChargeCallPaymentLink: (...a: any[]) => links.send(...a)
}));
jest.mock('../../src/services/audit-service', () => ({ logAuditEvent: jest.fn() }));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const routes = require('../../src/routes/syndic-online-payment-routes').default;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { errorHandler } = require('../../src/middleware/error-middleware');

const app = express();
app.use(express.json());
app.use('/api', routes);
app.use(errorHandler);

const URL =
  '/api/tenants/t1/syndics/11111111-1111-4111-8111-111111111111/charges/22222222-2222-4222-8222-222222222222/lien-paiement';

describe('Lien « Payer cet appel » : réponse jamais mise en cache', () => {
  it('COPY : 201 avec URL et no-store', async () => {
    links.create.mockResolvedValue({
      link: { id: 'l1', url: 'https://x/pay/TOKEN', expiresAt: new Date('2026-11-01') },
      context: { amountDue: 1000, currency: 'XOF' }
    });
    const res = await request(app).post(URL).send({ delivery: 'COPY' });
    expect(res.status).toBe(201);
    expect(res.body.data.url).toBe('https://x/pay/TOKEN');
    expect(res.headers['cache-control']).toBe('no-store');
  });
  it('SEND : 201 avec no-store', async () => {
    links.send.mockResolvedValue({
      sent: true,
      channel: 'EMAIL',
      linkId: 'l1',
      expiresAt: 'x',
      amountDue: 1,
      currency: 'XOF'
    });
    const res = await request(app).post(URL).send({ delivery: 'SEND' });
    expect(res.status).toBe(201);
    expect(res.headers['cache-control']).toBe('no-store');
  });
});
