/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Lot S2 — routes des paiements par lot, de l'avance et du suivi mensuel
 * (`routes/syndic-lot-payments-routes.ts`), sur HTTP. Session, agence et
 * permissions sont des passe-plats ; seuls les services du domaine sont
 * simules (leur logique est testee dans `unit/syndics.charge-allocation.test.ts`).
 */

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
  requireAnyPropertyPermission: () => (_req: any, _res: any, next: any) => next(),
  requirePropertyPermission: () => (_req: any, _res: any, next: any) => next()
}));

const mockRecordLotPayment = jest.fn();
const mockPreview = jest.fn();
const mockGetLotAdvance = jest.fn();
const mockListOpenCalls = jest.fn();
const mockGetMonthly = jest.fn();
jest.mock('../../src/lib/syndics/charge-allocation', () => ({
  recordLotPayment: (input: any) => mockRecordLotPayment(input),
  previewLotPaymentForTenant: (input: any) => mockPreview(input),
  getLotAdvance: (...args: any[]) => mockGetLotAdvance(...args),
  listOpenCallsForLot: (...args: any[]) => mockListOpenCalls(...args)
}));
jest.mock('../../src/lib/syndics/charge-monthly-tracking', () => ({
  getMonthlyTrackingBySyndicate: (...args: any[]) => mockGetMonthly(...args)
}));

import lotPaymentsRoutes from '../../src/routes/syndic-lot-payments-routes';
import { errorHandler, NotFoundError } from '../../src/middleware/error-middleware';

const app = express();
app.use(express.json());
app.use('/api', lotPaymentsRoutes);
app.use(errorHandler);

const TENANT = 'tenant-1';
const SYNDIC = '11111111-1111-4111-8111-111111111111';
const LOT = '22222222-2222-4222-8222-222222222222';
const CALL_A = '33333333-3333-4333-8333-333333333333';
const CALL_B = '44444444-4444-4444-8444-444444444444';
const BASE = `/api/tenants/${TENANT}/syndics/${SYNDIC}`;

const sampleResult = {
  payment: {
    id: '55555555-5555-4555-8555-555555555555',
    lotId: LOT,
    chargeCallId: CALL_A,
    amount: 25000,
    unallocatedAmount: 5000,
    paidAt: '2026-02-10T00:00:00.000Z',
    method: 'VIREMENT',
    reference: null
  },
  allocations: [
    { paymentId: '55555555-5555-4555-8555-555555555555', chargeCallId: CALL_A, period: '2026-01', amount: 20000, source: 'PAYMENT', callStatusAfter: 'PAID' }
  ],
  advance: 5000,
  lotAdvanceBalance: 5000,
  currency: 'XOF'
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('POST .../lots/:lotId/paiements', () => {
  it('201 avec le resultat de l affectation ; transmet agence, copropriete, lot et utilisateur', async () => {
    mockRecordLotPayment.mockResolvedValue(sampleResult);
    const response = await request(app)
      .post(`${BASE}/lots/${LOT}/paiements`)
      .send({ amount: 25000, paidAt: '2026-02-10', method: 'VIREMENT', chargeCallIds: [CALL_A, CALL_B, CALL_A] });

    expect(response.status).toBe(201);
    expect(response.body).toEqual({ success: true, data: sampleResult });
    expect(mockRecordLotPayment).toHaveBeenCalledWith({
      tenantId: TENANT,
      syndicateId: SYNDIC,
      lotId: LOT,
      amount: 25000,
      paidAt: new Date('2026-02-10T00:00:00.000Z'),
      method: 'VIREMENT',
      reference: null,
      chargeCallIds: [CALL_A, CALL_B],
      actorUserId: 'user-1'
    });
  });

  it('400 sur un corps invalide (montant nul, moyen absent, identifiant non UUID, champ inconnu)', async () => {
    for (const body of [
      { amount: 0, paidAt: '2026-02-10', method: 'VIREMENT' },
      { amount: 100, paidAt: '2026-02-10' },
      { amount: 100, paidAt: '2026-02-10', method: 'VIREMENT', chargeCallIds: ['x'] },
      { amount: 100, paidAt: '2026-02-10', method: 'VIREMENT', lotId: LOT }
    ]) {
      const response = await request(app).post(`${BASE}/lots/${LOT}/paiements`).send(body);
      expect(response.status).toBe(400);
    }
    expect(mockRecordLotPayment).not.toHaveBeenCalled();
  });

  it('404 sur un lot qui n est pas un UUID, sans appeler le service', async () => {
    const response = await request(app)
      .post(`${BASE}/lots/pas-un-lot/paiements`)
      .send({ amount: 100, paidAt: '2026-02-10', method: 'VIREMENT' });
    expect(response.status).toBe(404);
    expect(mockRecordLotPayment).not.toHaveBeenCalled();
  });

  it('404 quand le service refuse le lot ou un appel d un autre lot', async () => {
    mockRecordLotPayment.mockRejectedValue(new NotFoundError('Appel de charges introuvable pour ce lot.'));
    const response = await request(app)
      .post(`${BASE}/lots/${LOT}/paiements`)
      .send({ amount: 100, paidAt: '2026-02-10', method: 'VIREMENT', chargeCallIds: [CALL_B] });
    expect(response.status).toBe(404);
    expect(response.body.success).toBe(false);
  });
});

describe('POST .../lots/:lotId/paiements/apercu', () => {
  it('200 avec la meme forme, via le service d apercu', async () => {
    const preview = { ...sampleResult, payment: { ...sampleResult.payment, id: null } };
    mockPreview.mockResolvedValue(preview);
    const response = await request(app)
      .post(`${BASE}/lots/${LOT}/paiements/apercu`)
      .send({ amount: 25000, paidAt: '2026-02-10', method: 'VIREMENT' });
    expect(response.status).toBe(200);
    expect(response.body.data).toEqual(preview);
    expect(mockRecordLotPayment).not.toHaveBeenCalled();
  });
});

describe('lectures', () => {
  it('GET .../avance', async () => {
    mockGetLotAdvance.mockResolvedValue({ advance: 5000, currency: 'XOF' });
    const response = await request(app).get(`${BASE}/lots/${LOT}/avance`);
    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({ advance: 5000, currency: 'XOF' });
    expect(mockGetLotAdvance).toHaveBeenCalledWith(TENANT, SYNDIC, LOT);
  });

  it('GET .../appels-ouverts', async () => {
    mockListOpenCalls.mockResolvedValue([{ id: CALL_A, outstanding: 1000 }]);
    const response = await request(app).get(`${BASE}/lots/${LOT}/appels-ouverts`);
    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([{ id: CALL_A, outstanding: 1000 }]);
  });

  it('GET .../suivi-mensuel?year=2026, annee courante par defaut, 400 sur une annee invalide', async () => {
    mockGetMonthly.mockResolvedValue({ year: 2026, months: [], lots: [] });
    const response = await request(app).get(`${BASE}/suivi-mensuel?year=2026`);
    expect(response.status).toBe(200);
    expect(mockGetMonthly).toHaveBeenCalledWith(TENANT, SYNDIC, 2026);

    await request(app).get(`${BASE}/suivi-mensuel`);
    expect(mockGetMonthly).toHaveBeenLastCalledWith(TENANT, SYNDIC, new Date().getUTCFullYear());

    expect((await request(app).get(`${BASE}/suivi-mensuel?year=abc`)).status).toBe(400);
    expect((await request(app).get(`${BASE}/suivi-mensuel?year=1999`)).status).toBe(400);
  });

  it('404 sur une copropriete qui n est pas un UUID', async () => {
    const response = await request(app).get(`/api/tenants/${TENANT}/syndics/nope/suivi-mensuel`);
    expect(response.status).toBe(404);
  });
});
