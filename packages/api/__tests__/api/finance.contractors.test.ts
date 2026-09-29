import express from 'express';
import request from 'supertest';

/**
 * Tests des onze points d'entrée agence des tâcherons — lot 4, quatrième
 * sous-lot.
 *
 * Modèle : `__tests__/api/finance.land-leases.test.ts` (lot 4, premier
 * sous-lot). Les middlewares d'authentification, de tenant et de droits sont
 * remplacés par des passe-plats ; le domaine (`lib/finance/contractors.ts`)
 * est simulé par des espions Jest, pour vérifier que le contrôleur transmet
 * la bonne forme de requête (tenantId de l'URL, identifiants de chemin jamais
 * répétés dans le corps, utilisateur authentifié) sans reformuler la logique
 * métier, déjà couverte par les tests unitaires.
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

const createContractorTx = jest.fn();
const listContractors = jest.fn();
const createContractorContractTx = jest.fn();
const listContractorContracts = jest.fn();
const getContractorContract = jest.fn();
const createProgressStatementTx = jest.fn();
const validateProgressStatementTx = jest.fn();
const listProgressStatements = jest.fn();
const createContractorPaymentTx = jest.fn();
const validateContractorPaymentTx = jest.fn();
const listContractorPayments = jest.fn();

jest.mock('../../src/lib/finance/contractors', () => ({
  createContractorTx: (...args: any[]) => createContractorTx(...args),
  listContractors: (...args: any[]) => listContractors(...args),
  createContractorContractTx: (...args: any[]) => createContractorContractTx(...args),
  listContractorContracts: (...args: any[]) => listContractorContracts(...args),
  getContractorContract: (...args: any[]) => getContractorContract(...args),
  createProgressStatementTx: (...args: any[]) => createProgressStatementTx(...args),
  validateProgressStatementTx: (...args: any[]) => validateProgressStatementTx(...args),
  listProgressStatements: (...args: any[]) => listProgressStatements(...args),
  createContractorPaymentTx: (...args: any[]) => createContractorPaymentTx(...args),
  validateContractorPaymentTx: (...args: any[]) => validateContractorPaymentTx(...args),
  listContractorPayments: (...args: any[]) => listContractorPayments(...args)
}));

jest.mock('../../src/utils/database', () => ({
  prisma: {
    $transaction: (callback: any) => callback({})
  }
}));

import { errorHandler } from '../../src/middleware/error-middleware';
import { notFound, conflict } from '../../src/lib/errors';
import financeContractorsRoutes from '../../src/routes/finance-contractors-routes';

const TENANT_A = 'tenant-A';
const CONTRACTOR_A = '11111111-1111-4111-8111-111111111111';
const CONTRACT_A = '22222222-2222-4222-8222-222222222222';
const STATEMENT_A = '33333333-3333-4333-8333-333333333333';
const PAYMENT_A = '44444444-4444-4444-8444-444444444444';
const SITE_A = '55555555-5555-4555-8555-555555555555';
const CATEGORY_A = '66666666-6666-4666-8666-666666666666';

const app = express();
app.use(express.json());
app.use('/api', financeContractorsRoutes);
app.use(errorHandler);

function contractorRecord(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: CONTRACTOR_A,
    tenantId: TENANT_A,
    fullName: 'Sekou Diallo',
    trade: 'Maçon',
    thirdPartyAccountId: 'compte-1',
    isActive: true,
    accountBalance: 0,
    currency: 'XOF',
    ...overrides
  };
}

function contractRecord(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: CONTRACT_A,
    contractorId: CONTRACTOR_A,
    contractorLabel: 'Sekou Diallo',
    siteId: SITE_A,
    siteLabel: 'Chantier de Kaloum',
    costCategoryId: CATEGORY_A,
    costCategoryLabel: 'Gros œuvre',
    reference: 'MCH-001',
    agreedAmount: 1_000_000,
    currency: 'XOF',
    signedDate: new Date('2026-01-05'),
    isActive: true,
    statementedAmount: 0,
    remainingAmount: 1_000_000,
    isOverrun: false,
    ...overrides
  };
}

function statementRecord(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: STATEMENT_A,
    contractId: CONTRACT_A,
    contractReference: 'MCH-001',
    contractorLabel: 'Sekou Diallo',
    statementDate: new Date('2026-02-01'),
    amount: 300_000,
    currency: 'XOF',
    description: 'Fondations coulées',
    status: 'DRAFT',
    createdByLabel: 'Fatoumata Camara',
    validatedAt: null,
    ...overrides
  };
}

function paymentRecord(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: PAYMENT_A,
    contractorId: CONTRACTOR_A,
    contractorLabel: 'Sekou Diallo',
    paymentDate: new Date('2026-03-05'),
    amount: 300_000,
    currency: 'XOF',
    status: 'DRAFT',
    createdByLabel: 'Fatoumata Camara',
    validatedAt: null,
    ...overrides
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// A. GET contractors
// ---------------------------------------------------------------------------

describe('GET /tenants/:tenantId/finance/contractors', () => {
  it('liste les tâcherons du tenant de l’URL', async () => {
    listContractors.mockResolvedValue([contractorRecord()]);

    const res = await request(app).get(`/api/tenants/${TENANT_A}/finance/contractors`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(listContractors).toHaveBeenCalledWith(TENANT_A, { onlyActive: undefined });
  });

  it('transmet onlyActive=true depuis la query', async () => {
    listContractors.mockResolvedValue([]);

    await request(app).get(`/api/tenants/${TENANT_A}/finance/contractors?onlyActive=true`);

    expect(listContractors).toHaveBeenCalledWith(TENANT_A, { onlyActive: true });
  });
});

// ---------------------------------------------------------------------------
// B. POST contractors
// ---------------------------------------------------------------------------

describe('POST /tenants/:tenantId/finance/contractors', () => {
  it('crée un tâcheron avec un corps valide', async () => {
    createContractorTx.mockResolvedValue(contractorRecord());

    const res = await request(app)
      .post(`/api/tenants/${TENANT_A}/finance/contractors`)
      .send({ fullName: 'Sekou Diallo', trade: 'Maçon' });

    expect(res.status).toBe(201);
    expect(res.body.data.id).toBe(CONTRACTOR_A);
    expect(createContractorTx).toHaveBeenCalledWith(
      expect.anything(),
      TENANT_A,
      expect.objectContaining({ fullName: 'Sekou Diallo', trade: 'Maçon' })
    );
  });

  it('refuse un nom complet manquant (400, sans toucher au domaine)', async () => {
    const res = await request(app).post(`/api/tenants/${TENANT_A}/finance/contractors`).send({ trade: 'Maçon' });

    expect(res.status).toBe(400);
    expect(createContractorTx).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// C. GET contractor-contracts — liste transversale
// ---------------------------------------------------------------------------

describe('GET /tenants/:tenantId/finance/contractor-contracts', () => {
  it('liste les marchés, filtrés par contractorId et siteId', async () => {
    listContractorContracts.mockResolvedValue([contractRecord()]);

    const res = await request(app).get(
      `/api/tenants/${TENANT_A}/finance/contractor-contracts?contractorId=${CONTRACTOR_A}&siteId=${SITE_A}`
    );

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(listContractorContracts).toHaveBeenCalledWith(TENANT_A, { contractorId: CONTRACTOR_A, siteId: SITE_A });
  });
});

// ---------------------------------------------------------------------------
// D. POST contractors/:contractorId/contracts
// ---------------------------------------------------------------------------

describe('POST /tenants/:tenantId/finance/contractors/:contractorId/contracts', () => {
  it('convient un marché sans répéter contractorId dans le corps', async () => {
    createContractorContractTx.mockResolvedValue(contractRecord());

    const res = await request(app).post(`/api/tenants/${TENANT_A}/finance/contractors/${CONTRACTOR_A}/contracts`).send({
      siteId: SITE_A,
      costCategoryId: CATEGORY_A,
      reference: 'MCH-001',
      agreedAmount: 1_000_000,
      signedDate: '2026-01-05'
    });

    expect(res.status).toBe(201);
    expect(createContractorContractTx).toHaveBeenCalledWith(
      expect.anything(),
      TENANT_A,
      expect.objectContaining({ contractorId: CONTRACTOR_A, siteId: SITE_A, agreedAmount: 1_000_000 })
    );
  });

  it('LE CORPS NE RÉPÈTE JAMAIS UN IDENTIFIANT QUE LE CHEMIN PORTE : un contractorId dans le corps échoue en 400', async () => {
    const res = await request(app).post(`/api/tenants/${TENANT_A}/finance/contractors/${CONTRACTOR_A}/contracts`).send({
      contractorId: CONTRACTOR_A,
      siteId: SITE_A,
      costCategoryId: CATEGORY_A,
      reference: 'MCH-001',
      agreedAmount: 1_000_000,
      signedDate: '2026-01-05'
    });

    expect(res.status).toBe(400);
    expect(createContractorContractTx).not.toHaveBeenCalled();
  });

  it('refuse un montant convenu négatif (400)', async () => {
    const res = await request(app).post(`/api/tenants/${TENANT_A}/finance/contractors/${CONTRACTOR_A}/contracts`).send({
      siteId: SITE_A,
      costCategoryId: CATEGORY_A,
      reference: 'MCH-001',
      agreedAmount: -1,
      signedDate: '2026-01-05'
    });

    expect(res.status).toBe(400);
    expect(createContractorContractTx).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// E. GET contractor-contracts/:contractId
// ---------------------------------------------------------------------------

describe('GET /tenants/:tenantId/finance/contractor-contracts/:contractId', () => {
  it('renvoie le détail du marché', async () => {
    getContractorContract.mockResolvedValue(contractRecord());

    const res = await request(app).get(`/api/tenants/${TENANT_A}/finance/contractor-contracts/${CONTRACT_A}`);

    expect(res.status).toBe(200);
    expect(res.body.data.reference).toBe('MCH-001');
    expect(getContractorContract).toHaveBeenCalledWith(TENANT_A, CONTRACT_A);
  });

  it('relaie un 404 quand le domaine ne trouve pas le marché', async () => {
    getContractorContract.mockRejectedValue(notFound('Marché de tâcheron introuvable'));

    const res = await request(app).get(`/api/tenants/${TENANT_A}/finance/contractor-contracts/${CONTRACT_A}`);

    expect(res.status).toBe(404);
  });

  it('rejette un identifiant qui n’a pas la forme d’un UUID (400)', async () => {
    const res = await request(app).get(`/api/tenants/${TENANT_A}/finance/contractor-contracts/pas-un-uuid`);

    expect(res.status).toBe(400);
    expect(getContractorContract).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// F/G. Situations — liste et saisie
// ---------------------------------------------------------------------------

describe('GET /tenants/:tenantId/finance/contractor-contracts/:contractId/statements', () => {
  it('liste les situations du marché', async () => {
    listProgressStatements.mockResolvedValue([statementRecord()]);

    const res = await request(app).get(
      `/api/tenants/${TENANT_A}/finance/contractor-contracts/${CONTRACT_A}/statements`
    );

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(listProgressStatements).toHaveBeenCalledWith(TENANT_A, CONTRACT_A);
  });
});

describe('POST /tenants/:tenantId/finance/contractor-contracts/:contractId/statements', () => {
  it('saisit une situation en brouillon sans répéter contractId dans le corps', async () => {
    createProgressStatementTx.mockResolvedValue(statementRecord());

    const res = await request(app)
      .post(`/api/tenants/${TENANT_A}/finance/contractor-contracts/${CONTRACT_A}/statements`)
      .send({ statementDate: '2026-02-01', amount: 300_000, description: 'Fondations coulées' });

    expect(res.status).toBe(201);
    expect(createProgressStatementTx).toHaveBeenCalledWith(
      expect.anything(),
      TENANT_A,
      expect.objectContaining({ contractId: CONTRACT_A, amount: 300_000, createdByUserId: 'user-1' })
    );
  });

  it('un contractId répété dans le corps échoue en 400', async () => {
    const res = await request(app)
      .post(`/api/tenants/${TENANT_A}/finance/contractor-contracts/${CONTRACT_A}/statements`)
      .send({ contractId: CONTRACT_A, statementDate: '2026-02-01', amount: 300_000, description: 'Fondations' });

    expect(res.status).toBe(400);
    expect(createProgressStatementTx).not.toHaveBeenCalled();
  });

  it('LA DESCRIPTION D’UNE SITUATION EST OBLIGATOIRE : un corps sans description échoue en 400', async () => {
    const res = await request(app)
      .post(`/api/tenants/${TENANT_A}/finance/contractor-contracts/${CONTRACT_A}/statements`)
      .send({ statementDate: '2026-02-01', amount: 300_000 });

    expect(res.status).toBe(400);
    expect(createProgressStatementTx).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// H. Validation d'une situation
// ---------------------------------------------------------------------------

describe('POST /tenants/:tenantId/finance/progress-statements/:statementId/validate', () => {
  it('valide la situation', async () => {
    validateProgressStatementTx.mockResolvedValue(
      statementRecord({ status: 'VALIDATED', validatedAt: new Date('2026-02-02') })
    );

    const res = await request(app).post(`/api/tenants/${TENANT_A}/finance/progress-statements/${STATEMENT_A}/validate`);

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('VALIDATED');
    expect(validateProgressStatementTx).toHaveBeenCalledWith(expect.anything(), TENANT_A, STATEMENT_A, 'user-1');
  });

  it('relaie un 409 quand la situation est déjà validée', async () => {
    validateProgressStatementTx.mockRejectedValue(conflict('Cette situation a déjà été validée'));

    const res = await request(app).post(`/api/tenants/${TENANT_A}/finance/progress-statements/${STATEMENT_A}/validate`);

    expect(res.status).toBe(409);
  });
});

// ---------------------------------------------------------------------------
// I/J. Règlements — liste et saisie
// ---------------------------------------------------------------------------

describe('GET /tenants/:tenantId/finance/contractors/:contractorId/payments', () => {
  it('liste les règlements du tâcheron', async () => {
    listContractorPayments.mockResolvedValue([paymentRecord()]);

    const res = await request(app).get(`/api/tenants/${TENANT_A}/finance/contractors/${CONTRACTOR_A}/payments`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(listContractorPayments).toHaveBeenCalledWith(TENANT_A, CONTRACTOR_A);
  });
});

describe('POST /tenants/:tenantId/finance/contractors/:contractorId/payments', () => {
  it('saisit un règlement en brouillon sans répéter contractorId dans le corps', async () => {
    createContractorPaymentTx.mockResolvedValue(paymentRecord());

    const res = await request(app)
      .post(`/api/tenants/${TENANT_A}/finance/contractors/${CONTRACTOR_A}/payments`)
      .send({ paymentDate: '2026-03-05', amount: 300_000 });

    expect(res.status).toBe(201);
    expect(createContractorPaymentTx).toHaveBeenCalledWith(
      expect.anything(),
      TENANT_A,
      expect.objectContaining({ contractorId: CONTRACTOR_A, amount: 300_000, createdByUserId: 'user-1' })
    );
  });

  it('un contractorId répété dans le corps échoue en 400', async () => {
    const res = await request(app)
      .post(`/api/tenants/${TENANT_A}/finance/contractors/${CONTRACTOR_A}/payments`)
      .send({ contractorId: CONTRACTOR_A, paymentDate: '2026-03-05', amount: 300_000 });

    expect(res.status).toBe(400);
    expect(createContractorPaymentTx).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// K. Validation d'un règlement
// ---------------------------------------------------------------------------

describe('POST /tenants/:tenantId/finance/contractor-payments/:paymentId/validate', () => {
  it('valide le règlement', async () => {
    validateContractorPaymentTx.mockResolvedValue(
      paymentRecord({ status: 'VALIDATED', validatedAt: new Date('2026-03-06') })
    );

    const res = await request(app).post(`/api/tenants/${TENANT_A}/finance/contractor-payments/${PAYMENT_A}/validate`);

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('VALIDATED');
    expect(validateContractorPaymentTx).toHaveBeenCalledWith(expect.anything(), TENANT_A, PAYMENT_A, 'user-1', {});
  });

  it('relaie un 409 quand le règlement est déjà validé', async () => {
    validateContractorPaymentTx.mockRejectedValue(conflict('Ce règlement a déjà été validé'));

    const res = await request(app).post(`/api/tenants/${TENANT_A}/finance/contractor-payments/${PAYMENT_A}/validate`);

    expect(res.status).toBe(409);
  });
});

// ---------------------------------------------------------------------------
// Aucune chaîne renvoyée ne prononce « débit » ni « crédit »
// ---------------------------------------------------------------------------

describe('vocabulaire de la frontière réseau', () => {
  it('aucune réponse ne contient les mots interdits', async () => {
    listContractors.mockResolvedValue([contractorRecord()]);
    listContractorContracts.mockResolvedValue([contractRecord()]);
    listProgressStatements.mockResolvedValue([statementRecord()]);
    listContractorPayments.mockResolvedValue([paymentRecord()]);

    const responses = await Promise.all([
      request(app).get(`/api/tenants/${TENANT_A}/finance/contractors`),
      request(app).get(`/api/tenants/${TENANT_A}/finance/contractor-contracts`),
      request(app).get(`/api/tenants/${TENANT_A}/finance/contractor-contracts/${CONTRACT_A}/statements`),
      request(app).get(`/api/tenants/${TENANT_A}/finance/contractors/${CONTRACTOR_A}/payments`)
    ]);

    for (const res of responses) {
      const serialise = JSON.stringify(res.body).toLowerCase();
      expect(serialise).not.toMatch(/débit|debit|crédit|credit/);
    }
  });
});
