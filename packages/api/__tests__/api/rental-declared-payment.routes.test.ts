/* eslint-disable @typescript-eslint/no-explicit-any */
import express from 'express';
import request from 'supertest';

/**
 * Spec 049, lot 1 : routes du paiement de loyer déclaré (`routes/rental-declared-payment-routes.ts`
 * côté gestionnaire, `routes/tenant-portal-declared-payment-routes.ts` côté portail locataire).
 *
 * Auth, agence et isolation sont des passe-plats ; le droit (`RENTAL_PAYMENTS_*`) passe par les
 * vraies gardes de `rbac-middleware` avec un `hasPermission` simulé. Le moteur est simulé : on
 * vérifie le câblage (permissions, corps stricts, identifiants pris de la session, ordre des
 * limiteurs), pas les règles métier (testées dans `rental-declared-*.test.ts`).
 */

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
  enforceTenantIsolation: (_req: any, _res: any, next: any) => next()
}));
jest.mock('../../src/middleware/tenant-portal-access', () => ({
  requireTenantPortalAccess: (req: any, _res: any, next: any) => {
    if (req.headers['x-no-portal']) {
      next(Object.assign(new Error('no portal'), { statusCode: 403 }));
      return;
    }
    req.tenantPortal = { tenantId: 'tenant-A', tenantClientId: 'client-1', leaseId: 'lease-1' };
    next();
  }
}));

const permissions = new Set<string>();
jest.mock('../../src/services/permission-service', () => ({
  hasPermission: async (_userId: string, key: string) => permissions.has(key),
  hasAnyPermission: async (_userId: string, keys: string[]) => keys.some(key => permissions.has(key))
}));

const limiterCalls: string[] = [];
const limiter = (name: string) => (_req: any, _res: any, next: any) => {
  limiterCalls.push(name);
  next();
};
jest.mock('../../src/middleware/rental-declared-rate-limiters', () => ({
  rentalDeclaredManagerWriteLimiter: (_req: any, _res: any, next: any) => {
    limiterCalls.push('manager-write');
    next();
  },
  rentalDeclareCreateLimiter: (_req: any, _res: any, next: any) => {
    limiterCalls.push('declare-create');
    next();
  },
  rentalProofReadMinuteLimiter: (_req: any, _res: any, next: any) => {
    limiterCalls.push('proof-read-minute');
    next();
  },
  rentalProofReadDayLimiter: (_req: any, _res: any, next: any) => {
    limiterCalls.push('proof-read-day');
    next();
  }
}));
void limiter;

const listReceivingNumbers = jest.fn();
const createReceivingNumber = jest.fn();
const updateReceivingNumber = jest.fn();
const deleteReceivingNumber = jest.fn();
jest.mock('../../src/lib/rental/declared-payment/receiving-numbers', () => ({
  listReceivingNumbers: (...a: any[]) => listReceivingNumbers(...a),
  createReceivingNumber: (...a: any[]) => createReceivingNumber(...a),
  updateReceivingNumber: (...a: any[]) => updateReceivingNumber(...a),
  deleteReceivingNumber: (...a: any[]) => deleteReceivingNumber(...a)
}));

const getSettingsDto = jest.fn();
const updateSettings = jest.fn();
jest.mock('../../src/lib/rental/declared-payment/settings', () => ({
  getSettingsDto: (...a: any[]) => getSettingsDto(...a),
  updateSettings: (...a: any[]) => updateSettings(...a)
}));

const createRentalDeclaration = jest.fn();
jest.mock('../../src/lib/rental/declared-payment/declaration-create', () => ({
  createRentalDeclaration: (...a: any[]) => createRentalDeclaration(...a)
}));
const loadDeclarationDto = jest.fn();
jest.mock('../../src/lib/rental/declared-payment/declaration-dto', () => ({
  loadDeclarationDto: (...a: any[]) => loadDeclarationDto(...a)
}));
jest.mock('../../src/lib/rental/declared-payment/declaration-queries', () => ({
  getPendingCount: jest.fn(async () => ({ pending: 0, overdue: 0 }))
}));

const getAvailability = jest.fn();
const getMyDeclaration = jest.fn();
const listMyDeclarations = jest.fn();
const loadPortalDeclaration = jest.fn();
jest.mock('../../src/lib/rental/declared-payment/portal', () => ({
  getAvailability: (...a: any[]) => getAvailability(...a),
  getMyDeclaration: (...a: any[]) => getMyDeclaration(...a),
  listMyDeclarations: (...a: any[]) => listMyDeclarations(...a),
  loadPortalDeclaration: (...a: any[]) => loadPortalDeclaration(...a)
}));
const cancelRentalDeclaration = jest.fn();
jest.mock('../../src/lib/rental/declared-payment/declaration-cancel', () => ({
  cancelRentalDeclaration: (...a: any[]) => cancelRentalDeclaration(...a)
}));
const readRentalProof = jest.fn();
jest.mock('../../src/lib/rental/declared-payment/proof-read', () => ({
  readRentalProof: (...a: any[]) => readRentalProof(...a)
}));
jest.mock('../../src/lib/rental/declared-payment/proof-files', () => ({ PROOF_MAX_BYTES: 5 * 1024 * 1024 }));

jest.mock('../../src/utils/tenant-portal-leases', () => ({
  listPortalLeaseIds: jest.fn(async () => ['lease-1', 'lease-2']),
  resolveRequestedLeaseId: (_ids: string[], _requested: unknown, fallback: string) => ({ leaseId: fallback })
}));

const installmentFindFirst = jest.fn();
const leaseFindFirst = jest.fn();
jest.mock('../../src/utils/database', () => ({
  prisma: {
    rentalInstallment: { findFirst: (...a: any[]) => installmentFindFirst(...a) },
    rentalLease: { findFirst: (...a: any[]) => leaseFindFirst(...a) }
  }
}));
const assertBelongsToTenant = jest.fn();
jest.mock('../../src/utils/tenant-ownership', () => ({
  assertBelongsToTenant: (...a: any[]) => assertBelongsToTenant(...a)
}));

import { errorHandler, NotFoundError } from '../../src/middleware/error-middleware';
import managerRouter from '../../src/routes/rental-declared-payment-routes';
import portalRouter from '../../src/routes/tenant-portal-declared-payment-routes';

const app = express();
app.use(express.json());
app.use('/api', managerRouter);
app.use('/api/portal/tenant', portalRouter);
app.use(errorHandler);

const T = 'tenant-A';
const N = '33333333-3333-4333-8333-333333333333';
const D = '22222222-2222-4222-8222-222222222222';
const LEASE = '44444444-4444-4444-8444-444444444444';
const INST = '55555555-5555-4555-8555-555555555555';
const BASE = `/api/tenants/${T}/rental`;
const PORTAL = '/api/portal/tenant/payments';

const paidAt = () => new Date(Date.now() - 3_600_000).toISOString();

beforeEach(() => {
  jest.clearAllMocks();
  limiterCalls.length = 0;
  permissions.clear();
  permissions.add('RENTAL_PAYMENTS_VIEW');
  permissions.add('RENTAL_PAYMENTS_ALLOCATE');
  permissions.add('RENTAL_PAYMENTS_CREATE');
  assertBelongsToTenant.mockResolvedValue(undefined);
  leaseFindFirst.mockResolvedValue({ primary_renter_client_id: 'client-1' });
  createRentalDeclaration.mockResolvedValue({ declarationId: D, duplicateSuspected: false });
  loadDeclarationDto.mockResolvedValue({ id: D, status: 'PENDING' });
  loadPortalDeclaration.mockResolvedValue({ id: D, status: 'PENDING', canCancel: true });
  listReceivingNumbers.mockResolvedValue([]);
  getSettingsDto.mockResolvedValue({ enabled: true });
  updateSettings.mockResolvedValue({ enabled: false });
  createReceivingNumber.mockResolvedValue({ id: N });
  updateReceivingNumber.mockResolvedValue({ id: N });
  deleteReceivingNumber.mockResolvedValue({ id: N });
});

describe('gestionnaire : permissions RENTAL_PAYMENTS_*', () => {
  type Case = { method: 'get' | 'post' | 'patch' | 'put' | 'delete'; path: string; needs: string };
  const cases: Case[] = [
    { method: 'get', path: `${BASE}/receiving-numbers`, needs: 'RENTAL_PAYMENTS_VIEW' },
    { method: 'post', path: `${BASE}/receiving-numbers`, needs: 'RENTAL_PAYMENTS_ALLOCATE' },
    { method: 'patch', path: `${BASE}/receiving-numbers/${N}`, needs: 'RENTAL_PAYMENTS_ALLOCATE' },
    { method: 'delete', path: `${BASE}/receiving-numbers/${N}`, needs: 'RENTAL_PAYMENTS_ALLOCATE' },
    { method: 'get', path: `${BASE}/declared-payment/settings`, needs: 'RENTAL_PAYMENTS_VIEW' },
    { method: 'put', path: `${BASE}/declared-payment/settings`, needs: 'RENTAL_PAYMENTS_ALLOCATE' },
    { method: 'post', path: `${BASE}/payment-declarations`, needs: 'RENTAL_PAYMENTS_CREATE' }
  ];

  it.each(cases)('$method $path exige $needs', async ({ method, path, needs }) => {
    permissions.delete(needs);
    const denied = await (request(app) as any)[method](path).send({});
    expect(denied.status).toBe(403);
    expect(denied.body.requiredPermission).toBe(needs);
    expect(createRentalDeclaration).not.toHaveBeenCalled();
    expect(createReceivingNumber).not.toHaveBeenCalled();
    expect(updateSettings).not.toHaveBeenCalled();
  });

  it('une seule permission ne donne pas les autres (VIEW seul : lecture oui, écriture non)', async () => {
    permissions.clear();
    permissions.add('RENTAL_PAYMENTS_VIEW');
    expect((await request(app).get(`${BASE}/receiving-numbers`)).status).toBe(200);
    expect((await request(app).put(`${BASE}/declared-payment/settings`).send({ enabled: false })).status).toBe(403);
    expect((await request(app).post(`${BASE}/payment-declarations`)).status).toBe(403);
  });
});

describe('gestionnaire : numéros et réglages (câblage)', () => {
  it("passe l'agence de la route et l'utilisateur de la session au moteur", async () => {
    await request(app).post(`${BASE}/receiving-numbers`).send({ operator: 'ORANGE', phone: '0700000001' }).expect(201);
    expect(createReceivingNumber).toHaveBeenCalledWith(T, 'user-1', { operator: 'ORANGE', phone: '0700000001' });
    await request(app).put(`${BASE}/declared-payment/settings`).send({ enabled: false }).expect(200);
    expect(updateSettings).toHaveBeenCalledWith(T, 'user-1', { enabled: false });
    expect(limiterCalls).toEqual(['manager-write', 'manager-write']);
  });

  it('un identifiant de numéro malformé : 404 sans appeler le moteur', async () => {
    const res = await request(app).delete(`${BASE}/receiving-numbers/pas-un-uuid`);
    expect(res.status).toBe(404);
    expect(deleteReceivingNumber).not.toHaveBeenCalled();
  });

  it('le filtre active=true est transmis comme booléen', async () => {
    await request(app).get(`${BASE}/receiving-numbers?active=true`).expect(200);
    expect(listReceivingNumbers).toHaveBeenCalledWith(T, { active: true });
    await request(app).get(`${BASE}/receiving-numbers?active=peut-etre`).expect(400);
  });
});

describe('gestionnaire : déclaration pour un tiers (POST /payment-declarations)', () => {
  const mobilePayload = {
    leaseId: LEASE,
    receivingNumberId: N,
    operator: 'ORANGE',
    reference: 'MP123456',
    amount: 150000,
    paidAt: paidAt()
  };
  const post = (payload: unknown) =>
    request(app).post(`${BASE}/payment-declarations`).field('payload', JSON.stringify(payload));

  it('mobile money : 201, déclarant = locataire principal, utilisateur pris de la session', async () => {
    const res = await post({ ...mobilePayload, installmentId: INST });
    expect(res.status).toBe(201);
    expect(res.body.data).toEqual({ id: D, status: 'PENDING' });
    expect(createRentalDeclaration).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: T,
        leaseId: LEASE,
        installmentId: INST,
        declaredByClientId: 'client-1',
        declaredByUserId: 'user-1',
        actor: 'MANAGER',
        receivingNumberId: N,
        operator: 'ORANGE',
        reference: 'MP123456',
        amount: 150000
      })
    );
    expect(limiterCalls).toEqual(['manager-write']);
  });

  it('autres modes : espèces sans numéro, opérateur ni référence, 201 avec paymentMethod', async () => {
    const res = await post({ leaseId: LEASE, paymentMethod: 'CASH', amount: 90000, paidAt: paidAt() });
    expect(res.status).toBe(201);
    expect(createRentalDeclaration).toHaveBeenCalledWith(
      expect.objectContaining({ paymentMethod: 'CASH', actor: 'MANAGER', declaredByUserId: 'user-1', amount: 90000 })
    );
  });

  it('mobile money sans numéro, opérateur ou référence : 400, rien créé', async () => {
    const { reference, ...sansReference } = mobilePayload;
    void reference;
    expect((await post(sansReference)).status).toBe(400);
    expect((await post({ leaseId: LEASE, amount: 1000, paidAt: paidAt() })).status).toBe(400);
    expect(createRentalDeclaration).not.toHaveBeenCalled();
  });

  it('corps strict : champ inconnu (declaredByUserId, tenantId), mode inconnu ou payload absent : 400', async () => {
    expect((await post({ ...mobilePayload, declaredByUserId: 'autre' })).status).toBe(400);
    expect((await post({ ...mobilePayload, tenantId: 'tenant-B' })).status).toBe(400);
    expect((await post({ ...mobilePayload, paymentMethod: 'BITCOIN' })).status).toBe(400);
    expect((await request(app).post(`${BASE}/payment-declarations`)).status).toBe(400);
    expect(createRentalDeclaration).not.toHaveBeenCalled();
  });

  it("bail d'une autre agence : 404 uniforme, rien créé", async () => {
    assertBelongsToTenant.mockRejectedValue(new NotFoundError('Bail introuvable.'));
    const res = await post(mobilePayload);
    expect(res.status).toBe(404);
    expect(assertBelongsToTenant).toHaveBeenCalledWith(expect.anything(), 'rentalLease', LEASE, T, expect.anything());
    expect(createRentalDeclaration).not.toHaveBeenCalled();
  });
});

describe('portail locataire : disponibilité, listes, annulation', () => {
  it("availability : agence et locataire pris de la session, jamais d'un paramètre", async () => {
    getAvailability.mockResolvedValue({ enabled: true, available: true, allowedMethods: ['CASH'] });
    const res = await request(app).get(`${PORTAL}/declare/availability?tenantId=tenant-B`);
    expect(res.status).toBe(200);
    expect(res.body.data.allowedMethods).toEqual(['CASH']);
    expect(getAvailability).toHaveBeenCalledWith('tenant-A', 'client-1');
  });

  it('declarations : statut et pagination validés, périmètre = baux de la session', async () => {
    listMyDeclarations.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 });
    await request(app).get(`${PORTAL}/declarations?status=PENDING&page=2&pageSize=10`).expect(200);
    expect(listMyDeclarations).toHaveBeenCalledWith({
      tenantId: 'tenant-A',
      tenantClientId: 'client-1',
      leaseIds: ['lease-1', 'lease-2'],
      status: 'PENDING',
      page: 2,
      pageSize: 10
    });
    await request(app).get(`${PORTAL}/declarations?status=INCONNU`).expect(400);
    await request(app).get(`${PORTAL}/declarations?pageSize=51`).expect(400);
  });

  it('détail et annulation : identifiant malformé 404, sinon annulation puis relecture', async () => {
    expect((await request(app).get(`${PORTAL}/declarations/xx`)).status).toBe(404);
    getMyDeclaration.mockResolvedValue({ id: D, status: 'CANCELED' });
    const res = await request(app).post(`${PORTAL}/declarations/${D}/cancel`);
    expect(res.status).toBe(200);
    expect(cancelRentalDeclaration).toHaveBeenCalledWith({
      tenantId: 'tenant-A',
      tenantClientId: 'client-1',
      leaseIds: ['lease-1', 'lease-2'],
      declarationId: D
    });
    expect(res.body.data.status).toBe('CANCELED');
  });

  it('sans accès portail : refus avant tout appel au moteur', async () => {
    const res = await request(app).get(`${PORTAL}/declare/availability`).set('x-no-portal', '1');
    expect(res.status).toBe(403);
    expect(getAvailability).not.toHaveBeenCalled();
  });
});

describe('portail locataire : POST /payments/declare', () => {
  const mobileFields = (r: request.Test) =>
    r
      .field('receivingNumberId', N)
      .field('operator', 'ORANGE')
      .field('reference', 'MP123456')
      .field('amount', '150000')
      .field('paidAt', paidAt());

  it('mobile money : 201, le moteur reçoit agence, locataire et bail de la session', async () => {
    const res = await mobileFields(request(app).post(`${PORTAL}/declare`)).field('tenantId', 'tenant-B');
    expect(res.status).toBe(201);
    expect(createRentalDeclaration).toHaveBeenCalledTimes(1);
    expect(createRentalDeclaration.mock.calls[0][0]).toMatchObject({
      tenantId: 'tenant-A',
      leaseId: 'lease-1',
      declaredByClientId: 'client-1',
      actor: 'TENANT',
      paymentMethod: null,
      receivingNumberId: N,
      operator: 'ORANGE',
      reference: 'MP123456',
      amount: 150000
    });
    expect(loadPortalDeclaration).toHaveBeenCalledWith('tenant-A', D, { duplicateSuspected: false });
    expect(limiterCalls).toEqual(['declare-create']);
  });

  it('autres modes : espèces sans numéro, opérateur ni référence : 201', async () => {
    const res = await request(app)
      .post(`${PORTAL}/declare`)
      .field('paymentMethod', 'CASH')
      .field('amount', '90000')
      .field('paymentDate', new Date().toISOString().slice(0, 10));
    expect(res.status).toBe(201);
    expect(createRentalDeclaration.mock.calls[0][0]).toMatchObject({
      paymentMethod: 'CASH',
      receivingNumberId: null,
      operator: null,
      reference: null,
      amount: 90000,
      paidAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T00:00:00Z$/)
    });
  });

  it('mobile money par défaut : numéro, opérateur et référence requis (400)', async () => {
    const base = (r: request.Test) => r.field('amount', '1000').field('paidAt', paidAt());
    expect((await base(request(app).post(`${PORTAL}/declare`))).status).toBe(400);
    expect(
      (
        await base(request(app).post(`${PORTAL}/declare`))
          .field('receivingNumberId', N)
          .field('operator', 'ORANGE')
      ).status
    ).toBe(400);
    expect(createRentalDeclaration).not.toHaveBeenCalled();
  });

  it('mode inconnu ou date absente : 400', async () => {
    expect(
      (
        await request(app)
          .post(`${PORTAL}/declare`)
          .field('paymentMethod', 'BITCOIN')
          .field('amount', '1000')
          .field('paidAt', paidAt())
      ).status
    ).toBe(400);
    expect(
      (await request(app).post(`${PORTAL}/declare`).field('paymentMethod', 'CASH').field('amount', '1000')).status
    ).toBe(400);
    expect(createRentalDeclaration).not.toHaveBeenCalled();
  });

  it('échéance hors du périmètre du locataire : 404 RENTAL_DECLARATION_INSTALLMENT_INVALID, rien créé', async () => {
    installmentFindFirst.mockResolvedValue(null);
    const res = await request(app)
      .post(`${PORTAL}/declare`)
      .field('paymentMethod', 'CASH')
      .field('installmentId', INST)
      .field('amount', '1000')
      .field('paidAt', paidAt());
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('RENTAL_DECLARATION_INSTALLMENT_INVALID');
    expect(createRentalDeclaration).not.toHaveBeenCalled();
  });

  it("le bail de la déclaration est celui de l'échéance visée", async () => {
    installmentFindFirst.mockResolvedValue({ lease_id: 'lease-2' });
    await request(app)
      .post(`${PORTAL}/declare`)
      .field('paymentMethod', 'CHECK')
      .field('installmentId', INST)
      .field('amount', '1000')
      .field('paidAt', paidAt())
      .expect(201);
    expect(createRentalDeclaration.mock.calls[0][0]).toMatchObject({ leaseId: 'lease-2', installmentId: INST });
    expect(installmentFindFirst.mock.calls[0][0].where).toMatchObject({
      tenant_id: 'tenant-A',
      lease_id: { in: ['lease-1', 'lease-2'] }
    });
  });
});

describe('portail locataire : lecture IA de la capture', () => {
  it('limiteurs minute puis jour posés AVANT le parseur, lecture sans fichier transmise au moteur', async () => {
    readRentalProof.mockResolvedValue({ quality: 'UNREADABLE' });
    const res = await request(app).post(`${PORTAL}/declare/lecture`);
    expect(res.status).toBe(200);
    expect(limiterCalls).toEqual(['proof-read-minute', 'proof-read-day']);
    expect(readRentalProof).toHaveBeenCalledWith({ tenantId: 'tenant-A', tenantClientId: 'client-1', file: null });
  });
});
