/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * AG en direct (spec 043) — routes gestionnaire et routes publiques par lien
 * personnel, de bout en bout sur HTTP.
 *
 * La pile est la vraie (routeurs, zod, services, secure-links, calculs de
 * quorum et de majorite) ; seuls l'authentification et le RBAC sont remplaces,
 * et la base est une base en memoire qui applique les filtres `where`
 * (`__tests__/helpers/fake-prisma.ts`) : un filtre d'agence oublie laisserait
 * fuir la ligne de l'autre agence.
 *
 * Jeu de donnees (agence A, copropriete S1, AG M1 en cours, date passee) :
 *   L1 100 tantiemes : Awa           L2 200 : Bakary (pouvoir -> Eric)
 *   L3 300 : indivision Awa / Cheick L4 400 : Dieudonne
 *   total 1 000 tantiemes. Agence B : copropriete SB, lot LB, AG MB.
 */

import express from 'express';
import request from 'supertest';
import { createFakePrisma } from '../helpers/fake-prisma';

const mockPrisma = createFakePrisma();
jest.mock('../../src/utils/database', () => ({ prisma: mockPrisma }));

jest.mock('../../src/middleware/auth-middleware', () => ({
  authenticate: (req: any, _res: any, next: any) => {
    req.user = { userId: 'user-manager', globalRole: 'USER' };
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

const mockAudit = jest.fn();
jest.mock('../../src/services/audit-service', () => ({
  logAuditEvent: (...args: unknown[]) => mockAudit(...args),
  recordAuditEvent: jest.fn(),
  flushAuditQueue: jest.fn()
}));

import meetingLivePublicRoutes from '../../src/routes/meeting-live-public-routes';
import syndicRoutes from '../../src/routes/syndic-routes';
import { errorHandler } from '../../src/middleware/error-middleware';
import { meetingLiveTokenKey } from '../../src/middleware/rate-limit-middleware';

const app = express();
// Le routeur public a son propre parseur borne (4 Ko) : monte AVANT le parseur global.
app.use('/api', meetingLivePublicRoutes);
app.use(express.json());
app.use('/api', syndicRoutes);
app.use(errorHandler);

// --- Identifiants -----------------------------------------------------------

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const TENANT_A = 'tenant-a';
const TENANT_B = 'tenant-b';
const S1 = id(101);
const SB = id(102);
const M1 = id(201); // en cours
const M_PLANNED = id(202);
const M_DONE = id(203); // cloturee, votes sans emargement (AG historique)
const MB = id(204);
const L1 = id(301);
const L2 = id(302);
const L3 = id(303);
const L4 = id(304);
const LB = id(305);
const R1 = id(401);
const R2 = id(402);
const R_PLANNED = id(403);
const R_DONE = id(404);
const R_B = id(405);

const AWA = 'contact-awa';
const BAKARY = 'contact-bakary';
const CHEICK = 'contact-cheick';
const DIEU = 'contact-dieu';
const ERIC = 'contact-eric';
const CONTACT_B = 'contact-b';

const base = (syndicateId: string, meetingId: string) =>
  `/api/tenants/${syndicateId === SB ? TENANT_B : TENANT_A}/syndics/${syndicateId}/assemblees/${meetingId}`;
const url = (meetingId: string, suffix: string) => `${base(S1, meetingId)}${suffix}`;

const contactRow = (contactId: string, firstName: string, lastName: string, tenantId = TENANT_A) => ({
  id: contactId,
  tenantId,
  firstName,
  lastName,
  legalName: null,
  email: `${firstName.toLowerCase()}@example.test`,
  phonePrimary: `+22507${contactId.length}`
});

const profile = (contact: ReturnType<typeof contactRow>, percent: number) => ({
  contactId: contact.id,
  ownershipPercentage: percent,
  ownedSince: new Date('2020-01-01T00:00:00Z'),
  ownedUntil: null,
  contact: {
    id: contact.id,
    firstName: contact.firstName,
    lastName: contact.lastName,
    legalName: null,
    email: contact.email
  }
});

function resetWorld(meetingStatus = 'IN_PROGRESS') {
  mockPrisma.reset();
  mockAudit.mockClear();

  mockPrisma.tenant.rows.push(
    { id: TENANT_A, isActive: true, status: 'ACTIVE' },
    { id: TENANT_B, isActive: true, status: 'ACTIVE' }
  );

  const awa = contactRow(AWA, 'Awa', 'Traore');
  const bakary = contactRow(BAKARY, 'Bakary', 'Diallo');
  const cheick = contactRow(CHEICK, 'Cheick', 'Kone');
  const dieu = contactRow(DIEU, 'Dieudonne', 'Yao');
  const eric = contactRow(ERIC, 'Eric', 'Mandataire');
  const contactB = contactRow(CONTACT_B, 'Zoe', 'Autre', TENANT_B);
  mockPrisma.crmContact.rows.push(awa, bakary, cheick, dieu, eric, contactB);

  const syndicate = (sid: string, name: string, tenantId: string) => ({ id: sid, name, tenantId });
  const lot = (
    lotId: string,
    syndicateId: string,
    tenantId: string,
    lotNumber: string,
    shares: number,
    owner: any,
    profiles: any[]
  ) => ({
    id: lotId,
    syndicateId,
    syndicate: { tenantId },
    lotNumber,
    generalShares: shares,
    coownerId: owner?.id ?? null,
    ownerContactId: owner?.id ?? null,
    owner: owner
      ? { id: owner.id, firstName: owner.firstName, lastName: owner.lastName, legalName: null, email: owner.email }
      : null,
    ownerProfiles: profiles
  });
  mockPrisma.syndicateLot.rows.push(
    lot(L1, S1, TENANT_A, 'L1', 100, awa, [profile(awa, 100)]),
    lot(L2, S1, TENANT_A, 'L2', 200, bakary, [profile(bakary, 100)]),
    lot(L3, S1, TENANT_A, 'L3', 300, awa, [profile(awa, 50), profile(cheick, 50)]),
    lot(L4, S1, TENANT_A, 'L4', 400, dieu, [profile(dieu, 100)]),
    lot(LB, SB, TENANT_B, 'LB', 100, contactB, [profile(contactB, 100)])
  );

  const meeting = (mid: string, sid: string, tenantId: string, status: string) => ({
    id: mid,
    syndicateId: sid,
    syndicate: syndicate(sid, sid === SB ? 'Residence B' : 'Residence A', tenantId),
    type: 'ORDINARY',
    status,
    scheduledAt: new Date('2026-10-10T09:00:00Z'),
    startTime: null,
    endTime: null,
    location: 'Salle des fetes',
    videoConferenceUrl: 'https://visio.example.test/room',
    quorum: 0
  });
  mockPrisma.generalMeeting.rows.push(
    meeting(M1, S1, TENANT_A, meetingStatus),
    meeting(M_PLANNED, S1, TENANT_A, 'PLANNED'),
    meeting(M_DONE, S1, TENANT_A, 'COMPLETED'),
    meeting(MB, SB, TENANT_B, 'IN_PROGRESS')
  );

  const resolution = (rid: string, meetingId: string, title: string, voteStatus = 'PENDING') => ({
    id: rid,
    meetingId,
    title,
    description: null,
    majorityRule: 'ARTICLE_24',
    voteStatus,
    voteOpenedAt: null,
    voteClosedAt: null,
    createdAt: new Date('2026-10-01T00:00:00Z')
  });
  mockPrisma.gMResolution.rows.push(
    resolution(R1, M1, 'Budget previsionnel'),
    resolution(R2, M1, 'Travaux de toiture'),
    resolution(R_PLANNED, M_PLANNED, 'Point planifie'),
    resolution(R_DONE, M_DONE, 'Ancienne resolution', 'CLOSED'),
    resolution(R_B, MB, 'Resolution B')
  );

  mockPrisma.gMProxy.rows.push({ id: id(501), meetingId: M1, grantorContactId: BAKARY, representativeContactId: ERIC });
}

/** Cree un lien personnel via la route gestionnaire et rend le jeton (fragment de l'URL). */
async function issueToken(contactId: string, meetingId = M1): Promise<string> {
  const res = await request(app)
    .post(url(meetingId, `/participants/${contactId}/lien`))
    .send({});
  expect(res.status).toBe(200);
  expect(res.body.data.url).toContain('/ag-direct#');
  return String(res.body.data.url).split('#')[1];
}

const pub = (path: string, body: unknown) =>
  request(app)
    .post(`/api/public/assemblees${path}`)
    .send(body as any);
const attendanceOf = (lotId: string, meetingId = M1) =>
  mockPrisma.gMAttendance.rows.find((row: any) => row.lotId === lotId && row.meetingId === meetingId);

beforeEach(() => resetWorld());

// ---------------------------------------------------------------------------
// Gestionnaire
// ---------------------------------------------------------------------------

describe('GET /direct (console du gestionnaire)', () => {
  it('rend la vue : lots avec votants, resolutions, participants, quorum a zero', async () => {
    const res = await request(app).get(url(M1, '/direct'));
    expect(res.status).toBe(200);
    const view = res.body.data;
    expect(view.meeting).toMatchObject({
      id: M1,
      status: 'IN_PROGRESS',
      videoConferenceUrl: 'https://visio.example.test/room'
    });
    expect(view.attendance).toMatchObject({
      totalLots: 4,
      totalShares: 1000,
      presentLots: 0,
      quorumPercent: 0,
      onlineLots: 0
    });
    expect(view.lots).toHaveLength(4);
    const l3 = view.lots.find((lot: any) => lot.lotId === L3);
    expect(l3.voters.map((voter: any) => voter.name)).toEqual(expect.arrayContaining(['Awa Traore', 'Cheick Kone']));
    expect(l3.attendance).toBeNull();
    expect(view.resolutions.map((resolution: any) => resolution.voteStatus)).toEqual(['PENDING', 'PENDING']);
    expect(view.participants).toEqual({ invited: 0, joined: 0, online: 0 });
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('une AG d une autre agence ou d une autre copropriete = 404', async () => {
    // AG MB (agence B) lue par le chemin de l'agence A.
    const res = await request(app).get(`/api/tenants/${TENANT_A}/syndics/${S1}/assemblees/${MB}/direct`);
    expect(res.status).toBe(404);
    const res2 = await request(app).get(`/api/tenants/${TENANT_A}/syndics/${SB}/assemblees/${MB}/direct`);
    expect(res2.status).toBe(404);
  });

  it('AG historique : les lots qui ont vote comptent sans emargement (quorum inchange)', async () => {
    mockPrisma.gMVote.rows.push({ id: id(601), resolutionId: R_DONE, lotId: L4, vote: 'FOR', source: 'MANAGER' });
    const res = await request(app).get(url(M_DONE, '/direct'));
    expect(res.status).toBe(200);
    expect(res.body.data.attendance).toMatchObject({
      presentLots: 1,
      presentShares: 400,
      quorumPercent: 40,
      onlineLots: 0
    });
  });
});

describe('Emargement par le gestionnaire', () => {
  it('present en salle : le lot compte au quorum, l emargement garde l auteur', async () => {
    const res = await request(app)
      .put(url(M1, `/presences/${L2}`))
      .send({ status: 'PRESENT' });
    expect(res.status).toBe(200);
    expect(res.body.data.attendance).toMatchObject({ presentLots: 1, presentShares: 200, quorumPercent: 20 });
    const row = attendanceOf(L2);
    expect(row).toMatchObject({
      tenantId: TENANT_A,
      status: 'PRESENT',
      mode: 'IN_PERSON',
      recordedBy: 'MANAGER',
      recordedByUserId: 'user-manager'
    });
    expect(mockPrisma.generalMeeting.rows[0].quorum).toBe(20);
    expect(mockAudit).toHaveBeenCalledWith(
      expect.objectContaining({ actionKey: 'SYNDIC_MEETING_ATTENDANCE_SET', tenantId: TENANT_A })
    );
  });

  it('represente par un contact : compte aussi, le nom du mandataire est rendu', async () => {
    const res = await request(app)
      .put(url(M1, `/presences/${L2}`))
      .send({ status: 'REPRESENTED', representedByContactId: ERIC });
    expect(res.status).toBe(200);
    expect(res.body.data.attendance).toMatchObject({
      presentLots: 0,
      representedOnlyLots: 1,
      representedLots: 1,
      quorumPercent: 20
    });
    const lot = res.body.data.lots.find((entry: any) => entry.lotId === L2);
    expect(lot.attendance).toMatchObject({
      status: 'REPRESENTED',
      representedByContactId: ERIC,
      representedByName: 'Eric Mandataire'
    });
  });

  it('absent : le lot sort du quorum s il n a pas vote, mais reste compte s il a vote', async () => {
    await request(app)
      .put(url(M1, `/presences/${L1}`))
      .send({ status: 'PRESENT' });
    let res = await request(app)
      .put(url(M1, `/presences/${L1}`))
      .send({ status: 'ABSENT' });
    expect(res.body.data.attendance).toMatchObject({ presentLots: 0, quorumPercent: 0 });

    mockPrisma.gMVote.rows.push({ id: id(602), resolutionId: R1, lotId: L1, vote: 'FOR', source: 'MANAGER' });
    res = await request(app)
      .put(url(M1, `/presences/${L1}`))
      .send({ status: 'ABSENT' });
    expect(res.body.data.attendance).toMatchObject({ presentLots: 1, quorumPercent: 10 });
  });

  it('emargement en masse', async () => {
    const res = await request(app)
      .post(url(M1, '/presences'))
      .send({ lotIds: [L1, L3, L4], status: 'PRESENT', mode: 'ONLINE' });
    expect(res.status).toBe(200);
    expect(res.body.data.attendance).toMatchObject({
      presentLots: 3,
      presentShares: 800,
      quorumPercent: 80,
      onlineLots: 3
    });
  });

  it('refuse un lot d une autre agence, un contact d une autre agence (404) et un corps invalide (400)', async () => {
    let res = await request(app)
      .put(url(M1, `/presences/${LB}`))
      .send({ status: 'PRESENT' });
    expect(res.status).toBe(404);
    res = await request(app)
      .post(url(M1, '/presences'))
      .send({ lotIds: [L1, LB], status: 'PRESENT' });
    expect(res.status).toBe(404);
    expect(mockPrisma.gMAttendance.rows).toHaveLength(0);
    res = await request(app)
      .put(url(M1, `/presences/${L2}`))
      .send({ status: 'REPRESENTED', representedByContactId: CONTACT_B });
    expect(res.status).toBe(404);
    res = await request(app)
      .put(url(M1, `/presences/${L2}`))
      .send({ status: 'PEUT-ETRE' });
    expect(res.status).toBe(400);
    res = await request(app).post(url(M1, '/presences')).send({ lotIds: [], status: 'PRESENT' });
    expect(res.status).toBe(400);
  });

  it('une AG cloturee est figee (409)', async () => {
    const res = await request(app)
      .put(url(M_DONE, `/presences/${L1}`))
      .send({ status: 'PRESENT' });
    expect(res.status).toBe(409);
  });

  it('prend le verrou de l AG avant d ecrire', async () => {
    mockPrisma.$executeRaw.mockClear();
    await request(app)
      .put(url(M1, `/presences/${L1}`))
      .send({ status: 'PRESENT' });
    expect(mockPrisma.$executeRaw).toHaveBeenCalled();
    const [strings, value] = mockPrisma.$executeRaw.mock.calls[0] as unknown as [string[], string];
    expect(strings.join('?')).toContain('pg_advisory_xact_lock(hashtext(');
    expect(value).toBe(M1);
  });
});

describe('Ouverture et cloture du vote', () => {
  it('ouvre puis clot, rouvre une resolution close, 409 sur etat incoherent', async () => {
    let res = await request(app)
      .post(url(M1, `/resolutions/${R1}/ouvrir-vote`))
      .send({});
    expect(res.status).toBe(200);
    const opened = res.body.data.resolutions.find((resolution: any) => resolution.id === R1);
    expect(opened.voteStatus).toBe('OPEN');
    expect(opened.voteOpenedAt).toBeTruthy();

    res = await request(app)
      .post(url(M1, `/resolutions/${R1}/ouvrir-vote`))
      .send({});
    expect(res.status).toBe(409);

    res = await request(app)
      .post(url(M1, `/resolutions/${R1}/clore-vote`))
      .send({});
    expect(res.status).toBe(200);
    expect(res.body.data.resolutions.find((resolution: any) => resolution.id === R1).voteStatus).toBe('CLOSED');

    res = await request(app)
      .post(url(M1, `/resolutions/${R1}/clore-vote`))
      .send({});
    expect(res.status).toBe(409);

    res = await request(app)
      .post(url(M1, `/resolutions/${R1}/ouvrir-vote`))
      .send({});
    expect(res.status).toBe(200);
    expect(res.body.data.resolutions.find((resolution: any) => resolution.id === R1).voteStatus).toBe('OPEN');
    expect(mockAudit).toHaveBeenCalledWith(
      expect.objectContaining({ actionKey: 'SYNDIC_MEETING_VOTE_OPENED', entityId: R1 })
    );
    expect(mockAudit).toHaveBeenCalledWith(
      expect.objectContaining({ actionKey: 'SYNDIC_MEETING_VOTE_CLOSED', entityId: R1 })
    );
  });

  it('refuse hors seance en cours (409) et une resolution d une autre AG ou agence (404)', async () => {
    let res = await request(app)
      .post(url(M_PLANNED, `/resolutions/${R_PLANNED}/ouvrir-vote`))
      .send({});
    expect(res.status).toBe(409);
    res = await request(app)
      .post(url(M_DONE, `/resolutions/${R_DONE}/ouvrir-vote`))
      .send({});
    expect(res.status).toBe(409);
    res = await request(app)
      .post(url(M1, `/resolutions/${R_B}/ouvrir-vote`))
      .send({});
    expect(res.status).toBe(404);
    res = await request(app)
      .post(`/api/tenants/${TENANT_A}/syndics/${S1}/assemblees/${MB}/resolutions/${R_B}/ouvrir-vote`)
      .send({});
    expect(res.status).toBe(404);
    res = await request(app).post(url(M1, '/resolutions/pas-un-uuid/ouvrir-vote')).send({});
    expect(res.status).toBe(400);
  });
});

describe('Participants et liens personnels', () => {
  it('liste les votants et mandataires avec leurs lots votables (pouvoir compris)', async () => {
    const res = await request(app).get(url(M1, '/participants'));
    expect(res.status).toBe(200);
    const byContact = Object.fromEntries(res.body.data.map((entry: any) => [entry.contactId, entry]));
    expect(byContact[AWA].lotNumbers).toEqual(['L1', 'L3']);
    expect(byContact[CHEICK].lotNumbers).toEqual(['L3']);
    expect(byContact[BAKARY].lotNumbers).toEqual(['L2']);
    expect(byContact[ERIC].lotNumbers).toEqual(['L2']); // par pouvoir
    expect(byContact[DIEU].activeLinks).toBe(0);
    expect(byContact[CONTACT_B]).toBeUndefined();
  });

  it('delivre un lien (jeton une fois), refuse un contact etranger (404) et une AG cloturee (409)', async () => {
    const res = await request(app)
      .post(url(M1, `/participants/${AWA}/lien`))
      .send({});
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body.data.url).toMatch(/\/ag-direct#[A-Za-z0-9_-]{20,}$/);
    expect(new Date(res.body.data.expiresAt).getTime()).toBeGreaterThan(Date.now() - 1000);
    // Seul le hachage du jeton est stocke.
    const token = String(res.body.data.url).split('#')[1];
    expect(JSON.stringify(mockPrisma.secureLink.rows)).not.toContain(token);
    expect(mockPrisma.secureLink.rows[0]).toMatchObject({
      scope: 'GENERAL_MEETING_ACCESS',
      objectType: 'GM_PARTICIPANT',
      tenantId: TENANT_A
    });
    expect(mockAudit).toHaveBeenCalledWith(expect.objectContaining({ actionKey: 'SYNDIC_MEETING_LINK_ISSUED' }));

    expect(
      (
        await request(app)
          .post(url(M1, `/participants/${CONTACT_B}/lien`))
          .send({})
      ).status
    ).toBe(404);
    expect((await request(app).post(url(M1, '/participants/inconnu/lien')).send({})).status).toBe(404);
    expect(
      (
        await request(app)
          .post(url(M_DONE, `/participants/${AWA}/lien`))
          .send({})
      ).status
    ).toBe(409);

    const list = await request(app).get(url(M1, '/participants'));
    expect(list.body.data.find((entry: any) => entry.contactId === AWA).activeLinks).toBe(1);
  });

  it('revoque les liens : le jeton ne fonctionne plus (404 uniforme)', async () => {
    const token = await issueToken(AWA);
    await issueToken(AWA); // un nouveau lien ne revoque pas le precedent
    expect((await pub('/etat', { token })).status).toBe(200);

    const revoked = await request(app).delete(url(M1, `/participants/${AWA}/liens`));
    expect(revoked.status).toBe(200);
    expect(revoked.body.data).toEqual({ revoked: 2 });
    expect((await pub('/etat', { token })).status).toBe(404);
    expect(mockAudit).toHaveBeenCalledWith(expect.objectContaining({ actionKey: 'SYNDIC_MEETING_LINKS_REVOKED' }));

    // Contact eligible sans participant : 0 ; contact etranger : 404.
    expect((await request(app).delete(url(M1, `/participants/${DIEU}/liens`))).body.data).toEqual({ revoked: 0 });
    expect((await request(app).delete(url(M1, `/participants/${CONTACT_B}/liens`))).status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// Public : lien personnel
// ---------------------------------------------------------------------------

describe('Routes publiques : jeton', () => {
  it('jeton inconnu, mal forme, expire, revoque ou agence suspendue = meme 404, en-tetes no-store', async () => {
    const token = await issueToken(AWA);
    const bodies: Array<Record<string, unknown>> = [
      { token: 'x'.repeat(43) },
      { token: 'court' },
      {},
      { token: 12345 }
    ];
    const answers = [];
    for (const body of bodies) answers.push(await pub('/etat', body));

    // expire
    mockPrisma.secureLink.rows[0].expiresAt = new Date(Date.now() - 1000);
    answers.push(await pub('/etat', { token }));
    mockPrisma.secureLink.rows[0].expiresAt = new Date(Date.now() + 86_400_000);
    // revoque
    mockPrisma.secureLink.rows[0].revokedAt = new Date();
    answers.push(await pub('/etat', { token }));
    mockPrisma.secureLink.rows[0].revokedAt = null;
    // agence suspendue
    mockPrisma.tenant.rows[0].status = 'SUSPENDED';
    answers.push(await pub('/etat', { token }));
    mockPrisma.tenant.rows[0].status = 'ACTIVE';

    for (const answer of answers) {
      expect(answer.status).toBe(404);
      expect(answer.body).toEqual(answers[0].body);
      expect(answer.headers['cache-control']).toBe('no-store');
    }
    // Le meme jeton fonctionne une fois les causes levees.
    expect((await pub('/etat', { token })).status).toBe(200);
  });

  it('un jeton d un autre usage (portee) ou d un participant supprime = 404', async () => {
    const token = await issueToken(AWA);
    mockPrisma.secureLink.rows[0].scope = 'OWNER_MONTHLY_REPORT';
    expect((await pub('/etat', { token })).status).toBe(404);
    mockPrisma.secureLink.rows[0].scope = 'GENERAL_MEETING_ACCESS';
    mockPrisma.gMParticipant.rows.length = 0;
    expect((await pub('/etat', { token })).status).toBe(404);
  });

  it('corps trop gros ou JSON invalide = 404 uniforme (sans fuite du parseur)', async () => {
    const big = await request(app)
      .post('/api/public/assemblees/etat')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ token: 'a'.repeat(6000) }));
    expect(big.status).toBe(404);
    const broken = await request(app)
      .post('/api/public/assemblees/etat')
      .set('Content-Type', 'application/json')
      .send('{"token": "abc');
    expect(broken.status).toBe(404);
    expect(broken.body).toEqual(big.body);
    expect(broken.headers['cache-control']).toBe('no-store');
  });

  it('seul POST existe ; le jeton n est jamais accepte dans l URL', async () => {
    const token = await issueToken(AWA);
    expect((await request(app).get('/api/public/assemblees/etat')).status).toBe(404);
    expect((await request(app).get(`/api/public/assemblees/etat?token=${token}`)).status).toBe(404);
  });

  it('limiteur par jeton : 429 (no-store) au-dela de 30 actions par minute, cle = empreinte', async () => {
    const token = 'z'.repeat(40);
    let last: any;
    for (let i = 0; i < 31; i += 1) last = await pub('/rejoindre', { token });
    expect(last.status).toBe(429);
    expect(last.headers['cache-control']).toBe('no-store');

    const key = meetingLiveTokenKey({ body: { token }, ip: '1.2.3.4' } as any, 'etat');
    expect(key).not.toContain(token);
    expect(key).toMatch(/^meeting-live-etat:[0-9a-f]{64}$/);
    expect(meetingLiveTokenKey({ body: {}, ip: '1.2.3.4' } as any, 'etat')).toBe('meeting-live-etat:ip:1.2.3.4');
  });
});

describe('Routes publiques : etat et rejoindre', () => {
  it('rend la vue du copropriétaire : ses lots (indivision comprise), jamais les autres', async () => {
    const token = await issueToken(AWA);
    const res = await pub('/etat', { token });
    expect(res.status).toBe(200);
    const view = res.body.data;
    expect(view.me).toMatchObject({ contactId: AWA, name: 'Awa Traore', joined: false });
    expect(view.myLots.map((lot: any) => [lot.lotNumber, lot.role, lot.generalShares])).toEqual([
      ['L1', 'OWNER', 100],
      ['L3', 'OWNER', 300]
    ]);
    expect(view.canVote).toBe(false);
    expect(view.meeting).toMatchObject({
      status: 'IN_PROGRESS',
      syndicateName: 'Residence A',
      videoConferenceUrl: 'https://visio.example.test/room'
    });
    expect(view.attendance).toMatchObject({ totalShares: 1000, quorumPercent: 0 });
    expect(view.resolutions).toHaveLength(2);

    // Aucun nom ni coordonnee d'un autre copropriétaire, ni identifiant d'agence.
    const text = JSON.stringify(res.body);
    for (const forbidden of ['Bakary', 'Cheick', 'Dieudonne', 'Eric', 'bakary@', 'cheick@', 'tenant-a', 'tenantId']) {
      expect(text).not.toContain(forbidden);
    }
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('met a jour lastSeenAt au plus toutes les 10 secondes ; la console voit le lot en ligne', async () => {
    const token = await issueToken(AWA);
    await pub('/etat', { token });
    const participant = mockPrisma.gMParticipant.rows[0];
    const first = participant.lastSeenAt as Date;
    expect(first).toBeInstanceOf(Date);

    await pub('/etat', { token });
    expect(participant.lastSeenAt).toBe(first); // pas de seconde ecriture avant 10 s

    participant.lastSeenAt = new Date(Date.now() - 11_000);
    await pub('/etat', { token });
    expect(participant.lastSeenAt.getTime()).toBeGreaterThan(Date.now() - 5_000);

    const admin = await request(app).get(url(M1, '/direct'));
    expect(admin.body.data.participants).toMatchObject({ invited: 1, online: 1, joined: 0 });
    expect(admin.body.data.lots.find((lot: any) => lot.lotId === L1).online).toBe(true);
    expect(admin.body.data.lots.find((lot: any) => lot.lotId === L2).online).toBe(false);

    participant.lastSeenAt = new Date(Date.now() - 31_000);
    const later = await request(app).get(url(M1, '/direct'));
    expect(later.body.data.participants.online).toBe(0);
  });

  it('rejoindre : emarge ses lots en ligne, le quorum monte, idempotent', async () => {
    const token = await issueToken(AWA);
    const res = await pub('/rejoindre', { token });
    expect(res.status).toBe(200);
    expect(res.body.data.me.joined).toBe(true);
    expect(res.body.data.canVote).toBe(true);
    expect(res.body.data.attendance).toMatchObject({ representedShares: 400, quorumPercent: 40 });
    expect(attendanceOf(L1)).toMatchObject({
      status: 'PRESENT',
      mode: 'ONLINE',
      recordedBy: 'SELF',
      attendeeContactId: AWA,
      tenantId: TENANT_A
    });
    expect(attendanceOf(L3)).toMatchObject({ status: 'PRESENT', mode: 'ONLINE' });
    expect(attendanceOf(L2)).toBeUndefined();
    expect(mockPrisma.generalMeeting.rows[0].quorum).toBe(40);

    const again = await pub('/rejoindre', { token });
    expect(again.status).toBe(200);
    expect(mockPrisma.gMAttendance.rows).toHaveLength(2);
    expect(mockAudit.mock.calls.filter(([entry]) => entry.actionKey === 'SYNDIC_MEETING_JOINED')).toHaveLength(1);

    const admin = await request(app).get(url(M1, '/direct'));
    expect(admin.body.data.attendance).toMatchObject({ presentLots: 2, onlineLots: 2, quorumPercent: 40 });
    expect(admin.body.data.participants).toMatchObject({ joined: 1 });
  });

  it('ne retrograde jamais un emargement du gestionnaire, mais remplace un ABSENT', async () => {
    await request(app)
      .put(url(M1, `/presences/${L1}`))
      .send({ status: 'REPRESENTED', representedByContactId: ERIC });
    await request(app)
      .put(url(M1, `/presences/${L3}`))
      .send({ status: 'ABSENT' });
    const token = await issueToken(AWA);
    await pub('/rejoindre', { token });
    expect(attendanceOf(L1)).toMatchObject({
      status: 'REPRESENTED',
      recordedBy: 'MANAGER',
      representedByContactId: ERIC
    });
    expect(attendanceOf(L3)).toMatchObject({ status: 'PRESENT', recordedBy: 'SELF', mode: 'ONLINE' });
  });

  it('un mandataire rejoint : le lot du mandant est REPRESENTED, le sien reste a lui', async () => {
    const token = await issueToken(ERIC);
    const res = await pub('/rejoindre', { token });
    expect(res.status).toBe(200);
    expect(res.body.data.myLots).toEqual([
      expect.objectContaining({
        lotNumber: 'L2',
        role: 'PROXY',
        grantorName: 'Bakary Diallo',
        attendanceStatus: 'REPRESENTED'
      })
    ]);
    expect(attendanceOf(L2)).toMatchObject({
      status: 'REPRESENTED',
      mode: 'ONLINE',
      attendeeContactId: ERIC,
      representedByContactId: ERIC
    });
    expect(res.body.data.attendance).toMatchObject({ representedShares: 200, quorumPercent: 20 });
  });

  it('refuse de rejoindre une AG cloturee (409)', async () => {
    const token = await issueToken(AWA);
    mockPrisma.generalMeeting.rows[0].status = 'COMPLETED';
    expect((await pub('/rejoindre', { token })).status).toBe(409);
    expect(mockPrisma.gMAttendance.rows).toHaveLength(0);
  });
});

describe('Routes publiques : voter', () => {
  const openR1 = () =>
    request(app)
      .post(url(M1, `/resolutions/${R1}/ouvrir-vote`))
      .send({});

  it('refuse avant d avoir rejoint, sur une resolution non ouverte et hors seance (409)', async () => {
    const token = await issueToken(AWA);
    await openR1();
    const body = { token, resolutionId: R1, votes: [{ lotId: L1, vote: 'FOR' }] };
    expect((await pub('/voter', body)).status).toBe(409); // pas rejoint

    await pub('/rejoindre', { token });
    expect((await pub('/voter', { ...body, resolutionId: R2 })).status).toBe(409); // R2 pas ouverte
    expect((await pub('/voter', body)).status).toBe(200);

    mockPrisma.generalMeeting.rows[0].status = 'PLANNED';
    expect((await pub('/voter', body)).status).toBe(409);
    expect(mockPrisma.gMVote.rows).toHaveLength(1);
  });

  it('vote pour ses lots : origine, auteur, presence, participation ; revote autorise', async () => {
    const token = await issueToken(AWA);
    await pub('/rejoindre', { token });
    await openR1();
    const res = await pub('/voter', {
      token,
      resolutionId: R1,
      votes: [
        { lotId: L1, vote: 'FOR' },
        { lotId: L3, vote: 'AGAINST' }
      ]
    });
    expect(res.status).toBe(200);
    expect(mockPrisma.gMVote.rows).toHaveLength(2);
    expect(mockPrisma.gMVote.rows[0]).toMatchObject({
      resolutionId: R1,
      lotId: L1,
      vote: 'FOR',
      source: 'CO_OWNER',
      castByContactId: AWA
    });

    const resolution = res.body.data.resolutions.find((entry: any) => entry.id === R1);
    expect(resolution.ballotCount).toBe(2);
    expect(resolution.totalLots).toBe(4);
    expect(resolution.myVotes).toEqual(
      expect.arrayContaining([
        { lotId: L1, vote: 'FOR', source: 'CO_OWNER' },
        { lotId: L3, vote: 'AGAINST', source: 'CO_OWNER' }
      ])
    );
    // Pendant le vote : participation seulement, aucun resultat.
    expect(resolution.result).toBeNull();

    const revote = await pub('/voter', { token, resolutionId: R1, votes: [{ lotId: L1, vote: 'AGAINST' }] });
    expect(revote.status).toBe(200);
    expect(mockPrisma.gMVote.rows).toHaveLength(2);
    expect(mockPrisma.gMVote.rows.find((row: any) => row.lotId === L1)?.vote).toBe('AGAINST');

    // Audit : l'origine et le lot, jamais le sens du vote.
    const casts = mockAudit.mock.calls
      .map(([entry]) => entry)
      .filter(entry => entry.actionKey === 'SYNDIC_MEETING_VOTE_CAST');
    expect(casts.length).toBeGreaterThanOrEqual(3);
    for (const cast of casts) {
      expect(cast.payload).toMatchObject({ meetingId: M1, resolutionId: R1, source: 'CO_OWNER' });
      expect(JSON.stringify(cast.payload)).not.toMatch(/FOR|AGAINST|ABSTAIN/);
    }
  });

  it('un lot qui n est pas le sien = 404, la demande entiere est rejetee (aucun vote ecrit)', async () => {
    const token = await issueToken(AWA);
    await pub('/rejoindre', { token });
    await openR1();
    for (const foreign of [L2, L4, LB, id(999)]) {
      const res = await pub('/voter', {
        token,
        resolutionId: R1,
        votes: [
          { lotId: L1, vote: 'FOR' },
          { lotId: foreign, vote: 'FOR' }
        ]
      });
      expect(res.status).toBe(404);
    }
    expect(mockPrisma.gMVote.rows).toHaveLength(0);
  });

  it('une resolution d une autre AG ou agence = 404 ; corps invalide = 400', async () => {
    const token = await issueToken(AWA);
    await pub('/rejoindre', { token });
    expect((await pub('/voter', { token, resolutionId: R_B, votes: [{ lotId: L1, vote: 'FOR' }] })).status).toBe(404);
    expect((await pub('/voter', { token, resolutionId: R_DONE, votes: [{ lotId: L1, vote: 'FOR' }] })).status).toBe(
      404
    );
    expect((await pub('/voter', { token, resolutionId: R1, votes: [] })).status).toBe(400);
    expect((await pub('/voter', { token, resolutionId: R1, votes: [{ lotId: L1, vote: 'PEUT-ETRE' }] })).status).toBe(
      400
    );
    expect((await pub('/voter', { token, resolutionId: 'x', votes: [{ lotId: L1, vote: 'FOR' }] })).status).toBe(400);
  });

  it('le mandataire vote le lot du mandant : origine PROXY_HOLDER', async () => {
    const token = await issueToken(ERIC);
    await pub('/rejoindre', { token });
    await openR1();
    const res = await pub('/voter', { token, resolutionId: R1, votes: [{ lotId: L2, vote: 'ABSTAIN' }] });
    expect(res.status).toBe(200);
    expect(mockPrisma.gMVote.rows[0]).toMatchObject({
      lotId: L2,
      vote: 'ABSTAIN',
      source: 'PROXY_HOLDER',
      castByContactId: ERIC
    });
    // Il ne vote pas le lot d'un autre.
    expect((await pub('/voter', { token, resolutionId: R1, votes: [{ lotId: L1, vote: 'FOR' }] })).status).toBe(404);
  });

  it('un indivisaire vote le lot commun, le dernier vote l emporte', async () => {
    const awa = await issueToken(AWA);
    const cheick = await issueToken(CHEICK);
    await pub('/rejoindre', { token: awa });
    await pub('/rejoindre', { token: cheick });
    await openR1();
    await pub('/voter', { token: awa, resolutionId: R1, votes: [{ lotId: L3, vote: 'FOR' }] });
    const res = await pub('/voter', { token: cheick, resolutionId: R1, votes: [{ lotId: L3, vote: 'AGAINST' }] });
    expect(res.status).toBe(200);
    expect(mockPrisma.gMVote.rows).toHaveLength(1);
    expect(mockPrisma.gMVote.rows[0]).toMatchObject({ vote: 'AGAINST', castByContactId: CHEICK });
    // Awa voit le vote de Cheick sur le lot commun, c'est son lot.
    const state = await pub('/etat', { token: awa });
    expect(state.body.data.resolutions[0].myVotes).toEqual([{ lotId: L3, vote: 'AGAINST', source: 'CO_OWNER' }]);
  });

  it('le copropriétaire voit le vote saisi par le gestionnaire sur son lot (et seulement le sien)', async () => {
    mockPrisma.gMVote.rows.push(
      { id: id(701), resolutionId: R1, lotId: L1, vote: 'FOR', source: 'MANAGER', castByUserId: 'user-manager' },
      { id: id(702), resolutionId: R1, lotId: L4, vote: 'AGAINST', source: 'MANAGER', castByUserId: 'user-manager' }
    );
    const token = await issueToken(AWA);
    const res = await pub('/etat', { token });
    const resolution = res.body.data.resolutions.find((entry: any) => entry.id === R1);
    expect(resolution.myVotes).toEqual([{ lotId: L1, vote: 'FOR', source: 'MANAGER' }]);
    expect(resolution.ballotCount).toBe(2);
    expect(JSON.stringify(res.body)).not.toContain(L4);
  });

  it('le resultat apparait a la cloture du vote (decision et tantiemes), pas avant', async () => {
    const awa = await issueToken(AWA);
    const dieu = await issueToken(DIEU);
    await pub('/rejoindre', { token: awa });
    await pub('/rejoindre', { token: dieu });
    await openR1();
    await pub('/voter', {
      token: awa,
      resolutionId: R1,
      votes: [
        { lotId: L1, vote: 'FOR' },
        { lotId: L3, vote: 'FOR' }
      ]
    });
    await pub('/voter', { token: dieu, resolutionId: R1, votes: [{ lotId: L4, vote: 'AGAINST' }] });

    let state = await pub('/etat', { token: awa });
    expect(state.body.data.resolutions.find((entry: any) => entry.id === R1).result).toBeNull();
    const admin = await request(app).get(url(M1, '/direct'));
    expect(admin.body.data.resolutions[0].tally).toMatchObject({
      sharesFor: 400,
      sharesAgainst: 400,
      votesFor: 2,
      votesAgainst: 1
    });

    await request(app)
      .post(url(M1, `/resolutions/${R1}/clore-vote`))
      .send({});
    state = await pub('/etat', { token: awa });
    const closed = state.body.data.resolutions.find((entry: any) => entry.id === R1);
    expect(closed.voteStatus).toBe('CLOSED');
    expect(closed.result).toMatchObject({
      result: 'REJECTED', // 400 pour contre 400 contre : majorite simple non atteinte
      sharesFor: 400,
      sharesAgainst: 400,
      sharesAbstain: 0,
      totalShares: 1000,
      votesFor: 2,
      votesAgainst: 1
    });
    // Ni le sens ni le lot des autres ne sortent, meme resultat affiche.
    expect(closed.myVotes.every((entry: any) => [L1, L3].includes(entry.lotId))).toBe(true);
    expect(
      (await pub('/voter', { token: awa, resolutionId: R1, votes: [{ lotId: L1, vote: 'AGAINST' }] })).status
    ).toBe(409);
  });

  it('a la cloture de l AG, tous les resultats sont visibles', async () => {
    const token = await issueToken(AWA);
    mockPrisma.gMResolution.rows[1].voteStatus = 'OPEN';
    mockPrisma.generalMeeting.rows[0].status = 'COMPLETED';
    const res = await pub('/etat', { token });
    expect(res.status).toBe(200);
    expect(res.body.data.canVote).toBe(false);
    for (const resolution of res.body.data.resolutions) expect(resolution.result).not.toBeNull();
  });
});
