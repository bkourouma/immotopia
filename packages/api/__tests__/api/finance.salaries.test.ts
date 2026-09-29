import express from 'express';
import request from 'supertest';

/**
 * Tests des neuf points d'entrée agence des salaires — lot 4, troisième
 * sous-lot.
 *
 * Modèle de mock : `__tests__/api/finance.land-leases.test.ts` (lot 4,
 * premier sous-lot). Les middlewares d'authentification, de tenant et de
 * droits sont remplacés par des passe-plats ; le domaine
 * (`lib/finance/salaries.ts`) est simulé par des espions Jest, pour vérifier
 * que le contrôleur transmet la bonne forme de requête (tenantId de l'URL,
 * employeeId du CHEMIN et non du corps, corps validé, utilisateur
 * authentifié) sans reformuler la logique métier, déjà couverte par les
 * tests unitaires.
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

const createEmployeeTx = jest.fn();
const listEmployees = jest.fn();
const getEmployee = jest.fn();
const listSalaryNotes = jest.fn();
const createSalaryNoteTx = jest.fn();
const validateSalaryNoteTx = jest.fn();
const listSalaryPayments = jest.fn();
const createSalaryPaymentTx = jest.fn();
const validateSalaryPaymentTx = jest.fn();

jest.mock('../../src/lib/finance/salaries', () => ({
  createEmployeeTx: (...args: any[]) => createEmployeeTx(...args),
  listEmployees: (...args: any[]) => listEmployees(...args),
  getEmployee: (...args: any[]) => getEmployee(...args),
  listSalaryNotes: (...args: any[]) => listSalaryNotes(...args),
  createSalaryNoteTx: (...args: any[]) => createSalaryNoteTx(...args),
  validateSalaryNoteTx: (...args: any[]) => validateSalaryNoteTx(...args),
  listSalaryPayments: (...args: any[]) => listSalaryPayments(...args),
  createSalaryPaymentTx: (...args: any[]) => createSalaryPaymentTx(...args),
  validateSalaryPaymentTx: (...args: any[]) => validateSalaryPaymentTx(...args)
}));

jest.mock('../../src/utils/database', () => ({
  prisma: {
    $transaction: (callback: any) => callback({})
  }
}));

import { errorHandler } from '../../src/middleware/error-middleware';
import { notFound, conflict } from '../../src/lib/errors';
import financeSalariesRoutes from '../../src/routes/finance-salaries-routes';

const TENANT_A = 'tenant-A';
const EMPLOYEE_A = '11111111-1111-4111-8111-111111111111';
const SITE_A = '22222222-2222-4222-8222-222222222222';
const NOTE_A = '33333333-3333-4333-8333-333333333333';
const PAYMENT_A = '44444444-4444-4444-8444-444444444444';
const CATEGORY_A = '55555555-5555-4555-8555-555555555555';

const app = express();
app.use(express.json());
app.use('/api', financeSalariesRoutes);
app.use(errorHandler);

function employeeRecord(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: EMPLOYEE_A,
    tenantId: TENANT_A,
    fullName: 'Sekou Diallo',
    role: 'Maçon',
    thirdPartyAccountId: 'compte-1',
    isActive: true,
    accountBalance: 0,
    currency: 'XOF',
    ...overrides
  };
}

function salaryNoteRecord(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: NOTE_A,
    employeeId: EMPLOYEE_A,
    employeeLabel: 'Sekou Diallo',
    periodYear: 2026,
    periodMonth: 3,
    amount: 500_000,
    currency: 'XOF',
    siteId: null,
    siteLabel: null,
    costCategoryId: null,
    costCategoryLabel: null,
    status: 'DRAFT',
    createdByLabel: 'Fatoumata Camara',
    validatedAt: null,
    ...overrides
  };
}

function salaryPaymentRecord(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: PAYMENT_A,
    employeeId: EMPLOYEE_A,
    employeeLabel: 'Sekou Diallo',
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
// A. GET employees
// ---------------------------------------------------------------------------

describe('GET /tenants/:tenantId/finance/employees', () => {
  it('liste les employés du tenant de l’URL', async () => {
    listEmployees.mockResolvedValue([employeeRecord()]);

    const res = await request(app).get(`/api/tenants/${TENANT_A}/finance/employees`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(listEmployees).toHaveBeenCalledWith(TENANT_A, { onlyActive: undefined });
  });

  it('transmet onlyActive=true depuis la query', async () => {
    listEmployees.mockResolvedValue([]);

    await request(app).get(`/api/tenants/${TENANT_A}/finance/employees?onlyActive=true`);

    expect(listEmployees).toHaveBeenCalledWith(TENANT_A, { onlyActive: true });
  });
});

// ---------------------------------------------------------------------------
// B. POST employees
// ---------------------------------------------------------------------------

describe('POST /tenants/:tenantId/finance/employees', () => {
  it('crée un employé avec un corps valide', async () => {
    createEmployeeTx.mockResolvedValue(employeeRecord());

    const res = await request(app)
      .post(`/api/tenants/${TENANT_A}/finance/employees`)
      .send({ fullName: 'Sekou Diallo', role: 'Maçon' });

    expect(res.status).toBe(201);
    expect(res.body.data.id).toBe(EMPLOYEE_A);
    expect(createEmployeeTx).toHaveBeenCalledWith(
      expect.anything(),
      TENANT_A,
      expect.objectContaining({ fullName: 'Sekou Diallo', role: 'Maçon' })
    );
  });

  it('refuse un corps sans fullName (400)', async () => {
    const res = await request(app).post(`/api/tenants/${TENANT_A}/finance/employees`).send({ role: 'Maçon' });

    expect(res.status).toBe(400);
    expect(createEmployeeTx).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// C. GET employees/:employeeId
// ---------------------------------------------------------------------------

describe('GET /tenants/:tenantId/finance/employees/:employeeId', () => {
  it('renvoie le détail de l’employé', async () => {
    getEmployee.mockResolvedValue(employeeRecord());

    const res = await request(app).get(`/api/tenants/${TENANT_A}/finance/employees/${EMPLOYEE_A}`);

    expect(res.status).toBe(200);
    expect(res.body.data.fullName).toBe('Sekou Diallo');
    expect(getEmployee).toHaveBeenCalledWith(TENANT_A, EMPLOYEE_A);
  });

  it('relaie un 404 quand le domaine ne trouve pas l’employé', async () => {
    getEmployee.mockRejectedValue(notFound('Employé introuvable'));

    const res = await request(app).get(`/api/tenants/${TENANT_A}/finance/employees/${EMPLOYEE_A}`);

    expect(res.status).toBe(404);
  });

  it('rejette un identifiant qui n’a pas la forme d’un UUID (400)', async () => {
    const res = await request(app).get(`/api/tenants/${TENANT_A}/finance/employees/pas-un-uuid`);

    expect(res.status).toBe(400);
    expect(getEmployee).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// D. GET salary-notes — liste transversale
// ---------------------------------------------------------------------------

describe('GET /tenants/:tenantId/finance/salary-notes', () => {
  it('liste les notes du tenant, sans filtre', async () => {
    listSalaryNotes.mockResolvedValue([salaryNoteRecord()]);

    const res = await request(app).get(`/api/tenants/${TENANT_A}/finance/salary-notes`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(listSalaryNotes).toHaveBeenCalledWith(TENANT_A, {
      employeeId: undefined,
      siteId: undefined,
      periodYear: undefined,
      periodMonth: undefined
    });
  });

  it('transmet employeeId, siteId, periodYear et periodMonth depuis la query', async () => {
    listSalaryNotes.mockResolvedValue([]);

    await request(app)
      .get(`/api/tenants/${TENANT_A}/finance/salary-notes`)
      .query({ employeeId: EMPLOYEE_A, siteId: SITE_A, periodYear: 2026, periodMonth: 3 });

    expect(listSalaryNotes).toHaveBeenCalledWith(TENANT_A, {
      employeeId: EMPLOYEE_A,
      siteId: SITE_A,
      periodYear: 2026,
      periodMonth: 3
    });
  });

  it('refuse un periodMonth hors bornes (400)', async () => {
    const res = await request(app).get(`/api/tenants/${TENANT_A}/finance/salary-notes`).query({ periodMonth: 13 });

    expect(res.status).toBe(400);
    expect(listSalaryNotes).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// E. POST employees/:employeeId/salary-notes
// ---------------------------------------------------------------------------

describe('POST /tenants/:tenantId/finance/employees/:employeeId/salary-notes', () => {
  it('saisit une note de salaire, employeeId venant du CHEMIN', async () => {
    createSalaryNoteTx.mockResolvedValue(salaryNoteRecord());

    const res = await request(app)
      .post(`/api/tenants/${TENANT_A}/finance/employees/${EMPLOYEE_A}/salary-notes`)
      .send({ periodYear: 2026, periodMonth: 3, amount: 500_000 });

    expect(res.status).toBe(201);
    expect(createSalaryNoteTx).toHaveBeenCalledWith(
      expect.anything(),
      TENANT_A,
      expect.objectContaining({
        employeeId: EMPLOYEE_A,
        periodYear: 2026,
        periodMonth: 3,
        amount: 500_000,
        createdByUserId: 'user-1'
      })
    );
  });

  it(
    'LE CORPS NE RÉPÈTE JAMAIS UN IDENTIFIANT QUE LE CHEMIN PORTE : un corps qui répéterait ' +
      'employeeId échoue en 400 (schéma strict)',
    async () => {
      const res = await request(app)
        .post(`/api/tenants/${TENANT_A}/finance/employees/${EMPLOYEE_A}/salary-notes`)
        .send({ employeeId: EMPLOYEE_A, periodYear: 2026, periodMonth: 3, amount: 500_000 });

      expect(res.status).toBe(400);
      expect(createSalaryNoteTx).not.toHaveBeenCalled();
    }
  );

  it('transmet siteId et costCategoryId quand un chantier est renseigné', async () => {
    createSalaryNoteTx.mockResolvedValue(salaryNoteRecord({ siteId: SITE_A, costCategoryId: CATEGORY_A }));

    const res = await request(app)
      .post(`/api/tenants/${TENANT_A}/finance/employees/${EMPLOYEE_A}/salary-notes`)
      .send({ periodYear: 2026, periodMonth: 3, amount: 500_000, siteId: SITE_A, costCategoryId: CATEGORY_A });

    expect(res.status).toBe(201);
    expect(createSalaryNoteTx).toHaveBeenCalledWith(
      expect.anything(),
      TENANT_A,
      expect.objectContaining({ siteId: SITE_A, costCategoryId: CATEGORY_A })
    );
  });

  it('refuse un siteId sans costCategoryId (400, sans toucher au domaine)', async () => {
    const res = await request(app)
      .post(`/api/tenants/${TENANT_A}/finance/employees/${EMPLOYEE_A}/salary-notes`)
      .send({ periodYear: 2026, periodMonth: 3, amount: 500_000, siteId: SITE_A });

    expect(res.status).toBe(400);
    expect(createSalaryNoteTx).not.toHaveBeenCalled();
  });

  it('refuse un costCategoryId sans siteId (400, sans toucher au domaine)', async () => {
    const res = await request(app)
      .post(`/api/tenants/${TENANT_A}/finance/employees/${EMPLOYEE_A}/salary-notes`)
      .send({ periodYear: 2026, periodMonth: 3, amount: 500_000, costCategoryId: CATEGORY_A });

    expect(res.status).toBe(400);
    expect(createSalaryNoteTx).not.toHaveBeenCalled();
  });

  it('refuse un montant négatif (400)', async () => {
    const res = await request(app)
      .post(`/api/tenants/${TENANT_A}/finance/employees/${EMPLOYEE_A}/salary-notes`)
      .send({ periodYear: 2026, periodMonth: 3, amount: -1 });

    expect(res.status).toBe(400);
    expect(createSalaryNoteTx).not.toHaveBeenCalled();
  });

  it('relaie un 409 quand le domaine refuse une seconde note sur la même période', async () => {
    createSalaryNoteTx.mockRejectedValue(
      conflict('Une note de salaire existe déjà pour cet employé sur cette période')
    );

    const res = await request(app)
      .post(`/api/tenants/${TENANT_A}/finance/employees/${EMPLOYEE_A}/salary-notes`)
      .send({ periodYear: 2026, periodMonth: 3, amount: 500_000 });

    expect(res.status).toBe(409);
  });
});

// ---------------------------------------------------------------------------
// F. Validation d'une note
// ---------------------------------------------------------------------------

describe('POST /tenants/:tenantId/finance/salary-notes/:salaryNoteId/validate', () => {
  it('valide la note', async () => {
    validateSalaryNoteTx.mockResolvedValue(
      salaryNoteRecord({ status: 'VALIDATED', validatedAt: new Date('2026-03-02') })
    );

    const res = await request(app).post(`/api/tenants/${TENANT_A}/finance/salary-notes/${NOTE_A}/validate`);

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('VALIDATED');
    expect(validateSalaryNoteTx).toHaveBeenCalledWith(expect.anything(), TENANT_A, NOTE_A, 'user-1');
  });

  it('relaie un 409 quand la note est déjà validée', async () => {
    validateSalaryNoteTx.mockRejectedValue(conflict('Cette note de salaire a déjà été validée'));

    const res = await request(app).post(`/api/tenants/${TENANT_A}/finance/salary-notes/${NOTE_A}/validate`);

    expect(res.status).toBe(409);
  });
});

// ---------------------------------------------------------------------------
// G/H. Règlements — liste et saisie
// ---------------------------------------------------------------------------

describe('GET /tenants/:tenantId/finance/employees/:employeeId/salary-payments', () => {
  it('liste les règlements de l’employé', async () => {
    listSalaryPayments.mockResolvedValue([salaryPaymentRecord()]);

    const res = await request(app).get(`/api/tenants/${TENANT_A}/finance/employees/${EMPLOYEE_A}/salary-payments`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(listSalaryPayments).toHaveBeenCalledWith(TENANT_A, EMPLOYEE_A);
  });
});

describe('POST /tenants/:tenantId/finance/employees/:employeeId/salary-payments', () => {
  it('saisit un règlement en brouillon avec l’utilisateur authentifié, employeeId venant du CHEMIN', async () => {
    createSalaryPaymentTx.mockResolvedValue(salaryPaymentRecord());

    const res = await request(app)
      .post(`/api/tenants/${TENANT_A}/finance/employees/${EMPLOYEE_A}/salary-payments`)
      .send({ paymentDate: '2026-03-05', amount: 300_000 });

    expect(res.status).toBe(201);
    expect(createSalaryPaymentTx).toHaveBeenCalledWith(
      expect.anything(),
      TENANT_A,
      expect.objectContaining({ employeeId: EMPLOYEE_A, amount: 300_000, createdByUserId: 'user-1' })
    );
  });

  it('refuse un corps qui répéterait employeeId (400, schéma strict)', async () => {
    const res = await request(app)
      .post(`/api/tenants/${TENANT_A}/finance/employees/${EMPLOYEE_A}/salary-payments`)
      .send({ employeeId: EMPLOYEE_A, paymentDate: '2026-03-05', amount: 300_000 });

    expect(res.status).toBe(400);
    expect(createSalaryPaymentTx).not.toHaveBeenCalled();
  });

  it('refuse un montant négatif (400)', async () => {
    const res = await request(app)
      .post(`/api/tenants/${TENANT_A}/finance/employees/${EMPLOYEE_A}/salary-payments`)
      .send({ paymentDate: '2026-03-05', amount: -1 });

    expect(res.status).toBe(400);
    expect(createSalaryPaymentTx).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// I. Validation d'un règlement
// ---------------------------------------------------------------------------

describe('POST /tenants/:tenantId/finance/salary-payments/:salaryPaymentId/validate', () => {
  it('transmet le mode et le compte payeur choisis (BUG-2026-09-29-032)', async () => {
    validateSalaryPaymentTx.mockResolvedValue(
      salaryPaymentRecord({ status: 'VALIDATED', validatedAt: new Date('2026-03-06') })
    );
    const compte = '3f0c1c1e-8a55-4d0a-9d0e-0a1b2c3d4e5f';

    const res = await request(app)
      .post(`/api/tenants/${TENANT_A}/finance/salary-payments/${PAYMENT_A}/validate`)
      .send({ method: 'BANK_TRANSFER', treasuryAccountId: compte });

    expect(res.status).toBe(200);
    expect(validateSalaryPaymentTx).toHaveBeenCalledWith(expect.anything(), TENANT_A, PAYMENT_A, 'user-1', {
      method: 'BANK_TRANSFER',
      treasuryAccountId: compte
    });
  });

  it('refuse (400) un mode de règlement inconnu, sans valider', async () => {
    const res = await request(app)
      .post(`/api/tenants/${TENANT_A}/finance/salary-payments/${PAYMENT_A}/validate`)
      .send({ method: 'TROC' });

    expect(res.status).toBe(400);
    expect(validateSalaryPaymentTx).not.toHaveBeenCalled();
  });

  it('valide le règlement, même supérieur au solde (avance sur salaire)', async () => {
    validateSalaryPaymentTx.mockResolvedValue(
      salaryPaymentRecord({ status: 'VALIDATED', validatedAt: new Date('2026-03-06'), amount: 900_000 })
    );

    const res = await request(app).post(`/api/tenants/${TENANT_A}/finance/salary-payments/${PAYMENT_A}/validate`);

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('VALIDATED');
    expect(validateSalaryPaymentTx).toHaveBeenCalledWith(expect.anything(), TENANT_A, PAYMENT_A, 'user-1', {});
  });

  it('relaie un 409 quand le règlement est déjà validé', async () => {
    validateSalaryPaymentTx.mockRejectedValue(conflict('Ce règlement de salaire a déjà été validé'));

    const res = await request(app).post(`/api/tenants/${TENANT_A}/finance/salary-payments/${PAYMENT_A}/validate`);

    expect(res.status).toBe(409);
  });

  it('relaie un 404 quand le règlement est introuvable', async () => {
    validateSalaryPaymentTx.mockRejectedValue(notFound('Règlement de salaire introuvable'));

    const res = await request(app).post(`/api/tenants/${TENANT_A}/finance/salary-payments/${PAYMENT_A}/validate`);

    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// Aucune chaîne renvoyée ne prononce « débit » ni « crédit »
// ---------------------------------------------------------------------------

describe('vocabulaire de la frontière réseau', () => {
  it('aucune réponse ne contient les mots interdits', async () => {
    listEmployees.mockResolvedValue([employeeRecord()]);
    listSalaryNotes.mockResolvedValue([salaryNoteRecord()]);
    listSalaryPayments.mockResolvedValue([salaryPaymentRecord()]);

    const responses = await Promise.all([
      request(app).get(`/api/tenants/${TENANT_A}/finance/employees`),
      request(app).get(`/api/tenants/${TENANT_A}/finance/salary-notes`),
      request(app).get(`/api/tenants/${TENANT_A}/finance/employees/${EMPLOYEE_A}/salary-payments`)
    ]);

    for (const res of responses) {
      const serialise = JSON.stringify(res.body).toLowerCase();
      expect(serialise).not.toMatch(/débit|debit|crédit|credit/);
    }
  });
});
