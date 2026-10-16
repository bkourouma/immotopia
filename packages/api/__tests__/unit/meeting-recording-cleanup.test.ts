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
  logAuditEvent: (...args: unknown[]) => mockAudit(...args),
  recordAuditEvent: jest.fn(),
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

function dirOf(syndicateId: string, meetingId: string): string {
  return nodePath.join(UPLOADS_ROOT, 'syndics', syndicateId, 'assemblees', meetingId, 'enregistrements');
}
const fileOf = (syndicateId: string, meetingId: string, recordingId: string) =>
  nodePath.join(dirOf(syndicateId, meetingId), `${recordingId}.mp4`);

interface SeedOptions {
  tenantId?: string;
  syndicateId?: string;
  withFile?: boolean;
  fileUrl?: string | null;
  failureReason?: string | null;
}

/** Ligne d'enregistrement, avec (ou sans) un vrai fichier dans le dossier de son AG. */
function seed(recordingId: string, meetingId: string, status: string, options: SeedOptions = {}): any {
  const { tenantId = TENANT_A, syndicateId = SA1, withFile = false, failureReason = null } = options;
  if (withFile) {
    nodeFs.mkdirSync(dirOf(syndicateId, meetingId), { recursive: true });
    nodeFs.writeFileSync(fileOf(syndicateId, meetingId, recordingId), 'FAKE-MP4');
  }
  const defaultUrl = `/uploads/syndics/${syndicateId}/assemblees/${meetingId}/enregistrements/${recordingId}.mp4`;
  const row = {
    id: recordingId,
    tenantId,
    meetingId,
    egressId: `EG_${recordingId}`,
    status,
    storageKey: `ag-enregistrements/${tenantId}/${meetingId}/${recordingId}.mp4`,
    fileUrl: options.fileUrl !== undefined ? options.fileUrl : withFile ? defaultUrl : null,
    failureReason
  };
  mockPrisma.gMRecording.rows.push(row);
  return row;
}

beforeEach(() => {
  mockPrisma.reset();
  mockPrisma.$executeRaw.mockClear();
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

const collect = (tenantId: string, scope: RecordingCascadeScope): Promise<CascadedRecording[]> =>
  mockPrisma.$transaction((tx: any) => collectRecordingsForCascade(tx, tenantId, scope));
const auditCalls = () => mockAudit.mock.calls.map(([entry]) => entry);
const exists = (file: string): boolean => nodeFs.existsSync(file);
const byId = (a: { id: string }, b: { id: string }) => a.id.localeCompare(b.id);

describe('collectRecordingsForCascade', () => {
  it('relève les enregistrements d une AG (y compris DELETED), verrou pris, avec le syndicateId', async () => {
    seed('rec-available', MA1, 'AVAILABLE', { withFile: true });
    seed('rec-failed', MA1, 'FAILED', { failureReason: 'DOWNLOAD_FAILED' });
    seed('rec-deleted', MA1, 'DELETED');
    seed('rec-autre-ag', MA2, 'AVAILABLE', { withFile: true });

    const found = await collect(TENANT_A, { kind: 'MEETING', meetingId: MA1 });

    expect(found.map(row => row.id).sort()).toEqual(['rec-available', 'rec-deleted', 'rec-failed']);
    expect(found.every(row => row.syndicateId === SA1 && row.meetingId === MA1)).toBe(true);
    expect(mockPrisma.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it.each(['RECORDING', 'PROCESSING'])(
    'refuse (409) tant qu un enregistrement est %s, sans rien effacer',
    async status => {
      const row = seed('rec-ok', MA1, 'AVAILABLE', { withFile: true });
      seed('rec-busy', MA1, status);

      await expect(collect(TENANT_A, { kind: 'MEETING', meetingId: MA1 })).rejects.toMatchObject({ statusCode: 409 });

      expect(exists(fileOf(SA1, MA1, row.id))).toBe(true);
      expect(mockStorage.remove).not.toHaveBeenCalled();
      expect(mockAudit).not.toHaveBeenCalled();
    }
  );

  it('rend [] sans verrou quand le périmètre ne contient aucune AG', async () => {
    expect(await collect(TENANT_A, { kind: 'MEETING', meetingId: 'meet-inconnue' })).toEqual([]);
    expect(mockPrisma.$executeRaw).not.toHaveBeenCalled();
  });

  it('isolation : une AG d une autre agence ne ramène rien et son fichier reste intact', async () => {
    const other = seed('rec-b', MB1, 'AVAILABLE', { tenantId: TENANT_B, syndicateId: SB1, withFile: true });

    const found = await collect(TENANT_A, { kind: 'MEETING', meetingId: MB1 });
    await purgeCascadedRecordings(found, 'user-1', 'MEETING_DELETED');

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

    mockPrisma.$executeRaw.mockClear();
    const tenant = await collect(TENANT_A, { kind: 'TENANT' });
    expect(tenant.map(row => row.id).sort()).toEqual(['rec-a1', 'rec-a2', 'rec-a3']);
    expect(tenant.find(row => row.id === 'rec-a3')?.syndicateId).toBe(SA2);
    expect(mockPrisma.$executeRaw).toHaveBeenCalledTimes(3);

    // Copropriété d'une autre agence demandée par l'agence A : rien.
    expect(await collect(TENANT_A, { kind: 'SYNDICATE', syndicateId: SB1 })).toEqual([]);
  });
});

describe('purgeCascadedRecordings', () => {
  it('efface fichier et objet S3 de chaque enregistrement et audite ceux qui ne sont pas déjà DELETED', async () => {
    const available = seed('rec-available', MA1, 'AVAILABLE', { withFile: true });
    const failed = seed('rec-failed', MA1, 'FAILED', { failureReason: 'DOWNLOAD_FAILED' });
    const deleted = seed('rec-deleted', MA1, 'DELETED');

    const found = await collect(TENANT_A, { kind: 'MEETING', meetingId: MA1 });
    mockPrisma.gMRecording.rows = [];
    await purgeCascadedRecordings(found, 'user-1', 'MEETING_DELETED');

    expect(exists(fileOf(SA1, MA1, available.id))).toBe(false);
    const removed = mockStorage.remove.mock.calls.map(([key]) => key).sort();
    expect(removed).toEqual([available.storageKey, deleted.storageKey, failed.storageKey].sort());

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
      cause: 'MEETING_DELETED'
    });
    expect(audits.find(entry => entry.entityId === 'rec-failed').payload.previousStatus).toBe('FAILED');
    expect(audits.some(entry => entry.entityId === 'rec-deleted')).toBe(false);
    expect(AUDIT_CATALOG[AuditActionKey.SYNDIC_MEETING_RECORDING_DELETED].critical).toBe(true);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('tolère un fichier déjà absent (ENOENT) : pas d avertissement, audit quand même', async () => {
    seed('rec-gone', MA1, 'AVAILABLE', {
      fileUrl: `/uploads/syndics/${SA1}/assemblees/${MA1}/enregistrements/rec-gone.mp4`
    });

    const found = await collect(TENANT_A, { kind: 'SYNDICATE', syndicateId: SA1 });
    await purgeCascadedRecordings(found, null, 'SYNDICATE_DELETED');

    expect(warnSpy).not.toHaveBeenCalled();
    expect(auditCalls()).toHaveLength(1);
    expect(auditCalls()[0]).toMatchObject({ actorUserId: null, payload: { cause: 'SYNDICATE_DELETED' } });
  });

  it('journalise sans chemin ni clé un fichier impossible à effacer, et traite quand même les suivants', async () => {
    const stuck = seed('rec-0-stuck', MA1, 'AVAILABLE');
    // Un DOSSIER au nom du fichier : `unlink` échoue (EISDIR / EPERM), ce n'est pas ENOENT.
    nodeFs.mkdirSync(fileOf(SA1, MA1, stuck.id), { recursive: true });
    stuck.fileUrl = `/uploads/syndics/${SA1}/assemblees/${MA1}/enregistrements/${stuck.id}.mp4`;
    const next = seed('rec-1-next', MA1, 'AVAILABLE', { withFile: true });

    const found = (await collect(TENANT_A, { kind: 'MEETING', meetingId: MA1 })).sort(byId);
    await expect(purgeCascadedRecordings(found, 'user-1', 'MEETING_DELETED')).resolves.toBeUndefined();

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
    expect(auditCalls()).toHaveLength(2);
  });

  it('n efface pas un fichier désigné par une fileUrl falsifiée (hors du dossier de l AG)', async () => {
    const outside = nodePath.join(UPLOADS_ROOT, 'autre', 'x.mp4');
    nodeFs.mkdirSync(nodePath.dirname(outside), { recursive: true });
    nodeFs.writeFileSync(outside, 'AUTRE-FICHIER');
    seed('rec-forged', MA1, 'AVAILABLE', { fileUrl: '/uploads/autre/x.mp4' });

    const found = await collect(TENANT_A, { kind: 'MEETING', meetingId: MA1 });
    await purgeCascadedRecordings(found, 'user-1', 'MEETING_DELETED');

    expect(exists(outside)).toBe(true);
    expect(auditCalls()).toHaveLength(1);
    nodeFs.rmSync(nodePath.dirname(outside), { recursive: true, force: true });
  });

  it('enregistrement désactivé : aucun appel S3, mais le fichier est quand même effacé', async () => {
    mockRecordingEnabled = false;
    const row = seed('rec-off', MA1, 'AVAILABLE', { withFile: true });

    const found = await collect(TENANT_A, { kind: 'MEETING', meetingId: MA1 });
    await purgeCascadedRecordings(found, 'user-1', 'MEETING_DELETED');

    expect(mockStorage.remove).not.toHaveBeenCalled();
    expect(exists(fileOf(SA1, MA1, row.id))).toBe(false);
    expect(auditCalls()).toHaveLength(1);
  });

  it('échec de l objet S3 : avertissement sans clé, la purge continue', async () => {
    const first = seed('rec-1', MA1, 'FAILED', { failureReason: 'DOWNLOAD_FAILED' });
    const second = seed('rec-2', MA1, 'AVAILABLE', { withFile: true });
    mockStorage.remove.mockRejectedValue(new Error(`boom ${first.storageKey}`));

    const found = (await collect(TENANT_A, { kind: 'MEETING', meetingId: MA1 })).sort(byId);
    await expect(purgeCascadedRecordings(found, 'user-1', 'MEETING_DELETED')).resolves.toBeUndefined();

    expect(warnSpy).toHaveBeenCalledTimes(2);
    expect(warnSpy).toHaveBeenCalledWith('Recording object could not be deleted from storage', {
      recordingId: first.id,
      name: 'Error'
    });
    const logged = JSON.stringify(warnSpy.mock.calls);
    expect(logged).not.toContain(first.storageKey);
    expect(logged).not.toContain(second.storageKey);
    expect(exists(fileOf(SA1, MA1, second.id))).toBe(false);
    expect(auditCalls()).toHaveLength(2);
  });
});
