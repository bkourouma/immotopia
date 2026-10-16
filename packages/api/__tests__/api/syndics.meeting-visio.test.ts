/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Visio intégrée à l'AG en direct (spec 045), de bout en bout sur HTTP.
 *
 * Même pile que `syndics.meeting-live.test.ts` (vrais routeurs, zod, services,
 * liens sécurisés ; base en mémoire qui applique les filtres `where`), avec le
 * service LiveKit simulé : ses droits de jeton sont vérifiés par
 * `__tests__/unit/livekit-service.test.ts`.
 *
 * Jeu de données : agence A, copropriété S1, AG M1 en cours, lots L1 (Awa) et
 * L2 (Bakary) ; M_PLANNED planifiée ; M_DONE clôturée. Agence B : SB, MB.
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

// --- Service LiveKit simulé (les fonctions pures et les erreurs restent réelles) ---
const mockLk = {
  enabled: true,
  ensureRoom: jest.fn(),
  roomExists: jest.fn(),
  listRoomParticipants: jest.fn(),
  getRoomParticipant: jest.fn(),
  setHandRaised: jest.fn(),
  setCanSpeak: jest.fn(),
  removeParticipant: jest.fn(),
  deleteRoom: jest.fn(),
  sendRefreshSignal: jest.fn()
};
jest.mock('../../src/services/livekit-service', () => {
  const actual = jest.requireActual('../../src/services/livekit-service');
  const mint = (input: { roomName: string; identity: string; name: string }) =>
    Promise.resolve({
      token: `jwt-${input.identity}`,
      serverUrl: 'wss://visio.example.test',
      identity: input.identity,
      roomName: input.roomName,
      expiresAt: '2026-10-10T09:10:00.000Z'
    });
  return {
    ...actual,
    isVisioEnabled: () => mockLk.enabled,
    ensureRoom: (...args: unknown[]) => mockLk.ensureRoom(...args),
    roomExists: (...args: unknown[]) => mockLk.roomExists(...args),
    listRoomParticipants: (...args: unknown[]) => mockLk.listRoomParticipants(...args),
    getRoomParticipant: (...args: unknown[]) => mockLk.getRoomParticipant(...args),
    setHandRaised: (...args: unknown[]) => mockLk.setHandRaised(...args),
    setCanSpeak: (...args: unknown[]) => mockLk.setCanSpeak(...args),
    removeParticipant: (...args: unknown[]) => mockLk.removeParticipant(...args),
    deleteRoom: (...args: unknown[]) => mockLk.deleteRoom(...args),
    sendRefreshSignal: (...args: unknown[]) => mockLk.sendRefreshSignal(...args),
    mintParticipantToken: jest.fn((input: any) => mint(input)),
    mintModeratorToken: jest.fn((input: any) => mint(input))
  };
});

import meetingLivePublicRoutes from '../../src/routes/meeting-live-public-routes';
import syndicRoutes from '../../src/routes/syndic-routes';
import { errorHandler } from '../../src/middleware/error-middleware';
import { VisioUnavailableError } from '../../src/services/livekit-service';

const app = express();
app.use('/api', meetingLivePublicRoutes);
app.use(express.json());
app.use('/api', syndicRoutes);
app.use(errorHandler);

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const TENANT_A = 'tenant-a';
const TENANT_B = 'tenant-b';
const S1 = id(101);
const SB = id(102);
const M1 = id(201);
const M_PLANNED = id(202);
const M_DONE = id(203);
const MB = id(204);
const L1 = id(301);
const L2 = id(302);
const LB = id(305);
const R1 = id(401);
const AWA = 'contact-awa';
const BAKARY = 'contact-bakary';
const CONTACT_B = 'contact-b';
const ROOM = `t_${TENANT_A}__ag_${M1}`;

const url = (meetingId: string, suffix: string) =>
  `/api/tenants/${TENANT_A}/syndics/${S1}/assemblees/${meetingId}${suffix}`;
const pub = (path: string, body: unknown) =>
  request(app)
    .post(`/api/public/assemblees${path}`)
    .send(body as any);

const contactRow = (contactId: string, firstName: string, lastName: string, tenantId = TENANT_A) => ({
  id: contactId,
  tenantId,
  firstName,
  lastName,
  legalName: null,
  email: `${firstName.toLowerCase()}@example.test`,
  phonePrimary: '+2250700000000'
});

function resetWorld(meetingStatus = 'IN_PROGRESS') {
  mockPrisma.reset();
  mockAudit.mockClear();
  for (const fn of Object.values(mockLk)) if (typeof fn === 'function') (fn as jest.Mock).mockReset();
  mockLk.enabled = true;
  mockLk.ensureRoom.mockResolvedValue(undefined);
  mockLk.roomExists.mockResolvedValue(true);
  mockLk.listRoomParticipants.mockResolvedValue([]);
  mockLk.getRoomParticipant.mockResolvedValue(null);
  mockLk.setHandRaised.mockResolvedValue(undefined);
  mockLk.setCanSpeak.mockResolvedValue(undefined);
  mockLk.removeParticipant.mockResolvedValue(undefined);
  mockLk.deleteRoom.mockResolvedValue(undefined);
  mockLk.sendRefreshSignal.mockResolvedValue(undefined);

  mockPrisma.tenant.rows.push(
    { id: TENANT_A, isActive: true, status: 'ACTIVE' },
    { id: TENANT_B, isActive: true, status: 'ACTIVE' }
  );
  const awa = contactRow(AWA, 'Awa', 'Traore');
  const bakary = contactRow(BAKARY, 'Bakary', 'Diallo');
  const contactB = contactRow(CONTACT_B, 'Zoe', 'Autre', TENANT_B);
  mockPrisma.crmContact.rows.push(awa, bakary, contactB);

  const profile = (contact: ReturnType<typeof contactRow>) => ({
    contactId: contact.id,
    ownershipPercentage: 100,
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
  const lot = (lotId: string, syndicateId: string, tenantId: string, lotNumber: string, owner: any) => ({
    id: lotId,
    syndicateId,
    syndicate: { tenantId },
    lotNumber,
    generalShares: 100,
    coownerId: owner.id,
    ownerContactId: owner.id,
    owner: { id: owner.id, firstName: owner.firstName, lastName: owner.lastName, legalName: null, email: owner.email },
    ownerProfiles: [profile(owner)]
  });
  mockPrisma.syndicateLot.rows.push(
    lot(L1, S1, TENANT_A, 'L1', awa),
    lot(L2, S1, TENANT_A, 'L2', bakary),
    lot(LB, SB, TENANT_B, 'LB', contactB)
  );

  const meeting = (mid: string, sid: string, tenantId: string, status: string) => ({
    id: mid,
    syndicateId: sid,
    syndicate: { id: sid, name: sid === SB ? 'Residence B' : 'Residence A', tenantId },
    type: 'ORDINARY',
    status,
    scheduledAt: new Date('2026-10-10T09:00:00Z'),
    startTime: null,
    endTime: null,
    location: 'Salle des fetes',
    videoConferenceUrl: null,
    quorum: 0
  });
  mockPrisma.generalMeeting.rows.push(
    meeting(M1, S1, TENANT_A, meetingStatus),
    meeting(M_PLANNED, S1, TENANT_A, 'PLANNED'),
    meeting(M_DONE, S1, TENANT_A, 'COMPLETED'),
    meeting(MB, SB, TENANT_B, 'IN_PROGRESS')
  );
  mockPrisma.gMResolution.rows.push({
    id: R1,
    meetingId: M1,
    title: 'Budget previsionnel',
    description: null,
    majorityRule: 'ARTICLE_24',
    voteStatus: 'PENDING',
    voteOpenedAt: null,
    voteClosedAt: null,
    createdAt: new Date('2026-10-01T00:00:00Z')
  });

  // Gestionnaire de l'agence A, et un membre de l'agence B (identité à ignorer dans la console de A).
  mockPrisma.user.rows.push(
    { id: 'user-manager', fullName: 'Marie Syndic', email: 'marie@example.test', passwordHash: 'secret-hash' },
    { id: 'user-other', fullName: 'Intrus Autre Agence', email: 'autre@example.test', passwordHash: 'secret-hash' }
  );
  mockPrisma.membership.rows.push(
    { userId: 'user-manager', tenantId: TENANT_A, status: 'ACTIVE', user: { fullName: 'Marie Syndic' } },
    { userId: 'user-other', tenantId: TENANT_B, status: 'ACTIVE', user: { fullName: 'Intrus Autre Agence' } }
  );
}

async function issueToken(contactId: string, meetingId = M1): Promise<string> {
  const res = await request(app)
    .post(url(meetingId, `/participants/${contactId}/lien`))
    .send({});
  expect(res.status).toBe(200);
  return String(res.body.data.url).split('#')[1];
}

/** Lien + « Rejoindre l'assemblée » : le participant est émargé, `joinedAt` posé. */
async function joinedToken(contactId: string): Promise<{ token: string; participantId: string }> {
  const token = await issueToken(contactId);
  expect((await pub('/rejoindre', { token })).status).toBe(200);
  const participant = mockPrisma.gMParticipant.rows.find((row: any) => row.contactId === contactId);
  return { token, participantId: participant!.id };
}

const lkInfo = (identity: string, extra: Record<string, unknown> = {}) => ({
  identity,
  name: 'nom-livekit',
  attributes: {},
  permission: { canPublish: false },
  joinedAtMs: BigInt(Date.parse('2026-10-10T09:01:00Z')),
  joinedAt: BigInt(Math.floor(Date.parse('2026-10-10T09:01:00Z') / 1000)),
  ...extra
});

beforeEach(() => resetWorld());

// ---------------------------------------------------------------------------
// Public
// ---------------------------------------------------------------------------

describe('vue publique : visio.enabled', () => {
  it('reflète la configuration LiveKit, rien d autre', async () => {
    const token = await issueToken(AWA);
    let res = await pub('/etat', { token });
    expect(res.body.data.visio).toEqual({ enabled: true });
    mockLk.enabled = false;
    res = await pub('/etat', { token });
    expect(res.body.data.visio).toEqual({ enabled: false });
  });
});

describe('POST /public/assemblees/visio', () => {
  it('jeton inconnu, mal formé ou révoqué = la même 404 uniforme', async () => {
    const { token } = await joinedToken(AWA);
    const answers = [
      await pub('/visio', { token: 'x'.repeat(43) }),
      await pub('/visio', { token: 'court' }),
      await pub('/visio', {}),
      await pub('/visio', { token: 12345 })
    ];
    await request(app).delete(url(M1, `/participants/${AWA}/liens`));
    answers.push(await pub('/visio', { token }));
    for (const answer of answers) {
      expect(answer.status).toBe(404);
      expect(answer.body).toEqual(answers[0].body);
      expect(answer.headers['cache-control']).toBe('no-store');
    }
    expect(mockLk.ensureRoom).not.toHaveBeenCalled();
  });

  it('visio non configurée = 409', async () => {
    const { token } = await joinedToken(AWA);
    mockLk.enabled = false;
    const res = await pub('/visio', { token });
    expect(res.status).toBe(409);
    expect(res.body.message).toBe("La visio intégrée n'est pas activée");
  });

  it('avant « Rejoindre l assemblée » = 409, aucune salle créée', async () => {
    const token = await issueToken(AWA);
    const res = await pub('/visio', { token });
    expect(res.status).toBe(409);
    expect(res.body.message).toBe("Rejoignez l'assemblée avant d'entrer en visio");
    expect(mockLk.ensureRoom).not.toHaveBeenCalled();
  });

  it('AG non en cours = 409', async () => {
    resetWorld('PLANNED');
    const token = await issueToken(AWA);
    const res = await pub('/visio', { token });
    expect(res.status).toBe(409);
    expect(mockLk.ensureRoom).not.toHaveBeenCalled();
  });

  it('rend le jeton : identité = id du participant, nom du contact, aucune coordonnée', async () => {
    const { token, participantId } = await joinedToken(AWA);
    const res = await pub('/visio', { token });
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(Object.keys(res.body.data).sort()).toEqual(['expiresAt', 'identity', 'roomName', 'serverUrl', 'token']);
    expect(res.body.data).toMatchObject({
      identity: participantId,
      roomName: ROOM,
      serverUrl: 'wss://visio.example.test'
    });
    expect(mockLk.ensureRoom).toHaveBeenCalledWith(ROOM);

    const livekit = jest.requireMock('../../src/services/livekit-service');
    expect(livekit.mintParticipantToken).toHaveBeenCalledWith({
      roomName: ROOM,
      identity: participantId,
      name: 'Awa Traore'
    });
    const serialized = JSON.stringify(res.body) + JSON.stringify(livekit.mintParticipantToken.mock.calls);
    expect(serialized).not.toContain('awa@example.test');
    expect(serialized).not.toContain('+2250700000000');

    const audit = mockAudit.mock.calls
      .map(([entry]) => entry)
      .find(e => e.actionKey === 'SYNDIC_MEETING_VISIO_TOKEN_ISSUED');
    expect(audit).toMatchObject({
      tenantId: TENANT_A,
      payload: { meetingId: M1, role: 'PARTICIPANT', participantId }
    });
    expect(JSON.stringify(audit)).not.toContain('jwt-');
  });

  it('LiveKit injoignable = 503 « momentanément indisponible »', async () => {
    const { token } = await joinedToken(AWA);
    mockLk.ensureRoom.mockRejectedValueOnce(new VisioUnavailableError());
    const res = await pub('/visio', { token });
    expect(res.status).toBe(503);
    expect(res.body.message).toBe('La visio est momentanément indisponible');
  });
});

describe('POST /public/assemblees/visio/main', () => {
  it('hors de la salle = 409 ; dans la salle = main levée posée par le serveur', async () => {
    const { token, participantId } = await joinedToken(AWA);
    let res = await pub('/visio/main', { token, raised: true });
    expect(res.status).toBe(409);
    expect(res.body.message).toBe("Vous n'êtes pas dans la visio");
    expect(mockLk.setHandRaised).not.toHaveBeenCalled();

    mockLk.getRoomParticipant.mockResolvedValue(lkInfo(participantId));
    res = await pub('/visio/main', { token, raised: true });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ raised: true });
    expect(mockLk.getRoomParticipant).toHaveBeenCalledWith(ROOM, participantId);
    expect(mockLk.setHandRaised).toHaveBeenCalledWith(ROOM, participantId, true);

    res = await pub('/visio/main', { token, raised: false });
    expect(res.body.data).toEqual({ raised: false });
    expect(mockLk.setHandRaised).toHaveBeenLastCalledWith(ROOM, participantId, false);
    // Lever la main n'est pas auditée.
    expect(mockAudit.mock.calls.some(([entry]) => String(entry.actionKey).includes('VISIO'))).toBe(false);
  });

  it('jeton absent = 404 uniforme ; `raised` invalide = 400', async () => {
    const { token } = await joinedToken(AWA);
    expect((await pub('/visio/main', { raised: true })).status).toBe(404);
    expect((await pub('/visio/main', { token: 'x'.repeat(43), raised: true })).status).toBe(404);
    expect((await pub('/visio/main', { token, raised: 'oui' })).status).toBe(400);
    expect((await pub('/visio/main', { token })).status).toBe(400);
  });

  it('AG non en cours ou visio désactivée = 409', async () => {
    const { token, participantId } = await joinedToken(AWA);
    mockLk.getRoomParticipant.mockResolvedValue(lkInfo(participantId));
    mockLk.enabled = false;
    expect((await pub('/visio/main', { token, raised: true })).status).toBe(409);
    mockLk.enabled = true;
    mockPrisma.generalMeeting.rows.find((row: any) => row.id === M1)!.status = 'COMPLETED';
    expect((await pub('/visio/main', { token, raised: true })).status).toBe(409);
  });

  it('GET et jeton dans l URL ne sont pas servis', async () => {
    const { token } = await joinedToken(AWA);
    expect((await request(app).get('/api/public/assemblees/visio')).status).toBe(404);
    expect((await request(app).get(`/api/public/assemblees/visio?token=${token}`)).status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// Gestionnaire
// ---------------------------------------------------------------------------

describe('GET /visio (console)', () => {
  it('visio non configurée = 409', async () => {
    mockLk.enabled = false;
    const res = await request(app).get(url(M1, '/visio'));
    expect(res.status).toBe(409);
  });

  it('rapproche les participants de CETTE AG et de CETTE agence ; mains levées en tête', async () => {
    const awa = await joinedToken(AWA);
    const bakary = await joinedToken(BAKARY);
    // Participants d'une autre AG (même agence) et d'une autre agence : à ignorer.
    mockPrisma.gMParticipant.rows.push(
      { id: id(701), tenantId: TENANT_A, meetingId: M_PLANNED, contactId: AWA },
      { id: id(702), tenantId: TENANT_B, meetingId: MB, contactId: CONTACT_B }
    );
    mockLk.listRoomParticipants.mockResolvedValue([
      lkInfo(bakary.participantId, { permission: { canPublish: true } }),
      lkInfo('gestionnaire-user-manager', { name: 'Marie dans LiveKit', permission: { canPublish: true } }),
      lkInfo(awa.participantId, { attributes: { main_levee: '2026-10-10T09:05:00.000Z' } }),
      lkInfo('gestionnaire-user-other'),
      lkInfo(id(701)),
      lkInfo(id(702)),
      lkInfo('intrus-inconnu')
    ]);

    const res = await request(app).get(url(M1, '/visio'));
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(mockLk.listRoomParticipants).toHaveBeenCalledWith(ROOM);
    expect(res.body.data).toMatchObject({ enabled: true, roomName: ROOM, roomActive: true });
    expect(res.body.data.participants).toEqual([
      {
        identity: awa.participantId,
        kind: 'COOWNER',
        participantId: awa.participantId,
        contactId: AWA,
        name: 'Awa Traore',
        handRaisedAt: '2026-10-10T09:05:00.000Z',
        canSpeak: false,
        joinedAt: '2026-10-10T09:01:00.000Z'
      },
      expect.objectContaining({ kind: 'COOWNER', name: 'Bakary Diallo', handRaisedAt: null, canSpeak: true }),
      {
        identity: 'gestionnaire-user-manager',
        kind: 'MANAGER',
        participantId: null,
        contactId: null,
        name: 'Marie Syndic',
        handRaisedAt: null,
        canSpeak: true,
        joinedAt: '2026-10-10T09:01:00.000Z'
      }
    ]);
    expect(JSON.stringify(res.body)).not.toContain('@example.test');
    expect(JSON.stringify(res.body)).not.toContain('passwordHash');
  });

  it('salle absente : roomActive faux, liste vide', async () => {
    mockLk.roomExists.mockResolvedValue(false);
    const res = await request(app).get(url(M1, '/visio'));
    expect(res.body.data).toMatchObject({ roomActive: false, participants: [] });
  });

  it('une AG d une autre agence ou d une autre copropriété = 404', async () => {
    expect((await request(app).get(`/api/tenants/${TENANT_A}/syndics/${S1}/assemblees/${MB}/visio`)).status).toBe(404);
    expect((await request(app).get(`/api/tenants/${TENANT_A}/syndics/${SB}/assemblees/${MB}/visio`)).status).toBe(404);
    expect(mockLk.listRoomParticipants).not.toHaveBeenCalled();
  });
});

describe('POST /visio/jeton (modérateur)', () => {
  it('AG en cours ou planifiée : jeton gestionnaire, nom lu dans User, audit sans jeton', async () => {
    for (const meetingId of [M1, M_PLANNED]) {
      const res = await request(app).post(url(meetingId, '/visio/jeton')).send({});
      expect(res.status).toBe(200);
      expect(res.headers['cache-control']).toBe('no-store');
      expect(res.body.data).toMatchObject({
        identity: 'gestionnaire-user-manager',
        roomName: `t_${TENANT_A}__ag_${meetingId}`
      });
    }
    const livekit = jest.requireMock('../../src/services/livekit-service');
    expect(livekit.mintModeratorToken).toHaveBeenCalledWith({
      roomName: ROOM,
      identity: 'gestionnaire-user-manager',
      name: 'Marie Syndic'
    });
    const audit = mockAudit.mock.calls
      .map(([entry]) => entry)
      .find(e => e.actionKey === 'SYNDIC_MEETING_VISIO_TOKEN_ISSUED');
    expect(audit).toMatchObject({
      actorUserId: 'user-manager',
      payload: { meetingId: M1, role: 'MODERATOR', userId: 'user-manager' }
    });
    expect(JSON.stringify(mockAudit.mock.calls)).not.toContain('jwt-');
  });

  it('AG clôturée = 409 ; AG d une autre agence = 404 ; visio désactivée = 409', async () => {
    expect((await request(app).post(url(M_DONE, '/visio/jeton')).send({})).status).toBe(409);
    expect(
      (await request(app).post(`/api/tenants/${TENANT_A}/syndics/${S1}/assemblees/${MB}/visio/jeton`).send({})).status
    ).toBe(404);
    mockLk.enabled = false;
    expect((await request(app).post(url(M1, '/visio/jeton')).send({})).status).toBe(409);
    expect(mockLk.ensureRoom).not.toHaveBeenCalled();
  });
});

describe('POST /visio/participants/:participantId/parole', () => {
  it('donne puis retire la parole, audite, rend la vue', async () => {
    const awa = await joinedToken(AWA);
    mockLk.getRoomParticipant.mockResolvedValue(lkInfo(awa.participantId));
    mockLk.listRoomParticipants.mockResolvedValue([lkInfo(awa.participantId, { permission: { canPublish: true } })]);

    let res = await request(app)
      .post(url(M1, `/visio/participants/${awa.participantId}/parole`))
      .send({ allowed: true });
    expect(res.status).toBe(200);
    expect(mockLk.setCanSpeak).toHaveBeenCalledWith(ROOM, awa.participantId, true);
    expect(res.body.data.participants[0]).toMatchObject({ participantId: awa.participantId, canSpeak: true });
    expect(mockAudit).toHaveBeenCalledWith(
      expect.objectContaining({ actionKey: 'SYNDIC_MEETING_VISIO_SPEAK_GRANTED', entityId: awa.participantId })
    );

    res = await request(app)
      .post(url(M1, `/visio/participants/${awa.participantId}/parole`))
      .send({ allowed: false });
    expect(res.status).toBe(200);
    expect(mockLk.setCanSpeak).toHaveBeenLastCalledWith(ROOM, awa.participantId, false);
    expect(mockAudit).toHaveBeenCalledWith(
      expect.objectContaining({ actionKey: 'SYNDIC_MEETING_VISIO_SPEAK_REVOKED' })
    );
  });

  it('participant absent de la salle = 409', async () => {
    const awa = await joinedToken(AWA);
    const res = await request(app)
      .post(url(M1, `/visio/participants/${awa.participantId}/parole`))
      .send({ allowed: true });
    expect(res.status).toBe(409);
    expect(mockLk.setCanSpeak).not.toHaveBeenCalled();
  });

  it('participant d une autre AG, d une autre agence ou inconnu = 404 ; id invalide ou corps invalide = 400', async () => {
    mockPrisma.gMParticipant.rows.push(
      { id: id(701), tenantId: TENANT_A, meetingId: M_PLANNED, contactId: AWA },
      { id: id(702), tenantId: TENANT_B, meetingId: MB, contactId: CONTACT_B }
    );
    mockLk.getRoomParticipant.mockResolvedValue(lkInfo(id(701)));
    for (const participantId of [id(701), id(702), id(799)]) {
      const res = await request(app)
        .post(url(M1, `/visio/participants/${participantId}/parole`))
        .send({ allowed: true });
      expect(res.status).toBe(404);
    }
    // Une AG de l'autre agence par le chemin de A.
    expect(
      (
        await request(app)
          .post(`/api/tenants/${TENANT_A}/syndics/${S1}/assemblees/${MB}/visio/participants/${id(702)}/parole`)
          .send({ allowed: true })
      ).status
    ).toBe(404);
    expect(mockLk.setCanSpeak).not.toHaveBeenCalled();

    expect(
      (await request(app).post(url(M1, '/visio/participants/pas-un-uuid/parole')).send({ allowed: true })).status
    ).toBe(400);
    const awa = await joinedToken(AWA);
    expect(
      (
        await request(app)
          .post(url(M1, `/visio/participants/${awa.participantId}/parole`))
          .send({ allowed: 'oui' })
      ).status
    ).toBe(400);
  });
});

describe('POST /visio/participants/:participantId/exclure', () => {
  it('sans révocation : retiré de la salle, son lien fonctionne encore', async () => {
    const awa = await joinedToken(AWA);
    const res = await request(app)
      .post(url(M1, `/visio/participants/${awa.participantId}/exclure`))
      .send({});
    expect(res.status).toBe(200);
    expect(res.body.data.revokedLinks).toBe(0);
    expect(mockLk.removeParticipant).toHaveBeenCalledWith(ROOM, awa.participantId);
    expect((await pub('/etat', { token: awa.token })).status).toBe(200);
    expect(mockAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        actionKey: 'SYNDIC_MEETING_VISIO_PARTICIPANT_REMOVED',
        payload: expect.objectContaining({ participantId: awa.participantId, revokedLinks: 0 })
      })
    );
  });

  it('avec révocation : liens révoqués (404 ensuite, plus de jeton de salle), nombre rendu', async () => {
    const awa = await joinedToken(AWA);
    await issueToken(AWA); // second lien
    const res = await request(app)
      .post(url(M1, `/visio/participants/${awa.participantId}/exclure`))
      .send({ revokeLinks: true });
    expect(res.status).toBe(200);
    expect(res.body.data.revokedLinks).toBe(2);
    expect(mockLk.removeParticipant).toHaveBeenCalledWith(ROOM, awa.participantId);
    expect((await pub('/etat', { token: awa.token })).status).toBe(404);
    expect((await pub('/visio', { token: awa.token })).status).toBe(404);
    expect(mockAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        actionKey: 'SYNDIC_MEETING_VISIO_PARTICIPANT_REMOVED',
        payload: expect.objectContaining({ revokedLinks: 2 })
      })
    );
  });

  it('participant d une autre AG ou d une autre agence = 404, rien n est retiré ni révoqué', async () => {
    mockPrisma.gMParticipant.rows.push(
      { id: id(701), tenantId: TENANT_A, meetingId: M_PLANNED, contactId: AWA },
      { id: id(702), tenantId: TENANT_B, meetingId: MB, contactId: CONTACT_B }
    );
    for (const participantId of [id(701), id(702)]) {
      const res = await request(app)
        .post(url(M1, `/visio/participants/${participantId}/exclure`))
        .send({ revokeLinks: true });
      expect(res.status).toBe(404);
    }
    expect(mockLk.removeParticipant).not.toHaveBeenCalled();
    expect(mockPrisma.secureLink.rows.every((row: any) => !row.revokedAt)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Signal de rafraîchissement et fermeture de la salle
// ---------------------------------------------------------------------------

const flush = () => new Promise(resolve => setImmediate(resolve));

describe('signal de rafraîchissement (ouverture et clôture d un vote)', () => {
  it('envoyé à la salle après l ouverture et la clôture ; un échec ne bloque rien', async () => {
    let res = await request(app)
      .post(url(M1, `/resolutions/${R1}/ouvrir-vote`))
      .send({});
    expect(res.status).toBe(200);
    expect(mockLk.sendRefreshSignal).toHaveBeenCalledWith(ROOM);

    mockLk.sendRefreshSignal.mockRejectedValueOnce(new VisioUnavailableError());
    res = await request(app)
      .post(url(M1, `/resolutions/${R1}/clore-vote`))
      .send({});
    expect(res.status).toBe(200);
    await flush();
    expect(mockLk.sendRefreshSignal).toHaveBeenCalledTimes(2);
  });

  it('pas de signal quand la visio est désactivée', async () => {
    mockLk.enabled = false;
    const res = await request(app)
      .post(url(M1, `/resolutions/${R1}/ouvrir-vote`))
      .send({});
    expect(res.status).toBe(200);
    expect(mockLk.sendRefreshSignal).not.toHaveBeenCalled();
  });
});

describe('fermeture de la salle', () => {
  it.each([
    ['COMPLETED', M1],
    ['CANCELLED', M_PLANNED]
  ])('le passage de l AG à %s ferme la salle', async (status, meetingId) => {
    const res = await request(app).patch(url(meetingId, '')).send({ status });
    expect(res.status).toBe(200);
    await flush();
    expect(mockLk.deleteRoom).toHaveBeenCalledWith(`t_${TENANT_A}__ag_${meetingId}`);
  });

  it('un échec de LiveKit n empêche pas la clôture', async () => {
    mockLk.deleteRoom.mockRejectedValueOnce(new VisioUnavailableError());
    const res = await request(app).patch(url(M1, '')).send({ status: 'COMPLETED' });
    expect(res.status).toBe(200);
    await flush();
    expect(mockPrisma.generalMeeting.rows.find((row: any) => row.id === M1)!.status).toBe('COMPLETED');
  });

  it('une autre mise à jour (lieu) ne ferme pas la salle', async () => {
    const res = await request(app).patch(url(M1, '')).send({ location: 'Salle B' });
    expect(res.status).toBe(200);
    await flush();
    expect(mockLk.deleteRoom).not.toHaveBeenCalled();
  });
});
