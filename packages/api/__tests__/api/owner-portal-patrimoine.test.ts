/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Vue patrimoine du portail propriétaire (lot P5) — contrat figé dans
 * `p5-contrat-api.md`.
 *
 * Pile réelle pour le portail : `requireOwnerPortalAccess`
 * (middleware/owner-portal-access.ts) tourne sans mock, sur la base en
 * mémoire de `helpers/fake-prisma.ts` (modèle : `portal-no-disk-paths.test.ts`,
 * `maintenance.attachment-files.test.ts`) — un test d'isolation qui mockerait
 * la garde ne prouverait rien. `GET|PUT /settings/owner-portal` (réglage
 * d'agence) suit le patron de `settings.finance.test.ts` : `requireTenantAccess`
 * et `requirePermission` remplacés par des passe-plats, seul le contrôleur
 * compte.
 *
 * Jeu de données :
 *   Agence A — P1 (Oumar, valorisé, loué, un emprunt actif, un document) et
 *              P2 (Fanta, un document) ; propriétaire Oumar aussi client de
 *              l'agence B (bien PB), pour l'isolation multi-agence (B3).
 */

import express from 'express';
import request from 'supertest';
import { createFakePrisma } from '../helpers/fake-prisma';
import { findDiskPathLeaks } from '../helpers/disk-path-leaks';

const mockPrisma = createFakePrisma();

jest.mock('../../src/utils/database', () => ({ prisma: mockPrisma }));

jest.mock('../../src/middleware/auth-middleware', () => ({
  authenticate: (req: any, res: any, next: any) => {
    const userId = req.headers['x-test-user'];
    if (!userId) {
      res.status(401).json({ success: false, message: 'Authentification requise.' });
      return;
    }
    req.user = { userId, globalRole: 'USER' };
    next();
  }
}));

jest.mock('../../src/middleware/tenant-middleware', () => ({
  requireTenantAccess: (req: any, _res: any, next: any) => {
    req.tenantContext = { tenantId: req.params.tenantId, isCollaborator: true, isClient: false };
    next();
  }
}));

const mockPermissionsAsked: string[] = [];
jest.mock('../../src/middleware/rbac-middleware', () => ({
  requirePermission: (key: string) => {
    mockPermissionsAsked.push(key);
    return (_req: any, _res: any, next: any) => next();
  }
}));

import ownerPortalRoutes from '../../src/routes/owner-portal-routes';
import agencySettingsRoutes from '../../src/routes/agency-settings-routes';
import { errorHandler } from '../../src/middleware/error-middleware';
import { buildPropertyYieldInput } from '../../src/lib/patrimoine/queries';
import { grossYield, netYield, netNetYield, latentCapitalGain } from '../../src/lib/patrimoine/yield';

const app = express();
app.use(express.json());
app.use('/api/portal/owner', ownerPortalRoutes);
app.use('/api', agencySettingsRoutes);
app.use(errorHandler);

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const TENANT_A = 'tenant-a';
const TENANT_B = 'tenant-b';
const P1 = 'prop-1';
const P2 = 'prop-2';
const PB = 'prop-b';
const USER_OUMAR = 'user-oumar';
const USER_FANTA = 'user-fanta';
const LOAN_1 = id(51);
const VALUATION_1 = id(52);
const LEASE_1 = id(53);
const DOC_P1 = id(61);
const DOC_P2 = id(62);

function seed() {
  mockPrisma.reset();

  mockPrisma.tenant.rows.push({ id: TENANT_A, status: 'ACTIVE' }, { id: TENANT_B, status: 'ACTIVE' });

  mockPrisma.tenantClient.rows.push(
    {
      id: 'tc-oumar-a',
      userId: USER_OUMAR,
      tenantId: TENANT_A,
      clientType: 'OWNER',
      createdAt: new Date('2026-01-01'),
      tenant: { status: 'ACTIVE' }
    },
    {
      id: 'tc-oumar-b',
      userId: USER_OUMAR,
      tenantId: TENANT_B,
      clientType: 'OWNER',
      createdAt: new Date('2026-01-02'),
      tenant: { status: 'ACTIVE' }
    }
  );

  mockPrisma.property.rows.push(
    {
      id: P1,
      tenantId: TENANT_A,
      ownerUserId: USER_OUMAR,
      title: 'Villa Cocody',
      address: 'Cocody',
      locationZone: 'Cocody'
    },
    {
      id: P2,
      tenantId: TENANT_A,
      ownerUserId: USER_FANTA,
      title: 'Appartement Fanta',
      address: 'Marcory',
      locationZone: 'Marcory'
    },
    {
      id: PB,
      tenantId: TENANT_B,
      ownerUserId: USER_OUMAR,
      title: 'Studio Bouaké',
      address: 'Bouaké',
      locationZone: 'Bouaké'
    }
  );

  // Bail actif sur P1 : loyer 100 000 XOF/mois.
  mockPrisma.rentalLease.rows.push({
    id: LEASE_1,
    tenant_id: TENANT_A,
    property_id: P1,
    status: 'ACTIVE',
    rent_amount: 100000,
    billing_frequency: 'MONTHLY'
  });

  // Valorisation la plus récente de P1 : 10 000 000, coût d'acquisition 8 000 000.
  mockPrisma.assetValuation.rows.push({
    id: VALUATION_1,
    tenantId: TENANT_A,
    propertyId: P1,
    valuatedAt: new Date('2026-06-01'),
    estimatedValue: 10000000,
    acquisitionCost: 8000000,
    acquisitionDate: new Date('2020-01-01'),
    method: 'MARKET_ESTIMATE',
    currency: 'XOF'
  });

  // Dépense non capitalisée dans les 12 derniers mois : 200 000.
  mockPrisma.propertyExpense.rows.push({
    id: id(71),
    tenantId: TENANT_A,
    propertyId: P1,
    amount: 200000,
    isCapitalized: false,
    paidAt: new Date()
  });

  // Emprunt actif : mensualité 50 000, capital restant 1 000 000, échéance lointaine.
  const farFuture = new Date();
  farFuture.setFullYear(farFuture.getFullYear() + 10);
  mockPrisma.propertyLoan.rows.push({
    id: LOAN_1,
    tenantId: TENANT_A,
    propertyId: P1,
    lender: 'Banque Atlantique',
    capitalAmount: 5000000,
    remainingCapital: 1000000,
    interestRate: 6.5,
    monthlyPayment: 50000,
    currency: 'XOF',
    startDate: new Date('2024-01-01'),
    endDate: farFuture,
    status: 'ACTIVE'
  });

  // Un document par bien, jamais servi en statique.
  mockPrisma.propertyDocument.rows.push(
    {
      id: DOC_P1,
      propertyId: P1,
      tenantId: TENANT_A,
      documentType: 'TITLE_DEED',
      filePath: 'D:\\APP\\Immobillier\\uploads\\properties\\prop-1\\documents\\titre.pdf',
      fileUrl: `properties/${P1}/documents/titre.pdf`,
      fileName: 'Titre foncier P1.pdf',
      fileSize: 4096,
      mimeType: 'application/pdf',
      expirationDate: null,
      isValid: true,
      createdAt: new Date('2026-02-01')
    },
    {
      id: DOC_P2,
      propertyId: P2,
      tenantId: TENANT_A,
      documentType: 'TITLE_DEED',
      filePath: 'D:\\APP\\Immobillier\\uploads\\properties\\prop-2\\documents\\titre.pdf',
      fileUrl: `properties/${P2}/documents/titre.pdf`,
      fileName: 'Titre foncier P2.pdf',
      fileSize: 4096,
      mimeType: 'application/pdf',
      expirationDate: null,
      isValid: true,
      createdAt: new Date('2026-02-01')
    }
  );
}

beforeEach(() => {
  seed();
  // `requirePermission(key)` s'exécute une seule fois, au chargement du
  // module de routes (voir mock ci-dessus) : `mockPermissionsAsked` se
  // remplit à l'import, pas à chaque requête. Le vider ici l'effacerait
  // pour de bon (modèle : `__tests__/api/settings.finance.test.ts`).
  // Seuls les compteurs d'appel Prisma (`upsert`, etc.) se remettent à
  // zéro entre les tests.
  jest.clearAllMocks();
});

/**
 * Ligne complète de `owner_portal_settings` : une vraie base pose les valeurs
 * par défaut de chaque colonne à la création, ce que le fake ne fait pas tout
 * seul — chaque test de masquage part donc de « tout actif » puis ne change
 * que ce qu'il teste.
 */
function settingsRow(overrides: Partial<Record<string, boolean>> = {}) {
  return {
    id: 'ops-a',
    tenantId: TENANT_A,
    patrimonyEnabled: true,
    patrimonyShowValuation: true,
    patrimonyShowYield: true,
    patrimonyShowLoans: true,
    patrimonyShowWorks: true,
    patrimonyShowDocuments: true,
    ...overrides
  };
}

describe('GET /patrimoine/settings — toujours 200', () => {
  it('renvoie les valeurs par défaut (tout actif) sans rien écrire pour une agence jamais paramétrée', async () => {
    const res = await request(app).get('/api/portal/owner/patrimoine/settings').set('x-test-user', USER_OUMAR);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      enabled: true,
      sections: { valuation: true, yield: true, loans: true, works: true, documents: true }
    });
    expect(mockPrisma.ownerPortalSettings.upsert).not.toHaveBeenCalled();
  });

  it('reflète le masquage : enabled=false et toutes les rubriques à false', async () => {
    mockPrisma.ownerPortalSettings.rows.push(settingsRow({ patrimonyEnabled: false }));

    const res = await request(app).get('/api/portal/owner/patrimoine/settings').set('x-test-user', USER_OUMAR);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      enabled: false,
      sections: { valuation: false, yield: false, loans: false, works: false, documents: false }
    });
  });
});

describe('GET /patrimoine — isolation', () => {
  it('le propriétaire ne voit que ses biens : la liste ne montre pas ceux de Fanta', async () => {
    const res = await request(app).get('/api/portal/owner/patrimoine').set('x-test-user', USER_OUMAR);

    expect(res.status).toBe(200);
    expect(res.body.data.properties.map((p: any) => p.id)).toEqual([P1]);
    expect(res.body.data.summary.propertyCount).toBe(1);
  });

  it("une agence ne mélange pas les biens d'une autre : Oumar sur l'agence B ne voit que PB", async () => {
    const res = await request(app)
      .get('/api/portal/owner/patrimoine')
      .set('x-test-user', USER_OUMAR)
      .set('x-portal-tenant-id', TENANT_B);

    expect(res.status).toBe(200);
    expect(res.body.data.properties.map((p: any) => p.id)).toEqual([PB]);
  });

  it('aucune fuite de chemin disque', async () => {
    const res = await request(app).get('/api/portal/owner/patrimoine').set('x-test-user', USER_OUMAR);
    expect(findDiskPathLeaks(res.body)).toEqual([]);
  });
});

describe('GET /patrimoine/properties/:propertyId — isolation', () => {
  it("bien d'un autre propriétaire de la même agence → 404", async () => {
    const res = await request(app).get(`/api/portal/owner/patrimoine/properties/${P2}`).set('x-test-user', USER_OUMAR);
    expect(res.status).toBe(404);
  });

  it("bien d'une autre agence (même utilisateur propriétaire) → 404 sans l'en-tête d'agence", async () => {
    const res = await request(app).get(`/api/portal/owner/patrimoine/properties/${PB}`).set('x-test-user', USER_OUMAR);
    expect(res.status).toBe(404);
  });

  it('bien inexistant → 404, même message que les autres cas', async () => {
    const res = await request(app)
      .get('/api/portal/owner/patrimoine/properties/does-not-exist')
      .set('x-test-user', USER_OUMAR);
    expect(res.status).toBe(404);
  });

  it('bien du périmètre → 200, aucune fuite de chemin disque', async () => {
    const res = await request(app).get(`/api/portal/owner/patrimoine/properties/${P1}`).set('x-test-user', USER_OUMAR);
    expect(res.status).toBe(200);
    expect(findDiskPathLeaks(res.body)).toEqual([]);
    expect(res.body.data.property).toMatchObject({ id: P1, title: 'Villa Cocody', ownerSharePercent: null });
  });
});

describe('GET .../documents/:documentId/file — isolation', () => {
  it("document d'un autre bien → 404", async () => {
    const res = await request(app)
      .get(`/api/portal/owner/patrimoine/properties/${P1}/documents/${DOC_P2}/file`)
      .set('x-test-user', USER_OUMAR);
    expect(res.status).toBe(404);
  });

  it('bien hors périmètre → 404 avant même de chercher le document', async () => {
    const res = await request(app)
      .get(`/api/portal/owner/patrimoine/properties/${P2}/documents/${DOC_P2}/file`)
      .set('x-test-user', USER_OUMAR);
    expect(res.status).toBe(404);
  });
});

describe('Masquage — patrimonyEnabled=false', () => {
  beforeEach(() => {
    mockPrisma.ownerPortalSettings.rows.push(settingsRow({ patrimonyEnabled: false }));
  });

  it('/patrimoine → 404', async () => {
    const res = await request(app).get('/api/portal/owner/patrimoine').set('x-test-user', USER_OUMAR);
    expect(res.status).toBe(404);
  });

  it('/patrimoine/properties/:id → 404 même pour un bien du périmètre', async () => {
    const res = await request(app).get(`/api/portal/owner/patrimoine/properties/${P1}`).set('x-test-user', USER_OUMAR);
    expect(res.status).toBe(404);
  });

  it('/patrimoine/settings reste 200, enabled=false', async () => {
    const res = await request(app).get('/api/portal/owner/patrimoine/settings').set('x-test-user', USER_OUMAR);
    expect(res.status).toBe(200);
    expect(res.body.data.enabled).toBe(false);
  });
});

describe('Masquage — rubrique emprunts', () => {
  beforeEach(() => {
    mockPrisma.ownerPortalSettings.rows.push(settingsRow({ patrimonyShowLoans: false }));
  });

  it('clés loans, loanSummary, totalRemainingLoanCapital et netNetYield absentes', async () => {
    const list = await request(app).get('/api/portal/owner/patrimoine').set('x-test-user', USER_OUMAR);
    expect(list.body.data.sections.loans).toBe(false);
    expect(list.body.data.summary).not.toHaveProperty('totalRemainingLoanCapital');
    const listedProperty = list.body.data.properties[0];
    expect(listedProperty).not.toHaveProperty('loanSummary');
    expect(listedProperty.yield).not.toHaveProperty('netNetYield');

    const detail = await request(app)
      .get(`/api/portal/owner/patrimoine/properties/${P1}`)
      .set('x-test-user', USER_OUMAR);
    expect(detail.body.data).not.toHaveProperty('loans');
    expect(detail.body.data.yield).not.toHaveProperty('netNetYield');
  });
});

describe('Masquage — rubrique documents', () => {
  beforeEach(() => {
    mockPrisma.ownerPortalSettings.rows.push(settingsRow({ patrimonyShowDocuments: false }));
  });

  it('documents absent du détail, téléchargement 404', async () => {
    const detail = await request(app)
      .get(`/api/portal/owner/patrimoine/properties/${P1}`)
      .set('x-test-user', USER_OUMAR);
    expect(detail.body.data).not.toHaveProperty('documents');

    const file = await request(app)
      .get(`/api/portal/owner/patrimoine/properties/${P1}/documents/${DOC_P1}/file`)
      .set('x-test-user', USER_OUMAR);
    expect(file.status).toBe(404);
  });
});

describe('Calcul — aucun second moteur', () => {
  it('les rendements de la liste et du détail égalent ceux de lib/patrimoine/yield.ts pour la même entrée', async () => {
    const input = await buildPropertyYieldInput(TENANT_A, P1);
    const expected = {
      grossYield: grossYield(input),
      netYield: netYield(input),
      netNetYield: netNetYield(input),
      annualRent: input.annualRent,
      annualExpenses: input.annualExpenses,
      latentCapitalGain: latentCapitalGain(input)
    };

    const list = await request(app).get('/api/portal/owner/patrimoine').set('x-test-user', USER_OUMAR);
    const listedProperty = list.body.data.properties[0];
    expect(listedProperty.yield.grossYield).toBeCloseTo(expected.grossYield);
    expect(listedProperty.yield.netYield).toBeCloseTo(expected.netYield);
    expect(listedProperty.yield.netNetYield).toBeCloseTo(expected.netNetYield!);
    expect(listedProperty.yield.annualRent).toBeCloseTo(expected.annualRent);
    expect(listedProperty.yield.annualExpenses).toBeCloseTo(expected.annualExpenses);
    expect(listedProperty.latentCapitalGain).toBeCloseTo(expected.latentCapitalGain!);

    const detail = await request(app)
      .get(`/api/portal/owner/patrimoine/properties/${P1}`)
      .set('x-test-user', USER_OUMAR);
    expect(detail.body.data.yield.grossYield).toBeCloseTo(expected.grossYield);
    expect(detail.body.data.yield.netNetYield).toBeCloseTo(expected.netNetYield!);
    expect(detail.body.data.latentCapitalGain).toBeCloseTo(expected.latentCapitalGain!);
  });
});

describe("Quote-part d'indivision", () => {
  const TC_OUMAR_A = 'tc-oumar-a';
  const TC_AUTRE = 'tc-autre-indivisaire';
  const USER_AUTRE = 'user-autre-indivisaire';
  const TC_FANTA = 'tc-fanta-a';

  beforeEach(() => {
    // Second indivisaire, membre de l'agence A, propriétaire de 60 % de P1.
    mockPrisma.tenantClient.rows.push(
      {
        id: TC_AUTRE,
        userId: USER_AUTRE,
        tenantId: TENANT_A,
        clientType: 'OWNER',
        createdAt: new Date('2026-01-03'),
        tenant: { status: 'ACTIVE' }
      },
      // Fanta, propriétaire de P2 (sans ligne d'indivision), pour vérifier le null.
      {
        id: TC_FANTA,
        userId: USER_FANTA,
        tenantId: TENANT_A,
        clientType: 'OWNER',
        createdAt: new Date('2026-01-04'),
        tenant: { status: 'ACTIVE' }
      }
    );
    mockPrisma.propertyOwnershipShare.rows.push(
      { tenantId: TENANT_A, propertyId: P1, ownerClientId: TC_OUMAR_A, sharePercent: 40 },
      { tenantId: TENANT_A, propertyId: P1, ownerClientId: TC_AUTRE, sharePercent: 60 }
    );
  });

  it('GET /patrimoine : part pondérée, part de bien sans indivision à null, aucune fuite vers le co-indivisaire', async () => {
    const res = await request(app).get('/api/portal/owner/patrimoine').set('x-test-user', USER_OUMAR);

    expect(res.status).toBe(200);
    const p1 = res.body.data.properties.find((p: any) => p.id === P1);
    expect(p1.ownerSharePercent).toBe(40);

    // P1 pondéré à 40 % : valeur 10 000 000 × 0,4, plus-value latente
    // (10 000 000 - 8 000 000) × 0,4, capital restant dû 1 000 000 × 0,4.
    expect(res.body.data.summary.totalEstimatedValue).toBeCloseTo(4000000);
    expect(res.body.data.summary.totalLatentCapitalGain).toBeCloseTo(800000);
    expect(res.body.data.summary.totalRemainingLoanCapital).toBeCloseTo(400000);

    const raw = JSON.stringify(res.body);
    expect(raw).not.toContain(TC_AUTRE);
    expect(raw).not.toContain('60');
  });

  it('GET /patrimoine : un bien sans ligne d’indivision reste à ownerSharePercent=null et pondéré à 100 %', async () => {
    const res = await request(app).get('/api/portal/owner/patrimoine').set('x-test-user', USER_FANTA);

    expect(res.status).toBe(200);
    const p2 = res.body.data.properties.find((p: any) => p.id === P2);
    expect(p2.ownerSharePercent).toBeNull();
  });

  it('GET /patrimoine/properties/:propertyId : part affichée mais montants du détail non pondérés', async () => {
    const res = await request(app).get(`/api/portal/owner/patrimoine/properties/${P1}`).set('x-test-user', USER_OUMAR);

    expect(res.status).toBe(200);
    expect(res.body.data.property.ownerSharePercent).toBe(40);
    // Montants du bien entier, non pondérés par la quote-part.
    expect(res.body.data.valuation.estimatedValue).toBe(10000000);
    expect(res.body.data.latentCapitalGain).toBeCloseTo(2000000);
    expect(res.body.data.loans[0].remainingCapital).toBe(1000000);
  });
});

describe('Réglage agence — GET|PUT /tenants/:tenantId/settings/owner-portal', () => {
  it('protège la lecture et l’écriture par les permissions des paramètres de l’agence', async () => {
    await request(app).get(`/api/tenants/${TENANT_A}/settings/owner-portal`).set('x-test-user', USER_OUMAR);
    await request(app)
      .put(`/api/tenants/${TENANT_A}/settings/owner-portal`)
      .set('x-test-user', USER_OUMAR)
      .send({ patrimonyEnabled: false });

    expect(mockPermissionsAsked).toEqual(expect.arrayContaining(['TENANT_SETTINGS_VIEW', 'TENANT_SETTINGS_EDIT']));
  });

  it('GET renvoie les valeurs par défaut sans rien écrire pour une agence jamais paramétrée', async () => {
    const res = await request(app).get(`/api/tenants/${TENANT_A}/settings/owner-portal`).set('x-test-user', USER_OUMAR);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      patrimonyEnabled: true,
      patrimonyShowValuation: true,
      patrimonyShowYield: true,
      patrimonyShowLoans: true,
      patrimonyShowWorks: true,
      patrimonyShowDocuments: true
    });
    expect(mockPrisma.ownerPortalSettings.upsert).not.toHaveBeenCalled();
  });

  it('PUT partiel ne modifie que les champs fournis', async () => {
    const put = await request(app)
      .put(`/api/tenants/${TENANT_A}/settings/owner-portal`)
      .set('x-test-user', USER_OUMAR)
      .send({ patrimonyShowLoans: false });

    expect(put.status).toBe(200);
    expect(put.body.data).toMatchObject({
      patrimonyEnabled: true,
      patrimonyShowLoans: false,
      patrimonyShowDocuments: true
    });

    const put2 = await request(app)
      .put(`/api/tenants/${TENANT_A}/settings/owner-portal`)
      .set('x-test-user', USER_OUMAR)
      .send({ patrimonyEnabled: false });

    expect(put2.status).toBe(200);
    // Le premier PUT reste acquis : un PUT partiel ne réinitialise pas le reste.
    expect(put2.body.data).toMatchObject({ patrimonyEnabled: false, patrimonyShowLoans: false });
  });

  it('corps invalide → 400', async () => {
    const res = await request(app)
      .put(`/api/tenants/${TENANT_A}/settings/owner-portal`)
      .set('x-test-user', USER_OUMAR)
      .send({ patrimonyEnabled: 'oui' });

    expect(res.status).toBe(400);
    expect(mockPrisma.ownerPortalSettings.upsert).not.toHaveBeenCalled();
  });
});
