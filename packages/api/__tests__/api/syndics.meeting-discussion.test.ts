/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Discussion écrite modérée de la visio de l'AG (spec 046), de bout en bout sur HTTP.
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
  sendRefreshSignal: jest.fn(),
  sendDiscussionEvent: jest.fn()
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
    sendDiscussionEvent: (...args: unknown[]) => mockLk.sendDiscussionEvent(...args),
    mintParticipantToken: jest.fn((input: any) => mint(input)),
    mintModeratorToken: jest.fn((input: any) => mint(input))
  };
});

import meetingLivePublicRoutes from '../../src/routes/meeting-live-public-routes';
import syndicRoutes from '../../src/routes/syndic-routes';
import { errorHandler } from '../../src/middleware/error-middleware';
import { VisioUnavailableError } from '../../src/services/livekit-service';
import { _resetVisioAuditThrottleForTests } from '../../src/lib/syndics/meeting-visio';
import {
  DISCUSSION_MEETING_LIMIT_PER_MINUTE,
  _resetDiscussionMeetingLimitForTests
} from '../../src/lib/syndics/meeting-discussion';

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
  mockLk.sendDiscussionEvent.mockResolvedValue(undefined);

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

beforeEach(() => {
  resetWorld();
  _resetVisioAuditThrottleForTests();
  _resetDiscussionMeetingLimitForTests();
});

const disc = (suffix = '') => url(M1, `/visio/discussion${suffix}`);
const chatAudits = () =>
  mockAudit.mock.calls.map(([entry]) => entry).filter(entry => String(entry.actionKey).includes('_CHAT_'));
const meetingRow = (meetingId = M1) => mockPrisma.generalMeeting.rows.find((row: any) => row.id === meetingId)!;

/** Message déjà en base (id et horodatage maîtrisés : l'ordre ne dépend pas de la milliseconde). */
function seed(n: number, overrides: Record<string, unknown> = {}) {
  const row = {
    id: id(9000 + n),
    tenantId: TENANT_A,
    meetingId: M1,
    authorKind: 'COOWNER',
    participantId: null,
    authorUserId: null,
    authorName: 'Awa Traore',
    body: `message ${n}`,
    hiddenAt: null,
    hiddenByUserId: null,
    createdAt: new Date(Date.UTC(2026, 9, 10, 9, 0, n)),
    updatedAt: new Date(),
    ...overrides
  };
  mockPrisma.gMChatMessage.rows.push(row);
  return row;
}

/** Copropriétaire qui a rejoint l'AG ET se trouve dans la salle. */
async function inRoom(contactId = AWA) {
  const joined = await joinedToken(contactId);
  mockLk.getRoomParticipant.mockImplementation(async (_room: string, identity: string) =>
    identity === joined.participantId ? lkInfo(identity) : null
  );
  mockAudit.mockClear();
  return joined;
}

// ---------------------------------------------------------------------------
// Public : accès
// ---------------------------------------------------------------------------

describe('discussion publique : jeton et préconditions', () => {
  it.each(['/discussion', '/discussion/envoyer'])(
    '%s : jeton invalide ou révoqué = la même 404 uniforme',
    async path => {
      const { token } = await joinedToken(AWA);
      const body = (t?: unknown) => ({ token: t, body: 'Bonjour' });
      const answers = [
        await pub(path, body('x'.repeat(43))),
        await pub(path, body('court')),
        await pub(path, { body: 'Bonjour' }),
        await pub(path, body(12345)),
        // Jeton absent ET texte invalide : la 404 passe avant la validation du texte.
        await pub(path, { body: '' })
      ];
      await request(app).delete(url(M1, `/participants/${AWA}/liens`));
      answers.push(await pub(path, body(token)));
      for (const answer of answers) {
        expect(answer.status).toBe(404);
        expect(answer.body).toEqual(answers[0].body);
        expect(answer.headers['cache-control']).toBe('no-store');
      }
      expect(mockPrisma.gMChatMessage.rows).toHaveLength(0);
      expect(mockLk.sendDiscussionEvent).not.toHaveBeenCalled();
    }
  );

  it('GET et jeton dans l URL ne sont pas servis', async () => {
    const { token } = await joinedToken(AWA);
    expect((await request(app).get('/api/public/assemblees/discussion')).status).toBe(404);
    expect((await request(app).get(`/api/public/assemblees/discussion?token=${token}`)).status).toBe(404);
  });

  it.each(['/discussion', '/discussion/envoyer'])('%s : visio non configurée = 409', async path => {
    const { token } = await joinedToken(AWA);
    mockLk.enabled = false;
    const res = await pub(path, { token, body: 'Bonjour' });
    expect(res.status).toBe(409);
    expect(res.body.message).toBe("La visio intégrée n'est pas activée");
    expect(mockPrisma.gMChatMessage.rows).toHaveLength(0);
  });

  it.each(['/discussion', '/discussion/envoyer'])('%s : avant « Rejoindre » = 409', async path => {
    const token = await issueToken(AWA);
    const res = await pub(path, { token, body: 'Bonjour' });
    expect(res.status).toBe(409);
    expect(res.body.message).toBe("Rejoignez l'assemblée avant d'entrer en visio");
    expect(mockPrisma.gMChatMessage.rows).toHaveLength(0);
  });

  it.each(['PLANNED', 'COMPLETED', 'CANCELLED'])('AG %s : lecture et envoi = 409', async status => {
    const { token } = await inRoom();
    meetingRow().status = status;
    for (const path of ['/discussion', '/discussion/envoyer']) {
      const res = await pub(path, { token, body: 'Bonjour' });
      expect(res.status).toBe(409);
      expect(res.body.message).toBe("L'assemblée n'est pas en cours : la visio est fermée");
    }
    expect(mockPrisma.gMChatMessage.rows).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Public : lecture
// ---------------------------------------------------------------------------

describe('POST /public/assemblees/discussion', () => {
  it('état et historique chronologique ; masqué = body null, jamais le texte ; aucune donnée en trop', async () => {
    const { token, participantId } = await joinedToken(AWA);
    seed(2, { participantId, body: 'deuxième' });
    seed(1, { body: 'premier' });
    seed(3, {
      authorKind: 'MANAGER',
      authorUserId: 'user-manager',
      authorName: 'Marie Syndic',
      body: 'texte secret masqué',
      hiddenAt: new Date('2026-10-10T09:05:00Z'),
      hiddenByUserId: 'user-manager'
    });
    // Message d'une autre agence ou d'une autre AG : jamais servi.
    seed(4, { tenantId: TENANT_B, body: 'agence B' });
    seed(5, { meetingId: M_PLANNED, body: 'autre AG' });

    const res = await pub('/discussion', { token });
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body.data).toMatchObject({ open: true, muted: false, canWrite: true, maxLength: 500 });
    expect(res.body.data.messages.map((m: any) => m.id)).toEqual([id(9001), id(9002), id(9003)]);
    expect(res.body.data.messages[2]).toEqual({
      id: id(9003),
      authorKind: 'MANAGER',
      authorIdentity: 'gestionnaire-user-manager',
      authorName: 'Marie Syndic',
      body: null,
      hidden: true,
      createdAt: '2026-10-10T09:00:03.000Z'
    });
    expect(res.body.data.messages[1]).toMatchObject({ authorKind: 'COOWNER', authorIdentity: participantId });
    const serialized = JSON.stringify(res.body);
    for (const leak of ['texte secret masqué', 'agence B', 'autre AG', 'hiddenBy', 'authorUserId', 'tenantId']) {
      expect(serialized).not.toContain(leak);
    }
    // Lire l'historique ne suppose pas d'être dans la salle.
    expect(mockLk.getRoomParticipant).not.toHaveBeenCalled();
  });

  it('les 200 derniers messages seulement, en ordre chronologique', async () => {
    const { token } = await joinedToken(AWA);
    for (let n = 1; n <= 250; n++) {
      seed(n, { createdAt: new Date(Date.UTC(2026, 9, 10, 9, 0, 0) + n * 1000) });
    }
    const res = await pub('/discussion', { token });
    const ids = res.body.data.messages.map((m: any) => m.id);
    expect(ids).toHaveLength(200);
    expect(ids[0]).toBe(id(9051));
    expect(ids[199]).toBe(id(9250));
  });

  it('discussion fermée ou écriture coupée : on lit, on ne peut plus écrire', async () => {
    const { token, participantId } = await joinedToken(AWA);
    meetingRow().chatClosedAt = new Date();
    let res = await pub('/discussion', { token });
    expect(res.body.data).toMatchObject({ open: false, muted: false, canWrite: false });
    meetingRow().chatClosedAt = null;
    mockPrisma.gMParticipant.rows.find((row: any) => row.id === participantId)!.chatMutedAt = new Date();
    res = await pub('/discussion', { token });
    expect(res.body.data).toMatchObject({ open: true, muted: true, canWrite: false });
  });
});

// ---------------------------------------------------------------------------
// Public : envoi
// ---------------------------------------------------------------------------

describe('POST /public/assemblees/discussion/envoyer', () => {
  it('le copropriétaire présent dans la salle écrit : stocké avec son nom figé, diffusé, aucun audit', async () => {
    const { token, participantId } = await inRoom();
    const res = await pub('/discussion/envoyer', { token, body: '  Bonjour à tous  ' });
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body.data).toMatchObject({
      authorKind: 'COOWNER',
      authorIdentity: participantId,
      authorName: 'Awa Traore',
      body: 'Bonjour à tous',
      hidden: false
    });
    expect(Object.keys(res.body.data).sort()).toEqual(
      ['authorIdentity', 'authorKind', 'authorName', 'body', 'createdAt', 'hidden', 'id'].sort()
    );

    expect(mockPrisma.gMChatMessage.rows).toHaveLength(1);
    expect(mockPrisma.gMChatMessage.rows[0]).toMatchObject({
      id: res.body.data.id,
      tenantId: TENANT_A,
      meetingId: M1,
      authorKind: 'COOWNER',
      participantId,
      authorName: 'Awa Traore',
      body: 'Bonjour à tous'
    });
    // Présence vérifiée dans la salle de CETTE AG, puis diffusion à toute la salle.
    expect(mockLk.getRoomParticipant).toHaveBeenCalledWith(ROOM, participantId);
    expect(mockLk.sendDiscussionEvent).toHaveBeenCalledTimes(1);
    expect(mockLk.sendDiscussionEvent).toHaveBeenCalledWith(
      ROOM,
      { type: 'message', message: res.body.data },
      undefined
    );
    // Le nom est figé : un contact renommé ensuite ne change pas le message.
    mockPrisma.crmContact.rows.find((row: any) => row.id === AWA)!.lastName = 'Renommee';
    const read = await pub('/discussion', { token });
    expect(read.body.data.messages[0].authorName).toBe('Awa Traore');
    // L'envoi n'est pas audité (M13), pas plus que la lecture.
    expect(mockAudit).not.toHaveBeenCalled();
    expect(JSON.stringify(res.body)).not.toContain('awa@example.test');
  });

  it('une personne morale écrit sous sa raison sociale', async () => {
    const { token } = await inRoom();
    Object.assign(
      mockPrisma.crmContact.rows.find((row: any) => row.id === AWA)!,
      { legalName: 'SCI Les Palmiers' }
    );
    const res = await pub('/discussion/envoyer', { token, body: 'Bonjour' });
    expect(res.body.data.authorName).toBe('SCI Les Palmiers');
  });

  it('texte vide, blanc, absent, non textuel ou de plus de 500 caractères = 400 avec le détail', async () => {
    const { token } = await inRoom();
    for (const body of ['', '   \n  ', undefined, 42, 'x'.repeat(501)]) {
      const res = await pub('/discussion/envoyer', { token, body });
      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body)).toContain('body');
    }
    // 500 caractères exactement, entourés d'espaces : accepté (la limite porte sur le texte normalisé).
    const ok = await pub('/discussion/envoyer', { token, body: ` ${'x'.repeat(500)} ` });
    expect(ok.status).toBe(200);
    expect(ok.body.data.body).toHaveLength(500);
    expect(mockPrisma.gMChatMessage.rows).toHaveLength(1);
  });

  it('normalise le texte : retours chariot, contrôles, sauts de ligne multiples', async () => {
    const { token } = await inRoom();
    const res = await pub('/discussion/envoyer', { token, body: 'a\r\nb\u0000\u0007c\n\n\n\n\nd\t' });
    expect(res.status).toBe(200);
    expect(res.body.data.body).toBe('a\nbc\n\nd');
    expect(mockPrisma.gMChatMessage.rows[0].body).toBe('a\nbc\n\nd');
  });

  it('du HTML ou du script reste un texte : conservé tel quel, jamais interprété ni nettoyé', async () => {
    const { token } = await inRoom();
    const text = '<script>alert(1)</script><img src=x onerror=alert(2)> **gras** https://exemple.test';
    const res = await pub('/discussion/envoyer', { token, body: text });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.body.data.body).toBe(text);
    expect(mockPrisma.gMChatMessage.rows[0].body).toBe(text);
    const read = await pub('/discussion', { token });
    expect(read.headers['content-type']).toMatch(/application\/json/);
    expect(read.body.data.messages[0].body).toBe(text);
  });

  it('hors de la salle = 409, rien d’enregistré ni de diffusé', async () => {
    const { token } = await joinedToken(AWA);
    const res = await pub('/discussion/envoyer', { token, body: 'Bonjour' });
    expect(res.status).toBe(409);
    expect(res.body.message).toBe("Vous n'êtes pas dans la visio");
    expect(mockPrisma.gMChatMessage.rows).toHaveLength(0);
    expect(mockLk.sendDiscussionEvent).not.toHaveBeenCalled();
  });

  it('LiveKit injoignable pour le contrôle de présence = 503', async () => {
    const { token } = await joinedToken(AWA);
    mockLk.getRoomParticipant.mockRejectedValueOnce(new VisioUnavailableError());
    const res = await pub('/discussion/envoyer', { token, body: 'Bonjour' });
    expect(res.status).toBe(503);
    expect(res.body.message).toBe('La visio est momentanément indisponible');
    expect(mockPrisma.gMChatMessage.rows).toHaveLength(0);
  });

  it('discussion fermée = 409 ; rouverte, on écrit de nouveau', async () => {
    const { token } = await inRoom();
    meetingRow().chatClosedAt = new Date();
    const res = await pub('/discussion/envoyer', { token, body: 'Bonjour' });
    expect(res.status).toBe(409);
    expect(res.body.message).toBe('La discussion est fermée par le gestionnaire');
    expect(mockPrisma.gMChatMessage.rows).toHaveLength(0);
    meetingRow().chatClosedAt = null;
    expect((await pub('/discussion/envoyer', { token, body: 'Bonjour' })).status).toBe(200);
  });

  it('écriture coupée = 409 ; rétablie, on écrit de nouveau', async () => {
    const { token, participantId } = await inRoom();
    const participant = mockPrisma.gMParticipant.rows.find((row: any) => row.id === participantId)!;
    participant.chatMutedAt = new Date();
    const res = await pub('/discussion/envoyer', { token, body: 'Bonjour' });
    expect(res.status).toBe(409);
    expect(res.body.message).toBe("Le gestionnaire a suspendu votre droit d'écrire");
    expect(mockPrisma.gMChatMessage.rows).toHaveLength(0);
    participant.chatMutedAt = null;
    expect((await pub('/discussion/envoyer', { token, body: 'Bonjour' })).status).toBe(200);
  });

  it('une diffusion qui échoue ne fait pas échouer l’envoi : le message est conservé', async () => {
    const { token } = await inRoom();
    mockLk.sendDiscussionEvent.mockRejectedValueOnce(new VisioUnavailableError());
    const res = await pub('/discussion/envoyer', { token, body: 'Bonjour' });
    expect(res.status).toBe(200);
    expect(mockPrisma.gMChatMessage.rows).toHaveLength(1);
    const read = await pub('/discussion', { token });
    expect(read.body.data.messages.map((m: any) => m.body)).toEqual(['Bonjour']);
  });

  it('le limiteur coupe au 11e envoi de la minute (429), par lien', async () => {
    const { token } = await joinedToken(AWA);
    const other = await joinedToken(BAKARY);
    mockLk.getRoomParticipant.mockImplementation(async (_room: string, identity: string) => lkInfo(identity));
    for (let n = 1; n <= 10; n++) {
      expect((await pub('/discussion/envoyer', { token, body: `message ${n}` })).status).toBe(200);
    }
    const blocked = await pub('/discussion/envoyer', { token, body: 'message 11' });
    expect(blocked.status).toBe(429);
    expect(blocked.headers['cache-control']).toBe('no-store');
    expect(mockPrisma.gMChatMessage.rows).toHaveLength(10);
    // L'autre lien n'est pas touché ; la lecture a son propre compteur.
    expect((await pub('/discussion/envoyer', { token: other.token, body: 'Bonjour' })).status).toBe(200);
    expect((await pub('/discussion', { token })).status).toBe(200);
  });

  it('une coupure intercalée entre le contrôle de présence et la création = 409, rien d’enregistré', async () => {
    const { token, participantId } = await inRoom();
    mockLk.getRoomParticipant.mockImplementation(async (_room: string, identity: string) => {
      mockPrisma.gMParticipant.rows.find((row: any) => row.id === participantId)!.chatMutedAt = new Date();
      return lkInfo(identity);
    });
    const res = await pub('/discussion/envoyer', { token, body: 'Bonjour' });
    expect(res.status).toBe(409);
    expect(res.body.message).toBe("Le gestionnaire a suspendu votre droit d'écrire");
    expect(mockPrisma.gMChatMessage.rows).toHaveLength(0);
    expect(mockLk.sendDiscussionEvent).not.toHaveBeenCalled();
  });

  it('une fermeture intercalée entre le contrôle de présence et la création = 409, rien d’enregistré', async () => {
    const { token, participantId } = await inRoom();
    mockLk.getRoomParticipant.mockImplementation(async (_room: string, identity: string) => {
      meetingRow().chatClosedAt = new Date();
      return lkInfo(identity);
    });
    const res = await pub('/discussion/envoyer', { token, body: 'Bonjour' });
    expect(res.status).toBe(409);
    expect(res.body.message).toBe('La discussion est fermée par le gestionnaire');
    expect(participantId).toBeTruthy();
    expect(mockPrisma.gMChatMessage.rows).toHaveLength(0);
  });

  it('le plafond par AG coupe au 121e envoi de la minute (429), une autre AG n’est pas touchée', async () => {
    const OTHER = id(206);
    mockPrisma.generalMeeting.rows.push({ ...meetingRow(), id: OTHER });
    const { token } = await inRoom();
    for (let n = 1; n <= DISCUSSION_MEETING_LIMIT_PER_MINUTE; n++) {
      const sent = await request(app)
        .post(disc('/messages'))
        .send({ body: `annonce ${n}` });
      expect(sent.status).toBe(200);
    }
    // Copropriétaires et gestionnaire confondus : le 121e envoi est refusé, quel qu'en soit l'auteur.
    const blocked = await pub('/discussion/envoyer', { token, body: 'trop tard' });
    expect(blocked.status).toBe(429);
    expect(blocked.body.code).toBe('TOO_MANY_REQUESTS');
    expect(blocked.body.message).toBe('Trop de messages dans cette assemblée, patientez un instant');
    const blockedManager = await request(app).post(disc('/messages')).send({ body: 'encore' });
    expect(blockedManager.status).toBe(429);
    expect(mockPrisma.gMChatMessage.rows).toHaveLength(DISCUSSION_MEETING_LIMIT_PER_MINUTE);
    // Une autre AG a son propre compteur.
    const other = await request(app).post(url(OTHER, '/visio/discussion/messages')).send({ body: 'Bonjour' });
    expect(other.status).toBe(200);
    // La fenêtre se referme : après remise à zéro, l'AG écrit de nouveau.
    _resetDiscussionMeetingLimitForTests();
    expect((await request(app).post(disc('/messages')).send({ body: 'reprise' })).status).toBe(200);
  });

  it('le limiteur de lecture coupe au 31e appel de la minute (429)', async () => {
    const { token } = await joinedToken(AWA);
    for (let n = 1; n <= 30; n++) expect((await pub('/discussion', { token })).status).toBe(200);
    expect((await pub('/discussion', { token })).status).toBe(429);
  });
});

// ---------------------------------------------------------------------------
// Gestionnaire : lecture et écriture
// ---------------------------------------------------------------------------

describe('GET /visio/discussion (console)', () => {
  it('visio non configurée = 200 « désactivée »', async () => {
    mockLk.enabled = false;
    seed(1);
    const res = await request(app).get(disc());
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body.data).toMatchObject({ enabled: false, open: true, maxLength: 500, mutedParticipantIds: [] });
    expect(res.body.data.messages).toHaveLength(1);
  });

  it('toute la discussion, masqués compris avec leur texte, auteur du masquage nommé, participants coupés', async () => {
    const { participantId } = await joinedToken(AWA);
    const other = await joinedToken(BAKARY);
    mockPrisma.gMParticipant.rows.find((row: any) => row.id === participantId)!.chatMutedAt = new Date();
    meetingRow().chatClosedAt = new Date();
    seed(2, { participantId: other.participantId, body: 'deux' });
    seed(1, { participantId, body: 'un', authorName: 'Awa Traore' });
    seed(3, {
      body: 'texte masqué',
      hiddenAt: new Date('2026-10-10T09:05:00Z'),
      hiddenByUserId: 'user-manager'
    });
    seed(4, { tenantId: TENANT_B, body: 'agence B' });
    seed(5, { meetingId: M_DONE, body: 'autre AG' });

    const res = await request(app).get(disc());
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      enabled: true,
      open: false,
      maxLength: 500,
      mutedParticipantIds: [participantId]
    });
    expect(res.body.data.messages.map((m: any) => m.body)).toEqual(['un', 'deux', 'texte masqué']);
    expect(res.body.data.messages[2]).toMatchObject({
      hidden: true,
      body: 'texte masqué',
      hiddenAt: '2026-10-10T09:05:00.000Z',
      hiddenByName: 'Marie Syndic',
      participantId: null
    });
    expect(res.body.data.messages[0]).toMatchObject({ participantId, hiddenAt: null, hiddenByName: null });
    expect(JSON.stringify(res.body)).not.toMatch(/agence B|autre AG|passwordHash|secret-hash|marie@example/);
  });

  it('après la clôture, le gestionnaire relit encore la discussion ; les copropriétaires n’y accèdent plus', async () => {
    const { token } = await inRoom();
    seed(1, { body: 'avant la clôture' });
    meetingRow().status = 'COMPLETED';
    const res = await request(app).get(disc());
    expect(res.status).toBe(200);
    expect(res.body.data.messages.map((m: any) => m.body)).toEqual(['avant la clôture']);
    expect((await pub('/discussion', { token })).status).toBe(409);
  });

  it('une AG d’une autre agence ou inexistante = 404', async () => {
    seed(1);
    let res = await request(app).get(`/api/tenants/${TENANT_B}/syndics/${S1}/assemblees/${M1}/visio/discussion`);
    expect(res.status).toBe(404);
    res = await request(app).get(`/api/tenants/${TENANT_B}/syndics/${SB}/assemblees/${M1}/visio/discussion`);
    expect(res.status).toBe(404);
    res = await request(app).get(`/api/tenants/${TENANT_A}/syndics/${SB}/assemblees/${MB}/visio/discussion`);
    expect(res.status).toBe(404);
    res = await request(app).get(`/api/tenants/${TENANT_A}/syndics/${S1}/assemblees/${id(999)}/visio/discussion`);
    expect(res.status).toBe(404);
  });
});

describe('POST /visio/discussion/messages (gestionnaire)', () => {
  it('le gestionnaire écrit pendant la séance, sans être dans la salle : nom, identité, diffusion', async () => {
    const res = await request(app).post(disc('/messages')).send({ body: '  Annonce : le vote s’ouvre. ' });
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body.data).toMatchObject({
      authorKind: 'MANAGER',
      authorIdentity: 'gestionnaire-user-manager',
      authorName: 'Marie Syndic',
      body: 'Annonce : le vote s’ouvre.',
      hidden: false,
      participantId: null,
      hiddenAt: null,
      hiddenByName: null
    });
    expect(mockPrisma.gMChatMessage.rows[0]).toMatchObject({
      tenantId: TENANT_A,
      meetingId: M1,
      authorKind: 'MANAGER',
      authorUserId: 'user-manager'
    });
    expect(mockLk.getRoomParticipant).not.toHaveBeenCalled();
    expect(mockLk.sendDiscussionEvent).toHaveBeenCalledWith(
      ROOM,
      {
        type: 'message',
        message: expect.objectContaining({
          id: res.body.data.id,
          authorKind: 'MANAGER',
          body: 'Annonce : le vote s’ouvre.'
        })
      },
      undefined
    );
    expect(chatAudits()).toHaveLength(0);
  });

  it('écrit même quand la discussion est fermée aux copropriétaires', async () => {
    meetingRow().chatClosedAt = new Date();
    expect((await request(app).post(disc('/messages')).send({ body: 'Annonce' })).status).toBe(200);
  });

  it('AG non en cours ou visio non configurée = 409', async () => {
    let res = await request(app).post(url(M_PLANNED, '/visio/discussion/messages')).send({ body: 'Annonce' });
    expect(res.status).toBe(409);
    res = await request(app).post(url(M_DONE, '/visio/discussion/messages')).send({ body: 'Annonce' });
    expect(res.status).toBe(409);
    mockLk.enabled = false;
    res = await request(app).post(disc('/messages')).send({ body: 'Annonce' });
    expect(res.status).toBe(409);
    expect(res.body.message).toBe("La visio intégrée n'est pas activée");
    expect(mockPrisma.gMChatMessage.rows).toHaveLength(0);
  });

  it('corps strict : texte vide, trop long ou champ inconnu = 400 ; autre agence = 404', async () => {
    for (const payload of [{}, { body: '' }, { body: ' \n ' }, { body: 'x'.repeat(501) }, { body: 'ok', extra: 1 }]) {
      expect((await request(app).post(disc('/messages')).send(payload)).status).toBe(400);
    }
    const res = await request(app)
      .post(`/api/tenants/${TENANT_B}/syndics/${SB}/assemblees/${M1}/visio/discussion/messages`)
      .send({ body: 'Intrusion' });
    expect(res.status).toBe(404);
    expect(mockPrisma.gMChatMessage.rows).toHaveLength(0);
  });

  it('une diffusion qui échoue ne fait pas échouer l’envoi', async () => {
    mockLk.sendDiscussionEvent.mockRejectedValueOnce(new Error('boom'));
    const res = await request(app).post(disc('/messages')).send({ body: 'Annonce' });
    expect(res.status).toBe(200);
    expect(mockPrisma.gMChatMessage.rows).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Gestionnaire : modération
// ---------------------------------------------------------------------------

describe('POST /visio/discussion/messages/:messageId/masquer', () => {
  it('masque (disparaît chez tous, texte plus servi aux copropriétaires) puis rétablit', async () => {
    const { token } = await inRoom();
    const sent = await pub('/discussion/envoyer', { token, body: 'Message à modérer' });
    const messageId = sent.body.data.id;
    mockLk.sendDiscussionEvent.mockClear();
    mockAudit.mockClear();

    let res = await request(app)
      .post(disc(`/messages/${messageId}/masquer`))
      .send({ hidden: true });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      id: messageId,
      hidden: true,
      body: 'Message à modérer',
      hiddenByName: 'Marie Syndic'
    });
    expect(res.body.data.hiddenAt).toEqual(expect.any(String));
    expect(mockLk.sendDiscussionEvent).toHaveBeenCalledTimes(1);
    expect(mockLk.sendDiscussionEvent).toHaveBeenCalledWith(ROOM, { type: 'hidden', id: messageId }, undefined);

    // Côté copropriétaire : mention masquée, body null, le texte ne sort plus.
    const read = await pub('/discussion', { token });
    expect(read.body.data.messages[0]).toMatchObject({ id: messageId, hidden: true, body: null });
    expect(JSON.stringify(read.body)).not.toContain('Message à modérer');
    // Côté gestionnaire : le texte reste lisible, marqué masqué.
    const manager = await request(app).get(disc());
    expect(manager.body.data.messages[0]).toMatchObject({ hidden: true, body: 'Message à modérer' });

    // Idempotent : ni nouvel audit ni nouvelle diffusion.
    res = await request(app)
      .post(disc(`/messages/${messageId}/masquer`))
      .send({ hidden: true });
    expect(res.status).toBe(200);
    expect(res.body.data.hidden).toBe(true);
    expect(mockLk.sendDiscussionEvent).toHaveBeenCalledTimes(1);

    mockLk.sendDiscussionEvent.mockClear();
    res = await request(app)
      .post(disc(`/messages/${messageId}/masquer`))
      .send({ hidden: false });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ id: messageId, hidden: false, hiddenAt: null, hiddenByName: null });
    expect(mockLk.sendDiscussionEvent).toHaveBeenCalledWith(
      ROOM,
      {
        type: 'restored',
        message: expect.objectContaining({ id: messageId, body: 'Message à modérer', hidden: false })
      },
      undefined
    );
    const again = await pub('/discussion', { token });
    expect(again.body.data.messages[0]).toMatchObject({ hidden: false, body: 'Message à modérer' });

    // Audits : masqué puis rétabli, jamais le texte.
    expect(chatAudits().map(entry => entry.actionKey)).toEqual([
      'SYNDIC_MEETING_CHAT_MESSAGE_HIDDEN',
      'SYNDIC_MEETING_CHAT_MESSAGE_RESTORED'
    ]);
    expect(chatAudits()[0]).toMatchObject({
      actorUserId: 'user-manager',
      tenantId: TENANT_A,
      entityType: 'GMChatMessage',
      entityId: messageId,
      payload: { meetingId: M1, messageId }
    });
    expect(JSON.stringify(mockAudit.mock.calls)).not.toContain('Message à modérer');
  });

  it('un message d’une autre AG, d’une autre agence ou inexistant = la même 404 ; id mal formé = 400', async () => {
    seed(1, { meetingId: M_PLANNED });
    seed(2, { tenantId: TENANT_B });
    const answers = [
      await request(app)
        .post(disc(`/messages/${id(9001)}/masquer`))
        .send({ hidden: true }),
      await request(app)
        .post(disc(`/messages/${id(9002)}/masquer`))
        .send({ hidden: true }),
      await request(app)
        .post(disc(`/messages/${id(9999)}/masquer`))
        .send({ hidden: true })
    ];
    for (const answer of answers) {
      expect(answer.status).toBe(404);
      expect(answer.body).toEqual(answers[0].body);
    }
    expect((await request(app).post(disc('/messages/pas-un-uuid/masquer')).send({ hidden: true })).status).toBe(400);
    // Une autre agence ne masque rien dans l'AG de l'agence A, même avec un id valide.
    seed(3);
    const foreign = await request(app)
      .post(`/api/tenants/${TENANT_B}/syndics/${S1}/assemblees/${M1}/visio/discussion/messages/${id(9003)}/masquer`)
      .send({ hidden: true });
    expect(foreign.status).toBe(404);
    expect(mockPrisma.gMChatMessage.rows.every((row: any) => row.hiddenAt == null)).toBe(true);
    expect(chatAudits()).toHaveLength(0);
  });

  it('corps strict : `hidden` obligatoire et booléen, aucun autre champ', async () => {
    seed(1);
    for (const payload of [{}, { hidden: 'oui' }, { hidden: true, extra: 1 }]) {
      expect(
        (
          await request(app)
            .post(disc(`/messages/${id(9001)}/masquer`))
            .send(payload)
        ).status
      ).toBe(400);
    }
  });

  it('on modère aussi après la séance', async () => {
    seed(1);
    meetingRow().status = 'COMPLETED';
    const res = await request(app)
      .post(disc(`/messages/${id(9001)}/masquer`))
      .send({ hidden: true });
    expect(res.status).toBe(200);
  });
});

describe('POST /visio/participants/:participantId/ecriture', () => {
  it('coupe l’écriture (message ciblé, 409 à l’envoi, survit à la reconnexion) puis la rétablit', async () => {
    const { token, participantId } = await inRoom();
    const path = url(M1, `/visio/participants/${participantId}/ecriture`);

    let res = await request(app).post(path).send({ allowed: false });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ participantId, muted: true });
    expect(mockLk.sendDiscussionEvent).toHaveBeenCalledWith(ROOM, { type: 'muted', muted: true }, [participantId]);
    expect(mockPrisma.gMParticipant.rows.find((row: any) => row.id === participantId)!.chatMutedAt).toBeInstanceOf(
      Date
    );

    const blocked = await pub('/discussion/envoyer', { token, body: 'Bonjour' });
    expect(blocked.status).toBe(409);
    expect(blocked.body.message).toBe("Le gestionnaire a suspendu votre droit d'écrire");
    // Reconnexion : une nouvelle lecture dit toujours « coupé ».
    expect((await pub('/discussion', { token })).body.data).toMatchObject({ muted: true, canWrite: false });
    expect((await request(app).get(disc())).body.data.mutedParticipantIds).toEqual([participantId]);

    // Idempotent : ni nouvel audit ni nouveau message ciblé.
    mockLk.sendDiscussionEvent.mockClear();
    res = await request(app).post(path).send({ allowed: false });
    expect(res.body.data).toEqual({ participantId, muted: true });
    expect(mockLk.sendDiscussionEvent).not.toHaveBeenCalled();

    res = await request(app).post(path).send({ allowed: true });
    expect(res.body.data).toEqual({ participantId, muted: false });
    expect(mockLk.sendDiscussionEvent).toHaveBeenCalledWith(ROOM, { type: 'muted', muted: false }, [participantId]);
    expect((await pub('/discussion/envoyer', { token, body: 'Bonjour' })).status).toBe(200);

    expect(chatAudits().map(entry => entry.actionKey)).toEqual([
      'SYNDIC_MEETING_CHAT_PARTICIPANT_MUTED',
      'SYNDIC_MEETING_CHAT_PARTICIPANT_UNMUTED'
    ]);
    expect(chatAudits()[0]).toMatchObject({
      actorUserId: 'user-manager',
      tenantId: TENANT_A,
      entityType: 'GMParticipant',
      entityId: participantId,
      payload: { meetingId: M1, participantId, contactId: AWA }
    });
  });

  it('couper l’écriture ne touche pas aux autres participants', async () => {
    const { participantId } = await joinedToken(AWA);
    const other = await joinedToken(BAKARY);
    await request(app)
      .post(url(M1, `/visio/participants/${participantId}/ecriture`))
      .send({ allowed: false });
    expect(mockPrisma.gMParticipant.rows.find((row: any) => row.id === other.participantId)!.chatMutedAt).toBeFalsy();
    expect((await pub('/discussion', { token: other.token })).body.data.muted).toBe(false);
  });

  it('un participant d’une autre AG, d’une autre agence ou inexistant = la même 404 ; id mal formé = 400', async () => {
    mockPrisma.gMParticipant.rows.push(
      { id: id(701), tenantId: TENANT_A, meetingId: M_PLANNED, contactId: AWA, joinedAt: null },
      { id: id(702), tenantId: TENANT_B, meetingId: MB, contactId: CONTACT_B, joinedAt: null }
    );
    const answers = [
      await request(app)
        .post(url(M1, `/visio/participants/${id(701)}/ecriture`))
        .send({ allowed: false }),
      await request(app)
        .post(url(M1, `/visio/participants/${id(702)}/ecriture`))
        .send({ allowed: false }),
      await request(app)
        .post(url(M1, `/visio/participants/${id(799)}/ecriture`))
        .send({ allowed: false })
    ];
    for (const answer of answers) {
      expect(answer.status).toBe(404);
      expect(answer.body).toEqual(answers[0].body);
    }
    const malformed = await request(app)
      .post(url(M1, '/visio/participants/pas-un-uuid/ecriture'))
      .send({ allowed: false });
    expect(malformed.status).toBe(400);
    // Depuis l'agence B, un participant de l'agence A (même AG) reste inaccessible.
    const { participantId } = await joinedToken(AWA);
    const foreign = await request(app)
      .post(`/api/tenants/${TENANT_B}/syndics/${S1}/assemblees/${M1}/visio/participants/${participantId}/ecriture`)
      .send({ allowed: false });
    expect(foreign.status).toBe(404);
    expect(mockPrisma.gMParticipant.rows.every((row: any) => row.chatMutedAt == null)).toBe(true);
    expect(chatAudits()).toHaveLength(0);
  });

  it('corps strict : `allowed` obligatoire et booléen', async () => {
    const { participantId } = await joinedToken(AWA);
    const path = url(M1, `/visio/participants/${participantId}/ecriture`);
    for (const payload of [{}, { allowed: 'non' }, { allowed: true, extra: 1 }]) {
      expect((await request(app).post(path).send(payload)).status).toBe(400);
    }
  });
});

describe('POST /visio/discussion/etat', () => {
  it('ferme puis rouvre la discussion pour toute la salle ; le gestionnaire écrit toujours', async () => {
    const { token } = await inRoom();

    let res = await request(app).post(disc('/etat')).send({ open: false });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ open: false });
    expect(mockLk.sendDiscussionEvent).toHaveBeenCalledWith(ROOM, { type: 'state', open: false }, undefined);
    expect((await pub('/discussion', { token })).body.data).toMatchObject({ open: false, canWrite: false });
    expect((await pub('/discussion/envoyer', { token, body: 'Bonjour' })).status).toBe(409);
    expect((await request(app).post(disc('/messages')).send({ body: 'Annonce' })).status).toBe(200);
    expect((await request(app).get(disc())).body.data.open).toBe(false);

    // Idempotent : ni audit ni diffusion de plus.
    mockLk.sendDiscussionEvent.mockClear();
    mockAudit.mockClear();
    res = await request(app).post(disc('/etat')).send({ open: false });
    expect(res.body.data).toEqual({ open: false });
    expect(mockLk.sendDiscussionEvent).not.toHaveBeenCalled();
    expect(chatAudits()).toHaveLength(0);

    res = await request(app).post(disc('/etat')).send({ open: true });
    expect(res.body.data).toEqual({ open: true });
    expect(mockLk.sendDiscussionEvent).toHaveBeenCalledWith(ROOM, { type: 'state', open: true }, undefined);
    expect((await pub('/discussion/envoyer', { token, body: 'Bonjour' })).status).toBe(200);

    expect(chatAudits().map(entry => entry.actionKey)).toEqual(['SYNDIC_MEETING_CHAT_OPENED']);
  });

  it('audite la fermeture (sans texte) avec l’AG comme objet', async () => {
    await request(app).post(disc('/etat')).send({ open: false });
    expect(chatAudits()).toHaveLength(1);
    expect(chatAudits()[0]).toMatchObject({
      actionKey: 'SYNDIC_MEETING_CHAT_CLOSED',
      actorUserId: 'user-manager',
      tenantId: TENANT_A,
      entityType: 'GeneralMeeting',
      entityId: M1,
      payload: { meetingId: M1 }
    });
  });

  it('AG close ou annulée = 409, état inchangé ; planifiée = permis', async () => {
    for (const status of ['COMPLETED', 'CANCELLED']) {
      meetingRow().status = status;
      const res = await request(app).post(disc('/etat')).send({ open: false });
      expect(res.status).toBe(409);
      expect(meetingRow().chatClosedAt).toBeFalsy();
    }
    expect((await request(app).post(url(M_PLANNED, '/visio/discussion/etat')).send({ open: false })).status).toBe(200);
  });

  it('corps strict ; autre agence = 404', async () => {
    for (const payload of [{}, { open: 'oui' }, { open: true, extra: 1 }]) {
      expect((await request(app).post(disc('/etat')).send(payload)).status).toBe(400);
    }
    const res = await request(app)
      .post(`/api/tenants/${TENANT_B}/syndics/${SB}/assemblees/${M1}/visio/discussion/etat`)
      .send({ open: false });
    expect(res.status).toBe(404);
    expect(mockPrisma.generalMeeting.rows.every((row: any) => row.chatClosedAt == null)).toBe(true);
  });
});

describe('GET /visio : chatMuted (spec 046)', () => {
  it('les participants de la salle portent chatMuted ; toujours false pour un gestionnaire', async () => {
    const { participantId } = await joinedToken(AWA);
    const other = await joinedToken(BAKARY);
    mockPrisma.gMParticipant.rows.find((row: any) => row.id === participantId)!.chatMutedAt = new Date();
    mockLk.listRoomParticipants.mockResolvedValue([
      lkInfo(participantId),
      lkInfo(other.participantId),
      lkInfo('gestionnaire-user-manager')
    ]);
    const res = await request(app).get(url(M1, '/visio'));
    expect(res.status).toBe(200);
    const byName = (name: string) => res.body.data.participants.find((p: any) => p.name === name);
    expect(byName('Awa Traore').chatMuted).toBe(true);
    expect(byName('Bakary Diallo').chatMuted).toBe(false);
    expect(byName('Marie Syndic')).toMatchObject({ kind: 'MANAGER', chatMuted: false });
  });
});

describe('discussion : le serveur seul parle', () => {
  it('lire ou écrire ne délivre aucun jeton de salle (donc aucun droit de publication)', async () => {
    const { token } = await inRoom();
    await pub('/discussion/envoyer', { token, body: 'Bonjour' });
    await pub('/discussion', { token });
    const livekit = jest.requireMock('../../src/services/livekit-service');
    expect(livekit.mintParticipantToken).not.toHaveBeenCalled();
    expect(livekit.mintModeratorToken).not.toHaveBeenCalled();
    expect(mockLk.ensureRoom).not.toHaveBeenCalled();
  });
});
