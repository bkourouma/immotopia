/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-var-requires */
/**
 * Enregistrement des AG en visio (spec 045, R1 à R10), de bout en bout sur HTTP.
 *
 * Même pile que `syndics.meeting-visio.test.ts` (vrais routeurs, zod, services, liens
 * sécurisés ; base en mémoire qui applique les filtres `where`). Simulés : le service
 * LiveKit (Egress, signature du webhook — la vraie signature est vérifiée par
 * `__tests__/unit/livekit-service.test.ts`) et le stockage S3. Le stockage privé est un
 * vrai dossier temporaire (`UPLOADS_DIR`).
 */

const nodeOs = require('os');
const nodePath = require('path');
const nodeFs = require('fs');
const UPLOADS_ROOT: string = nodeFs.mkdtempSync(nodePath.join(nodeOs.tmpdir(), 'immotopia-ag-rec-'));
process.env.UPLOADS_DIR = UPLOADS_ROOT;

import express from 'express';
import request from 'supertest';
import { createFakePrisma } from '../helpers/fake-prisma';

const mockPrisma = createFakePrisma();
// La base en mémoire n'applique pas les valeurs par défaut du schéma (startedAt, status).
const fakeCreate = mockPrisma.gMRecording.create.bind(mockPrisma.gMRecording);
mockPrisma.gMRecording.create = ((args: any) =>
  fakeCreate({ ...args, data: { startedAt: new Date(), status: 'RECORDING', ...args.data } })) as any;
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

const mockLk = {
  enabled: true,
  recordingEnabled: true,
  ensureRoom: jest.fn(),
  roomExists: jest.fn(),
  listRoomParticipants: jest.fn(),
  getRoomParticipant: jest.fn(),
  startMeetingRecording: jest.fn(),
  stopEgress: jest.fn(),
  getEgressStatus: jest.fn(),
  deleteRoom: jest.fn(),
  sendRefreshSignal: jest.fn()
};
jest.mock('../../src/services/livekit-service', () => {
  const actual = jest.requireActual('../../src/services/livekit-service');
  return {
    ...actual,
    isVisioEnabled: () => mockLk.enabled,
    isRecordingEnabled: () => mockLk.enabled && mockLk.recordingEnabled,
    ensureRoom: (...a: unknown[]) => mockLk.ensureRoom(...a),
    roomExists: (...a: unknown[]) => mockLk.roomExists(...a),
    listRoomParticipants: (...a: unknown[]) => mockLk.listRoomParticipants(...a),
    getRoomParticipant: (...a: unknown[]) => mockLk.getRoomParticipant(...a),
    startMeetingRecording: (...a: unknown[]) => mockLk.startMeetingRecording(...a),
    stopEgress: (...a: unknown[]) => mockLk.stopEgress(...a),
    getEgressStatus: (...a: unknown[]) => mockLk.getEgressStatus(...a),
    deleteRoom: (...a: unknown[]) => mockLk.deleteRoom(...a),
    sendRefreshSignal: (...a: unknown[]) => mockLk.sendRefreshSignal(...a),
    // Signature simulée : l'en-tête « valid » signe le corps ; la vraie vérification est testée en unitaire.
    verifyWebhook: async (raw: string, auth: string | undefined) => {
      if (auth !== 'valid') throw new Error('invalid signature');
      return JSON.parse(raw, (_k, v) => (v && typeof v === 'object' && v.__big !== undefined ? BigInt(v.__big) : v));
    }
  };
});

const mockStorage = {
  download: jest.fn(),
  remove: jest.fn()
};
jest.mock('../../src/lib/syndics/meeting-recording-storage', () => ({
  downloadRecordingObject: (...a: unknown[]) => mockStorage.download(...a),
  deleteRecordingObject: (...a: unknown[]) => mockStorage.remove(...a)
}));

import { EgressStatus } from 'livekit-server-sdk';
import meetingLivePublicRoutes from '../../src/routes/meeting-live-public-routes';
import livekitWebhookRoutes from '../../src/routes/livekit-webhook-routes';
import syndicRoutes from '../../src/routes/syndic-routes';
import { uploadsAccessGuard } from '../../src/middleware/uploads-access-middleware';
import { errorHandler } from '../../src/middleware/error-middleware';

const app = express();
app.use('/api/webhooks/livekit', livekitWebhookRoutes);
app.use('/api', meetingLivePublicRoutes);
app.use(express.json());
app.use('/uploads', uploadsAccessGuard, express.static(UPLOADS_ROOT));
app.use('/api', syndicRoutes);
app.use(errorHandler);

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const TENANT_A = 'tenant-a';
const TENANT_B = 'tenant-b';
const S1 = id(101);
const SB = id(102);
const M1 = id(201);
const M_PLANNED = id(202);
const MB = id(204);
const L1 = id(301);
const LB = id(305);
const AWA = 'contact-awa';
const CONTACT_B = 'contact-b';
const ROOM = `t_${TENANT_A}__ag_${M1}`;
const FILE_BYTES = Buffer.from('0123456789-FAKE-MP4-CONTENT-0123456789');

const url = (meetingId: string, suffix: string) =>
  `/api/tenants/${TENANT_A}/syndics/${S1}/assemblees/${meetingId}${suffix}`;
const flush = async () => {
  await new Promise(resolve => setImmediate(resolve));
  await new Promise(resolve => setImmediate(resolve));
};

function resetWorld(meetingStatus = 'IN_PROGRESS') {
  mockPrisma.reset();
  mockAudit.mockClear();
  for (const fn of [...Object.values(mockLk), ...Object.values(mockStorage)]) {
    if (typeof fn === 'function') (fn as jest.Mock).mockReset();
  }
  mockLk.enabled = true;
  mockLk.recordingEnabled = true;
  mockLk.ensureRoom.mockResolvedValue(undefined);
  mockLk.roomExists.mockResolvedValue(true);
  mockLk.listRoomParticipants.mockResolvedValue([]);
  mockLk.stopEgress.mockResolvedValue(undefined);
  mockLk.getEgressStatus.mockResolvedValue(null);
  mockLk.deleteRoom.mockResolvedValue(undefined);
  mockLk.startMeetingRecording.mockImplementation(async () => `EG_${Math.random().toString(36).slice(2, 10)}`);
  mockStorage.download.mockImplementation(async (_key: string, destination: string) => {
    nodeFs.mkdirSync(nodePath.dirname(destination), { recursive: true });
    nodeFs.writeFileSync(destination, FILE_BYTES);
    return FILE_BYTES.length;
  });
  mockStorage.remove.mockResolvedValue(undefined);

  mockPrisma.tenant.rows.push(
    { id: TENANT_A, isActive: true, status: 'ACTIVE' },
    { id: TENANT_B, isActive: true, status: 'ACTIVE' }
  );
  const owner = (contactId: string, firstName: string, lastName: string, tenantId = TENANT_A) => ({
    id: contactId,
    tenantId,
    firstName,
    lastName,
    legalName: null,
    email: `${firstName.toLowerCase()}@example.test`,
    phonePrimary: '+2250700000000'
  });
  const awa = owner(AWA, 'Awa', 'Traore');
  const contactB = owner(CONTACT_B, 'Zoe', 'Autre', TENANT_B);
  mockPrisma.crmContact.rows.push(awa, contactB);
  const lot = (lotId: string, syndicateId: string, tenantId: string, who: any) => ({
    id: lotId,
    syndicateId,
    syndicate: { tenantId },
    lotNumber: 'L',
    generalShares: 100,
    coownerId: who.id,
    ownerContactId: who.id,
    owner: { id: who.id, firstName: who.firstName, lastName: who.lastName, legalName: null, email: who.email },
    ownerProfiles: [
      {
        contactId: who.id,
        ownershipPercentage: 100,
        ownedSince: new Date('2020-01-01T00:00:00Z'),
        ownedUntil: null,
        contact: { id: who.id, firstName: who.firstName, lastName: who.lastName, legalName: null, email: who.email }
      }
    ]
  });
  mockPrisma.syndicateLot.rows.push(lot(L1, S1, TENANT_A, awa), lot(LB, SB, TENANT_B, contactB));
  const meeting = (mid: string, sid: string, tenantId: string, status: string) => ({
    id: mid,
    syndicateId: sid,
    syndicate: { id: sid, name: 'Residence', tenantId },
    type: 'ORDINARY',
    status,
    scheduledAt: new Date('2026-10-10T09:00:00Z'),
    startTime: null,
    endTime: null,
    location: null,
    videoConferenceUrl: null,
    quorum: 0
  });
  mockPrisma.generalMeeting.rows.push(
    meeting(M1, S1, TENANT_A, meetingStatus),
    meeting(M_PLANNED, S1, TENANT_A, 'PLANNED'),
    meeting(MB, SB, TENANT_B, 'IN_PROGRESS')
  );
  mockPrisma.user.rows.push({
    id: 'user-manager',
    fullName: 'Marie Syndic',
    email: 'm@example.test',
    passwordHash: 'h'
  });
  mockPrisma.membership.rows.push({
    userId: 'user-manager',
    tenantId: TENANT_A,
    status: 'ACTIVE',
    user: { fullName: 'Marie Syndic' }
  });
}

/** Ligne d'enregistrement en base (état voulu), sans passer par LiveKit. */
function seedRecording(overrides: Record<string, unknown> = {}): any {
  const recordingId = (overrides.id as string) ?? id(900 + mockPrisma.gMRecording.rows.length);
  const row = {
    id: recordingId,
    tenantId: TENANT_A,
    meetingId: M1,
    egressId: `EG_${recordingId.slice(-3)}`,
    status: 'RECORDING',
    storageKey: `ag-enregistrements/${TENANT_A}/${M1}/${recordingId}.mp4`,
    fileUrl: null,
    fileSize: null,
    durationSeconds: null,
    failureReason: null,
    webhookEventId: null,
    startedAt: new Date('2026-10-10T09:30:00Z'),
    startedByUserId: 'user-manager',
    stoppedAt: null,
    stoppedByUserId: null,
    endedAt: null,
    deletedAt: null,
    deletedByUserId: null,
    ...overrides
  };
  mockPrisma.gMRecording.rows.push(row);
  return row;
}

/** Enregistrement DISPONIBLE avec un vrai fichier dans le stockage privé. */
function seedAvailable(overrides: Record<string, unknown> = {}): any {
  const recordingId = (overrides.id as string) ?? id(950 + mockPrisma.gMRecording.rows.length);
  const segments = ['syndics', S1, 'assemblees', M1, 'enregistrements'];
  const dir = nodePath.join(UPLOADS_ROOT, ...segments);
  nodeFs.mkdirSync(dir, { recursive: true });
  nodeFs.writeFileSync(nodePath.join(dir, `${recordingId}.mp4`), FILE_BYTES);
  return seedRecording({
    id: recordingId,
    status: 'AVAILABLE',
    fileUrl: `/uploads/${segments.join('/')}/${recordingId}.mp4`,
    fileSize: BigInt(FILE_BYTES.length),
    durationSeconds: 125,
    endedAt: new Date('2026-10-10T10:00:00Z'),
    ...overrides
  });
}

const ns = (seconds: number) => ({ __big: String(seconds * 1_000_000_000) });
const endedEvent = (egressId: string, eventId: string, status = EgressStatus.EGRESS_COMPLETE, files = true) => ({
  event: 'egress_ended',
  id: eventId,
  egressInfo: {
    egressId,
    status,
    endedAt: ns(1_791_626_400),
    fileResults: files ? [{ filename: 'x.mp4', duration: ns(125), size: { __big: '12345' } }] : []
  }
});
const webhook = (body: unknown, auth: string | null = 'valid') => {
  const req = request(app).post('/api/webhooks/livekit').set('Content-Type', 'application/webhook+json');
  if (auth !== null) req.set('Authorization', auth);
  return req.send(JSON.stringify(body));
};
const auditKeys = () => mockAudit.mock.calls.map(([entry]) => entry.actionKey);
const rowOf = (recordingId: string): any => mockPrisma.gMRecording.rows.find((row: any) => row.id === recordingId);

beforeEach(() => resetWorld());
afterAll(() => nodeFs.rmSync(UPLOADS_ROOT, { recursive: true, force: true }));

// ---------------------------------------------------------------------------
// Démarrer
// ---------------------------------------------------------------------------

describe('POST /visio/enregistrement/demarrer', () => {
  it('enregistrement non configuré ou visio désactivée = 409', async () => {
    mockLk.recordingEnabled = false;
    let res = await request(app).post(url(M1, '/visio/enregistrement/demarrer')).send({});
    expect(res.status).toBe(409);
    expect(res.body.message).toBe("L'enregistrement n'est pas activé");
    mockLk.recordingEnabled = true;
    mockLk.enabled = false;
    res = await request(app).post(url(M1, '/visio/enregistrement/demarrer')).send({});
    expect(res.status).toBe(409);
    expect(mockLk.startMeetingRecording).not.toHaveBeenCalled();
  });

  it('AG non en cours = 409', async () => {
    const res = await request(app).post(url(M_PLANNED, '/visio/enregistrement/demarrer')).send({});
    expect(res.status).toBe(409);
    expect(mockLk.startMeetingRecording).not.toHaveBeenCalled();
  });

  it('AG d une autre agence = 404', async () => {
    const res = await request(app)
      .post(`/api/tenants/${TENANT_A}/syndics/${S1}/assemblees/${MB}/visio/enregistrement/demarrer`)
      .send({});
    expect(res.status).toBe(404);
    expect(mockLk.startMeetingRecording).not.toHaveBeenCalled();
  });

  it('démarre : clé <préfixe><agence>/<AG>/<enregistrement>.mp4, ligne RECORDING, audit', async () => {
    const res = await request(app).post(url(M1, '/visio/enregistrement/demarrer')).send({});
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(mockLk.ensureRoom).toHaveBeenCalledWith(ROOM);
    const row = mockPrisma.gMRecording.rows[0];
    expect(mockLk.startMeetingRecording).toHaveBeenCalledWith(
      ROOM,
      `ag-enregistrements/${TENANT_A}/${M1}/${row.id}.mp4`
    );
    expect(row).toMatchObject({
      tenantId: TENANT_A,
      meetingId: M1,
      status: 'RECORDING',
      startedByUserId: 'user-manager',
      storageKey: `ag-enregistrements/${TENANT_A}/${M1}/${row.id}.mp4`
    });
    expect(res.body.data).toMatchObject({
      id: row.id,
      status: 'RECORDING',
      stoppedAt: null,
      endedAt: null,
      fileSize: null,
      failureReason: null,
      startedByName: 'Marie Syndic'
    });
    expect(JSON.stringify(res.body)).not.toContain(row.storageKey);
    expect(JSON.stringify(res.body)).not.toContain(row.egressId);
    expect(mockAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        actionKey: 'SYNDIC_MEETING_RECORDING_STARTED',
        actorUserId: 'user-manager',
        payload: { meetingId: M1, recordingId: row.id }
      })
    );
  });

  it('déjà en cours côté LiveKit = 409, aucun second egress', async () => {
    const running = seedRecording({ id: id(910) });
    mockLk.getEgressStatus.mockResolvedValue({ egressId: running.egressId, status: EgressStatus.EGRESS_ACTIVE });
    const res = await request(app).post(url(M1, '/visio/enregistrement/demarrer')).send({});
    expect(res.status).toBe(409);
    expect(res.body.message).toBe('Un enregistrement est déjà en cours');
    expect(mockLk.getEgressStatus).toHaveBeenCalledWith(running.egressId);
    expect(mockLk.startMeetingRecording).not.toHaveBeenCalled();
    expect(mockPrisma.gMRecording.rows).toHaveLength(1);
  });

  it('un egress terminé dont le webhook n est jamais arrivé est réconcilié, puis un nouveau démarre', async () => {
    const stale = seedRecording({ id: id(911) });
    mockLk.getEgressStatus.mockResolvedValue({
      egressId: stale.egressId,
      status: EgressStatus.EGRESS_COMPLETE,
      endedAt: BigInt(1_791_626_400) * 1_000_000_000n,
      fileResults: [{ duration: 125n * 1_000_000_000n }]
    });
    const res = await request(app).post(url(M1, '/visio/enregistrement/demarrer')).send({});
    expect(res.status).toBe(200);
    await flush();
    // L'ancien suit le même chemin que egress_ended : PROCESSING puis rapatrié.
    expect(rowOf(stale.id)).toMatchObject({ status: 'AVAILABLE', durationSeconds: 125, webhookEventId: null });
    expect(mockStorage.download).toHaveBeenCalledTimes(1);
    expect(mockPrisma.gMRecording.rows).toHaveLength(2);
    expect(mockPrisma.gMRecording.rows.filter((row: any) => row.status === 'RECORDING')).toHaveLength(1);
    expect(mockLk.startMeetingRecording).toHaveBeenCalledTimes(1);
  });

  it('un egress perdu côté LiveKit passe l ancien en FAILED et laisse démarrer', async () => {
    const stale = seedRecording({ id: id(912) });
    mockLk.getEgressStatus.mockResolvedValue(null);
    const res = await request(app).post(url(M1, '/visio/enregistrement/demarrer')).send({});
    expect(res.status).toBe(200);
    expect(rowOf(stale.id)).toMatchObject({ status: 'FAILED', failureReason: 'EGRESS_LOST' });
  });

  it('si la ligne ne peut pas être créée après le démarrage, l egress est arrêté', async () => {
    mockLk.startMeetingRecording.mockResolvedValue('EG_ORPHELIN');
    jest.spyOn(mockPrisma.gMRecording, 'create').mockRejectedValueOnce(new Error('insert failed'));
    const res = await request(app).post(url(M1, '/visio/enregistrement/demarrer')).send({});
    expect(res.status).toBe(500);
    expect(mockLk.stopEgress).toHaveBeenCalledWith('EG_ORPHELIN');
    expect(mockPrisma.gMRecording.rows).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Arrêter
// ---------------------------------------------------------------------------

describe('POST /visio/enregistrement/arreter', () => {
  it('aucun enregistrement en cours = 409', async () => {
    const res = await request(app).post(url(M1, '/visio/enregistrement/arreter')).send({});
    expect(res.status).toBe(409);
    expect(mockLk.stopEgress).not.toHaveBeenCalled();
  });

  it('arrête l egress, horodate l arrêt ; le statut reste RECORDING jusqu au webhook', async () => {
    const running = seedRecording({ id: id(920) });
    const res = await request(app).post(url(M1, '/visio/enregistrement/arreter')).send({});
    expect(res.status).toBe(200);
    expect(mockLk.stopEgress).toHaveBeenCalledWith(running.egressId);
    expect(res.body.data.status).toBe('RECORDING');
    expect(res.body.data.stoppedAt).not.toBeNull();
    expect(rowOf(running.id)).toMatchObject({ status: 'RECORDING', stoppedByUserId: 'user-manager' });
    expect(rowOf(running.id).stoppedAt).toBeInstanceOf(Date);
    expect(auditKeys()).toContain('SYNDIC_MEETING_RECORDING_STOPPED');
  });

  it('l enregistrement d une autre AG n est pas arrêté', async () => {
    seedRecording({ id: id(921), meetingId: M_PLANNED });
    const res = await request(app).post(url(M1, '/visio/enregistrement/arreter')).send({});
    expect(res.status).toBe(409);
    expect(mockLk.stopEgress).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Webhook
// ---------------------------------------------------------------------------

describe('POST /api/webhooks/livekit', () => {
  it('visio non configurée = 404', async () => {
    mockLk.enabled = false;
    expect((await webhook(endedEvent('EG_X', 'EV_1'))).status).toBe(404);
  });

  it('signature absente ou invalide = 401 sans détail, rien n est modifié', async () => {
    const running = seedRecording({ id: id(930) });
    for (const auth of [null, 'forged']) {
      const res = await webhook(endedEvent(running.egressId, 'EV_1'), auth);
      expect(res.status).toBe(401);
      expect(res.text).toBe('');
    }
    expect(rowOf(running.id).status).toBe('RECORDING');
  });

  it('un autre événement, ou un egress inconnu = 200 sans effet', async () => {
    const running = seedRecording({ id: id(931) });
    let res = await webhook({ event: 'room_finished', id: 'EV_2', room: { name: ROOM } });
    expect(res.status).toBe(200);
    res = await webhook({ event: 'egress_started', id: 'EV_3', egressInfo: { egressId: running.egressId } });
    expect(res.status).toBe(200);
    res = await webhook(endedEvent('EG_INCONNU', 'EV_4'));
    expect(res.status).toBe(200);
    expect(rowOf(running.id).status).toBe('RECORDING');
    expect(mockStorage.download).not.toHaveBeenCalled();
  });

  it('egress_ended réussi : PROCESSING dans la réponse, puis AVAILABLE après (S3 → stockage privé), objet S3 supprimé', async () => {
    const running = seedRecording({ id: id(932) });
    // Le rapatriement est retenu tant que la réponse du webhook n'a pas été vérifiée.
    let release: () => void = () => undefined;
    const gate = new Promise<void>(resolve => (release = resolve));
    mockStorage.download.mockImplementation(async (_k: string, destination: string) => {
      await gate;
      // À ce moment la ligne est déjà PROCESSING (écrite avant la réponse).
      expect(rowOf(running.id).status).toBe('PROCESSING');
      nodeFs.mkdirSync(nodePath.dirname(destination), { recursive: true });
      nodeFs.writeFileSync(destination, FILE_BYTES);
      return FILE_BYTES.length;
    });

    const res = await webhook(endedEvent(running.egressId, 'EV_10'));
    expect(res.status).toBe(200);
    expect(rowOf(running.id)).toMatchObject({ status: 'PROCESSING', durationSeconds: 125, webhookEventId: 'EV_10' });
    expect(rowOf(running.id).endedAt).toBeInstanceOf(Date);
    release();

    await flush();
    const segments = `syndics/${S1}/assemblees/${M1}/enregistrements/${running.id}.mp4`;
    expect(rowOf(running.id)).toMatchObject({
      status: 'AVAILABLE',
      fileUrl: `/uploads/${segments}`,
      fileSize: BigInt(FILE_BYTES.length)
    });
    expect(nodeFs.existsSync(nodePath.join(UPLOADS_ROOT, segments))).toBe(true);
    expect(mockStorage.download).toHaveBeenCalledWith(running.storageKey, nodePath.join(UPLOADS_ROOT, segments));
    expect(mockStorage.remove).toHaveBeenCalledWith(running.storageKey);
    expect(mockAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        actionKey: 'SYNDIC_MEETING_RECORDING_AVAILABLE',
        tenantId: TENANT_A,
        payload: { meetingId: M1, recordingId: running.id, status: 'AVAILABLE' }
      })
    );
  });

  it('rejoué (même événement, ou ligne déjà traitée) = sans effet', async () => {
    const running = seedRecording({ id: id(933) });
    const body = endedEvent(running.egressId, 'EV_20');
    expect((await webhook(body)).status).toBe(200);
    await flush();
    expect((await webhook(body)).status).toBe(200);
    await flush();
    expect((await webhook(endedEvent(running.egressId, 'EV_21'))).status).toBe(200);
    await flush();
    expect(mockStorage.download).toHaveBeenCalledTimes(1);
    expect(mockStorage.remove).toHaveBeenCalledTimes(1);
    expect(rowOf(running.id)).toMatchObject({ status: 'AVAILABLE', webhookEventId: 'EV_20' });
    expect(auditKeys().filter(key => key === 'SYNDIC_MEETING_RECORDING_AVAILABLE')).toHaveLength(1);
  });

  it('egress en échec ou sans fichier : FAILED avec un motif court, aucun rapatriement', async () => {
    const failed = seedRecording({ id: id(934) });
    const empty = seedRecording({ id: id(935) });
    expect((await webhook(endedEvent(failed.egressId, 'EV_30', EgressStatus.EGRESS_FAILED, false))).status).toBe(200);
    expect((await webhook(endedEvent(empty.egressId, 'EV_31', EgressStatus.EGRESS_COMPLETE, false))).status).toBe(200);
    await flush();
    expect(rowOf(failed.id)).toMatchObject({ status: 'FAILED', failureReason: 'EGRESS_FAILED' });
    expect(rowOf(empty.id)).toMatchObject({ status: 'FAILED', failureReason: 'NO_FILE' });
    expect(mockStorage.download).not.toHaveBeenCalled();
    expect(mockAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        actionKey: 'SYNDIC_MEETING_RECORDING_AVAILABLE',
        payload: expect.objectContaining({ status: 'FAILED', recordingId: failed.id })
      })
    );
  });

  it('rapatriement en échec : FAILED, l objet S3 est conservé, aucun fichier partiel', async () => {
    const running = seedRecording({ id: id(936) });
    mockStorage.download.mockRejectedValueOnce(new Error('S3 down'));
    expect((await webhook(endedEvent(running.egressId, 'EV_40'))).status).toBe(200);
    await flush();
    expect(rowOf(running.id)).toMatchObject({ status: 'FAILED', failureReason: 'DOWNLOAD_FAILED', fileUrl: null });
    expect(mockStorage.remove).not.toHaveBeenCalled();
    expect(mockAudit).toHaveBeenCalledWith(
      expect.objectContaining({ payload: expect.objectContaining({ status: 'FAILED', recordingId: running.id }) })
    );
  });

  it('corps vide ou non JSON signé : 401 (pas de 500)', async () => {
    const res = await request(app)
      .post('/api/webhooks/livekit')
      .set('Content-Type', 'application/webhook+json')
      .set('Authorization', 'valid')
      .send('pas du json');
    expect([200, 401]).toContain(res.status);
    const empty = await request(app).post('/api/webhooks/livekit').set('Authorization', 'valid');
    expect(empty.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// Liste, fichier, suppression
// ---------------------------------------------------------------------------

describe('GET /enregistrements', () => {
  it('le plus récent d abord, nom de l initiateur par select, jamais de clé de stockage', async () => {
    seedRecording({
      id: id(940),
      startedAt: new Date('2026-10-10T08:00:00Z'),
      status: 'FAILED',
      failureReason: 'EGRESS_FAILED'
    });
    seedAvailable({ id: id(941), startedAt: new Date('2026-10-10T09:00:00Z') });
    seedRecording({ id: id(942), startedAt: new Date('2026-10-10T10:00:00Z') });
    const res = await request(app).get(url(M1, '/enregistrements'));
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body.data.map((entry: any) => entry.id)).toEqual([id(942), id(941), id(940)]);
    expect(res.body.data[1]).toMatchObject({
      status: 'AVAILABLE',
      durationSeconds: 125,
      fileSize: FILE_BYTES.length,
      startedByName: 'Marie Syndic'
    });
    expect(res.body.data[2]).toMatchObject({ status: 'FAILED', failureReason: "L'enregistrement a échoué côté visio" });
    const raw = JSON.stringify(res.body);
    for (const secret of ['storageKey', 'egressId', 'fileUrl', 'ag-enregistrements', '/uploads/', 'passwordHash']) {
      expect(raw).not.toContain(secret);
    }
  });

  it('arrêté depuis plus d une minute sans webhook : vérifié auprès de LiveKit et réconcilié à la lecture', async () => {
    const stale = seedRecording({ id: id(945), stoppedAt: new Date(Date.now() - 5 * 60_000) });
    const fresh = seedRecording({
      id: id(946),
      startedAt: new Date('2026-10-10T11:00:00Z'),
      stoppedAt: new Date(Date.now() - 5_000)
    });
    mockLk.getEgressStatus.mockImplementation(async (egressId: string) =>
      egressId === stale.egressId
        ? { egressId, status: EgressStatus.EGRESS_COMPLETE, fileResults: [{ duration: 60n * 1_000_000_000n }] }
        : { egressId, status: EgressStatus.EGRESS_ACTIVE }
    );
    const res = await request(app).get(url(M1, '/enregistrements'));
    expect(res.status).toBe(200);
    // Seul l'enregistrement arrêté depuis longtemps est vérifié (l'AG est en cours).
    expect(mockLk.getEgressStatus).toHaveBeenCalledTimes(1);
    expect(mockLk.getEgressStatus).toHaveBeenCalledWith(stale.egressId);
    expect(['PROCESSING', 'AVAILABLE']).toContain(res.body.data.find((entry: any) => entry.id === stale.id).status);
    await flush();
    expect(rowOf(stale.id)).toMatchObject({ status: 'AVAILABLE', durationSeconds: 60, webhookEventId: null });
    expect(rowOf(fresh.id).status).toBe('RECORDING');
  });

  it('LiveKit injoignable pendant la réconciliation : la liste se lit, la ligne reste en cours', async () => {
    const stale = seedRecording({ id: id(947), stoppedAt: new Date(Date.now() - 5 * 60_000) });
    mockLk.getEgressStatus.mockRejectedValue(new Error('indisponible'));
    const res = await request(app).get(url(M1, '/enregistrements'));
    expect(res.status).toBe(200);
    expect(rowOf(stale.id).status).toBe('RECORDING');
  });

  it('les enregistrements d une autre AG ou agence ne sortent pas ; AG étrangère = 404', async () => {
    seedRecording({ id: id(943), meetingId: M_PLANNED });
    seedRecording({ id: id(944), tenantId: TENANT_B, meetingId: MB });
    const res = await request(app).get(url(M1, '/enregistrements'));
    expect(res.body.data).toEqual([]);
    expect((await request(app).get(url(MB, '/enregistrements'))).status).toBe(404);
  });
});

describe('GET /enregistrements/:recordingId/fichier', () => {
  it('rend le flux video/mp4, en ligne par défaut, sans cache, nom neutre', async () => {
    const rec = seedAvailable({ id: id(950) });
    const res = await request(app)
      .get(url(M1, `/enregistrements/${rec.id}/fichier`))
      .buffer(true)
      .parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on('data', (c: Buffer) => chunks.push(c));
        r.on('end', () => cb(null, Buffer.concat(chunks)));
      });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('video/mp4');
    expect(res.headers['cache-control']).toBe('private, no-store');
    expect(res.headers['content-disposition']).toBe('inline; filename="assemblee-2026-10-10.mp4"');
    expect(res.headers['accept-ranges']).toBe('bytes');
    expect(Buffer.from(res.body).equals(FILE_BYTES)).toBe(true);
    expect(res.headers['content-disposition']).not.toContain(rec.id);
  });

  it('Range : 206 avec Content-Range ; ?telecharger=1 : pièce jointe', async () => {
    const rec = seedAvailable({ id: id(951) });
    const ranged = await request(app)
      .get(url(M1, `/enregistrements/${rec.id}/fichier`))
      .set('Range', 'bytes=0-9');
    expect(ranged.status).toBe(206);
    expect(ranged.headers['content-range']).toBe(`bytes 0-9/${FILE_BYTES.length}`);
    const download = await request(app).get(url(M1, `/enregistrements/${rec.id}/fichier?telecharger=1`));
    expect(download.status).toBe(200);
    expect(download.headers['content-disposition']).toBe('attachment; filename="assemblee-2026-10-10.mp4"');
  });

  it('404 si non disponible, supprimé, fichier absent ou chemin falsifié ; 400 si id invalide', async () => {
    const processing = seedRecording({ id: id(952), status: 'PROCESSING' });
    const gone = seedAvailable({ id: id(953) });
    nodeFs.unlinkSync(nodePath.join(UPLOADS_ROOT, gone.fileUrl.replace('/uploads/', '')));
    const deleted = seedRecording({ id: id(954), status: 'DELETED' });
    const tampered = seedAvailable({ id: id(955) });
    rowOf(tampered.id).fileUrl = '/uploads/../../../../windows/win.ini';
    const elsewhere = seedAvailable({ id: id(956) });
    rowOf(elsewhere.id).fileUrl = `/uploads/syndics/${SB}/assemblees/${MB}/enregistrements/${elsewhere.id}.mp4`;
    const wrongName = seedAvailable({ id: id(957) });
    rowOf(wrongName.id).fileUrl = rowOf(wrongName.id).fileUrl.replace(`${wrongName.id}.mp4`, `${tampered.id}.mp4`);
    for (const rec of [processing, gone, deleted, tampered, elsewhere, wrongName]) {
      const res = await request(app).get(url(M1, `/enregistrements/${rec.id}/fichier`));
      expect(res.status).toBe(404);
    }
    expect((await request(app).get(url(M1, '/enregistrements/pas-un-uuid/fichier'))).status).toBe(400);
  });

  it('enregistrement d une autre agence ou d une autre AG = 404', async () => {
    const foreign = seedAvailable({ id: id(958), tenantId: TENANT_B });
    const otherMeeting = seedAvailable({ id: id(959), meetingId: M_PLANNED });
    expect((await request(app).get(url(M1, `/enregistrements/${foreign.id}/fichier`))).status).toBe(404);
    expect((await request(app).get(url(M1, `/enregistrements/${otherMeeting.id}/fichier`))).status).toBe(404);
    expect((await request(app).get(url(MB, `/enregistrements/${foreign.id}/fichier`))).status).toBe(404);
  });

  it('jamais servi en statique : /uploads/syndics/... = 404 même avec le fichier sur le disque', async () => {
    const rec = seedAvailable({ id: id(960) });
    const res = await request(app).get(rec.fileUrl);
    expect(res.status).toBe(404);
  });
});

describe('DELETE /enregistrements/:recordingId', () => {
  it('supprime le fichier du disque, garde la ligne en DELETED, audit critique', async () => {
    const rec = seedAvailable({ id: id(970) });
    const path = nodePath.join(UPLOADS_ROOT, rec.fileUrl.replace('/uploads/', ''));
    expect(nodeFs.existsSync(path)).toBe(true);
    const res = await request(app).delete(url(M1, `/enregistrements/${rec.id}`));
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('DELETED');
    expect(nodeFs.existsSync(path)).toBe(false);
    expect(rowOf(rec.id)).toMatchObject({ status: 'DELETED', fileUrl: null, deletedByUserId: 'user-manager' });
    expect(rowOf(rec.id).deletedAt).toBeInstanceOf(Date);
    expect(mockStorage.remove).toHaveBeenCalledWith(rec.storageKey);
    expect(mockAudit).toHaveBeenCalledWith(
      expect.objectContaining({ actionKey: 'SYNDIC_MEETING_RECORDING_DELETED', entityId: rec.id })
    );
    // Déjà supprimé : 409.
    expect((await request(app).delete(url(M1, `/enregistrements/${rec.id}`))).status).toBe(409);
  });

  it('un enregistrement en échec peut être supprimé (objet S3 effacé au mieux, même si l effacement échoue)', async () => {
    const failed = seedRecording({ id: id(971), status: 'FAILED', failureReason: 'DOWNLOAD_FAILED' });
    mockStorage.remove.mockRejectedValueOnce(new Error('S3 down'));
    const res = await request(app).delete(url(M1, `/enregistrements/${failed.id}`));
    expect(res.status).toBe(200);
    expect(rowOf(failed.id).status).toBe('DELETED');
  });

  it('en cours ou en traitement = 409 ; autre agence ou autre AG = 404', async () => {
    const running = seedRecording({ id: id(972) });
    const processing = seedRecording({ id: id(973), status: 'PROCESSING' });
    const foreign = seedAvailable({ id: id(974), tenantId: TENANT_B });
    const otherMeeting = seedAvailable({ id: id(975), meetingId: M_PLANNED });
    expect((await request(app).delete(url(M1, `/enregistrements/${running.id}`))).status).toBe(409);
    expect((await request(app).delete(url(M1, `/enregistrements/${processing.id}`))).status).toBe(409);
    expect((await request(app).delete(url(M1, `/enregistrements/${foreign.id}`))).status).toBe(404);
    expect((await request(app).delete(url(M1, `/enregistrements/${otherMeeting.id}`))).status).toBe(404);
    expect(rowOf(foreign.id).status).toBe('AVAILABLE');
    expect(rowOf(otherMeeting.id).status).toBe('AVAILABLE');
  });
});

// ---------------------------------------------------------------------------
// Vues : console et page publique
// ---------------------------------------------------------------------------

describe('vues', () => {
  it('GET /visio : recording { enabled, active } (null sans enregistrement en cours)', async () => {
    let res = await request(app).get(url(M1, '/visio'));
    expect(res.body.data.recording).toEqual({ enabled: true, active: null });
    const running = seedRecording({ id: id(980) });
    res = await request(app).get(url(M1, '/visio'));
    expect(res.body.data.recording.enabled).toBe(true);
    expect(res.body.data.recording.active).toMatchObject({ id: running.id, status: 'RECORDING' });
    mockLk.recordingEnabled = false;
    res = await request(app).get(url(M1, '/visio'));
    expect(res.body.data.recording.enabled).toBe(false);
  });

  it('GET /visio visio désactivée : 200, enabled faux, enregistrement désactivé', async () => {
    mockLk.enabled = false;
    const res = await request(app).get(url(M1, '/visio'));
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      enabled: false,
      roomName: null,
      roomActive: false,
      participants: [],
      recording: { enabled: false, active: null }
    });
  });

  it('page publique : visio.recording vrai seulement pendant un enregistrement RECORDING', async () => {
    const link = await request(app)
      .post(url(M1, `/participants/${AWA}/lien`))
      .send({});
    const token = String(link.body.data.url).split('#')[1];
    const etat = () => request(app).post('/api/public/assemblees/etat').send({ token });
    expect((await etat()).body.data.visio).toEqual({ enabled: true, recording: false });
    const running = seedRecording({ id: id(981) });
    expect((await etat()).body.data.visio).toEqual({ enabled: true, recording: true });
    rowOf(running.id).status = 'PROCESSING';
    expect((await etat()).body.data.visio.recording).toBe(false);
    rowOf(running.id).status = 'RECORDING';
    mockLk.enabled = false;
    expect((await etat()).body.data.visio).toEqual({ enabled: false, recording: false });
  });
});
