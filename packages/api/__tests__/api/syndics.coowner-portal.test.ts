/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Portail copropriétaire — étanchéité, invitation et révocation, de bout en
 * bout sur HTTP.
 *
 * La pile est la vraie : garde `requireCoOwnerPortalAccess`, lectures du
 * portail, `requireTenantAccess` + permissions de rôle sur les routes de
 * gestion, invitation et révocation. Seules changent la session (un en-tête
 * `x-test-user` tient lieu de jeton) et la base, remplacée par une base en
 * mémoire qui applique réellement les filtres `where`
 * (`__tests__/helpers/fake-prisma.ts`) : une fuite entre copropriétaires ou
 * entre agences s'y verrait comme sur Postgres.
 *
 * Jeu de données :
 *   Agence A — copropriété S1 (lots L1 de Awa, L2 de Bakary), copropriété S2
 *              (lot L3 de Awa) ; gestionnaire Mariam.
 *   Agence B — copropriété SB (lot LB de Awa, sous une autre fiche CRM).
 */

import * as os from 'os';
import * as path from 'path';
import { promises as fs } from 'fs';

// Racine des fichiers déposés, lue par config/env au premier import : à
// poser AVANT d'importer l'application.
const UPLOADS_ROOT = path.join(os.tmpdir(), `coowner-portal-test-${process.pid}`);
process.env.UPLOADS_DIR = UPLOADS_ROOT;

import express from 'express';
import request from 'supertest';
import { createFakePrisma } from '../helpers/fake-prisma';

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

const mockSendInvitation = jest.fn(async (_params: any) => undefined);
jest.mock('../../src/services/email-service', () => ({
  ...jest.requireActual('../../src/services/email-service'),
  isEmailDeliveryConfigured: () => true,
  emailService: {
    sendCoOwnerPortalInvitationEmail: (params: any) => mockSendInvitation(params),
    sendEmail: jest.fn()
  }
}));

jest.mock('../../src/services/audit-service', () => ({
  logAuditEvent: jest.fn(),
  flushAuditQueue: jest.fn()
}));

import coOwnerPortalRoutes from '../../src/routes/coowner-portal-routes';
import syndicRoutes from '../../src/routes/syndic-routes';
import { errorHandler } from '../../src/middleware/error-middleware';
import { clearPermissionCache } from '../../src/services/permission-service';

const app = express();
app.use(express.json());
app.use('/api/portal/copropriete', coOwnerPortalRoutes);
app.use('/api', syndicRoutes);
app.use(errorHandler);

// --- Identifiants -----------------------------------------------------------

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const TENANT_A = 'tenant-a';
const TENANT_B = 'tenant-b';
const TENANT_C = 'tenant-c';

const S1 = id(101);
const S2 = id(102);
const SB = id(103);
const L1 = id(201);
const L2 = id(202);
const L3 = id(203);
const LB = id(204);
const L4 = id(205);

const CONTACT_AWA = 'contact-awa';
const CONTACT_BAKARY = 'contact-bakary';
const CONTACT_AWA_IN_B = 'contact-awa-b';
const CONTACT_CHEICK = 'contact-cheick';
const CONTACT_NO_EMAIL = 'contact-sans-email';

const PROFILE_AWA_L1 = id(301);
const PROFILE_BAKARY_L2 = id(302);
const PROFILE_AWA_L3 = id(303);
const PROFILE_AWA_LB = id(304);
const PROFILE_CHEICK_L4 = id(305);
const PROFILE_NO_EMAIL = id(306);

const USER_AWA = 'user-awa';
const USER_BAKARY = 'user-bakary';
const USER_MANAGER = 'user-mariam';

const ACCOUNT_L1 = id(401);
const ACCOUNT_L2 = id(402);
const CALL_L1 = id(501);
const CALL_L2 = id(502);
const DOC_REGULATION = id(601);
const DOC_INSURANCE = id(602);
const DOC_MINUTES = id(603);
const DOC_SB = id(604);
const MEETING_DONE = id(701);
const MEETING_PLANNED = id(702);
const RESOLUTION = id(801);

const PAST = new Date('2026-01-10T00:00:00.000Z');
const FUTURE = new Date('2099-01-10T00:00:00.000Z');

function seed() {
  mockPrisma.reset();
  clearPermissionCache();
  mockSendInvitation.mockClear();

  mockPrisma.tenant.rows.push(
    { id: TENANT_A, name: 'Agence Plateau', status: 'ACTIVE' },
    { id: TENANT_B, name: 'Agence Cocody', status: 'ACTIVE' },
    { id: TENANT_C, name: 'Agence Yopougon', status: 'ACTIVE' }
  );

  mockPrisma.user.rows.push(
    {
      id: USER_AWA,
      email: 'awa@example.com',
      fullName: 'Awa Konan',
      globalRole: 'USER',
      emailVerified: true,
      lastLoginAt: new Date(),
      googleId: null,
      isActive: true,
      preferredLanguage: null
    },
    {
      id: USER_BAKARY,
      email: 'bakary@example.com',
      fullName: 'Bakary Traoré',
      globalRole: 'USER',
      emailVerified: true,
      lastLoginAt: new Date(),
      googleId: null,
      isActive: true,
      preferredLanguage: null
    },
    {
      id: USER_MANAGER,
      email: 'mariam@agence.ci',
      fullName: 'Mariam',
      globalRole: 'USER',
      emailVerified: true,
      lastLoginAt: new Date(),
      googleId: null,
      isActive: true,
      preferredLanguage: null
    }
  );

  // Gestionnaire de l'agence A : adhésion active et rôle d'agence.
  mockPrisma.membership.rows.push({ id: 'm-1', userId: USER_MANAGER, tenantId: TENANT_A, status: 'ACTIVE' });
  mockPrisma.userRole.rows.push({
    id: 'ur-1',
    userId: USER_MANAGER,
    tenantId: TENANT_A,
    role: {
      scope: 'TENANT',
      permissions: [{ permission: { key: 'PROPERTIES_VIEW' } }, { permission: { key: 'PROPERTIES_EDIT' } }]
    }
  });

  mockPrisma.crmContact.rows.push(
    {
      id: CONTACT_AWA,
      tenantId: TENANT_A,
      firstName: 'Awa',
      lastName: 'Konan',
      legalName: null,
      email: 'awa@example.com'
    },
    {
      id: CONTACT_BAKARY,
      tenantId: TENANT_A,
      firstName: 'Bakary',
      lastName: 'Traoré',
      legalName: null,
      email: 'bakary@example.com'
    },
    {
      id: CONTACT_AWA_IN_B,
      tenantId: TENANT_B,
      firstName: 'Awa',
      lastName: 'Konan',
      legalName: null,
      email: 'awa@example.com'
    },
    {
      id: CONTACT_CHEICK,
      tenantId: TENANT_A,
      firstName: 'Cheick',
      lastName: 'Diallo',
      legalName: null,
      email: 'cheick@example.com'
    },
    { id: CONTACT_NO_EMAIL, tenantId: TENANT_A, firstName: 'Sans', lastName: 'Adresse', legalName: null, email: '' }
  );

  mockPrisma.tenantClient.rows.push(
    {
      id: 'tc-awa-a',
      userId: USER_AWA,
      tenantId: TENANT_A,
      clientType: 'CO_OWNER',
      createdAt: new Date('2026-01-01'),
      details: { crmContactId: CONTACT_AWA, syndicCoOwnerContactIds: [CONTACT_AWA] }
    },
    {
      id: 'tc-awa-b',
      userId: USER_AWA,
      tenantId: TENANT_B,
      clientType: 'CO_OWNER',
      createdAt: new Date('2026-02-01'),
      details: { crmContactId: CONTACT_AWA_IN_B, syndicCoOwnerContactIds: [CONTACT_AWA_IN_B] }
    },
    {
      id: 'tc-bakary-a',
      userId: USER_BAKARY,
      tenantId: TENANT_A,
      clientType: 'CO_OWNER',
      createdAt: new Date('2026-01-01'),
      details: { crmContactId: CONTACT_BAKARY, syndicCoOwnerContactIds: [CONTACT_BAKARY] }
    }
  );

  mockPrisma.syndicate.rows.push(
    { id: S1, tenantId: TENANT_A, name: 'Résidence Les Acacias', address: 'Plateau' },
    { id: S2, tenantId: TENANT_A, name: 'Résidence Les Palmiers', address: 'Plateau' },
    { id: SB, tenantId: TENANT_B, name: 'Résidence Cocody', address: 'Cocody' }
  );

  const lot = (
    lotId: string,
    syndicateId: string,
    lotNumber: string,
    generalShares: number,
    ownerContactId: string
  ) => ({
    id: lotId,
    syndicateId,
    lotNumber,
    lotType: 'APARTMENT',
    generalShares,
    specialShares: null,
    coownerId: ownerContactId,
    ownerContactId
  });
  mockPrisma.syndicateLot.rows.push(
    lot(L1, S1, 'A1', 400, CONTACT_AWA),
    lot(L2, S1, 'A2', 600, CONTACT_BAKARY),
    lot(L3, S2, 'P1', 1000, CONTACT_AWA),
    lot(LB, SB, 'C1', 1000, CONTACT_AWA_IN_B),
    lot(L4, S2, 'P2', 500, CONTACT_CHEICK)
  );

  const profile = (profileId: string, lotId: string, contactId: string, portalAccessEnabled = true) => ({
    id: profileId,
    lotId,
    contactId,
    ownershipPercentage: 100,
    ownedSince: PAST,
    ownedUntil: null,
    portalAccessEnabled,
    portalAccessToken: portalAccessEnabled ? `token-${profileId}` : null,
    isActive: true,
    createdAt: PAST
  });
  mockPrisma.lotOwnerProfile.rows.push(
    profile(PROFILE_AWA_L1, L1, CONTACT_AWA),
    profile(PROFILE_BAKARY_L2, L2, CONTACT_BAKARY),
    profile(PROFILE_AWA_L3, L3, CONTACT_AWA),
    profile(PROFILE_AWA_LB, LB, CONTACT_AWA_IN_B),
    profile(PROFILE_CHEICK_L4, L4, CONTACT_CHEICK, false),
    profile(PROFILE_NO_EMAIL, L4, CONTACT_NO_EMAIL, false)
  );

  mockPrisma.ownerAccount.rows.push(
    {
      id: ACCOUNT_L1,
      syndicateId: S1,
      lotId: L1,
      contactId: CONTACT_AWA,
      balance: 70000,
      currency: 'XOF',
      lastUpdatedAt: PAST
    },
    {
      id: ACCOUNT_L2,
      syndicateId: S1,
      lotId: L2,
      contactId: CONTACT_BAKARY,
      balance: -20000,
      currency: 'XOF',
      lastUpdatedAt: PAST
    }
  );
  mockPrisma.ownerAccountTransaction.rows.push(
    {
      id: 'tx-1',
      accountId: ACCOUNT_L1,
      transactionDate: PAST,
      createdAt: PAST,
      type: 'CHARGE_CALL',
      debit: 100000,
      credit: null,
      balanceAfter: 100000,
      label: 'Appel T1',
      reference: null
    },
    {
      id: 'tx-2',
      accountId: ACCOUNT_L1,
      transactionDate: new Date('2026-01-20'),
      createdAt: new Date('2026-01-20'),
      type: 'PAYMENT',
      debit: null,
      credit: 30000,
      balanceAfter: 70000,
      label: 'Paiement',
      reference: null
    },
    {
      id: 'tx-bakary',
      accountId: ACCOUNT_L2,
      transactionDate: PAST,
      createdAt: PAST,
      type: 'PAYMENT',
      debit: null,
      credit: 20000,
      balanceAfter: -20000,
      label: 'Avance Bakary',
      reference: null
    }
  );

  mockPrisma.chargeCall.rows.push(
    {
      id: CALL_L1,
      syndicateId: S1,
      lotId: L1,
      period: '2026-T1',
      amount: 100000,
      currency: 'XOF',
      dueDate: PAST,
      status: 'PARTIAL',
      createdAt: PAST
    },
    {
      id: CALL_L2,
      syndicateId: S1,
      lotId: L2,
      period: '2026-T1',
      amount: 150000,
      currency: 'XOF',
      dueDate: FUTURE,
      status: 'PENDING',
      createdAt: PAST
    }
  );
  mockPrisma.chargePayment.rows.push(
    { id: 'pay-1', chargeCallId: CALL_L1, amount: 30000 },
    { id: 'pay-2', chargeCallId: CALL_L2, amount: 1000 }
  );

  mockPrisma.syndicateDocument.rows.push(
    {
      id: DOC_REGULATION,
      syndicateId: S1,
      title: 'Reglement',
      type: 'REGULATION',
      fileUrl: `/uploads/syndics/${S1}/documents/reglement.pdf`,
      createdAt: PAST
    },
    {
      id: DOC_INSURANCE,
      syndicateId: S1,
      title: 'Assurance',
      type: 'INSURANCE',
      fileUrl: `/uploads/syndics/${S1}/documents/assurance.pdf`,
      createdAt: PAST
    },
    {
      id: DOC_MINUTES,
      syndicateId: S1,
      title: 'PV AG 2025',
      type: 'GENERAL_MEETING_MINUTES',
      fileUrl: 'https://docs.example.com/pv.pdf',
      createdAt: PAST
    },
    {
      id: DOC_SB,
      syndicateId: SB,
      title: 'Reglement Cocody',
      type: 'REGULATION',
      fileUrl: `/uploads/syndics/${SB}/documents/reglement.pdf`,
      createdAt: PAST
    }
  );

  mockPrisma.generalMeeting.rows.push(
    {
      id: MEETING_DONE,
      syndicateId: S1,
      type: 'ORDINARY',
      scheduledAt: PAST,
      location: 'Salle A',
      status: 'COMPLETED',
      createdAt: PAST
    },
    {
      id: MEETING_PLANNED,
      syndicateId: S1,
      type: 'ORDINARY',
      scheduledAt: FUTURE,
      location: 'Salle B',
      status: 'PLANNED',
      createdAt: PAST
    }
  );
  mockPrisma.gMAgendaItem.rows.push(
    { id: 'ag-1', meetingId: MEETING_PLANNED, orderIndex: 1, title: 'Budget 2027', createdAt: PAST },
    { id: 'ag-2', meetingId: MEETING_DONE, orderIndex: 1, title: 'Ravalement', createdAt: PAST }
  );
  mockPrisma.gMResolution.rows.push({
    id: RESOLUTION,
    meetingId: MEETING_DONE,
    title: 'Ravalement de facade',
    description: null,
    majorityRule: 'ARTICLE_24',
    result: 'REJECTED',
    createdAt: PAST
  });
  mockPrisma.gMVote.rows.push(
    { id: 'v-1', resolutionId: RESOLUTION, lotId: L1, vote: 'FOR' },
    { id: 'v-2', resolutionId: RESOLUTION, lotId: L2, vote: 'AGAINST' }
  );
}

const as = (userId: string) => ({ 'x-test-user': userId });

beforeAll(async () => {
  await fs.mkdir(path.join(UPLOADS_ROOT, 'syndics', S1, 'documents'), { recursive: true });
  await fs.writeFile(path.join(UPLOADS_ROOT, 'syndics', S1, 'documents', 'reglement.pdf'), 'PDF-REGLEMENT');
  await fs.mkdir(path.join(UPLOADS_ROOT, 'syndics', SB, 'documents'), { recursive: true });
  await fs.writeFile(path.join(UPLOADS_ROOT, 'syndics', SB, 'documents', 'reglement.pdf'), 'PDF-B');
});

afterAll(async () => {
  await fs.rm(UPLOADS_ROOT, { recursive: true, force: true });
});

beforeEach(seed);

describe('Portail copropriétaire — ce que voit chaque copropriétaire', () => {
  it('liste ses lots dans toutes les copropriétés de l’agence, et seulement les siens', async () => {
    const res = await request(app).get('/api/portal/copropriete/lots').set(as(USER_AWA));

    expect(res.status).toBe(200);
    const ids = res.body.data.map((lot: any) => lot.id).sort();
    expect(ids).toEqual([L1, L3].sort());
    const l1 = res.body.data.find((lot: any) => lot.id === L1);
    expect(l1).toMatchObject({
      lotNumber: 'A1',
      lotType: 'APARTMENT',
      generalShares: 400,
      syndicate: { name: 'Résidence Les Acacias' },
      balance: { amount: 70000, direction: 'DEBITEUR', currency: 'XOF' }
    });
    expect(res.body.data.find((lot: any) => lot.id === L3).balance).toBeNull();
  });

  it('le copropriétaire B ne voit que son lot, avec un solde créditeur en valeur absolue', async () => {
    const res = await request(app).get('/api/portal/copropriete/lots').set(as(USER_BAKARY));

    expect(res.status).toBe(200);
    expect(res.body.data.map((lot: any) => lot.id)).toEqual([L2]);
    expect(res.body.data[0].balance).toMatchObject({ amount: 20000, direction: 'CREDITEUR' });
  });

  it('compte de son lot : solde et mouvements de CE lot uniquement', async () => {
    const res = await request(app).get(`/api/portal/copropriete/lots/${L1}/compte`).set(as(USER_AWA));

    expect(res.status).toBe(200);
    expect(res.body.data.account).toMatchObject({ amount: 70000, direction: 'DEBITEUR' });
    expect(res.body.data.transactions.map((tx: any) => tx.id)).toEqual(['tx-2', 'tx-1']);
  });

  it('A ne lit pas le compte du lot de B dans la même copropriété : 404, comme un lot inexistant', async () => {
    const res = await request(app).get(`/api/portal/copropriete/lots/${L2}/compte`).set(as(USER_AWA));
    const inexistant = await request(app)
      .get(`/api/portal/copropriete/lots/${id(999)}/compte`)
      .set(as(USER_AWA));

    expect(res.status).toBe(404);
    expect(inexistant.status).toBe(404);
    expect(res.body.message).toBe(inexistant.body.message);
    expect(JSON.stringify(res.body)).not.toContain('Avance Bakary');
  });

  it('appels de charges : montant, payé, reste, échéance et statut « En retard » dérivé', async () => {
    const res = await request(app).get('/api/portal/copropriete/appels').set(as(USER_AWA));

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0]).toMatchObject({
      id: CALL_L1,
      amount: 100000,
      paid: 30000,
      outstanding: 70000,
      status: 'OVERDUE',
      lot: { lotNumber: 'A1' }
    });
  });

  it('A ne voit pas les appels du lot de B, ni en les filtrant par son identifiant', async () => {
    const all = await request(app).get('/api/portal/copropriete/appels').set(as(USER_AWA));
    const filtered = await request(app).get(`/api/portal/copropriete/appels?lotId=${L2}`).set(as(USER_AWA));

    expect(all.body.data.map((call: any) => call.id)).not.toContain(CALL_L2);
    expect(filtered.status).toBe(404);
  });

  it('documents : règlement et procès-verbaux de SES copropriétés, jamais les autres types', async () => {
    const res = await request(app).get('/api/portal/copropriete/documents').set(as(USER_AWA));

    expect(res.status).toBe(200);
    const ids = res.body.data.map((doc: any) => doc.id).sort();
    expect(ids).toEqual([DOC_REGULATION, DOC_MINUTES].sort());
    expect(res.body.data.find((doc: any) => doc.id === DOC_REGULATION)).toMatchObject({
      downloadable: true,
      externalUrl: null
    });
    // Le chemin du fichier déposé n'est jamais exposé.
    expect(JSON.stringify(res.body)).not.toContain('/uploads/');
  });

  it('téléchargement : son règlement oui ; un document d’un autre type ou d’une autre agence, 404', async () => {
    const own = await request(app)
      .get(`/api/portal/copropriete/documents/${DOC_REGULATION}/fichier`)
      .set(as(USER_AWA))
      .buffer(true)
      .parse((response, callback) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => callback(null, Buffer.concat(chunks)));
      });
    const insurance = await request(app)
      .get(`/api/portal/copropriete/documents/${DOC_INSURANCE}/fichier`)
      .set(as(USER_AWA));
    const otherAgency = await request(app).get(`/api/portal/copropriete/documents/${DOC_SB}/fichier`).set(as(USER_AWA));

    expect(own.status).toBe(200);
    expect(own.headers['content-type']).toContain('application/pdf');
    expect((own.body as Buffer).toString()).toBe('PDF-REGLEMENT');
    expect(own.headers['content-disposition']).toContain('Reglement.pdf');
    expect(insurance.status).toBe(404);
    expect(otherAgency.status).toBe(404);
  });

  it('assemblées : date, lieu, ordre du jour ; résultats seulement après clôture, sans le vote des autres lots', async () => {
    const res = await request(app).get('/api/portal/copropriete/assemblees').set(as(USER_AWA));

    expect(res.status).toBe(200);
    const done = res.body.data.find((meeting: any) => meeting.id === MEETING_DONE);
    const planned = res.body.data.find((meeting: any) => meeting.id === MEETING_PLANNED);
    expect(planned).toMatchObject({ location: 'Salle B', status: 'PLANNED', resolutions: [] });
    expect(planned.agenda.map((item: any) => item.title)).toEqual(['Budget 2027']);
    expect(done.resolutions).toHaveLength(1);
    expect(done.resolutions[0]).toMatchObject({
      title: 'Ravalement de facade',
      rule: 'ARTICLE_24',
      result: 'REJECTED',
      sharesFor: 400,
      sharesAgainst: 600,
      totalShares: 1000,
      myVotes: [{ lotNumber: 'A1', vote: 'FOR' }]
    });
    expect(JSON.stringify(res.body)).not.toContain(CONTACT_BAKARY);
    expect(JSON.stringify(res.body)).not.toContain('A2');
  });
});

describe('Portail copropriétaire — étanchéité entre agences', () => {
  it("sans en-tête : l'agence la plus ancienne, et rien de l'autre agence", async () => {
    const lots = await request(app).get('/api/portal/copropriete/lots').set(as(USER_AWA));
    const docs = await request(app).get('/api/portal/copropriete/documents').set(as(USER_AWA));

    expect(lots.body.data.map((lot: any) => lot.id)).not.toContain(LB);
    expect(docs.body.data.map((doc: any) => doc.id)).not.toContain(DOC_SB);
  });

  it('avec X-Portal-Tenant-Id : les lots de CETTE agence seulement', async () => {
    const res = await request(app)
      .get('/api/portal/copropriete/lots')
      .set({ ...as(USER_AWA), 'X-Portal-Tenant-Id': TENANT_B });

    expect(res.status).toBe(200);
    expect(res.body.data.map((lot: any) => lot.id)).toEqual([LB]);
  });

  it("un lot de l'agence A demandé depuis le portail de l'agence B : 404", async () => {
    const res = await request(app)
      .get(`/api/portal/copropriete/lots/${L1}/compte`)
      .set({ ...as(USER_AWA), 'X-Portal-Tenant-Id': TENANT_B });

    expect(res.status).toBe(404);
  });

  it("une agence où le compte n'est pas copropriétaire : 403", async () => {
    const res = await request(app)
      .get('/api/portal/copropriete/lots')
      .set({ ...as(USER_AWA), 'X-Portal-Tenant-Id': TENANT_C });

    expect(res.status).toBe(403);
  });

  it('agence suspendue : 403 TENANT_SUSPENDED', async () => {
    mockPrisma.tenant.rows.find(tenant => tenant.id === TENANT_B)!.status = 'SUSPENDED';
    const res = await request(app)
      .get('/api/portal/copropriete/lots')
      .set({ ...as(USER_AWA), 'X-Portal-Tenant-Id': TENANT_B });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('TENANT_SUSPENDED');
  });

  it('une fiche CRM listée dans details mais appartenant à une autre agence ne donne rien', async () => {
    // Détails trafiqués : le contact de l'agence B glissé dans le rattachement A.
    mockPrisma.tenantClient.rows.find(client => client.id === 'tc-bakary-a')!.details = {
      syndicCoOwnerContactIds: [CONTACT_AWA_IN_B]
    };
    const res = await request(app).get('/api/portal/copropriete/lots').set(as(USER_BAKARY));

    expect(res.status).toBe(403);
  });
});

describe('Portail copropriétaire — le jeton de portail n’ouvre aucune route de gestion', () => {
  it('lister les lots de la copropriété par la route de gestion : 403', async () => {
    const res = await request(app).get(`/api/tenants/${TENANT_A}/syndics/${S1}/lots`).set(as(USER_AWA));
    expect(res.status).toBe(403);
  });

  it("lire les profils propriétaires ou le compte d'un lot par les routes de gestion : 403", async () => {
    const profiles = await request(app)
      .get(`/api/tenants/${TENANT_A}/syndics/${S1}/profils/proprietaires`)
      .set(as(USER_AWA));
    const account = await request(app)
      .get(`/api/tenants/${TENANT_A}/syndics/${S1}/lots/${L2}/compte`)
      .set(as(USER_AWA));
    expect(profiles.status).toBe(403);
    expect(account.status).toBe(403);
  });

  it("s'inviter soi-même ou révoquer un autre copropriétaire : 403", async () => {
    const invite = await request(app)
      .post(`/api/tenants/${TENANT_A}/syndics/${S1}/profils/proprietaires/${PROFILE_BAKARY_L2}/invitation-portail`)
      .set(as(USER_AWA));
    const revoke = await request(app)
      .delete(`/api/tenants/${TENANT_A}/syndics/${S1}/profils/proprietaires/${PROFILE_BAKARY_L2}/invitation-portail`)
      .set(as(USER_AWA));
    expect(invite.status).toBe(403);
    expect(revoke.status).toBe(403);
    expect(mockPrisma.lotOwnerProfile.rows.find(p => p.id === PROFILE_BAKARY_L2)!.portalAccessEnabled).toBe(true);
  });

  it('sans session : 401', async () => {
    const res = await request(app).get('/api/portal/copropriete/lots');
    expect(res.status).toBe(401);
  });
});

describe('Gestionnaire — inviter au portail', () => {
  const inviteUrl = (syndicateId: string, profileId: string) =>
    `/api/tenants/${TENANT_A}/syndics/${syndicateId}/profils/proprietaires/${profileId}/invitation-portail`;

  it("contact sans compte : compte créé, lien d'activation affiché, e-mail envoyé, lots ouverts", async () => {
    const res = await request(app).post(inviteUrl(S2, PROFILE_CHEICK_L4)).set(as(USER_MANAGER));

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      email: 'cheick@example.com',
      contactName: 'Cheick Diallo',
      accountStatus: 'NEW_ACCOUNT',
      emailSent: true,
      openedLots: 1
    });
    expect(res.body.data.invitationUrl).toMatch(/\/reset-password\?token=[0-9a-f-]{36}$/);
    expect(res.body.data.expiresAt).toBeTruthy();

    const user = mockPrisma.user.rows.find(row => row.email === 'cheick@example.com')!;
    expect(user).toMatchObject({ globalRole: 'USER', emailVerified: false });
    const token = res.body.data.invitationUrl.split('token=')[1];
    expect(mockPrisma.passwordResetToken.rows).toEqual([expect.objectContaining({ token, userId: user.id })]);
    const client = mockPrisma.tenantClient.rows.find(row => row.userId === user.id)!;
    expect(client).toMatchObject({ tenantId: TENANT_A, clientType: 'CO_OWNER' });
    expect(client.details.syndicCoOwnerContactIds).toEqual([CONTACT_CHEICK]);
    expect(mockPrisma.lotOwnerProfile.rows.find(p => p.id === PROFILE_CHEICK_L4)!.portalAccessEnabled).toBe(true);
    expect(mockSendInvitation).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'cheick@example.com', isActivation: true, tenantId: TENANT_A })
    );

    // Et le nouveau compte voit son lot, et lui seul.
    const lots = await request(app).get('/api/portal/copropriete/lots').set(as(user.id));
    expect(lots.status).toBe(200);
    expect(lots.body.data.map((lot: any) => lot.id)).toEqual([L4]);
  });

  it("le lien reste affiché quand l'e-mail échoue", async () => {
    mockSendInvitation.mockRejectedValueOnce(new Error('SMTP indisponible'));
    const res = await request(app).post(inviteUrl(S2, PROFILE_CHEICK_L4)).set(as(USER_MANAGER));

    expect(res.status).toBe(201);
    expect(res.body.data.emailSent).toBe(false);
    expect(res.body.data.invitationUrl).toContain('/reset-password?token=');
  });

  it('compte déjà utilisé : aucun lien de réinitialisation, seulement le lien de connexion', async () => {
    const res = await request(app).post(inviteUrl(S1, PROFILE_BAKARY_L2)).set(as(USER_MANAGER));

    expect(res.status).toBe(201);
    expect(res.body.data.accountStatus).toBe('EXISTING_ACCOUNT');
    expect(res.body.data.invitationUrl).toMatch(/\/login\?redirect=%2Fcopropriete$/);
    expect(res.body.data.expiresAt).toBeNull();
    expect(mockPrisma.passwordResetToken.rows).toHaveLength(0);
  });

  it("compte jamais activé et rattaché ailleurs : pas de nouveau lien d'activation", async () => {
    mockPrisma.user.rows.push({
      id: 'user-cheick',
      email: 'cheick@example.com',
      fullName: null,
      globalRole: 'USER',
      emailVerified: false,
      lastLoginAt: null,
      googleId: null,
      isActive: true,
      preferredLanguage: null
    });
    mockPrisma.tenantClient.rows.push({
      id: 'tc-cheick-c',
      userId: 'user-cheick',
      tenantId: TENANT_C,
      clientType: 'RENTER',
      createdAt: PAST,
      details: {}
    });

    const res = await request(app).post(inviteUrl(S2, PROFILE_CHEICK_L4)).set(as(USER_MANAGER));

    expect(res.body.data.accountStatus).toBe('EXISTING_ACCOUNT');
    expect(mockPrisma.passwordResetToken.rows).toHaveLength(0);
  });

  it("compte jamais activé, sans autre rattachement : nouveau lien, l'ancien est invalidé", async () => {
    mockPrisma.user.rows.push({
      id: 'user-cheick',
      email: 'cheick@example.com',
      fullName: null,
      globalRole: 'USER',
      emailVerified: false,
      lastLoginAt: null,
      googleId: null,
      isActive: true,
      preferredLanguage: null
    });
    mockPrisma.passwordResetToken.rows.push({ id: 'old', token: 'old-token', userId: 'user-cheick', used: false });

    const res = await request(app).post(inviteUrl(S2, PROFILE_CHEICK_L4)).set(as(USER_MANAGER));

    expect(res.body.data.accountStatus).toBe('ACTIVATION_RENEWED');
    expect(mockPrisma.passwordResetToken.rows.find(row => row.id === 'old')!.used).toBe(true);
    expect(mockPrisma.passwordResetToken.rows.filter(row => !row.used)).toHaveLength(1);
  });

  it('un rattachement existant (locataire) garde son type et gagne le lien de copropriété', async () => {
    mockPrisma.tenantClient.rows.find(row => row.id === 'tc-bakary-a')!.clientType = 'RENTER';
    mockPrisma.tenantClient.rows.find(row => row.id === 'tc-bakary-a')!.details = { crmContactId: CONTACT_BAKARY };

    await request(app).post(inviteUrl(S1, PROFILE_BAKARY_L2)).set(as(USER_MANAGER)).expect(201);

    const client = mockPrisma.tenantClient.rows.find(row => row.id === 'tc-bakary-a')!;
    expect(client.clientType).toBe('RENTER');
    expect(client.details).toEqual({ crmContactId: CONTACT_BAKARY, syndicCoOwnerContactIds: [CONTACT_BAKARY] });
  });

  it('contact sans e-mail : 400, rien n’est créé', async () => {
    const res = await request(app).post(inviteUrl(S2, PROFILE_NO_EMAIL)).set(as(USER_MANAGER));

    expect(res.status).toBe(400);
    expect(mockPrisma.tenantClient.rows).toHaveLength(3);
  });

  it("profil d'une autre copropriété ou d'une autre agence : 404", async () => {
    const otherSyndicate = await request(app).post(inviteUrl(S1, PROFILE_CHEICK_L4)).set(as(USER_MANAGER));
    const otherAgency = await request(app).post(inviteUrl(S1, PROFILE_AWA_LB)).set(as(USER_MANAGER));
    const syndicateOfB = await request(app).post(inviteUrl(SB, PROFILE_AWA_LB)).set(as(USER_MANAGER));

    expect(otherSyndicate.status).toBe(404);
    expect(otherAgency.status).toBe(404);
    expect(syndicateOfB.status).toBe(404);
  });
});

describe('Gestionnaire — révoquer l’accès', () => {
  it('ferme tous les lots du contact dans l’agence, et le portail refuse aussitôt', async () => {
    const res = await request(app)
      .delete(`/api/tenants/${TENANT_A}/syndics/${S1}/profils/proprietaires/${PROFILE_AWA_L1}/invitation-portail`)
      .set(as(USER_MANAGER));

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ closedLots: 2, unlinkedAccounts: 1 });
    expect(mockPrisma.lotOwnerProfile.rows.find(p => p.id === PROFILE_AWA_L1)).toMatchObject({
      portalAccessEnabled: false,
      portalAccessToken: null
    });
    expect(mockPrisma.lotOwnerProfile.rows.find(p => p.id === PROFILE_AWA_L3)!.portalAccessEnabled).toBe(false);
    // L'autre agence n'est pas touchée.
    expect(mockPrisma.lotOwnerProfile.rows.find(p => p.id === PROFILE_AWA_LB)!.portalAccessEnabled).toBe(true);

    const portal = await request(app).get('/api/portal/copropriete/lots').set(as(USER_AWA));
    // Plus aucun accès dans l'agence A ; l'agence B reste ouverte (défaut : la
    // seule agence restante où le compte est copropriétaire).
    expect(portal.status).toBe(200);
    expect(portal.body.data.map((lot: any) => lot.id)).toEqual([LB]);
    const inA = await request(app)
      .get('/api/portal/copropriete/lots')
      .set({ ...as(USER_AWA), 'X-Portal-Tenant-Id': TENANT_A });
    expect(inA.status).toBe(403);
  });

  it('décocher « Activer accès portail » sur tous ses profils coupe aussi l’accès', async () => {
    mockPrisma.lotOwnerProfile.rows.find(p => p.id === PROFILE_BAKARY_L2)!.portalAccessEnabled = false;
    const res = await request(app).get('/api/portal/copropriete/lots').set(as(USER_BAKARY));
    expect(res.status).toBe(403);
  });
});

/** Lit une réponse binaire en Buffer (supertest ne parse pas un PDF). */
function binary(response: any, callback: (error: Error | null, body: Buffer) => void) {
  const chunks: Buffer[] = [];
  response.on('data', (chunk: Buffer) => chunks.push(chunk));
  response.on('end', () => callback(null, Buffer.concat(chunks)));
}

describe('Gestionnaire — télécharger un document de copropriété (jamais en statique)', () => {
  const fileUrl = (syndicateId: string, documentId: string, tenantId = TENANT_A) =>
    `/api/tenants/${tenantId}/syndics/${syndicateId}/documents/${documentId}/fichier`;

  it("télécharge un document d'une copropriété de l'agence", async () => {
    const res = await request(app).get(fileUrl(S1, DOC_REGULATION)).set(as(USER_MANAGER)).buffer(true).parse(binary);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');
    expect((res.body as Buffer).toString()).toBe('PDF-REGLEMENT');
  });

  it("un document d'une autre agence : 404, par la copropriété de l'agence comme par la sienne", async () => {
    const viaOwnSyndicate = await request(app).get(fileUrl(S1, DOC_SB)).set(as(USER_MANAGER));
    const viaForeignSyndicate = await request(app).get(fileUrl(SB, DOC_SB)).set(as(USER_MANAGER));

    expect(viaOwnSyndicate.status).toBe(404);
    expect(viaForeignSyndicate.status).toBe(404);
  });

  it("un document d'une autre copropriété de l'agence, demandé sous la mauvaise copropriété : 404", async () => {
    const res = await request(app).get(fileUrl(S2, DOC_REGULATION)).set(as(USER_MANAGER));
    expect(res.status).toBe(404);
  });

  it('un lien externe ne se télécharge pas : 404', async () => {
    const res = await request(app).get(fileUrl(S1, DOC_MINUTES)).set(as(USER_MANAGER));
    expect(res.status).toBe(404);
  });

  it('un client du portail ne passe pas par la route de gestion : 403', async () => {
    const res = await request(app).get(fileUrl(S1, DOC_INSURANCE)).set(as(USER_AWA));
    expect(res.status).toBe(403);
  });

  it('un dépôt est écrit sous la racine de référence, puis se relit par la route', async () => {
    const created = await request(app)
      .post(`/api/tenants/${TENANT_A}/syndics/${S1}/documents`)
      .set(as(USER_MANAGER))
      .field('title', 'Carnet entretien')
      .field('type', 'OTHER')
      .attach('file', Buffer.from('PDF-CARNET'), { filename: 'carnet.pdf', contentType: 'application/pdf' });

    expect(created.status).toBe(201);
    const storedUrl: string = created.body.data.fileUrl;
    expect(storedUrl).toMatch(new RegExp(`^/uploads/syndics/${S1}/documents/other-[^/]+\.pdf$`));
    const onDisk = path.join(UPLOADS_ROOT, storedUrl.replace(/^\/uploads\//, ''));
    expect((await fs.readFile(onDisk)).toString()).toBe('PDF-CARNET');

    const downloaded = await request(app)
      .get(fileUrl(S1, created.body.data.id))
      .set(as(USER_MANAGER))
      .buffer(true)
      .parse(binary);
    expect(downloaded.status).toBe(200);
    expect((downloaded.body as Buffer).toString()).toBe('PDF-CARNET');
  });
});
