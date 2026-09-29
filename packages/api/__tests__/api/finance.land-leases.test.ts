import express from 'express';
import request from 'supertest';

/**
 * Tests des neuf points d'entrée agence des baux de terrain — lot 4, premier
 * sous-lot.
 *
 * Modèle de mock : `__tests__/api/finance.suppliers.test.ts` (lot 2). Les
 * middlewares d'authentification, de tenant et de droits sont remplacés par
 * des passe-plats ; le domaine (`lib/finance/land-leases.ts`) est simulé par
 * des espions Jest, pour vérifier que le contrôleur transmet la bonne forme
 * de requête (tenantId de l'URL, corps validé, utilisateur authentifié) sans
 * reformuler la logique métier, déjà couverte par les tests unitaires.
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

jest.mock('../../src/middleware/finance-rbac-middleware', () => ({
  requireAccountsRead: (_req: any, _res: any, next: any) => next(),
  requireReportsRead: (_req: any, _res: any, next: any) => next(),
  requireDocumentsCreate: (_req: any, _res: any, next: any) => next(),
  requireDocumentsValidate: (_req: any, _res: any, next: any) => next(),
  requireSitesManage: (_req: any, _res: any, next: any) => next(),
  requireSettingsManage: (_req: any, _res: any, next: any) => next()
}));

const createLandLeaseTx = jest.fn();
const attachSiteToLandLeaseTx = jest.fn();
const getLandLease = jest.fn();
const listLandLeases = jest.fn();
const createLandLeasePaymentTx = jest.fn();
const validateLandLeasePaymentTx = jest.fn();
const listLandLeasePayments = jest.fn();
const recordLandLeaseAccrualTx = jest.fn();
const listLandLeaseAccruals = jest.fn();

jest.mock('../../src/lib/finance/land-leases', () => ({
  createLandLeaseTx: (...args: any[]) => createLandLeaseTx(...args),
  attachSiteToLandLeaseTx: (...args: any[]) => attachSiteToLandLeaseTx(...args),
  getLandLease: (...args: any[]) => getLandLease(...args),
  listLandLeases: (...args: any[]) => listLandLeases(...args),
  createLandLeasePaymentTx: (...args: any[]) => createLandLeasePaymentTx(...args),
  validateLandLeasePaymentTx: (...args: any[]) => validateLandLeasePaymentTx(...args),
  listLandLeasePayments: (...args: any[]) => listLandLeasePayments(...args),
  recordLandLeaseAccrualTx: (...args: any[]) => recordLandLeaseAccrualTx(...args),
  listLandLeaseAccruals: (...args: any[]) => listLandLeaseAccruals(...args)
}));

jest.mock('../../src/utils/database', () => ({
  prisma: {
    $transaction: (callback: any) => callback({})
  }
}));

import { errorHandler } from '../../src/middleware/error-middleware';
import { notFound, conflict } from '../../src/lib/errors';
import financeLandLeasesRoutes from '../../src/routes/finance-land-leases-routes';

const TENANT_A = 'tenant-A';
const LEASE_A = '11111111-1111-4111-8111-111111111111';
const SITE_A = '22222222-2222-4222-8222-222222222222';
const PAYMENT_A = '33333333-3333-4333-8333-333333333333';
const CATEGORY_A = '55555555-5555-4555-8555-555555555555';

const app = express();
app.use(express.json());
app.use('/api', financeLandLeasesRoutes);
app.use(errorHandler);

function leaseRecord(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: LEASE_A,
    tenantId: TENANT_A,
    landlordAccountId: 'compte-1',
    landlordName: 'Mamadou Bah',
    landLabel: 'Terrain de Nongo, 800 m²',
    annualAmount: 1_000_000,
    costCategoryId: CATEGORY_A,
    costCategoryLabel: 'Locations diverses',
    monthlyAmount: 83_333,
    currency: 'XOF',
    startDate: new Date('2026-03-01'),
    endDate: null,
    isActive: true,
    sites: [],
    accountBalance: 0,
    ...overrides
  };
}

function paymentRecord(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: PAYMENT_A,
    landLeaseId: LEASE_A,
    landlordName: 'Mamadou Bah',
    paymentDate: new Date('2026-03-01'),
    amount: 1_000_000,
    currency: 'XOF',
    coverageStartDate: new Date('2026-03-01'),
    coverageEndDate: new Date('2027-02-28'),
    status: 'DRAFT',
    createdByLabel: 'Fatoumata Camara',
    validatedAt: null,
    ...overrides
  };
}

function accrualRecord(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'constat-1',
    landLeaseId: LEASE_A,
    landlordName: 'Mamadou Bah',
    periodYear: 2026,
    periodMonth: 3,
    amount: 83_333,
    currency: 'XOF',
    allocations: [],
    createdAt: new Date('2026-04-01'),
    ...overrides
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// A. GET land-leases
// ---------------------------------------------------------------------------

describe('GET /tenants/:tenantId/finance/land-leases', () => {
  it('liste les baux du tenant de l’URL', async () => {
    listLandLeases.mockResolvedValue([leaseRecord()]);

    const res = await request(app).get(`/api/tenants/${TENANT_A}/finance/land-leases`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(listLandLeases).toHaveBeenCalledWith(TENANT_A, { onlyActive: undefined });
  });

  it('transmet onlyActive=true depuis la query', async () => {
    listLandLeases.mockResolvedValue([]);

    await request(app).get(`/api/tenants/${TENANT_A}/finance/land-leases?onlyActive=true`);

    expect(listLandLeases).toHaveBeenCalledWith(TENANT_A, { onlyActive: true });
  });
});

// ---------------------------------------------------------------------------
// B. POST land-leases
// ---------------------------------------------------------------------------

describe('POST /tenants/:tenantId/finance/land-leases', () => {
  it('crée un bail avec un corps valide', async () => {
    createLandLeaseTx.mockResolvedValue(leaseRecord());

    const res = await request(app).post(`/api/tenants/${TENANT_A}/finance/land-leases`).send({
      landlordName: 'Mamadou Bah',
      landLabel: 'Terrain de Nongo, 800 m²',
      annualAmount: 1_000_000,
      costCategoryId: CATEGORY_A,
      startDate: '2026-03-01'
    });

    expect(res.status).toBe(201);
    expect(res.body.data.id).toBe(LEASE_A);
    expect(createLandLeaseTx).toHaveBeenCalledWith(
      expect.anything(),
      TENANT_A,
      expect.objectContaining({ landlordName: 'Mamadou Bah', annualAmount: 1_000_000, costCategoryId: CATEGORY_A })
    );
  });

  it('refuse un montant annuel négatif (400, sans toucher au domaine)', async () => {
    const res = await request(app).post(`/api/tenants/${TENANT_A}/finance/land-leases`).send({
      landlordName: 'Mamadou Bah',
      landLabel: 'Terrain de Nongo',
      annualAmount: -100,
      costCategoryId: CATEGORY_A,
      startDate: '2026-03-01'
    });

    expect(res.status).toBe(400);
    expect(createLandLeaseTx).not.toHaveBeenCalled();
  });

  it('refuse une date de fin antérieure à la date de début (400)', async () => {
    const res = await request(app).post(`/api/tenants/${TENANT_A}/finance/land-leases`).send({
      landlordName: 'Mamadou Bah',
      landLabel: 'Terrain de Nongo',
      annualAmount: 1_000_000,
      costCategoryId: CATEGORY_A,
      startDate: '2026-03-01',
      endDate: '2026-01-01'
    });

    expect(res.status).toBe(400);
    expect(createLandLeaseTx).not.toHaveBeenCalled();
  });

  it('refuse un corps sans costCategoryId (400)', async () => {
    const res = await request(app).post(`/api/tenants/${TENANT_A}/finance/land-leases`).send({
      landlordName: 'Mamadou Bah',
      landLabel: 'Terrain de Nongo',
      annualAmount: 1_000_000,
      startDate: '2026-03-01'
    });

    expect(res.status).toBe(400);
    expect(createLandLeaseTx).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// C. GET land-leases/:landLeaseId
// ---------------------------------------------------------------------------

describe('GET /tenants/:tenantId/finance/land-leases/:landLeaseId', () => {
  it('renvoie le détail du bail', async () => {
    getLandLease.mockResolvedValue(leaseRecord());

    const res = await request(app).get(`/api/tenants/${TENANT_A}/finance/land-leases/${LEASE_A}`);

    expect(res.status).toBe(200);
    expect(res.body.data.landLabel).toBe('Terrain de Nongo, 800 m²');
    expect(getLandLease).toHaveBeenCalledWith(TENANT_A, LEASE_A);
  });

  it('relaie un 404 quand le domaine ne trouve pas le bail', async () => {
    getLandLease.mockRejectedValue(notFound('Bail de terrain introuvable'));

    const res = await request(app).get(`/api/tenants/${TENANT_A}/finance/land-leases/${LEASE_A}`);

    expect(res.status).toBe(404);
  });

  it('rejette un identifiant qui n’a pas la forme d’un UUID (400)', async () => {
    const res = await request(app).get(`/api/tenants/${TENANT_A}/finance/land-leases/pas-un-uuid`);

    expect(res.status).toBe(400);
    expect(getLandLease).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// D. PUT sites/:siteId/land-lease
// ---------------------------------------------------------------------------

describe('PUT /tenants/:tenantId/finance/sites/:siteId/land-lease', () => {
  it('rattache un chantier à un bail', async () => {
    attachSiteToLandLeaseTx.mockResolvedValue(leaseRecord());

    const res = await request(app)
      .put(`/api/tenants/${TENANT_A}/finance/sites/${SITE_A}/land-lease`)
      .send({ landLeaseId: LEASE_A });

    expect(res.status).toBe(200);
    expect(attachSiteToLandLeaseTx).toHaveBeenCalledWith(expect.anything(), TENANT_A, SITE_A, LEASE_A);
  });

  it('détache un chantier avec landLeaseId: null', async () => {
    attachSiteToLandLeaseTx.mockResolvedValue(null);

    const res = await request(app)
      .put(`/api/tenants/${TENANT_A}/finance/sites/${SITE_A}/land-lease`)
      .send({ landLeaseId: null });

    expect(res.status).toBe(200);
    expect(res.body.data).toBeNull();
    expect(attachSiteToLandLeaseTx).toHaveBeenCalledWith(expect.anything(), TENANT_A, SITE_A, null);
  });

  it('refuse un corps sans landLeaseId (400)', async () => {
    const res = await request(app).put(`/api/tenants/${TENANT_A}/finance/sites/${SITE_A}/land-lease`).send({});

    expect(res.status).toBe(400);
    expect(attachSiteToLandLeaseTx).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// E/F. Paiements — liste et saisie
// ---------------------------------------------------------------------------

describe('GET /tenants/:tenantId/finance/land-leases/:landLeaseId/payments', () => {
  it('liste les paiements du bail', async () => {
    listLandLeasePayments.mockResolvedValue([paymentRecord()]);

    const res = await request(app).get(`/api/tenants/${TENANT_A}/finance/land-leases/${LEASE_A}/payments`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(listLandLeasePayments).toHaveBeenCalledWith(TENANT_A, LEASE_A);
  });
});

describe('POST /tenants/:tenantId/finance/land-leases/:landLeaseId/payments', () => {
  it('saisit un paiement en brouillon avec l’utilisateur authentifié', async () => {
    createLandLeasePaymentTx.mockResolvedValue(paymentRecord());

    const res = await request(app).post(`/api/tenants/${TENANT_A}/finance/land-leases/${LEASE_A}/payments`).send({
      paymentDate: '2026-03-01',
      amount: 1_000_000,
      coverageStartDate: '2026-03-01',
      coverageEndDate: '2027-02-28'
    });

    expect(res.status).toBe(201);
    expect(createLandLeasePaymentTx).toHaveBeenCalledWith(
      expect.anything(),
      TENANT_A,
      expect.objectContaining({ landLeaseId: LEASE_A, amount: 1_000_000, createdByUserId: 'user-1' })
    );
  });

  it('refuse une période couverte incohérente (400)', async () => {
    const res = await request(app).post(`/api/tenants/${TENANT_A}/finance/land-leases/${LEASE_A}/payments`).send({
      paymentDate: '2026-03-01',
      amount: 1_000_000,
      coverageStartDate: '2027-02-28',
      coverageEndDate: '2026-03-01'
    });

    expect(res.status).toBe(400);
    expect(createLandLeasePaymentTx).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// G. Validation du paiement
// ---------------------------------------------------------------------------

describe('POST /tenants/:tenantId/finance/land-lease-payments/:paymentId/validate', () => {
  it('valide le paiement', async () => {
    validateLandLeasePaymentTx.mockResolvedValue(
      paymentRecord({ status: 'VALIDATED', validatedAt: new Date('2026-03-02') })
    );

    const res = await request(app).post(`/api/tenants/${TENANT_A}/finance/land-lease-payments/${PAYMENT_A}/validate`);

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('VALIDATED');
    expect(validateLandLeasePaymentTx).toHaveBeenCalledWith(expect.anything(), TENANT_A, PAYMENT_A, 'user-1', {});
  });

  it('relaie un 409 quand le paiement est déjà validé', async () => {
    validateLandLeasePaymentTx.mockRejectedValue(conflict('Ce paiement de bail est déjà validé'));

    const res = await request(app).post(`/api/tenants/${TENANT_A}/finance/land-lease-payments/${PAYMENT_A}/validate`);

    expect(res.status).toBe(409);
  });
});

// ---------------------------------------------------------------------------
// H/I. Constatations — liste et constatation manuelle
// ---------------------------------------------------------------------------

describe('GET /tenants/:tenantId/finance/land-leases/:landLeaseId/accruals', () => {
  it('liste les constatations du bail', async () => {
    listLandLeaseAccruals.mockResolvedValue([accrualRecord()]);

    const res = await request(app).get(`/api/tenants/${TENANT_A}/finance/land-leases/${LEASE_A}/accruals`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(listLandLeaseAccruals).toHaveBeenCalledWith(TENANT_A, LEASE_A);
  });
});

describe('POST /tenants/:tenantId/finance/land-leases/:landLeaseId/accruals', () => {
  it('constate le mois demandé', async () => {
    recordLandLeaseAccrualTx.mockResolvedValue(accrualRecord());

    const res = await request(app)
      .post(`/api/tenants/${TENANT_A}/finance/land-leases/${LEASE_A}/accruals`)
      .send({ periodYear: 2026, periodMonth: 3 });

    expect(res.status).toBe(201);
    expect(res.body.data.amount).toBe(83_333);
    expect(recordLandLeaseAccrualTx).toHaveBeenCalledWith(expect.anything(), TENANT_A, {
      landLeaseId: LEASE_A,
      periodYear: 2026,
      periodMonth: 3
    });
  });

  it('refuse un mois hors bornes (400)', async () => {
    const res = await request(app)
      .post(`/api/tenants/${TENANT_A}/finance/land-leases/${LEASE_A}/accruals`)
      .send({ periodYear: 2026, periodMonth: 13 });

    expect(res.status).toBe(400);
    expect(recordLandLeaseAccrualTx).not.toHaveBeenCalled();
  });

  it('renvoie 201 avec la constatation existante quand elle a déjà eu lieu (idempotence)', async () => {
    recordLandLeaseAccrualTx.mockResolvedValue(accrualRecord());

    const res = await request(app)
      .post(`/api/tenants/${TENANT_A}/finance/land-leases/${LEASE_A}/accruals`)
      .send({ periodYear: 2026, periodMonth: 3 });

    expect(res.status).toBe(201);
    expect(res.body.data.id).toBe('constat-1');
  });
});

// ---------------------------------------------------------------------------
// Aucune chaîne renvoyée ne prononce « débit » ni « crédit »
// ---------------------------------------------------------------------------

describe('vocabulaire de la frontière réseau', () => {
  it('aucune réponse ne contient les mots interdits', async () => {
    listLandLeases.mockResolvedValue([leaseRecord()]);
    listLandLeasePayments.mockResolvedValue([paymentRecord()]);
    listLandLeaseAccruals.mockResolvedValue([accrualRecord()]);

    const responses = await Promise.all([
      request(app).get(`/api/tenants/${TENANT_A}/finance/land-leases`),
      request(app).get(`/api/tenants/${TENANT_A}/finance/land-leases/${LEASE_A}/payments`),
      request(app).get(`/api/tenants/${TENANT_A}/finance/land-leases/${LEASE_A}/accruals`)
    ]);

    for (const res of responses) {
      const serialise = JSON.stringify(res.body).toLowerCase();
      expect(serialise).not.toMatch(/débit|debit|crédit|credit/);
    }
  });
});
