/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-var-requires */
/**
 * Nettoyage des enregistrements d'AG lors d'une suppression en cascade (spec 045, R12).
 *
 * Base en mémoire qui applique vraiment les filtres `where` ; stockage privé = vrai
 * dossier temporaire (`UPLOADS_DIR`). Simulés : le stockage S3 et l'audit.
 */

const nodeOs = require('os');
const nodePath = require('path');
const nodeFs = require('fs');
const UPLOADS_ROOT: string = nodeFs.mkdtempSync(nodePath.join(nodeOs.tmpdir(), '.immotopia-ag-clean-'));
process.env.UPLOADS_DIR = UPLOADS_ROOT;

import { createFakePrisma } from '../helpers/fake-prisma';

const mockPrisma = createFakePrisma();
jest.mock('../../src/utils/database', () => ({ prisma: mockPrisma }));

const mockAudit = jest.fn();
jest.mock('../../src/services/audit-service', () => ({
  recordAuditEvent: async (writer: unknown, entry: unknown) => mockAudit(entry, writer),
  logAuditEvent: jest.fn(),
  flushAuditQueue: jest.fn()
}));

let mockRecordingEnabled = true;
jest.mock('../../src/services/livekit-service', () => ({
  ...jest.requireActual('../../src/services/livekit-service'),
  isRecordingEnabled: () => mockRecordingEnabled
}));

const mockStorage = { download: jest.fn(), remove: jest.fn() };
jest.mock('../../src/lib/syndics/meeting-recording-storage', () => ({
  downloadRecordingObject: (...a: unknown[]) => mockStorage.download(...a),
  deleteRecordingObject: (...a: unknown[]) => mockStorage.remove(...a)
}));

import { logger } from '../../src/utils/logger';
import { AuditActionKey } from '../../src/types/audit-types';
import { AUDIT_CATALOG } from '../../src/types/audit-catalog';
import {
  collectRecordingsForCascade,
  purgeCascadedRecordings,
  type CascadedRecording,
  type RecordingCascadeCause,
  type RecordingCascadeScope
} from '../../src/lib/syndics/meeting-recording-cleanup';

const TENANT_A = 'tenant-a';
const TENANT_B = 'tenant-b';
const SA1 = 'syn-a1';
const SA2 = 'syn-a2';
const SB1 = 'syn-b1';
const MA1 = 'meet-a1';
const MA2 = 'meet-a2';
const MA3 = 'meet-a3';
const MB1 = 'meet-b1';

let warnSpy: jest.SpyInstance;
let lockResults: boolean[] = [];

function dirOf(syndicateId: string, meetingId: string): string {
  return nodePath.join(UPLOADS_ROOT, 'syndics', syndicateId, 'assemblees', meetingId, 'enregistrements');
}
const fileOf = (syndicateId: string, meetingId: string, recordingId: string) =>
  nodePath.join(dirOf(syndicateId, meetingId), `${recordingId}.mp4`);

interface SeedOptions {
  tenantId?: string;
  syndicateId?: string;
  withFile?: boolean;
  withPart?: boolean;
  storageKey?: string;
  failureReason?: string | null;
}

/** Ligne d'enregistrement, avec (ou sans) un vrai fichier dans le dossier canonique de son AG. */
function seed(recordingId: string, meetingId: string, status: string, options: SeedOptions = {}): any {
  const { tenantId = TENANT_A, syndicateId = SA1, withFile = false, failureReason = null } = options;
  if (withFile || options.withPart) nodeFs.mkdirSync(dirOf(syndicateId, meetingId), { recursive: true });
  if (withFile) nodeFs.writeFileSync(fileOf(syndicateId, meetingId, recordingId), 'FAKE-MP4');
  if (options.withPart) nodeFs.writeFileSync(`${fileOf(syndicateId, meetingId, recordingId)}.part`, 'PARTIAL');
  const row = {
    id: recordingId,
    tenantId,
    meetingId,
    egressId: `EG_${recordingId}`,
    status,
    storageKey: options.storageKey ?? `ag-enregistrements/${tenantId}/${meetingId}/${recordingId}.mp4`,
    // Volontairement null : la purge ne doit pas dépendre de `fileUrl`.
    fileUrl: null,
    failureReason
  };
  mockPrisma.gMRecording.rows.push(row);
  return row;
}

beforeEach(() => {
  mockPrisma.reset();
  lockResults = [];
  mockPrisma.$queryRaw = jest.fn(async () => [{ locked: lockResults.length ? lockResults.shift() : true }]);
  mockAudit.mockClear();
  mockStorage.remove.mockReset().mockResolvedValue(undefined);
  mockRecordingEnabled = true;
  warnSpy = jest.spyOn(logger, 'warn').mockImplementation((() => logger) as any);
  const meeting = (id: string, syndicateId: string, tenantId: string) => ({
    id,
    syndicateId,
    syndicate: { id: syndicateId, tenantId }
  });
  mockPrisma.generalMeeting.rows.push(
    meeting(MA1, SA1, TENANT_A),
    meeting(MA2, SA1, TENANT_A),
    meeting(MA3, SA2, TENANT_A),
    meeting(MB1, SB1, TENANT_B)
  );
});
afterEach(() => {
  warnSpy.mockRestore();
  nodeFs.rmSync(nodePath.join(UPLOADS_ROOT, 'syndics'), { recursive: true, force: true });
});
afterAll(() => nodeFs.rmSync(UPLOADS_ROOT, { recursive: true, force: true }));

const collect = (
  tenantId: string,
  scope: RecordingCascadeScope,
  cause: RecordingCascadeCause = 'MEETING_DELETED',
  actor: string | null = 'user-1'
): Promise<CascadedRecording[]> =>
  mockPrisma.$transaction((tx: any) => collectRecordingsForCascade(tx, tenantId, scope, cause, actor));
const auditCalls = () => mockAudit.mock.calls.map(([entry]) => entry);
const exists = (file: string): boolean => nodeFs.existsSync(file);
const byId = (a: { id: string }, b: { id: string }) => a.id.localeCompare(b.id);
const MEETING_A1 = { kind: 'MEETING', meetingId: MA1 } as const;

describe('collectRecordingsForCascade', () => {
  it('relève les enregistrements d une AG (y compris DELETED), verrou pris, avec le syndicateId', async () => {
    seed('rec-available', MA1, 'AVAILABLE', { withFile: true });
    seed('rec-failed', MA1, 'FAILED', { failureReason: 'DOWNLOAD_FAILED' });
    seed('rec-deleted', MA1, 'DELETED');
    seed('rec-autre-ag', MA2, 'AVAILABLE', { withFile: true });

    const found = await collect(TENANT_A, MEETING_A1);

    expect(found.map(row => row.id).sort()).toEqual(['rec-available', 'rec-deleted', 'rec-failed']);
    expect(found.every(row => row.syndicateId === SA1 && row.meetingId === MA1)).toBe(true);
    expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('écrit l audit critique dans la transaction, pour chaque ligne non DELETED, avec acteur et cause', async () => {
    seed('rec-available', MA1, 'AVAILABLE', { withFile: true });
    seed('rec-failed', MA1, 'FAILED', { failureReason: 'DOWNLOAD_FAILED' });
    seed('rec-deleted', MA1, 'DELETED');

    await collect(TENANT_A, MEETING_A1, 'SYNDICATE_DELETED');

    const audits = auditCalls();
    expect(audits).toHaveLength(2);
    for (const entry of audits) {
      expect(entry).toMatchObject({
        actorUserId: 'user-1',
        tenantId: TENANT_A,
        actionKey: AuditActionKey.SYNDIC_MEETING_RECORDING_DELETED,
        entityType: 'GMRecording'
      });
    }
    expect(audits.find(entry => entry.entityId === 'rec-available').payload).toEqual({
      meetingId: MA1,
      recordingId: 'rec-available',
      previousStatus: 'AVAILABLE',
      cause: 'SYNDICATE_DELETED'
    });
    expect(audits.find(entry => entry.entityId === 'rec-failed').payload.previousStatus).toBe('FAILED');
    expect(audits.some(entry => entry.entityId === 'rec-deleted')).toBe(false);
    // Ecrit par le client de la transaction (recordAuditEvent), pas par la file asynchrone.
    expect(mockAudit.mock.calls.every(([, writer]) => writer === mockPrisma)).toBe(true);
    expect(AUDIT_CATALOG[AuditActionKey.SYNDIC_MEETING_RECORDING_DELETED].critical).toBe(true);
  });

  it.each(['RECORDING', 'PROCESSING'])(
    'refuse (409) tant qu un enregistrement est %s, sans rien effacer ni auditer',
    async status => {
      const row = seed('rec-ok', MA1, 'AVAILABLE', { withFile: true });
      seed('rec-busy', MA1, status);

      await expect(collect(TENANT_A, MEETING_A1)).rejects.toMatchObject({ statusCode: 409 });

      expect(exists(fileOf(SA1, MA1, row.id))).toBe(true);
      expect(mockStorage.remove).not.toHaveBeenCalled();
      expect(mockAudit).not.toHaveBeenCalled();
    }
  );

  it('verrou non obtenu (démarrage en cours) : 409 immédiat, rien d effacé ni d audité', async () => {
    const row = seed('rec-ok', MA1, 'AVAILABLE', { withFile: true });
    lockResults = [false];

    await expect(collect(TENANT_A, MEETING_A1)).rejects.toMatchObject({ statusCode: 409 });

    expect(exists(fileOf(SA1, MA1, row.id))).toBe(true);
    expect(mockStorage.remove).not.toHaveBeenCalled();
    expect(mockAudit).not.toHaveBeenCalled();
  });

  it('rend [] sans verrou quand le périmètre ne contient aucune AG', async () => {
    expect(await collect(TENANT_A, { kind: 'MEETING', meetingId: 'meet-inconnue' })).toEqual([]);
    expect(mockPrisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('isolation : une AG d une autre agence ne ramène rien et son fichier reste intact', async () => {
    const other = seed('rec-b', MB1, 'AVAILABLE', { tenantId: TENANT_B, syndicateId: SB1, withFile: true });

    const found = await collect(TENANT_A, { kind: 'MEETING', meetingId: MB1 });
    await purgeCascadedRecordings(found);

    expect(found).toEqual([]);
    expect(exists(fileOf(SB1, MB1, other.id))).toBe(true);
    expect(mockStorage.remove).not.toHaveBeenCalled();
    expect(mockAudit).not.toHaveBeenCalled();
  });

  it('un enregistrement RECORDING d une autre agence ne bloque pas la suppression de l agence A', async () => {
    seed('rec-b-busy', MB1, 'RECORDING', { tenantId: TENANT_B, syndicateId: SB1 });
    seed('rec-a', MA1, 'AVAILABLE', { withFile: true });

    const found = await collect(TENANT_A, { kind: 'TENANT' });

    expect(found.map(row => row.id)).toEqual(['rec-a']);
  });

  it('périmètres SYNDICATE et TENANT : seulement les AG de la copropriété, puis de l agence', async () => {
    seed('rec-a1', MA1, 'AVAILABLE');
    seed('rec-a2', MA2, 'FAILED');
    seed('rec-a3', MA3, 'AVAILABLE', { syndicateId: SA2 });
    seed('rec-b1', MB1, 'AVAILABLE', { tenantId: TENANT_B, syndicateId: SB1 });

    const syndicate = await collect(TENANT_A, { kind: 'SYNDICATE', syndicateId: SA1 });
    expect(syndicate.map(row => row.id).sort()).toEqual(['rec-a1', 'rec-a2']);

    mockPrisma.$queryRaw.mockClear();
    const tenant = await collect(TENANT_A, { kind: 'TENANT' });
    expect(tenant.map(row => row.id).sort()).toEqual(['rec-a1', 'rec-a2', 'rec-a3']);
    expect(tenant.find(row => row.id === 'rec-a3')?.syndicateId).toBe(SA2);
    expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(3);

    // Copropriété d'une autre agence demandée par l'agence A : rien.
    expect(await collect(TENANT_A, { kind: 'SYNDICATE', syndicateId: SB1 })).toEqual([]);
  });
});

describe('purgeCascadedRecordings', () => {
  it('efface fichier (d après les identifiants) et objet S3 de chaque enregistrement, sans auditer', async () => {
    const available = seed('rec-available', MA1, 'AVAILABLE', { withFile: true });
    const failed = seed('rec-failed', MA1, 'FAILED', { failureReason: 'DOWNLOAD_FAILED' });
    const deleted = seed('rec-deleted', MA1, 'DELETED');

    const found = await collect(TENANT_A, MEETING_A1);
    mockAudit.mockClear();
    mockPrisma.gMRecording.rows = [];
    await purgeCascadedRecordings(found);

    expect(exists(fileOf(SA1, MA1, available.id))).toBe(false);
    const removed = mockStorage.remove.mock.calls.map(([key]) => key).sort();
    expect(removed).toEqual([available.storageKey, deleted.storageKey, failed.storageKey].sort());
    expect(mockAudit).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('efface le fichier canonique et le .part même si fileUrl est null (relance concurrente FAILED -> AVAILABLE)', async () => {
    const row = seed('rec-race', MA1, 'FAILED', { withFile: true, withPart: true });

    const found = await collect(TENANT_A, MEETING_A1);
    await purgeCascadedRecordings(found);

    expect(exists(fileOf(SA1, MA1, row.id))).toBe(false);
    expect(exists(`${fileOf(SA1, MA1, row.id)}.part`)).toBe(false);
  });

  it('tolère un fichier déjà absent (ENOENT) : pas d avertissement', async () => {
    seed('rec-gone', MA1, 'AVAILABLE');

    const found = await collect(TENANT_A, { kind: 'SYNDICATE', syndicateId: SA1 }, 'SYNDICATE_DELETED', null);
    await purgeCascadedRecordings(found);

    expect(warnSpy).not.toHaveBeenCalled();
    expect(auditCalls()).toHaveLength(1);
    expect(auditCalls()[0]).toMatchObject({ actorUserId: null, payload: { cause: 'SYNDICATE_DELETED' } });
  });

  it('journalise sans chemin ni clé un fichier impossible à effacer, et traite quand même les suivants', async () => {
    const stuck = seed('rec-0-stuck', MA1, 'AVAILABLE');
    // Un DOSSIER au nom du fichier : `unlink` échoue (EISDIR / EPERM), ce n'est pas ENOENT.
    nodeFs.mkdirSync(fileOf(SA1, MA1, stuck.id), { recursive: true });
    const next = seed('rec-1-next', MA1, 'AVAILABLE', { withFile: true });

    const found = (await collect(TENANT_A, MEETING_A1)).sort(byId);
    await expect(purgeCascadedRecordings(found)).resolves.toBeUndefined();

    expect(warnSpy).toHaveBeenCalledWith(
      'Recording file could not be deleted after cascade',
      expect.objectContaining({ recordingId: stuck.id })
    );
    const logged = JSON.stringify(warnSpy.mock.calls);
    expect(logged).not.toContain(UPLOADS_ROOT);
    expect(logged).not.toContain(UPLOADS_ROOT.replace(/\\/g, '\\\\'));
    expect(logged).not.toContain('syndics/');
    expect(logged).not.toContain(stuck.storageKey);
    expect(logged).not.toContain(next.storageKey);
    expect(exists(fileOf(SA1, MA1, next.id))).toBe(false);
    expect(mockStorage.remove).toHaveBeenCalledTimes(2);
  });

  it('ignore une fileUrl falsifiée : le fichier désigné reste, le fichier canonique est effacé', async () => {
    const outside = nodePath.join(UPLOADS_ROOT, 'autre', 'x.mp4');
    nodeFs.mkdirSync(nodePath.dirname(outside), { recursive: true });
    nodeFs.writeFileSync(outside, 'AUTRE-FICHIER');
    const row = seed('rec-forged', MA1, 'AVAILABLE', { withFile: true });
    row.fileUrl = '/uploads/autre/x.mp4';

    const found = await collect(TENANT_A, MEETING_A1);
    await purgeCascadedRecordings(found);

    expect(exists(outside)).toBe(true);
    expect(exists(fileOf(SA1, MA1, row.id))).toBe(false);
    nodeFs.rmSync(nodePath.dirname(outside), { recursive: true, force: true });
  });

  it('enregistrement désactivé : aucun appel S3, fichier effacé, avertissement pour un FAILED', async () => {
    mockRecordingEnabled = false;
    const row = seed('rec-off', MA1, 'AVAILABLE', { withFile: true });
    const failed = seed('rec-off-failed', MA1, 'FAILED', { failureReason: 'DOWNLOAD_FAILED' });

    const found = await collect(TENANT_A, MEETING_A1);
    await purgeCascadedRecordings(found);

    expect(mockStorage.remove).not.toHaveBeenCalled();
    expect(exists(fileOf(SA1, MA1, row.id))).toBe(false);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith('Recording object kept: recording storage is not configured', {
      recordingId: failed.id
    });
  });

  it('clé S3 non conforme à l enregistrement : objet conservé, avertissement sans la clé', async () => {
    const foreign = seed('rec-foreign', MA1, 'FAILED', {
      failureReason: 'DOWNLOAD_FAILED',
      storageKey: 'ag-enregistrements/tenant-b/meet-b1/autre.mp4'
    });
    const prefixed = seed('rec-prefixed', MA1, 'FAILED', {
      failureReason: 'DOWNLOAD_FAILED',
      storageKey: `autre-prefixe/${TENANT_A}/${MA1}/rec-prefixed.mp4`
    });

    const found = (await collect(TENANT_A, MEETING_A1)).sort(byId);
    await purgeCascadedRecordings(found);

    expect(mockStorage.remove).toHaveBeenCalledTimes(1);
    expect(mockStorage.remove).toHaveBeenCalledWith(prefixed.storageKey);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith('Recording object key does not match the recording; not deleted', {
      recordingId: foreign.id
    });
    expect(JSON.stringify(warnSpy.mock.calls)).not.toContain('tenant-b/meet-b1');
  });

  it('échec de l objet S3 : avertissement sans clé, la purge continue', async () => {
    const first = seed('rec-1', MA1, 'FAILED', { failureReason: 'DOWNLOAD_FAILED' });
    const second = seed('rec-2', MA1, 'AVAILABLE', { withFile: true });
    mockStorage.remove.mockRejectedValue(new Error(`boom ${first.storageKey}`));

    const found = (await collect(TENANT_A, MEETING_A1)).sort(byId);
    await expect(purgeCascadedRecordings(found)).resolves.toBeUndefined();

    expect(warnSpy).toHaveBeenCalledTimes(2);
    expect(warnSpy).toHaveBeenCalledWith('Recording object could not be deleted from storage', {
      recordingId: first.id,
      name: 'Error'
    });
    const logged = JSON.stringify(warnSpy.mock.calls);
    expect(logged).not.toContain(first.storageKey);
    expect(logged).not.toContain(second.storageKey);
    expect(exists(fileOf(SA1, MA1, second.id))).toBe(false);
  });
});
