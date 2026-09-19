import express from 'express';
import request from 'supertest';

/**
 * Tests des sept points d'entrée agence des associations — lot 4, deuxième
 * sous-lot.
 *
 * Modèle de mock : `__tests__/api/finance.land-leases.test.ts` (sous-lot
 * précédent). Les middlewares d'authentification, de tenant et de droits sont
 * remplacés par des passe-plats ; le domaine (`lib/finance/partnerships.ts`)
 * est simulé par des espions Jest, pour vérifier que le contrôleur transmet
 * la bonne forme de requête (tenantId de l'URL, identifiants de chemin jamais
 * répétés dans le corps, corps validé) sans reformuler la logique métier,
 * déjà couverte par les tests unitaires.
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

const createPartnershipTx = jest.fn();
const addPartnershipShareTx = jest.fn();
const removePartnershipShareTx = jest.fn();
const attachPropertyToPartnershipTx = jest.fn();
const listPartnerships = jest.fn();
const getPartnership = jest.fn();
const getPartnerStatement = jest.fn();

jest.mock('../../src/lib/finance/partnerships', () => ({
  createPartnershipTx: (...args: any[]) => createPartnershipTx(...args),
  addPartnershipShareTx: (...args: any[]) => addPartnershipShareTx(...args),
  removePartnershipShareTx: (...args: any[]) => removePartnershipShareTx(...args),
  attachPropertyToPartnershipTx: (...args: any[]) => attachPropertyToPartnershipTx(...args),
  listPartnerships: (...args: any[]) => listPartnerships(...args),
  getPartnership: (...args: any[]) => getPartnership(...args),
  getPartnerStatement: (...args: any[]) => getPartnerStatement(...args)
}));

jest.mock('../../src/utils/database', () => ({
  prisma: {
    $transaction: (callback: any) => callback({})
  }
}));

import { errorHandler } from '../../src/middleware/error-middleware';
import { notFound, conflict, badRequest } from '../../src/lib/errors';
import financePartnershipsRoutes from '../../src/routes/finance-partnerships-routes';

const TENANT_A = 'tenant-A';
const PARTNERSHIP_A = '11111111-1111-4111-8111-111111111111';
const SHARE_A = '22222222-2222-4222-8222-222222222222';
const PROPERTY_A = '33333333-3333-4333-8333-333333333333';

const app = express();
app.use(express.json());
app.use('/api', financePartnershipsRoutes);
app.use(errorHandler);

function partnershipRecord(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: PARTNERSHIP_A,
    tenantId: TENANT_A,
    label: 'Les Trois Palmiers',
    isActive: true,
    shares: [],
    totalSharePercent: 0,
    companySharePercent: 100,
    properties: [],
    ...overrides
  };
}

function statementRecord(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    partnershipShareId: SHARE_A,
    partnerName: 'Mariam Diallo',
    sharePercent: 50,
    lines: [],
    totalShare: 0,
    totalPaidOut: 0,
    accountBalance: 0,
    currency: 'XOF',
    ...overrides
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// A. GET partnerships
// ---------------------------------------------------------------------------

describe('GET /tenants/:tenantId/finance/partnerships', () => {
  it('liste les associations du tenant de l’URL', async () => {
    listPartnerships.mockResolvedValue([partnershipRecord()]);

    const res = await request(app).get(`/api/tenants/${TENANT_A}/finance/partnerships`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(listPartnerships).toHaveBeenCalledWith(TENANT_A, { onlyActive: undefined });
  });

  it('transmet onlyActive=true depuis la query', async () => {
    listPartnerships.mockResolvedValue([]);

    await request(app).get(`/api/tenants/${TENANT_A}/finance/partnerships?onlyActive=true`);

    expect(listPartnerships).toHaveBeenCalledWith(TENANT_A, { onlyActive: true });
  });
});

// ---------------------------------------------------------------------------
// B. POST partnerships
// ---------------------------------------------------------------------------

describe('POST /tenants/:tenantId/finance/partnerships', () => {
  it('crée une association avec un corps valide', async () => {
    createPartnershipTx.mockResolvedValue(partnershipRecord());

    const res = await request(app)
      .post(`/api/tenants/${TENANT_A}/finance/partnerships`)
      .send({ label: 'Les Trois Palmiers' });

    expect(res.status).toBe(201);
    expect(res.body.data.id).toBe(PARTNERSHIP_A);
    expect(createPartnershipTx).toHaveBeenCalledWith(expect.anything(), TENANT_A, { label: 'Les Trois Palmiers' });
  });

  it('refuse un corps sans libellé (400, sans toucher au domaine)', async () => {
    const res = await request(app).post(`/api/tenants/${TENANT_A}/finance/partnerships`).send({});

    expect(res.status).toBe(400);
    expect(createPartnershipTx).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// C. GET partnerships/:partnershipId
// ---------------------------------------------------------------------------

describe('GET /tenants/:tenantId/finance/partnerships/:partnershipId', () => {
  it('renvoie le détail de l’association', async () => {
    getPartnership.mockResolvedValue(partnershipRecord());

    const res = await request(app).get(`/api/tenants/${TENANT_A}/finance/partnerships/${PARTNERSHIP_A}`);

    expect(res.status).toBe(200);
    expect(res.body.data.label).toBe('Les Trois Palmiers');
    expect(getPartnership).toHaveBeenCalledWith(TENANT_A, PARTNERSHIP_A);
  });

  it('relaie un 404 quand le domaine ne trouve pas l’association', async () => {
    getPartnership.mockRejectedValue(notFound('Association introuvable'));

    const res = await request(app).get(`/api/tenants/${TENANT_A}/finance/partnerships/${PARTNERSHIP_A}`);

    expect(res.status).toBe(404);
  });

  it('rejette un identifiant qui n’a pas la forme d’un UUID (400)', async () => {
    const res = await request(app).get(`/api/tenants/${TENANT_A}/finance/partnerships/pas-un-uuid`);

    expect(res.status).toBe(400);
    expect(getPartnership).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// D. POST partnerships/:partnershipId/shares
//
// LE CORPS NE RÉPÈTE JAMAIS `partnershipId` : il vient du chemin.
// ---------------------------------------------------------------------------

describe('POST /tenants/:tenantId/finance/partnerships/:partnershipId/shares', () => {
  it('ajoute un associé avec partnershipId pris dans le CHEMIN, jamais dans le corps', async () => {
    addPartnershipShareTx.mockResolvedValue(partnershipRecord({ shares: [{ id: SHARE_A }] }));

    const res = await request(app)
      .post(`/api/tenants/${TENANT_A}/finance/partnerships/${PARTNERSHIP_A}/shares`)
      .send({ partnerName: 'Mariam Diallo', sharePercent: 40 });

    expect(res.status).toBe(201);
    expect(addPartnershipShareTx).toHaveBeenCalledWith(expect.anything(), TENANT_A, {
      partnershipId: PARTNERSHIP_A,
      partnerName: 'Mariam Diallo',
      sharePercent: 40
    });
  });

  it(
    'refuse (400) un corps qui répète partnershipId — schéma `.strict()`, exactement le défaut vécu ' +
      'aux lots 2 et 3 (`fix(finance): quatre creations echouaient en 400 contre le vrai serveur`)',
    async () => {
      const res = await request(app)
        .post(`/api/tenants/${TENANT_A}/finance/partnerships/${PARTNERSHIP_A}/shares`)
        .send({ partnershipId: PARTNERSHIP_A, partnerName: 'Mariam Diallo', sharePercent: 40 });

      expect(res.status).toBe(400);
      expect(addPartnershipShareTx).not.toHaveBeenCalled();
    }
  );

  it('refuse une quote-part négative (400)', async () => {
    const res = await request(app)
      .post(`/api/tenants/${TENANT_A}/finance/partnerships/${PARTNERSHIP_A}/shares`)
      .send({ partnerName: 'Mariam Diallo', sharePercent: -10 });

    expect(res.status).toBe(400);
    expect(addPartnershipShareTx).not.toHaveBeenCalled();
  });

  it('relaie un 400 quand le domaine refuse de dépasser cent pour cent', async () => {
    addPartnershipShareTx.mockRejectedValue(badRequest('La somme des quotes-parts dépasserait cent pour cent'));

    const res = await request(app)
      .post(`/api/tenants/${TENANT_A}/finance/partnerships/${PARTNERSHIP_A}/shares`)
      .send({ partnerName: 'Sekou Toure', sharePercent: 70 });

    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// E. DELETE partnership-shares/:shareId
// ---------------------------------------------------------------------------

describe('DELETE /tenants/:tenantId/finance/partnership-shares/:shareId', () => {
  it('retire un associé', async () => {
    removePartnershipShareTx.mockResolvedValue(partnershipRecord());

    const res = await request(app).delete(`/api/tenants/${TENANT_A}/finance/partnership-shares/${SHARE_A}`);

    expect(res.status).toBe(200);
    expect(removePartnershipShareTx).toHaveBeenCalledWith(expect.anything(), TENANT_A, SHARE_A);
  });

  it('relaie un 409 quand l’associé a déjà une ventilation constatée', async () => {
    removePartnershipShareTx.mockRejectedValue(conflict('Cet associé a déjà une ventilation constatée'));

    const res = await request(app).delete(`/api/tenants/${TENANT_A}/finance/partnership-shares/${SHARE_A}`);

    expect(res.status).toBe(409);
  });
});

// ---------------------------------------------------------------------------
// F. PUT properties/:propertyId/partnership
//
// LE CORPS NE RÉPÈTE JAMAIS `propertyId` : il vient du chemin.
// ---------------------------------------------------------------------------

describe('PUT /tenants/:tenantId/finance/properties/:propertyId/partnership', () => {
  it('rattache un bien à une association', async () => {
    attachPropertyToPartnershipTx.mockResolvedValue(partnershipRecord());

    const res = await request(app)
      .put(`/api/tenants/${TENANT_A}/finance/properties/${PROPERTY_A}/partnership`)
      .send({ partnershipId: PARTNERSHIP_A });

    expect(res.status).toBe(200);
    expect(attachPropertyToPartnershipTx).toHaveBeenCalledWith(expect.anything(), TENANT_A, PROPERTY_A, PARTNERSHIP_A);
  });

  it('détache un bien avec partnershipId: null', async () => {
    attachPropertyToPartnershipTx.mockResolvedValue(null);

    const res = await request(app)
      .put(`/api/tenants/${TENANT_A}/finance/properties/${PROPERTY_A}/partnership`)
      .send({ partnershipId: null });

    expect(res.status).toBe(200);
    expect(res.body.data).toBeNull();
    expect(attachPropertyToPartnershipTx).toHaveBeenCalledWith(expect.anything(), TENANT_A, PROPERTY_A, null);
  });

  it('refuse un corps sans partnershipId (400)', async () => {
    const res = await request(app)
      .put(`/api/tenants/${TENANT_A}/finance/properties/${PROPERTY_A}/partnership`)
      .send({});

    expect(res.status).toBe(400);
    expect(attachPropertyToPartnershipTx).not.toHaveBeenCalled();
  });

  it('refuse (400) un corps qui répète propertyId — schéma `.strict()`, même défaut que les shares', async () => {
    const res = await request(app)
      .put(`/api/tenants/${TENANT_A}/finance/properties/${PROPERTY_A}/partnership`)
      .send({ propertyId: PROPERTY_A, partnershipId: PARTNERSHIP_A });

    expect(res.status).toBe(400);
    expect(attachPropertyToPartnershipTx).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// G. GET partnership-shares/:shareId/statement
// ---------------------------------------------------------------------------

describe('GET /tenants/:tenantId/finance/partnership-shares/:shareId/statement', () => {
  it('renvoie l’état de quote-part', async () => {
    getPartnerStatement.mockResolvedValue(statementRecord({ totalShare: 500_000, accountBalance: 600_000 }));

    const res = await request(app).get(`/api/tenants/${TENANT_A}/finance/partnership-shares/${SHARE_A}/statement`);

    expect(res.status).toBe(200);
    expect(res.body.data.accountBalance).toBe(600_000);
    expect(getPartnerStatement).toHaveBeenCalledWith(TENANT_A, SHARE_A, undefined);
  });

  it('transmet from/to depuis la query', async () => {
    getPartnerStatement.mockResolvedValue(statementRecord());

    await request(app)
      .get(`/api/tenants/${TENANT_A}/finance/partnership-shares/${SHARE_A}/statement`)
      .query({ from: '2026-03-01', to: '2026-03-31' });

    expect(getPartnerStatement).toHaveBeenCalledWith(
      TENANT_A,
      SHARE_A,
      expect.objectContaining({ from: new Date('2026-03-01'), to: new Date('2026-03-31') })
    );
  });

  it('refuse une borne de fin antérieure à la borne de début (400)', async () => {
    const res = await request(app)
      .get(`/api/tenants/${TENANT_A}/finance/partnership-shares/${SHARE_A}/statement`)
      .query({ from: '2026-03-31', to: '2026-03-01' });

    expect(res.status).toBe(400);
    expect(getPartnerStatement).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Aucune chaîne renvoyée ne prononce « débit » ni « crédit »
// ---------------------------------------------------------------------------

describe('vocabulaire de la frontière réseau', () => {
  it('aucune réponse ne contient les mots interdits', async () => {
    listPartnerships.mockResolvedValue([partnershipRecord()]);
    getPartnership.mockResolvedValue(partnershipRecord());
    getPartnerStatement.mockResolvedValue(statementRecord());

    const responses = await Promise.all([
      request(app).get(`/api/tenants/${TENANT_A}/finance/partnerships`),
      request(app).get(`/api/tenants/${TENANT_A}/finance/partnerships/${PARTNERSHIP_A}`),
      request(app).get(`/api/tenants/${TENANT_A}/finance/partnership-shares/${SHARE_A}/statement`)
    ]);

    for (const res of responses) {
      const serialise = JSON.stringify(res.body).toLowerCase();
      expect(serialise).not.toMatch(/débit|debit|crédit|credit/);
    }
  });
});
