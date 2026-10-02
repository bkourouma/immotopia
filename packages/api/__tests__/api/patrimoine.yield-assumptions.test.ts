import express from 'express';
import request from 'supertest';

/**
 * Hypotheses de projection d'un bien detenu (BUG-2026-09-30-033, spec 029).
 *
 * Les hypotheses (annees, croissances, vacance) sont desormais ENREGISTREES
 * cote serveur, une ligne par bien (`PropertyYieldAssumption`) : la decision
 * « parametre de calcul seulement, rien de stocke » est abolie.
 * Priorite par champ pour `GET .../yield` et `GET .../patrimoine/performance` :
 * requete > hypotheses enregistrees > valeurs par defaut. Ce test fige le
 * contrat : GET/PUT des hypotheses, validation `.strict()`, isolation par
 * agence (meme 404 qu'un bien inexistant), priorite, presence des `ratios`.
 */

const mockDeniedPermissions = new Set<string>();

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
  // Un lecteur sans la permission demandee est refuse en 403 (voir `mockDeniedPermissions`).
  requirePropertyPermission: (permission: string) => (_req: any, res: any, next: any) =>
    mockDeniedPermissions.has(permission) ? res.status(403).json({ success: false }) : next()
}));

const TENANT_ID = 'tenant-1';
const OTHER_TENANT_ID = 'tenant-2';

// Base en memoire : un seul bien (`prop-1`, agence 1), table des hypotheses
// cle par bien. Les Decimal sortent en chaine, comme Prisma.
const mockStore = new Map<string, any>();
const mockUpsertCalls: any[] = [];

jest.mock('../../src/utils/database', () => ({
  prisma: {
    property: {
      findFirst: jest.fn(async ({ where }: any) =>
        where.id === 'prop-1' && where.tenantId === 'tenant-1' ? { id: 'prop-1', tenantId: 'tenant-1' } : null
      )
    },
    propertyYieldAssumption: {
      findFirst: jest.fn(async ({ where }: any) => {
        const row = mockStore.get(where.propertyId);
        return row && row.tenantId === where.tenantId ? row : null;
      }),
      upsert: jest.fn(async ({ where, create, update }: any) => {
        mockUpsertCalls.push({ where, create, update });
        const previous = mockStore.get(where.propertyId);
        const data = previous ? update : create;
        const row = {
          ...(previous ?? { id: 'row-1', tenantId: create.tenantId, propertyId: create.propertyId }),
          years: data.years,
          valueGrowthRate: data.valueGrowthRate.toFixed(4),
          rentGrowthRate: data.rentGrowthRate.toFixed(4),
          expenseGrowthRate: data.expenseGrowthRate.toFixed(4),
          vacancyRate: data.vacancyRate.toFixed(4),
          updatedByUserId: data.updatedByUserId,
          updatedAt: new Date('2026-10-07T09:00:00.000Z')
        };
        mockStore.set(where.propertyId, row);
        return row;
      })
    }
  }
}));

jest.mock('../../src/lib/patrimoine/queries', () => {
  const actual = jest.requireActual('../../src/lib/patrimoine/queries');
  const { NotFoundError } = jest.requireActual('../../src/middleware/error-middleware');
  return {
    ...actual,
    buildPropertyYieldInput: jest.fn(async (tenantId: string, propertyId: string) => {
      // Le bien appartient à l'agence 1 : toute autre agence reçoit la même 404 qu'un bien inexistant.
      if (tenantId !== 'tenant-1' || propertyId !== 'prop-1') throw new NotFoundError('Bien introuvable');
      return {
        annualRent: 7_200_000,
        currentValue: 120_000_000,
        costBasis: 90_000_000,
        annualExpenses: 600_000,
        annualLoanPayments: 3_000_000,
        loanRemainingCapital: 40_000_000,
        loanInitialCapital: 60_000_000,
        hasActiveLoan: true
      };
    })
  };
});

// eslint-disable-next-line @typescript-eslint/no-var-requires
const patrimoineRoutes = require('../../src/routes/patrimoine-routes').default;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { errorHandler } = require('../../src/middleware/error-middleware');

const app = express();
app.use(express.json());
app.use('/api', patrimoineRoutes);
app.use(errorHandler);

const url = (tenant: string, query = '') => `/api/tenants/${tenant}/properties/prop-1/yield${query}`;
const assumptionsUrl = (tenant: string, property = 'prop-1') =>
  `/api/tenants/${tenant}/properties/${property}/yield/assumptions`;
const performanceUrl = (query = '') => `/api/tenants/${TENANT_ID}/patrimoine/performance?propertyId=prop-1${query}`;

const VALID_BODY = {
  years: 20,
  valueGrowthRate: 0.04,
  rentGrowthRate: 0.015,
  expenseGrowthRate: 0.03,
  vacancyRate: 0.1
};

beforeEach(() => {
  mockDeniedPermissions.clear();
  mockStore.clear();
  mockUpsertCalls.length = 0;
});

describe('GET .../properties/:propertyId/yield — hypothèses de projection', () => {
  it('applique les valeurs par défaut (10 ans) sans paramètre', async () => {
    const res = await request(app).get(url(TENANT_ID));
    expect(res.status).toBe(200);
    expect(res.body.data.projection).toHaveLength(10);
    expect(res.body.data.assumptions).toEqual({
      years: 10,
      valueGrowthRate: 0.03,
      rentGrowthRate: 0.02,
      expenseGrowthRate: 0.025,
      vacancyRate: 0.05
    });
    expect(res.body.data.assumptionsSaved).toBe(false);
  });

  it('prend en compte les hypothèses saisies : 15 ans, taux et vacance', async () => {
    const res = await request(app).get(
      url(TENANT_ID, '?years=15&valueGrowthRate=0.03&rentGrowthRate=0.02&expenseGrowthRate=0.025&vacancyRate=0.05')
    );
    expect(res.status).toBe(200);
    expect(res.body.data.projection).toHaveLength(15);
    expect(res.body.data.projectedAtHorizon.year).toBe(15);
  });

  it('la vacance change le rendement projeté (même horizon, hypothèses différentes)', async () => {
    const a = await request(app).get(url(TENANT_ID, '?years=5&vacancyRate=0'));
    const b = await request(app).get(url(TENANT_ID, '?years=5&vacancyRate=0.5'));
    expect(a.body.data.projectedAtHorizon.grossYield).toBeGreaterThan(b.body.data.projectedAtHorizon.grossYield);
  });

  it("accepte une croissance négative jusqu'à -50 %", async () => {
    const res = await request(app).get(url(TENANT_ID, '?valueGrowthRate=-0.1&rentGrowthRate=-0.5'));
    expect(res.status).toBe(200);
  });

  it.each([
    ['années nulles', '?years=0'],
    ['années au-delà de 30', '?years=31'],
    ['années non entières', '?years=2.5'],
    ['années non numériques', '?years=abc'],
    ['croissance sous -50 %', '?valueGrowthRate=-0.6'],
    ['croissance au-delà de 100 %', '?rentGrowthRate=1.5'],
    ['vacance négative', '?vacancyRate=-0.1'],
    ['vacance au-delà de 100 %', '?vacancyRate=2']
  ])('refuse en 400 : %s', async (_label, query) => {
    const res = await request(app).get(url(TENANT_ID, query));
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it("ne rend jamais le bien d'une autre agence (même 404 qu'un bien inexistant)", async () => {
    const autre = await request(app).get(url(OTHER_TENANT_ID, '?years=15'));
    const inexistant = await request(app).get(`/api/tenants/${TENANT_ID}/properties/nope/yield`);
    expect(autre.status).toBe(404);
    expect(inexistant.status).toBe(404);
    expect(autre.body).toEqual(inexistant.body);
  });
});

describe('GET/PUT .../yield/assumptions — hypothèses enregistrées', () => {
  it('GET sans ligne : valeurs par défaut, saved=false, updatedAt=null', async () => {
    const res = await request(app).get(assumptionsUrl(TENANT_ID));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      data: {
        assumptions: {
          years: 10,
          valueGrowthRate: 0.03,
          rentGrowthRate: 0.02,
          expenseGrowthRate: 0.025,
          vacancyRate: 0.05
        },
        saved: false,
        updatedAt: null
      }
    });
  });

  it('PUT puis GET : les valeurs sont relues en nombres, saved=true', async () => {
    const put = await request(app).put(assumptionsUrl(TENANT_ID)).send(VALID_BODY);
    expect(put.status).toBe(200);
    expect(put.body.data).toEqual({
      assumptions: VALID_BODY,
      saved: true,
      updatedAt: '2026-10-07T09:00:00.000Z'
    });

    const get = await request(app).get(assumptionsUrl(TENANT_ID));
    expect(get.status).toBe(200);
    expect(get.body.data.assumptions).toEqual(VALID_BODY);
    expect(typeof get.body.data.assumptions.vacancyRate).toBe('number');
    expect(get.body.data.saved).toBe(true);
  });

  it("PUT pose l'agence du contexte et l'auteur ; clé d'upsert = bien", async () => {
    await request(app).put(assumptionsUrl(TENANT_ID)).send(VALID_BODY);
    expect(mockUpsertCalls[0].where).toEqual({ propertyId: 'prop-1', tenantId: TENANT_ID });
    expect(mockUpsertCalls[0].create).toMatchObject({
      tenantId: TENANT_ID,
      propertyId: 'prop-1',
      updatedByUserId: 'user-1'
    });
  });

  it('PUT idempotent : deux appels identiques, une seule ligne, même résultat', async () => {
    const a = await request(app).put(assumptionsUrl(TENANT_ID)).send(VALID_BODY);
    const b = await request(app).put(assumptionsUrl(TENANT_ID)).send(VALID_BODY);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(b.body.data).toEqual(a.body.data);
    expect(mockStore.size).toBe(1);
  });

  it('PUT refusé en 403 sans PROPERTIES_EDIT (le GET reste permis), rien écrit', async () => {
    mockDeniedPermissions.add('PROPERTIES_EDIT');
    const put = await request(app).put(assumptionsUrl(TENANT_ID)).send(VALID_BODY);
    const get = await request(app).get(assumptionsUrl(TENANT_ID));
    expect(put.status).toBe(403);
    expect(get.status).toBe(200);
    expect(mockStore.size).toBe(0);
  });

  it.each([
    ['années hors bornes', { ...VALID_BODY, years: 31 }],
    ['années non entières', { ...VALID_BODY, years: 2.5 }],
    ['croissance sous -50 %', { ...VALID_BODY, valueGrowthRate: -0.6 }],
    ['croissance au-delà de 100 %', { ...VALID_BODY, rentGrowthRate: 1.5 }],
    ['vacance négative', { ...VALID_BODY, vacancyRate: -0.1 }],
    ['vacance au-delà de 100 %', { ...VALID_BODY, vacancyRate: 1.01 }],
    ['chaîne au lieu de nombre (pas de coercion)', { ...VALID_BODY, years: '10' }],
    ['champ inconnu (strict)', { ...VALID_BODY, extra: 1 }],
    ['tenantId dans le corps', { ...VALID_BODY, tenantId: OTHER_TENANT_ID }],
    ['champ manquant', { years: 10, valueGrowthRate: 0.03, rentGrowthRate: 0.02, expenseGrowthRate: 0.025 }],
    ['corps vide', {}]
  ])('PUT refuse en 400 : %s', async (_label, body) => {
    const res = await request(app).put(assumptionsUrl(TENANT_ID)).send(body);
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(mockStore.size).toBe(0);
  });

  it('PUT refuse une valeur null (NaN/Infinity deviennent null en JSON) en 400', async () => {
    const res = await request(app)
      .put(assumptionsUrl(TENANT_ID))
      .set('Content-Type', 'application/json')
      .send('{"years":10,"valueGrowthRate":null,"rentGrowthRate":0.02,"expenseGrowthRate":0.025,"vacancyRate":0.05}');
    expect(res.status).toBe(400);
  });

  it("bien d'une autre agence : 404 identique à un bien inexistant, GET et PUT, rien d'écrit", async () => {
    const getAutre = await request(app).get(assumptionsUrl(OTHER_TENANT_ID));
    const getInexistant = await request(app).get(assumptionsUrl(TENANT_ID, 'nope'));
    const putAutre = await request(app).put(assumptionsUrl(OTHER_TENANT_ID)).send(VALID_BODY);
    const putInexistant = await request(app).put(assumptionsUrl(TENANT_ID, 'nope')).send(VALID_BODY);
    expect(getAutre.status).toBe(404);
    expect(putAutre.status).toBe(404);
    expect(getAutre.body).toEqual(getInexistant.body);
    expect(putAutre.body).toEqual(putInexistant.body);
    expect(mockStore.size).toBe(0);
  });
});

describe('Hypothèses résolues côté serveur : requête > enregistrées > défauts', () => {
  beforeEach(async () => {
    await request(app).put(assumptionsUrl(TENANT_ID)).send(VALID_BODY);
  });

  it('/yield utilise les hypothèses enregistrées quand la requête n’en fournit pas', async () => {
    const res = await request(app).get(url(TENANT_ID));
    expect(res.status).toBe(200);
    expect(res.body.data.assumptions).toEqual(VALID_BODY);
    expect(res.body.data.assumptionsSaved).toBe(true);
    expect(res.body.data.projection).toHaveLength(20);
  });

  it('un paramètre de requête valide l’emporte, champ par champ', async () => {
    const res = await request(app).get(url(TENANT_ID, '?years=5&vacancyRate=0'));
    expect(res.body.data.assumptions).toEqual({ ...VALID_BODY, years: 5, vacancyRate: 0 });
    expect(res.body.data.projection).toHaveLength(5);
  });

  it('un paramètre invalide reste un 400 même avec des hypothèses enregistrées', async () => {
    const res = await request(app).get(url(TENANT_ID, '?years=99'));
    expect(res.status).toBe(400);
  });

  it('/patrimoine/performance?propertyId= applique la même résolution', async () => {
    const res = await request(app).get(performanceUrl());
    expect(res.status).toBe(200);
    expect(res.body.data.assumptions).toEqual(VALID_BODY);
    expect(res.body.data.assumptionsSaved).toBe(true);
    const surcharge = await request(app).get(performanceUrl('&years=3'));
    expect(surcharge.body.data.assumptions.years).toBe(3);
    expect(surcharge.body.data.projection).toHaveLength(3);
  });
});

describe('Ratios bancaires dans la réponse', () => {
  it('/yield expose dscr, ltv, cashOnCash et irr ({ value, reason })', async () => {
    const res = await request(app).get(url(TENANT_ID, '?vacancyRate=0&years=1&valueGrowthRate=0'));
    expect(res.status).toBe(200);
    const { ratios } = res.body.data;
    expect(Object.keys(ratios).sort()).toEqual(['cashOnCash', 'dscr', 'irr', 'ltv']);
    // (7,2 M - 0,6 M) / 3 M
    expect(ratios.dscr.value).toBeCloseTo(2.2, 10);
    expect(ratios.dscr.reason).toBeNull();
    // 40 M / 120 M
    expect(ratios.ltv.value).toBeCloseTo(33.333333, 4);
    // (7,2 - 0,6 - 3) M / (90 - 60) M
    expect(ratios.cashOnCash.value).toBeCloseTo(12, 8);
    // 1 an, valeur stable, loyer +2 %, charges +2,5 % (defauts) : flux1 = 7,2 x 1,02 - 0,6 x 1,025 + 120 = 126,729 M pour un cout de 90 M.
    expect(ratios.irr.value).toBeCloseTo((126_729_000 / 90_000_000 - 1) * 100, 6);
  });

  it('/performance?propertyId= expose aussi les ratios', async () => {
    const res = await request(app).get(performanceUrl());
    expect(res.body.data.ratios).toBeDefined();
    expect(res.body.data.ratios.ltv.reason).toBeNull();
  });
});
