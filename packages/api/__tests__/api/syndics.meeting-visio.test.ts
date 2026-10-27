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

// Droits par rôle (route de jeton modérateur) : simulés, la garde de route l'est aussi.
const mockHasPermission = jest.fn();
jest.mock('../../src/services/permission-service', () => ({
  hasPermission: (...args: unknown[]) => mockHasPermission(...args)
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
  muteParticipantTracks: jest.fn(),
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
    muteParticipantTracks: (...args: unknown[]) => mockLk.muteParticipantTracks(...args),
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
import { _resetVisioAuditThrottleForTests } from '../../src/lib/syndics/meeting-visio';

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
  mockLk.muteParticipantTracks.mockResolvedValue(0);
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

const awaRow = (participantId: string): any =>
  mockPrisma.gMParticipant.rows.find((row: any) => row.id === participantId);

const lkInfo = (identity: string, extra: Record<string, unknown> = {}) => ({
  identity,
  name: 'nom-livekit',
  attributes: {},
  permission: { canPublish: false },
  joinedAtMs: BigInt(Date.parse('2026-10-10T09:01:00Z')),
  joinedAt: BigInt(Math.floor(Date.parse('2026-10-10T09:01:00Z') / 1000)),
  ...extra
});

beforeEach(() => {
  resetWorld();
  _resetVisioAuditThrottleForTests();
});

// ---------------------------------------------------------------------------
// Public
// ---------------------------------------------------------------------------

describe('vue publique : visio.enabled', () => {
  it('reflète la configuration LiveKit, rien d autre', async () => {
    const token = await issueToken(AWA);
    let res = await pub('/etat', { token });
    expect(res.body.data.visio).toEqual({ enabled: true, recording: false, mediaAllowed: true });
    mockLk.enabled = false;
    res = await pub('/etat', { token });
    expect(res.body.data.visio).toEqual({ enabled: false, recording: false, mediaAllowed: true });
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
    expect(Object.keys(res.body.data).sort()).toEqual([
      'expiresAt',
      'identity',
      'mediaAllowed',
      'roomName',
      'serverUrl',
      'token'
    ]);
    expect(res.body.data).toMatchObject({
      identity: participantId,
      roomName: ROOM,
      serverUrl: 'wss://visio.example.test',
      mediaAllowed: true
    });
    expect(mockLk.ensureRoom).toHaveBeenCalledWith(ROOM);

    const livekit = jest.requireMock('../../src/services/livekit-service');
    expect(livekit.mintParticipantToken).toHaveBeenCalledWith({
      roomName: ROOM,
      identity: participantId,
      name: 'Awa Traore',
      canPublish: true
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
  it('visio non configurée = 200 « désactivée » (la portée reste vérifiée d abord)', async () => {
    mockLk.enabled = false;
    const res = await request(app).get(url(M1, '/visio'));
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      enabled: false,
      roomName: null,
      roomActive: false,
      mediaLocked: false,
      participants: [],
      recording: { enabled: false, active: null },
      degraded: false,
      unrecognized: 0
    });
    expect(mockLk.listRoomParticipants).not.toHaveBeenCalled();
    expect((await request(app).get(`/api/tenants/${TENANT_A}/syndics/${S1}/assemblees/${MB}/visio`)).status).toBe(404);
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
    expect(res.body.data).toMatchObject({ enabled: true, roomName: ROOM, roomActive: true, mediaLocked: false });
    expect(res.body.data.participants).toEqual([
      {
        identity: awa.participantId,
        kind: 'COOWNER',
        participantId: awa.participantId,
        contactId: AWA,
        name: 'Awa Traore',
        handRaisedAt: '2026-10-10T09:05:00.000Z',
        canSpeak: false,
        mediaAllowed: true,
        mediaPolicy: 'DEFAULT',
        mic: { published: false, muted: false },
        camera: { published: false, muted: false },
        joinedAt: '2026-10-10T09:01:00.000Z',
        chatMuted: false
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
        mediaAllowed: true,
        mediaPolicy: 'DEFAULT',
        mic: { published: false, muted: false },
        camera: { published: false, muted: false },
        joinedAt: '2026-10-10T09:01:00.000Z',
        chatMuted: false
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
    // Sans interdiction globale, « autorisé » est le comportement par défaut.
    expect(awaRow(awa.participantId).mediaPolicy).toBe('DEFAULT');
    expect(mockAudit).toHaveBeenCalledWith(
      expect.objectContaining({ actionKey: 'SYNDIC_MEETING_VISIO_SPEAK_GRANTED', entityId: awa.participantId })
    );

    // LiveKit retire les pistes : la salle ne les publie plus.
    mockLk.listRoomParticipants.mockResolvedValue([lkInfo(awa.participantId)]);
    res = await request(app)
      .post(url(M1, `/visio/participants/${awa.participantId}/parole`))
      .send({ allowed: false });
    expect(res.status).toBe(200);
    expect(mockLk.setCanSpeak).toHaveBeenLastCalledWith(ROOM, awa.participantId, false);
    expect(awaRow(awa.participantId).mediaPolicy).toBe('BLOCKED');
    expect(mockAudit).toHaveBeenCalledWith(
      expect.objectContaining({ actionKey: 'SYNDIC_MEETING_VISIO_SPEAK_REVOKED' })
    );
  });

  it('participant absent de la salle : la décision est posée en base, rien n est envoyé à LiveKit', async () => {
    const awa = await joinedToken(AWA);
    const res = await request(app)
      .post(url(M1, `/visio/participants/${awa.participantId}/parole`))
      .send({ allowed: false });
    expect(res.status).toBe(200);
    expect(awaRow(awa.participantId).mediaPolicy).toBe('BLOCKED');
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
    expect(mockLk.removeParticipant).toHaveBeenCalledWith(ROOM, awa.participantId, { revokeTokens: false });
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
    expect(mockLk.removeParticipant).toHaveBeenCalledWith(ROOM, awa.participantId, { revokeTokens: true });
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

// ---------------------------------------------------------------------------
// Correctifs de revue et d'audit (phase 3)
// ---------------------------------------------------------------------------

describe('exclusion : liens révoqués avant le retrait, jeton de salle invalidé', () => {
  it('à l instant du retrait, les liens sont déjà révoqués', async () => {
    const awa = await joinedToken(AWA);
    let linksRevokedAtRemoval: boolean | null = null;
    mockLk.removeParticipant.mockImplementation(async () => {
      linksRevokedAtRemoval = mockPrisma.secureLink.rows.every((row: any) => Boolean(row.revokedAt));
    });
    const res = await request(app)
      .post(url(M1, `/visio/participants/${awa.participantId}/exclure`))
      .send({ revokeLinks: true });
    expect(res.status).toBe(200);
    expect(linksRevokedAtRemoval).toBe(true);
  });
});

describe('GET /visio : identité gestionnaire sans droit sur l agence', () => {
  it('retirée de la salle (jetons invalidés), le super-administrateur et les membres restent', async () => {
    mockPrisma.user.rows.push({
      id: 'user-root',
      fullName: 'Root Admin',
      globalRole: 'SUPER_ADMIN',
      passwordHash: 'h'
    });
    mockLk.listRoomParticipants.mockResolvedValue([
      lkInfo('gestionnaire-user-manager'),
      lkInfo('gestionnaire-user-root'),
      lkInfo('gestionnaire-user-other'),
      lkInfo('gestionnaire-inconnu')
    ]);
    const res = await request(app).get(url(M1, '/visio'));
    expect(res.status).toBe(200);
    expect(res.body.data.participants.map((p: any) => p.name).sort()).toEqual(['Marie Syndic', 'Root Admin']);
    expect(mockLk.removeParticipant).toHaveBeenCalledTimes(2);
    expect(mockLk.removeParticipant).toHaveBeenCalledWith(ROOM, 'gestionnaire-user-other', { revokeTokens: true });
    expect(mockLk.removeParticipant).toHaveBeenCalledWith(ROOM, 'gestionnaire-inconnu', { revokeTokens: true });
    expect(JSON.stringify(res.body)).not.toContain('passwordHash');
  });

  it('un échec du retrait ne casse pas la lecture', async () => {
    mockLk.listRoomParticipants.mockResolvedValue([lkInfo('gestionnaire-user-other')]);
    mockLk.removeParticipant.mockRejectedValue(new VisioUnavailableError());
    const res = await request(app).get(url(M1, '/visio'));
    expect(res.status).toBe(200);
    expect(res.body.data.participants).toEqual([]);
  });
});

describe('courses LiveKit : participant parti entre la lecture et l écriture', () => {
  it('main levée : 409 « Vous n êtes pas dans la visio » (pas 503)', async () => {
    const { token, participantId } = await joinedToken(AWA);
    mockLk.getRoomParticipant.mockResolvedValue(lkInfo(participantId));
    mockLk.setHandRaised.mockResolvedValue(false);
    const res = await pub('/visio/main', { token, raised: true });
    expect(res.status).toBe(409);
    expect(res.body.message).toBe("Vous n'êtes pas dans la visio");
  });

  it('parole : parti entre la lecture et l écriture, la décision posée en base reste (200, pas 503)', async () => {
    const awa = await joinedToken(AWA);
    mockLk.getRoomParticipant.mockResolvedValue(lkInfo(awa.participantId));
    mockLk.setCanSpeak.mockResolvedValue(false);
    const res = await request(app)
      .post(url(M1, `/visio/participants/${awa.participantId}/parole`))
      .send({ allowed: false });
    expect(res.status).toBe(200);
    expect(awaRow(awa.participantId).mediaPolicy).toBe('BLOCKED');
  });
});

describe('jeton public : un seul audit par participant et par 10 minutes', () => {
  it('trois demandes de jeton, un audit', async () => {
    const { token } = await joinedToken(AWA);
    for (let i = 0; i < 3; i += 1) expect((await pub('/visio', { token })).status).toBe(200);
    const audits = mockAudit.mock.calls.filter(([entry]) => entry.actionKey === 'SYNDIC_MEETING_VISIO_TOKEN_ISSUED');
    expect(audits).toHaveLength(1);
  });

  it('participant disparu entre le lien et le jeton : la 404 uniforme du lien', async () => {
    const { token, participantId } = await joinedToken(AWA);
    const unknown = await pub('/visio', { token: 'x'.repeat(43) });
    const real = mockPrisma.gMParticipant.rows.find((row: any) => row.id === participantId);
    const original = mockPrisma.gMParticipant.findFirst;
    const calls = [{ ...real }, null];
    mockPrisma.gMParticipant.findFirst = (async () => calls.shift() ?? null) as any;
    const res = await pub('/visio', { token });
    mockPrisma.gMParticipant.findFirst = original;
    expect(res.status).toBe(404);
    expect(res.body).toEqual(unknown.body);
    expect(res.body.message).not.toContain('Participant');
  });
});

describe('corps des routes du gestionnaire : champs inconnus refusés', () => {
  it('parole et exclusion en .strict()', async () => {
    const awa = await joinedToken(AWA);
    mockLk.getRoomParticipant.mockResolvedValue(lkInfo(awa.participantId));
    expect(
      (
        await request(app)
          .post(url(M1, `/visio/participants/${awa.participantId}/parole`))
          .send({ allowed: true, extra: 1 })
      ).status
    ).toBe(400);
    expect(
      (
        await request(app)
          .post(url(M1, `/visio/participants/${awa.participantId}/exclure`))
          .send({ revokeLinks: true, extra: 1 })
      ).status
    ).toBe(400);
    expect(mockLk.setCanSpeak).not.toHaveBeenCalled();
    expect(mockLk.removeParticipant).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Recette du 2026-10-17 : GET /visio pendant la séance (cartes qui disparaissent,
// copropriétaire absent de la liste, gestionnaire expulsé)
// ---------------------------------------------------------------------------

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * `GMParticipant.id` est une colonne Postgres `uuid` : une valeur qui n'en est pas une dans un
 * `id IN (...)` fait échouer TOUTE la requête (Prisma P2023). La base en mémoire ne le sait pas.
 */
function makeParticipantIdStrictUuid(): void {
  const original = mockPrisma.gMParticipant.findMany.bind(mockPrisma.gMParticipant);
  mockPrisma.gMParticipant.findMany = (async (args: any) => {
    const ids: unknown[] = args?.where?.id?.in ?? [];
    if (ids.some(value => typeof value !== 'string' || !UUID_RE.test(value))) {
      throw Object.assign(new Error('Inconsistent column data: Error creating UUID'), { code: 'P2023' });
    }
    return original(args);
  }) as any;
}

function seedRunningRecording(): void {
  mockPrisma.gMRecording.rows.push({
    id: id(901),
    tenantId: TENANT_A,
    meetingId: M1,
    egressId: 'EG_rec1',
    status: 'RECORDING',
    storageKey: 'k',
    fileUrl: null,
    fileSize: null,
    durationSeconds: null,
    failureReason: null,
    webhookEventId: null,
    startedAt: new Date('2026-10-10T09:30:00Z'),
    startedByUserId: 'user-manager',
    stoppedAt: null,
    endedAt: null
  });
}

describe('GET /visio : identités de salle qui ne sont pas des participants (enregistreur, agents)', () => {
  it('le participant enregistreur EG_… ne fait pas échouer la lecture ; le copropriétaire reste listé', async () => {
    makeParticipantIdStrictUuid();
    const awa = await joinedToken(AWA);
    seedRunningRecording();
    mockLk.listRoomParticipants.mockResolvedValue([
      lkInfo('EG_aBcDeF123456'),
      lkInfo(awa.participantId),
      lkInfo('gestionnaire-user-manager', { permission: { canPublish: true } })
    ]);

    const res = await request(app).get(url(M1, '/visio'));

    expect(res.status).toBe(200);
    expect(res.body.data.participants.map((p: any) => p.name)).toEqual(['Awa Traore', 'Marie Syndic']);
    expect(res.body.data.recording.active).toMatchObject({ id: id(901), status: 'RECORDING' });
    expect(res.body.data.degraded).toBe(false);
    expect(res.body.data.unrecognized).toBe(1);
    // L'enregistreur n'est jamais expulsé de la salle.
    expect(mockLk.removeParticipant).not.toHaveBeenCalled();
  });

  it('un participant d une autre AG ou agence reste ignoré (compté, jamais exposé)', async () => {
    makeParticipantIdStrictUuid();
    mockPrisma.gMParticipant.rows.push(
      { id: id(701), tenantId: TENANT_A, meetingId: M_PLANNED, contactId: AWA },
      { id: id(702), tenantId: TENANT_B, meetingId: MB, contactId: CONTACT_B }
    );
    mockLk.listRoomParticipants.mockResolvedValue([lkInfo(id(701)), lkInfo(id(702)), lkInfo('EG_x')]);
    const res = await request(app).get(url(M1, '/visio'));
    expect(res.status).toBe(200);
    expect(res.body.data.participants).toEqual([]);
    expect(res.body.data.unrecognized).toBe(3);
    expect(mockLk.removeParticipant).not.toHaveBeenCalled();
  });
});

describe('GET /visio : dégradation si LiveKit échoue', () => {
  it('liste des participants indisponible : 200, enabled vrai, degraded vrai, enregistrement lu en base', async () => {
    seedRunningRecording();
    mockLk.listRoomParticipants.mockRejectedValue(new VisioUnavailableError());

    const res = await request(app).get(url(M1, '/visio'));

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      enabled: true,
      roomName: ROOM,
      roomActive: false,
      participants: [],
      degraded: true,
      unrecognized: 0
    });
    expect(res.body.data.recording.active).toMatchObject({ id: id(901) });
    expect(mockLk.removeParticipant).not.toHaveBeenCalled();
  });

  it('existence de la salle indisponible (salle vide) : 200 dégradé', async () => {
    mockLk.listRoomParticipants.mockResolvedValue([]);
    mockLk.roomExists.mockRejectedValue(new VisioUnavailableError());
    const res = await request(app).get(url(M1, '/visio'));
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ enabled: true, participants: [], degraded: true });
  });

  it('état nominal : degraded faux, unrecognized 0 ; visio désactivée : mêmes champs', async () => {
    let res = await request(app).get(url(M1, '/visio'));
    expect(res.body.data).toMatchObject({ degraded: false, unrecognized: 0 });
    mockLk.enabled = false;
    res = await request(app).get(url(M1, '/visio'));
    expect(res.body.data).toMatchObject({ enabled: false, degraded: false, unrecognized: 0 });
  });

  it('une AG d une autre agence reste un 404, même quand LiveKit est en panne', async () => {
    mockLk.listRoomParticipants.mockRejectedValue(new VisioUnavailableError());
    expect((await request(app).get(`/api/tenants/${TENANT_A}/syndics/${S1}/assemblees/${MB}/visio`)).status).toBe(404);
  });
});

describe('GET /visio : un gestionnaire qui a pu obtenir un jeton n est pas expulsé', () => {
  beforeEach(() => {
    mockHasPermission.mockReset();
    mockHasPermission.mockResolvedValue(false);
  });

  it('accès par TenantClient + SYNDIC_EDIT dans CETTE agence : reconnu, non expulsé', async () => {
    mockPrisma.user.rows.push({ id: 'user-client', fullName: 'Paul Client', passwordHash: 'h' });
    mockPrisma.tenantClient.rows.push({ userId: 'user-client', tenantId: TENANT_A, clientType: 'OWNER' });
    mockHasPermission.mockImplementation(
      async (userId: string, key: string, tenantId?: string) =>
        userId === 'user-client' && key === 'SYNDIC_EDIT' && tenantId === TENANT_A
    );
    mockLk.listRoomParticipants.mockResolvedValue([lkInfo('gestionnaire-user-client')]);

    const res = await request(app).get(url(M1, '/visio'));

    expect(res.status).toBe(200);
    expect(res.body.data.participants.map((p: any) => p.name)).toEqual(['Paul Client']);
    expect(mockLk.removeParticipant).not.toHaveBeenCalled();
  });

  it('membre suspendu, sans accès client, ou droit d une autre agence : expulsé', async () => {
    mockPrisma.user.rows.push(
      { id: 'user-disabled', fullName: 'Suspendu', passwordHash: 'h' },
      { id: 'user-noperm', fullName: 'Sans droit', passwordHash: 'h' }
    );
    mockPrisma.membership.rows.push({
      userId: 'user-disabled',
      tenantId: TENANT_A,
      status: 'DISABLED',
      user: { fullName: 'Suspendu' }
    });
    mockPrisma.tenantClient.rows.push({ userId: 'user-noperm', tenantId: TENANT_A, clientType: 'OWNER' });
    // Droit SYNDIC_EDIT, mais seulement dans l'agence B.
    mockHasPermission.mockImplementation(
      async (userId: string, _key: string, tenantId?: string) => userId === 'user-other' && tenantId === TENANT_B
    );
    mockPrisma.tenantClient.rows.push({ userId: 'user-other', tenantId: TENANT_B, clientType: 'OWNER' });
    mockLk.listRoomParticipants.mockResolvedValue([
      lkInfo('gestionnaire-user-disabled'),
      lkInfo('gestionnaire-user-noperm'),
      lkInfo('gestionnaire-user-other')
    ]);

    const res = await request(app).get(url(M1, '/visio'));

    expect(res.status).toBe(200);
    expect(res.body.data.participants).toEqual([]);
    expect(mockLk.removeParticipant).toHaveBeenCalledTimes(3);
    expect(mockLk.removeParticipant).toHaveBeenCalledWith(ROOM, 'gestionnaire-user-disabled', { revokeTokens: true });
    expect(mockLk.removeParticipant).toHaveBeenCalledWith(ROOM, 'gestionnaire-user-noperm', { revokeTokens: true });
    expect(mockLk.removeParticipant).toHaveBeenCalledWith(ROOM, 'gestionnaire-user-other', { revokeTokens: true });
  });

  it('si la vérification des droits échoue, personne n est expulsé (on ne retire pas dans le doute)', async () => {
    mockPrisma.user.rows.push({ id: 'user-client', fullName: 'Paul Client', passwordHash: 'h' });
    mockPrisma.tenantClient.rows.push({ userId: 'user-client', tenantId: TENANT_A, clientType: 'OWNER' });
    mockHasPermission.mockRejectedValue(new Error('db down'));
    mockLk.listRoomParticipants.mockResolvedValue([lkInfo('gestionnaire-user-client')]);

    const res = await request(app).get(url(M1, '/visio'));

    expect(res.status).toBe(200);
    expect(res.body.data.degraded).toBe(true);
    expect(mockLk.removeParticipant).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Spec 045, V16 (décision du 2026-10-17) : micro et caméra des copropriétaires,
// coupure, interdiction individuelle ou globale, persistance à la reconnexion.
// ---------------------------------------------------------------------------

const livekitMock = () => jest.requireMock('../../src/services/livekit-service');
const lastMintedParticipant = () => {
  const calls = livekitMock().mintParticipantToken.mock.calls;
  return calls[calls.length - 1][0];
};
const meetingRow = (meetingId = M1): any => mockPrisma.generalMeeting.rows.find((row: any) => row.id === meetingId);
const auditKeys = () => mockAudit.mock.calls.map(([entry]) => entry.actionKey);
const parole = (participantId: string, allowed: boolean, meetingId = M1) =>
  request(app)
    .post(url(meetingId, `/visio/participants/${participantId}/parole`))
    .send({ allowed });
const verrou = (locked: boolean, meetingId = M1) =>
  request(app).post(url(meetingId, '/visio/media/verrou')).send({ locked });
const couper = (participantId: string, body: unknown = {}, meetingId = M1) =>
  request(app)
    .post(url(meetingId, `/visio/participants/${participantId}/couper`))
    .send(body as any);

describe('V16 : jeton du copropriétaire, droit de publier décidé par le serveur', () => {
  it('par défaut : micro et caméra autorisés dès l entrée', async () => {
    const { token } = await joinedToken(AWA);
    const res = await pub('/visio', { token });
    expect(res.status).toBe(200);
    expect(res.body.data.mediaAllowed).toBe(true);
    expect(lastMintedParticipant().canPublish).toBe(true);
    // Les droits fins (sources, pas de partage d écran, pas de canal de données) : test unitaire de `livekit-service`.
  });

  it('interdit à ce participant : le jeton ne permet pas de publier, et l interdiction survit à la reconnexion', async () => {
    const awa = await joinedToken(AWA);
    expect((await parole(awa.participantId, false)).status).toBe(200);

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const res = await pub('/visio', { token: awa.token });
      expect(res.status).toBe(200);
      expect(res.body.data.mediaAllowed).toBe(false);
      expect(lastMintedParticipant()).toMatchObject({ identity: awa.participantId, canPublish: false });
    }
    // Le copropriétaire voit aussi l état dans la vue publique (interrogée toutes les 3 s).
    const view = await pub('/etat', { token: awa.token });
    expect(view.body.data.visio.mediaAllowed).toBe(false);

    // Le droit rendu, le jeton suivant publie de nouveau.
    expect((await parole(awa.participantId, true)).status).toBe(200);
    const again = await pub('/visio', { token: awa.token });
    expect(again.body.data.mediaAllowed).toBe(true);
    expect(lastMintedParticipant().canPublish).toBe(true);
  });

  it('interdit à tous : plus personne ne publie à l entrée ; la parole donnée à un seul est une exception', async () => {
    const awa = await joinedToken(AWA);
    const bakary = await joinedToken(BAKARY);
    expect((await verrou(true)).status).toBe(200);

    for (const who of [awa, bakary]) {
      const res = await pub('/visio', { token: who.token });
      expect(res.body.data.mediaAllowed).toBe(false);
      expect(lastMintedParticipant().canPublish).toBe(false);
    }
    // Donner la parole à Awa seulement.
    expect((await parole(awa.participantId, true)).status).toBe(200);
    expect(awaRow(awa.participantId).mediaPolicy).toBe('ALLOWED');
    expect((await pub('/visio', { token: awa.token })).body.data.mediaAllowed).toBe(true);
    expect((await pub('/visio', { token: bakary.token })).body.data.mediaAllowed).toBe(false);

    // Une interdiction individuelle l emporte sur tout, même quand l interdiction globale est levée.
    expect((await parole(bakary.participantId, false)).status).toBe(200);
    expect((await verrou(false)).status).toBe(200);
    expect((await pub('/visio', { token: bakary.token })).body.data.mediaAllowed).toBe(false);
    expect((await pub('/visio', { token: awa.token })).body.data.mediaAllowed).toBe(true);
  });
});

describe('V16 : POST /visio/participants/:participantId/parole (interdiction individuelle)', () => {
  it('interdit un participant qui n est pas encore dans la salle : posé en base, audité, rien envoyé à LiveKit', async () => {
    const awa = await joinedToken(AWA);
    const res = await parole(awa.participantId, false);
    expect(res.status).toBe(200);
    expect(awaRow(awa.participantId).mediaPolicy).toBe('BLOCKED');
    expect(mockLk.setCanSpeak).not.toHaveBeenCalled();
    expect(mockAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        actionKey: 'SYNDIC_MEETING_VISIO_SPEAK_REVOKED',
        tenantId: TENANT_A,
        entityId: awa.participantId,
        payload: expect.objectContaining({ meetingId: M1, mediaPolicy: 'BLOCKED' })
      })
    );
  });

  it('interdit un participant présent : ses pistes sont retirées par LiveKit', async () => {
    const awa = await joinedToken(AWA);
    mockLk.getRoomParticipant.mockResolvedValue(lkInfo(awa.participantId, { permission: { canPublish: true } }));
    const res = await parole(awa.participantId, false);
    expect(res.status).toBe(200);
    expect(mockLk.setCanSpeak).toHaveBeenCalledWith(ROOM, awa.participantId, false);
  });

  it('participant d une autre AG ou agence = 404 sans rien écrire ; AG close = 409 ; visio désactivée = 409', async () => {
    const awa = await joinedToken(AWA);
    mockPrisma.gMParticipant.rows.push(
      { id: id(701), tenantId: TENANT_A, meetingId: M_PLANNED, contactId: AWA },
      { id: id(702), tenantId: TENANT_B, meetingId: MB, contactId: CONTACT_B }
    );
    expect((await parole(id(701), false)).status).toBe(404);
    expect((await parole(id(702), false)).status).toBe(404);
    expect(awaRow(id(701)).mediaPolicy).toBeUndefined();
    expect(awaRow(id(702)).mediaPolicy).toBeUndefined();

    mockPrisma.gMParticipant.rows.push({ id: id(703), tenantId: TENANT_A, meetingId: M_DONE, contactId: AWA });
    expect((await parole(id(703), false, M_DONE)).status).toBe(409);
    expect(awaRow(id(703)).mediaPolicy).toBeUndefined();

    mockLk.enabled = false;
    expect((await parole(awa.participantId, false)).status).toBe(409);
    expect(awaRow(awa.participantId).mediaPolicy).toBeUndefined();
  });
});

describe('V16 : POST /visio/participants/:participantId/couper', () => {
  it('coupe le micro et la caméra par défaut, audite sans jeton, rend la vue et le nombre de pistes', async () => {
    const awa = await joinedToken(AWA);
    mockLk.muteParticipantTracks.mockResolvedValue(2);
    mockLk.listRoomParticipants.mockResolvedValue([
      lkInfo(awa.participantId, {
        permission: { canPublish: true },
        tracks: [
          { sid: 'TR_a', source: 2, muted: true }, // MICROPHONE
          { sid: 'TR_b', source: 1, muted: false } // CAMERA
        ]
      })
    ]);
    const res = await couper(awa.participantId);
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(mockLk.muteParticipantTracks).toHaveBeenCalledWith(ROOM, awa.participantId, [2, 1]);
    expect(res.body.data.mutedTracks).toBe(2);
    expect(res.body.data.participants[0]).toMatchObject({
      participantId: awa.participantId,
      mic: { published: true, muted: true },
      camera: { published: true, muted: false }
    });
    const audit = mockAudit.mock.calls
      .map(([entry]) => entry)
      .find(entry => entry.actionKey === 'SYNDIC_MEETING_VISIO_PARTICIPANT_MUTED');
    expect(audit).toMatchObject({
      tenantId: TENANT_A,
      actorUserId: 'user-manager',
      entityId: awa.participantId,
      payload: { meetingId: M1, sources: ['MICROPHONE', 'CAMERA'], mutedTracks: 2 }
    });
  });

  it('seulement le micro quand c est demandé ; la politique du participant n est pas touchée (ce n est pas une interdiction)', async () => {
    const awa = await joinedToken(AWA);
    mockLk.muteParticipantTracks.mockResolvedValue(1);
    const res = await couper(awa.participantId, { sources: ['MICROPHONE'] });
    expect(res.status).toBe(200);
    expect(mockLk.muteParticipantTracks).toHaveBeenCalledWith(ROOM, awa.participantId, [2]);
    expect(awaRow(awa.participantId).mediaPolicy).toBeUndefined();
    expect(mockLk.setCanSpeak).not.toHaveBeenCalled();
  });

  it('participant absent de la salle = 409, rien d audité', async () => {
    const awa = await joinedToken(AWA);
    mockLk.muteParticipantTracks.mockResolvedValue(null);
    const res = await couper(awa.participantId);
    expect(res.status).toBe(409);
    expect(auditKeys()).not.toContain('SYNDIC_MEETING_VISIO_PARTICIPANT_MUTED');
  });

  it('isolation : participant d une autre AG, d une autre agence ou inconnu = 404 ; AG d une autre agence = 404', async () => {
    mockPrisma.gMParticipant.rows.push(
      { id: id(701), tenantId: TENANT_A, meetingId: M_PLANNED, contactId: AWA },
      { id: id(702), tenantId: TENANT_B, meetingId: MB, contactId: CONTACT_B }
    );
    for (const participantId of [id(701), id(702), id(799)]) {
      expect((await couper(participantId)).status).toBe(404);
    }
    expect(
      (
        await request(app)
          .post(`/api/tenants/${TENANT_A}/syndics/${S1}/assemblees/${MB}/visio/participants/${id(702)}/couper`)
          .send({})
      ).status
    ).toBe(404);
    expect(mockLk.muteParticipantTracks).not.toHaveBeenCalled();
  });

  it('validation : id invalide, source inconnue, champ en trop, liste vide = 400 ; AG close et visio désactivée = 409', async () => {
    const awa = await joinedToken(AWA);
    expect((await couper('pas-un-uuid')).status).toBe(400);
    expect((await couper(awa.participantId, { sources: ['SCREEN_SHARE'] })).status).toBe(400);
    expect((await couper(awa.participantId, { sources: [] })).status).toBe(400);
    expect((await couper(awa.participantId, { extra: 1 })).status).toBe(400);
    expect(mockLk.muteParticipantTracks).not.toHaveBeenCalled();

    mockPrisma.gMParticipant.rows.push({ id: id(703), tenantId: TENANT_A, meetingId: M_DONE, contactId: AWA });
    expect((await couper(id(703), {}, M_DONE)).status).toBe(409);
    mockLk.enabled = false;
    expect((await couper(awa.participantId)).status).toBe(409);
    expect(mockLk.muteParticipantTracks).not.toHaveBeenCalled();
  });
});

describe('V16 : POST /visio/media/verrou (interdire ou rendre à tous)', () => {
  const present = (participantId: string, canPublish: boolean) => lkInfo(participantId, { permission: { canPublish } });

  it('interdit à tous : état posé en base, exceptions levées, copropriétaires présents ramenés à « ne publie pas »', async () => {
    const awa = await joinedToken(AWA);
    const bakary = await joinedToken(BAKARY);
    awaRow(bakary.participantId).mediaPolicy = 'ALLOWED';
    mockPrisma.gMParticipant.rows.push({ id: id(701), tenantId: TENANT_A, meetingId: M_PLANNED, contactId: AWA });
    // La salle suit les appels de LiveKit : un droit retiré n apparaît plus à la lecture suivante.
    const room: any[] = [
      present(awa.participantId, true),
      present(bakary.participantId, true),
      present(id(701), true), // participant d une autre AG : jamais touché
      lkInfo('gestionnaire-user-manager', { permission: { canPublish: true } }),
      lkInfo('EG_enregistreur', { permission: { canPublish: true } })
    ];
    mockLk.listRoomParticipants.mockImplementation(async () => room);
    mockLk.setCanSpeak.mockImplementation(async (_room: string, identity: string, allowed: boolean) => {
      room.find(info => info.identity === identity).permission.canPublish = allowed;
    });

    const res = await verrou(true);
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(meetingRow().mediaLockedAt).toBeInstanceOf(Date);
    expect(res.body.data.mediaLocked).toBe(true);
    // « Tous » : l exception accordée à Bakary est levée.
    expect(awaRow(bakary.participantId).mediaPolicy).toBe('DEFAULT');

    const touched = mockLk.setCanSpeak.mock.calls.map(call => call.slice(0, 3));
    expect(touched).toEqual(
      expect.arrayContaining([
        [ROOM, awa.participantId, false],
        [ROOM, bakary.participantId, false]
      ])
    );
    expect(touched).toHaveLength(2);
    // Les mains levées ne sont pas baissées.
    for (const call of mockLk.setCanSpeak.mock.calls) expect(call[3]).toEqual({ lowerHand: false });
    expect(mockAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        actionKey: 'SYNDIC_MEETING_VISIO_MEDIA_LOCKED',
        tenantId: TENANT_A,
        actorUserId: 'user-manager',
        entityId: M1
      })
    );
    // Les jetons suivants ne publient plus.
    expect((await pub('/visio', { token: awa.token })).body.data.mediaAllowed).toBe(false);
  });

  it('déjà interdit à tous : une exception ALLOWED remise à DEFAULT est tout de même auditée', async () => {
    const bakary = await joinedToken(BAKARY);
    meetingRow().mediaLockedAt = new Date('2026-10-10T09:00:00Z');
    awaRow(bakary.participantId).mediaPolicy = 'ALLOWED';
    mockLk.listRoomParticipants.mockResolvedValue([]);
    mockAudit.mockClear();

    expect((await verrou(true)).status).toBe(200);
    expect(awaRow(bakary.participantId).mediaPolicy).toBe('DEFAULT');
    expect(mockAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        actionKey: 'SYNDIC_MEETING_VISIO_MEDIA_LOCKED',
        entityId: M1,
        payload: expect.objectContaining({ clearedExceptions: 1 })
      })
    );
    // Répétition sans rien à changer : pas de second audit.
    mockAudit.mockClear();
    expect((await verrou(true)).status).toBe(200);
    expect(mockAudit).not.toHaveBeenCalledWith(
      expect.objectContaining({ actionKey: 'SYNDIC_MEETING_VISIO_MEDIA_LOCKED' })
    );
  });

  it('rend à tous : seuls les présents non interdits individuellement retrouvent le droit', async () => {
    const awa = await joinedToken(AWA);
    const bakary = await joinedToken(BAKARY);
    meetingRow().mediaLockedAt = new Date('2026-10-10T09:00:00Z');
    awaRow(bakary.participantId).mediaPolicy = 'BLOCKED';
    mockLk.listRoomParticipants.mockResolvedValue([
      present(awa.participantId, false),
      present(bakary.participantId, false)
    ]);

    const res = await verrou(false);
    expect(res.status).toBe(200);
    expect(meetingRow().mediaLockedAt).toBeNull();
    expect(res.body.data.mediaLocked).toBe(false);
    expect(mockLk.setCanSpeak.mock.calls.map(call => call.slice(0, 3))).toEqual([[ROOM, awa.participantId, true]]);
    expect(awaRow(bakary.participantId).mediaPolicy).toBe('BLOCKED');
    expect(auditKeys()).toContain('SYNDIC_MEETING_VISIO_MEDIA_UNLOCKED');
  });

  it('idempotent : répéter resynchronise la salle sans changer l état ni auditer une seconde fois', async () => {
    const awa = await joinedToken(AWA);
    mockLk.listRoomParticipants.mockResolvedValue([present(awa.participantId, true)]);
    expect((await verrou(true)).status).toBe(200);
    const lockedAt = meetingRow().mediaLockedAt;
    mockAudit.mockClear();
    expect((await verrou(true)).status).toBe(200);
    expect(meetingRow().mediaLockedAt).toBe(lockedAt);
    expect(auditKeys()).not.toContain('SYNDIC_MEETING_VISIO_MEDIA_LOCKED');
  });

  it('LiveKit en panne : 503 mais la décision reste posée (les jetons la respectent déjà)', async () => {
    const awa = await joinedToken(AWA);
    mockLk.listRoomParticipants.mockRejectedValue(new VisioUnavailableError());
    expect((await verrou(true)).status).toBe(503);
    expect(meetingRow().mediaLockedAt).toBeInstanceOf(Date);
    mockLk.listRoomParticipants.mockResolvedValue([]);
    expect((await pub('/visio', { token: awa.token })).body.data.mediaAllowed).toBe(false);
  });

  it('GET /visio expose mediaLocked et, par participant, politique, droit décidé et pistes', async () => {
    const awa = await joinedToken(AWA);
    meetingRow().mediaLockedAt = new Date();
    awaRow(awa.participantId).mediaPolicy = 'ALLOWED';
    mockLk.listRoomParticipants.mockResolvedValue([present(awa.participantId, true)]);
    const res = await request(app).get(url(M1, '/visio'));
    expect(res.body.data.mediaLocked).toBe(true);
    expect(res.body.data.participants[0]).toMatchObject({
      participantId: awa.participantId,
      mediaPolicy: 'ALLOWED',
      mediaAllowed: true,
      canSpeak: true
    });
  });

  it('isolation et validation : AG d une autre agence = 404 sans toucher LiveKit ; corps invalide = 400 ; AG close et visio désactivée = 409', async () => {
    expect(
      (
        await request(app)
          .post(`/api/tenants/${TENANT_A}/syndics/${S1}/assemblees/${MB}/visio/media/verrou`)
          .send({ locked: true })
      ).status
    ).toBe(404);
    expect(mockLk.listRoomParticipants).not.toHaveBeenCalled();
    expect(meetingRow(MB).mediaLockedAt).toBeUndefined();

    expect((await request(app).post(url(M1, '/visio/media/verrou')).send({ locked: 'oui' })).status).toBe(400);
    expect((await request(app).post(url(M1, '/visio/media/verrou')).send({})).status).toBe(400);
    expect((await request(app).post(url(M1, '/visio/media/verrou')).send({ locked: true, extra: 1 })).status).toBe(400);
    expect((await verrou(true, M_DONE)).status).toBe(409);
    expect(meetingRow(M_DONE).mediaLockedAt).toBeUndefined();
    mockLk.enabled = false;
    expect((await verrou(true)).status).toBe(409);
    expect(meetingRow().mediaLockedAt).toBeUndefined();
  });

  it('autorisable avant le début de la séance (AG planifiée) : le gestionnaire prépare la salle', async () => {
    expect((await verrou(true, M_PLANNED)).status).toBe(200);
    expect(meetingRow(M_PLANNED).mediaLockedAt).toBeInstanceOf(Date);
  });
});

describe('V16 : l interdiction décidée en base est rappliquée à la salle', () => {
  it('un copropriétaire qui publie malgré l interdiction (jeton ancien rejoué) est ramené au droit décidé', async () => {
    const awa = await joinedToken(AWA);
    awaRow(awa.participantId).mediaPolicy = 'BLOCKED';
    mockLk.listRoomParticipants.mockResolvedValue([lkInfo(awa.participantId, { permission: { canPublish: true } })]);
    const res = await request(app).get(url(M1, '/visio'));
    expect(res.status).toBe(200);
    expect(mockLk.setCanSpeak).toHaveBeenCalledWith(ROOM, awa.participantId, false, { lowerHand: false });
    expect(res.body.data.participants[0]).toMatchObject({ mediaAllowed: false, canSpeak: false });
  });

  it('jamais dans l autre sens, et un échec de LiveKit ne casse pas la lecture', async () => {
    const awa = await joinedToken(AWA);
    mockLk.listRoomParticipants.mockResolvedValue([lkInfo(awa.participantId, { permission: { canPublish: false } })]);
    expect((await request(app).get(url(M1, '/visio'))).status).toBe(200);
    expect(mockLk.setCanSpeak).not.toHaveBeenCalled();

    awaRow(awa.participantId).mediaPolicy = 'BLOCKED';
    mockLk.listRoomParticipants.mockResolvedValue([lkInfo(awa.participantId, { permission: { canPublish: true } })]);
    mockLk.setCanSpeak.mockRejectedValue(new VisioUnavailableError());
    const res = await request(app).get(url(M1, '/visio'));
    expect(res.status).toBe(200);
    expect(res.body.data.participants[0].canSpeak).toBe(true);
  });
});
