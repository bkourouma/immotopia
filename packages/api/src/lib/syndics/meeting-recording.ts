import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import * as path from 'path';
import { prisma, type PrismaTransactionClient } from '../../utils/database';
import { ConflictError, NotFoundError } from '../../middleware/error-middleware';
import { t } from '../../i18n';
import { logger } from '../../utils/logger';
import { logAuditEvent, recordAuditEvent } from '../../services/audit-service';
import { AuditActionKey } from '../../types/audit-types';
import {
  buildMeetingRoomName,
  buildRecordingStorageKey,
  ensureRoom,
  getEgressStatus,
  isEgressActive,
  isRecordingEnabled,
  startMeetingRecording,
  stopEgress
} from '../../services/livekit-service';
import { loadMeetingBase } from './meeting-live-context';
import { deleteRecordingObject } from './meeting-recording-storage';
import {
  applyEgressEnded,
  reconcileStaleRecordings,
  repatriateRecording,
  type AfterCommit,
  type RecordingFollowUp
} from './meeting-recording-ingest';
import {
  FAILURE_DOWNLOAD,
  RECORDING_SELECT,
  invalidateActiveRecordingCache,
  lockRecordingTx,
  nameOf,
  resolveRecordingPath,
  unlinkIfPresent,
  viewOf,
  viewsOf,
  type MeetingRecordingView,
  type RecordingRow
} from './meeting-recording-shared';

/**
 * Enregistrement des AG en visio, cote gestionnaire (spec 045, R1 a R10) :
 * demarrage et arret, liste, lecture, reprise et suppression. Le fichier n'est
 * JAMAIS servi en statique. La fin d'egress et le rapatriement sont dans
 * `meeting-recording-ingest.ts`.
 */

export type { MeetingRecordingStatus, MeetingRecordingView } from './meeting-recording-shared';
export { hasActiveRecording, invalidateActiveRecordingCache } from './meeting-recording-shared';
export { handleEgressEnded, repatriateRecording } from './meeting-recording-ingest';
export type { EgressEndedEvent, RecordingFollowUp } from './meeting-recording-ingest';

function assertRecordingEnabled(): void {
  if (!isRecordingEnabled()) throw new ConflictError(t("L'enregistrement n'est pas activé"));
}

// --- Lecture ---------------------------------------------------------------

/** Enregistrement en cours (RECORDING) de l'AG, ou null. */
export async function findActiveRecording(tenantId: string, meetingId: string): Promise<MeetingRecordingView | null> {
  const row = await prisma.gMRecording.findFirst({
    where: { tenantId, meetingId, status: 'RECORDING' },
    orderBy: { startedAt: 'desc' },
    select: RECORDING_SELECT
  });
  return row ? viewOf(row as RecordingRow) : null;
}

/** GET /enregistrements : le plus récent d'abord ; rattrape un webhook perdu ou un rapatriement interrompu. */
export async function listRecordings(
  tenantId: string,
  syndicateId: string,
  meetingId: string
): Promise<MeetingRecordingView[]> {
  const meeting = await loadMeetingBase(prisma, tenantId, syndicateId, meetingId);
  const readRows = async () =>
    (await prisma.gMRecording.findMany({
      where: { tenantId, meetingId: meeting.id },
      orderBy: { startedAt: 'desc' },
      select: RECORDING_SELECT
    })) as RecordingRow[];
  let rows = await readRows();
  if (await reconcileStaleRecordings(rows, meeting.status)) rows = await readRows();
  return viewsOf(rows);
}

// --- Démarrage --------------------------------------------------------------

async function assertMeetingInProgress(tx: PrismaTransactionClient, tenantId: string, meetingId: string) {
  const current = await tx.generalMeeting.findFirst({
    where: { id: meetingId, syndicate: { tenantId } },
    select: { status: true }
  });
  if (current?.status !== 'IN_PROGRESS') {
    throw new ConflictError(t("L'assemblée n'est pas en cours : l'enregistrement est impossible"));
  }
}

interface StartEffects {
  egressId: string | null;
  followUps: RecordingFollowUp[];
  afterCommit: AfterCommit;
}

/**
 * Un enregistrement `RECORDING` existe deja : actif cote LiveKit = 409 ; termine sans
 * que le webhook soit arrive = traite comme un `egress_ended` (meme code, idempotent).
 */
async function settleRunningRecording(
  tx: PrismaTransactionClient,
  tenantId: string,
  meetingId: string,
  effects: StartEffects
): Promise<void> {
  const running = (await tx.gMRecording.findFirst({
    where: { tenantId, meetingId, status: 'RECORDING' },
    select: RECORDING_SELECT
  })) as RecordingRow | null;
  if (!running) return;
  const info = await getEgressStatus(running.egressId);
  if (info && isEgressActive(info)) throw new ConflictError(t('Un enregistrement est déjà en cours'));
  const followUp = await applyEgressEnded(tx, running, info, null, effects.afterCommit);
  if (followUp) effects.followUps.push(followUp);
}

async function startInTransaction(
  tx: PrismaTransactionClient,
  tenantId: string,
  meetingId: string,
  actorUserId: string | null,
  effects: StartEffects
): Promise<RecordingRow> {
  await lockRecordingTx(tx, meetingId);
  await assertMeetingInProgress(tx, tenantId, meetingId);
  await settleRunningRecording(tx, tenantId, meetingId, effects);

  const roomName = buildMeetingRoomName(tenantId, meetingId);
  await ensureRoom(roomName);
  const recordingId = randomUUID();
  const storageKey = buildRecordingStorageKey(tenantId, meetingId, recordingId);
  effects.egressId = await startMeetingRecording(roomName, storageKey);
  // L'AG a pu etre close pendant l'appel reseau : l'egress est alors arrete par l'appelant.
  await assertMeetingInProgress(tx, tenantId, meetingId);
  return (await tx.gMRecording.create({
    data: {
      id: recordingId,
      tenantId,
      meetingId,
      egressId: effects.egressId,
      storageKey,
      startedByUserId: actorUserId
    },
    select: RECORDING_SELECT
  })) as RecordingRow;
}

/** POST /visio/enregistrement/demarrer */
export async function startRecording(
  tenantId: string,
  syndicateId: string,
  meetingId: string,
  actorUserId: string | null
): Promise<MeetingRecordingView> {
  const meeting = await loadMeetingBase(prisma, tenantId, syndicateId, meetingId);
  assertRecordingEnabled();

  const effects: StartEffects = { egressId: null, followUps: [], afterCommit: [] };
  let created: RecordingRow;
  try {
    created = await prisma.$transaction(tx => startInTransaction(tx, tenantId, meeting.id, actorUserId, effects), {
      timeout: 30_000,
      maxWait: 10_000
    });
  } catch (error) {
    // L'egress a demarre mais la ligne n'existe pas : on l'arrete, sinon il enregistrerait sans trace.
    if (effects.egressId) await stopEgress(effects.egressId).catch(() => undefined);
    throw error;
  }

  invalidateActiveRecordingCache();
  for (const audit of effects.afterCommit) audit();
  for (const followUp of effects.followUps) setImmediate(() => void followUp());
  logAuditEvent({
    actorUserId,
    tenantId,
    actionKey: AuditActionKey.SYNDIC_MEETING_RECORDING_STARTED,
    entityType: 'GMRecording',
    entityId: created.id,
    payload: { meetingId: meeting.id, recordingId: created.id }
  });
  return viewOf(created);
}

/** POST /visio/enregistrement/arreter : le statut reste RECORDING jusqu'au webhook ; idempotent. */
export async function stopRecording(
  tenantId: string,
  syndicateId: string,
  meetingId: string,
  actorUserId: string | null
): Promise<MeetingRecordingView> {
  const meeting = await loadMeetingBase(prisma, tenantId, syndicateId, meetingId);
  const row = (await prisma.gMRecording.findFirst({
    where: { tenantId, meetingId: meeting.id, status: 'RECORDING' },
    orderBy: { startedAt: 'desc' },
    select: RECORDING_SELECT
  })) as RecordingRow | null;
  if (!row) throw new ConflictError(t("Aucun enregistrement n'est en cours"));
  // Deja arrete (double clic, deux onglets) : ni second arret, ni nouvelle ecriture, ni audit.
  if (row.stoppedAt) return viewOf(row);

  await stopEgress(row.egressId);
  const stoppedAt = new Date();
  await prisma.gMRecording.updateMany({
    where: { id: row.id, tenantId, status: 'RECORDING' },
    data: { stoppedAt, stoppedByUserId: actorUserId }
  });
  logAuditEvent({
    actorUserId,
    tenantId,
    actionKey: AuditActionKey.SYNDIC_MEETING_RECORDING_STOPPED,
    entityType: 'GMRecording',
    entityId: row.id,
    payload: { meetingId: meeting.id, recordingId: row.id }
  });
  return viewOf({ ...row, stoppedAt });
}

// --- Fichier, reprise et suppression ----------------------------------------

interface ScopedRecording {
  row: RecordingRow;
  syndicateId: string;
}

async function loadScopedRecording(
  tenantId: string,
  syndicateId: string,
  meetingId: string,
  recordingId: string
): Promise<ScopedRecording> {
  const meeting = await loadMeetingBase(prisma, tenantId, syndicateId, meetingId);
  const row = (await prisma.gMRecording.findFirst({
    where: { id: recordingId, tenantId, meetingId: meeting.id },
    select: RECORDING_SELECT
  })) as RecordingRow | null;
  if (!row) throw new NotFoundError(t('Enregistrement introuvable ou inaccessible'));
  return { row, syndicateId: meeting.syndicateId };
}

export interface RecordingFile {
  recordingId: string;
  tenantId: string;
  meetingId: string;
  /** Dossier du fichier (racine de `sendFile`) et nom : jamais un chemin hors de ce dossier. */
  directory: string;
  fileName: string;
  downloadName: string;
}

/** GET /enregistrements/:recordingId/fichier : 404 si l'enregistrement n'est pas AVAILABLE ou le fichier absent. */
export async function getRecordingFile(
  tenantId: string,
  syndicateId: string,
  meetingId: string,
  recordingId: string
): Promise<RecordingFile> {
  const { row, syndicateId: ownSyndicateId } = await loadScopedRecording(tenantId, syndicateId, meetingId, recordingId);
  const notFound = () => new NotFoundError(t('Enregistrement introuvable ou inaccessible'));
  if (row.status !== 'AVAILABLE') throw notFound();
  const absolutePath = resolveRecordingPath(row, ownSyndicateId);
  if (!absolutePath) throw notFound();
  const stat = await fs.stat(absolutePath).catch(() => null);
  if (!stat?.isFile()) throw notFound();
  return {
    recordingId: row.id,
    tenantId,
    meetingId: row.meetingId,
    directory: path.dirname(absolutePath),
    fileName: path.basename(absolutePath),
    downloadName: `assemblee-${row.startedAt.toISOString().slice(0, 10)}.mp4`
  };
}

/** Audit de la lecture ou du telechargement (charge sans chemin ni cle de stockage). */
export function auditRecordingAccess(
  file: Pick<RecordingFile, 'recordingId' | 'tenantId' | 'meetingId'>,
  actorUserId: string | null,
  mode: 'STREAM' | 'DOWNLOAD'
): void {
  logAuditEvent({
    actorUserId,
    tenantId: file.tenantId,
    actionKey: AuditActionKey.SYNDIC_MEETING_RECORDING_ACCESSED,
    entityType: 'GMRecording',
    entityId: file.recordingId,
    payload: { meetingId: file.meetingId, recordingId: file.recordingId, mode }
  });
}

/** POST /enregistrements/:recordingId/reessayer : relance le rapatriement d'un echec `DOWNLOAD_FAILED`. */
export async function retryRecording(
  tenantId: string,
  syndicateId: string,
  meetingId: string,
  recordingId: string
): Promise<MeetingRecordingView> {
  const { row } = await loadScopedRecording(tenantId, syndicateId, meetingId, recordingId);
  const notRetryable = () => new ConflictError(t('Cet enregistrement ne peut pas être relancé dans son état actuel'));
  if (row.status !== 'FAILED' || row.failureReason !== FAILURE_DOWNLOAD) throw notRetryable();
  const updated = await prisma.gMRecording.updateMany({
    where: { id: row.id, tenantId, status: 'FAILED', failureReason: FAILURE_DOWNLOAD },
    data: { status: 'PROCESSING', failureReason: null }
  });
  if (updated.count === 0) throw notRetryable();
  setImmediate(() => void repatriateRecording(tenantId, row.id));
  return viewOf({ ...row, status: 'PROCESSING', failureReason: null });
}

/** DELETE /enregistrements/:recordingId : fichier effacé, ligne conservée en DELETED (trace). */
export async function deleteRecording(
  tenantId: string,
  syndicateId: string,
  meetingId: string,
  recordingId: string,
  actorUserId: string | null
): Promise<MeetingRecordingView> {
  const { row, syndicateId: ownSyndicateId } = await loadScopedRecording(tenantId, syndicateId, meetingId, recordingId);
  const notDeletable = () => new ConflictError(t('Cet enregistrement ne peut pas être supprimé dans son état actuel'));
  if (row.status !== 'AVAILABLE' && row.status !== 'FAILED') throw notDeletable();

  const absolutePath = resolveRecordingPath(row, ownSyndicateId);
  if (absolutePath) await unlinkIfPresent(absolutePath);
  // Un echec de rapatriement laisse l'objet sur le stockage S3 : on l'efface aussi (au mieux).
  if (isRecordingEnabled()) {
    await deleteRecordingObject(row.storageKey).catch(error => {
      logger.warn('Recording object could not be deleted from storage', { recordingId: row.id, name: nameOf(error) });
    });
  }

  // Action critique : la trace s'ecrit DANS la transaction, avec la mutation. Le statut lu fait
  // partie du `where` : une seule transition, donc un seul audit, meme en cas de double suppression.
  await prisma.$transaction(async tx => {
    const updated = await tx.gMRecording.updateMany({
      where: { id: row.id, tenantId, status: row.status },
      data: { status: 'DELETED', deletedAt: new Date(), deletedByUserId: actorUserId, fileUrl: null }
    });
    if (updated.count === 0) throw notDeletable();
    await recordAuditEvent(tx, {
      actorUserId,
      tenantId,
      actionKey: AuditActionKey.SYNDIC_MEETING_RECORDING_DELETED,
      entityType: 'GMRecording',
      entityId: row.id,
      payload: { meetingId: row.meetingId, recordingId: row.id, previousStatus: row.status }
    });
  });
  return viewOf({ ...row, status: 'DELETED', fileUrl: null });
}
