import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import * as path from 'path';
import { EgressStatus, type EgressInfo } from 'livekit-server-sdk';
import { prisma, type PrismaTransactionClient } from '../../utils/database';
import { env } from '../../config/env';
import { ConflictError, NotFoundError } from '../../middleware/error-middleware';
import { t } from '../../i18n';
import { logger } from '../../utils/logger';
import { logAuditEvent } from '../../services/audit-service';
import { AuditActionKey } from '../../types/audit-types';
import { runWithTenantContext } from '../../utils/tenant-context';
import { getUploadsRoot } from '../../utils/project-root';
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
import { loadMeetingBase, loadMeetingBaseById } from './meeting-live-context';
import { lockMeetingTx } from './meeting-results';
import { deleteRecordingObject, downloadRecordingObject } from './meeting-recording-storage';

/**
 * Enregistrement des AG en visio (spec 045, R1 a R10) : demarrage et arret par
 * le gestionnaire, fin de l'egress signalee par webhook, rapatriement du MP4
 * depuis le stockage S3 vers le stockage prive d'ImmoTopia, lecture et
 * suppression. Le fichier n'est JAMAIS servi en statique.
 */

export type MeetingRecordingStatus = 'RECORDING' | 'PROCESSING' | 'AVAILABLE' | 'FAILED' | 'DELETED';

export interface MeetingRecordingView {
  id: string;
  status: MeetingRecordingStatus;
  startedAt: string;
  stoppedAt: string | null;
  endedAt: string | null;
  durationSeconds: number | null;
  fileSize: number | null;
  failureReason: string | null;
  startedByName: string | null;
}

/** Motifs d'echec stockes (codes courts, jamais de detail technique) ; traduits a la lecture. */
const FAILURE_EGRESS = 'EGRESS_FAILED';
const FAILURE_LIMIT = 'EGRESS_LIMIT';
const FAILURE_NO_FILE = 'NO_FILE';
const FAILURE_DOWNLOAD = 'DOWNLOAD_FAILED';
const FAILURE_LOST = 'EGRESS_LOST';

function failureText(code: string | null | undefined): string | null {
  if (!code) return null;
  switch (code) {
    case FAILURE_EGRESS:
      return t("L'enregistrement a échoué côté visio");
    case FAILURE_LIMIT:
      return t("La limite de durée de l'enregistrement a été atteinte");
    case FAILURE_NO_FILE:
      return t("Aucun fichier n'a été produit par l'enregistrement");
    case FAILURE_DOWNLOAD:
      return t("Le fichier n'a pas pu être rapatrié : il est conservé sur le stockage de la visio");
    case FAILURE_LOST:
      return t("L'enregistrement a été perdu côté visio");
    default:
      return t("L'enregistrement a échoué");
  }
}

interface RecordingRow {
  id: string;
  tenantId: string;
  meetingId: string;
  egressId: string;
  status: MeetingRecordingStatus;
  storageKey: string;
  fileUrl: string | null;
  fileSize: bigint | number | null;
  durationSeconds: number | null;
  failureReason: string | null;
  webhookEventId: string | null;
  startedAt: Date;
  startedByUserId: string | null;
  stoppedAt: Date | null;
  endedAt: Date | null;
}

const RECORDING_SELECT = {
  id: true,
  tenantId: true,
  meetingId: true,
  egressId: true,
  status: true,
  storageKey: true,
  fileUrl: true,
  fileSize: true,
  durationSeconds: true,
  failureReason: true,
  webhookEventId: true,
  startedAt: true,
  startedByUserId: true,
  stoppedAt: true,
  endedAt: true
} as const;

async function loadNames(userIds: Array<string | null>): Promise<Map<string, string>> {
  const ids = Array.from(new Set(userIds.filter((id): id is string => Boolean(id))));
  if (ids.length === 0) return new Map();
  // Select explicite : l'objet User complet porte `passwordHash`.
  const users = await prisma.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, fullName: true }
  });
  return new Map(users.map(user => [user.id, user.fullName?.trim() ?? '']));
}

function toView(row: RecordingRow, names: Map<string, string>): MeetingRecordingView {
  return {
    id: row.id,
    status: row.status,
    startedAt: row.startedAt.toISOString(),
    stoppedAt: row.stoppedAt?.toISOString() ?? null,
    endedAt: row.endedAt?.toISOString() ?? null,
    durationSeconds: row.durationSeconds,
    fileSize: row.fileSize == null ? null : Number(row.fileSize),
    failureReason: failureText(row.failureReason),
    startedByName: (row.startedByUserId && names.get(row.startedByUserId)) || null
  };
}

async function viewOf(row: RecordingRow): Promise<MeetingRecordingView> {
  return toView(row, await loadNames([row.startedByUserId]));
}

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

/** Vue publique : un enregistrement est-il en cours ? (avis « cette assemblée est enregistrée »). */
export async function hasActiveRecording(tenantId: string, meetingId: string): Promise<boolean> {
  const count = await prisma.gMRecording.count({ where: { tenantId, meetingId, status: 'RECORDING' } });
  return count > 0;
}

/** GET /enregistrements : le plus récent d'abord. */
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
  const names = await loadNames(rows.map(row => row.startedByUserId));
  return rows.map(row => toView(row, names));
}

/** Délai après l'arrêt au-delà duquel un enregistrement sans webhook est vérifié auprès de LiveKit. */
const RECONCILE_AFTER_MS = 60_000;

/**
 * Filet de sécurité si le webhook `egress_ended` n'arrive jamais (URL mal
 * déclarée, limiteur, panne) : un enregistrement encore `RECORDING` alors qu'il
 * a été arrêté depuis plus d'une minute, ou que l'AG n'est plus en cours, est
 * vérifié auprès de LiveKit et traité comme une fin d'egress (même chemin,
 * idempotent). Une panne de LiveKit laisse la ligne telle quelle.
 */
async function reconcileStaleRecordings(rows: RecordingRow[], meetingStatus: string): Promise<boolean> {
  const now = Date.now();
  let changed = false;
  for (const row of rows) {
    if (row.status !== 'RECORDING') continue;
    const stoppedLongAgo = row.stoppedAt !== null && now - row.stoppedAt.getTime() > RECONCILE_AFTER_MS;
    if (!stoppedLongAgo && meetingStatus === 'IN_PROGRESS') continue;
    let info: EgressInfo | null;
    try {
      info = await getEgressStatus(row.egressId);
    } catch {
      continue;
    }
    if (info && isEgressActive(info)) continue;
    const followUp = await applyEgressEnded(prisma, row, info, null);
    if (followUp) setImmediate(() => void followUp());
    changed = true;
  }
  return changed;
}

// --- Fin d'egress (commun au webhook et à la réconciliation) ---------------

function nanosToMs(value: bigint | number | undefined): number {
  const n = Number(value ?? 0);
  return n > 0 ? Math.round(n / 1e6) : 0;
}

/** Echec de l'egress : statut non « COMPLETE » (valeurs numeriques de `EgressStatus`) ou aucun fichier. */
function failureCodeOf(info: EgressInfo | null): string | null {
  if (!info) return FAILURE_LOST;
  if (info.status === EgressStatus.EGRESS_LIMIT_REACHED)
    return (info.fileResults?.length ?? 0) > 0 ? null : FAILURE_LIMIT;
  if (info.status === EgressStatus.EGRESS_FAILED || info.status === EgressStatus.EGRESS_ABORTED) return FAILURE_EGRESS;
  return (info.fileResults?.length ?? 0) > 0 ? null : FAILURE_NO_FILE;
}

export type RecordingFollowUp = () => Promise<void>;

/**
 * Applique la fin de l'egress a une ligne `RECORDING` : `FAILED` (motif court) ou
 * `PROCESSING` (fin et duree). Conditionne par `status = RECORDING` : deux
 * traitements simultanes n'ecrivent qu'une fois. Rend le travail a faire APRES la
 * reponse (rapatriement), ou null.
 */
async function applyEgressEnded(
  client: PrismaTransactionClient,
  row: RecordingRow,
  info: EgressInfo | null,
  webhookEventId: string | null
): Promise<RecordingFollowUp | null> {
  const failure = failureCodeOf(info);
  const file = info?.fileResults?.[0];
  const endedMs = nanosToMs(info?.endedAt);
  const endedAt = endedMs > 0 ? new Date(endedMs) : new Date();
  const data =
    failure === null
      ? {
          status: 'PROCESSING' as const,
          endedAt,
          durationSeconds: file && Number(file.duration) > 0 ? Math.round(Number(file.duration) / 1e9) : null,
          webhookEventId
        }
      : { status: 'FAILED' as const, endedAt, failureReason: failure, webhookEventId };

  const updated = await client.gMRecording.updateMany({
    where: { id: row.id, tenantId: row.tenantId, status: 'RECORDING' },
    data
  });
  if (updated.count === 0) return null;

  if (failure !== null) {
    auditAvailability(row, 'FAILED');
    return null;
  }
  return () => repatriateRecording(row.tenantId, row.id);
}

function auditAvailability(row: Pick<RecordingRow, 'tenantId' | 'meetingId' | 'id'>, status: 'AVAILABLE' | 'FAILED') {
  logAuditEvent({
    actorUserId: null,
    tenantId: row.tenantId,
    actionKey: AuditActionKey.SYNDIC_MEETING_RECORDING_AVAILABLE,
    entityType: 'GMRecording',
    entityId: row.id,
    payload: { meetingId: row.meetingId, recordingId: row.id, status }
  });
}

/** Dossier prive des enregistrements d'une AG, relatif a la racine des fichiers deposes. */
function recordingFolder(syndicateId: string, meetingId: string): string[] {
  return ['syndics', syndicateId, 'assemblees', meetingId, 'enregistrements'];
}

/**
 * Rapatrie le MP4 du stockage S3 vers le stockage prive (flux), passe `AVAILABLE`
 * puis supprime l'objet S3 au mieux. Un echec passe `FAILED` et CONSERVE l'objet.
 * Ne leve jamais : appele apres la reponse du webhook.
 */
export async function repatriateRecording(tenantId: string, recordingId: string): Promise<void> {
  await runWithTenantContext({ tenantId }, async () => {
    const row = (await prisma.gMRecording.findFirst({
      where: { id: recordingId, tenantId },
      select: RECORDING_SELECT
    })) as RecordingRow | null;
    if (!row || row.status !== 'PROCESSING') return;

    try {
      const meeting = await loadMeetingBaseById(prisma, tenantId, row.meetingId);
      const segments = recordingFolder(meeting.syndicateId, meeting.id);
      const destination = path.join(getUploadsRoot(env.UPLOADS_DIR), ...segments, `${row.id}.mp4`);
      const size = await downloadRecordingObject(row.storageKey, destination);
      const updated = await prisma.gMRecording.updateMany({
        where: { id: row.id, tenantId, status: 'PROCESSING' },
        data: { status: 'AVAILABLE', fileUrl: `/uploads/${segments.join('/')}/${row.id}.mp4`, fileSize: BigInt(size) }
      });
      if (updated.count === 0) {
        // Supprime entre-temps : le fichier ne doit pas rester sans ligne qui le designe.
        await fs.unlink(destination).catch(() => undefined);
        return;
      }
      auditAvailability(row, 'AVAILABLE');
      await deleteRecordingObject(row.storageKey).catch(error => {
        logger.warn('Recording object could not be deleted from storage', { recordingId: row.id, name: nameOf(error) });
      });
    } catch (error) {
      logger.warn('Recording could not be brought back', { recordingId: row.id, name: nameOf(error) });
      try {
        const updated = await prisma.gMRecording.updateMany({
          where: { id: row.id, tenantId, status: 'PROCESSING' },
          data: { status: 'FAILED', failureReason: FAILURE_DOWNLOAD }
        });
        if (updated.count > 0) auditAvailability(row, 'FAILED');
      } catch (inner) {
        logger.error('Recording failure could not be saved', { recordingId: row.id, name: nameOf(inner) });
      }
    }
  });
}

function nameOf(error: unknown): string {
  return error instanceof Error ? error.name : 'Error';
}

export interface EgressEndedEvent {
  id: string;
  egressInfo?: EgressInfo;
}

/**
 * Webhook `egress_ended` (R4). Sans contexte d'agence au depart (l'agence n'est pas
 * connue d'un webhook, comme les IPN de paiement), puis sous celui de la ligne.
 * Idempotent : egress inconnu, evenement deja traite ou ligne deja passee de
 * `RECORDING` = sans effet. Rend le rapatriement a lancer APRES la reponse.
 */
export async function handleEgressEnded(event: EgressEndedEvent): Promise<{ followUp: RecordingFollowUp | null }> {
  const info = event.egressInfo;
  if (!info?.egressId || !event.id) return { followUp: null };

  const row = (await prisma.gMRecording.findFirst({
    where: { egressId: info.egressId },
    select: RECORDING_SELECT
  })) as RecordingRow | null;
  if (!row || row.webhookEventId === event.id || row.status !== 'RECORDING') return { followUp: null };

  const followUp = await runWithTenantContext({ tenantId: row.tenantId }, () =>
    applyEgressEnded(prisma, row, info, event.id)
  );
  return { followUp };
}

// --- Démarrage et arrêt -----------------------------------------------------

/** POST /visio/enregistrement/demarrer */
export async function startRecording(
  tenantId: string,
  syndicateId: string,
  meetingId: string,
  actorUserId: string | null
): Promise<MeetingRecordingView> {
  const meeting = await loadMeetingBase(prisma, tenantId, syndicateId, meetingId);
  assertRecordingEnabled();

  const followUps: RecordingFollowUp[] = [];
  let egressId: string | null = null;
  let created: RecordingRow;
  try {
    created = await prisma.$transaction(
      async tx => {
        await lockMeetingTx(tx, meeting.id);
        // Statut relu sous le verrou : une cloture simultanee ne laisse pas demarrer.
        const current = await tx.generalMeeting.findFirst({
          where: { id: meeting.id, syndicate: { tenantId } },
          select: { status: true }
        });
        if (current?.status !== 'IN_PROGRESS') {
          throw new ConflictError(t("L'assemblée n'est pas en cours : l'enregistrement est impossible"));
        }

        const running = (await tx.gMRecording.findFirst({
          where: { tenantId, meetingId: meeting.id, status: 'RECORDING' },
          select: RECORDING_SELECT
        })) as RecordingRow | null;
        if (running) {
          // Egress peut-etre termine sans que le webhook soit arrive : on demande a LiveKit.
          const info = await getEgressStatus(running.egressId);
          if (info && isEgressActive(info)) throw new ConflictError(t('Un enregistrement est déjà en cours'));
          const followUp = await applyEgressEnded(tx, running, info, null);
          if (followUp) followUps.push(followUp);
        }

        const roomName = buildMeetingRoomName(tenantId, meeting.id);
        await ensureRoom(roomName);
        const recordingId = randomUUID();
        const storageKey = buildRecordingStorageKey(tenantId, meeting.id, recordingId);
        egressId = await startMeetingRecording(roomName, storageKey);
        return (await tx.gMRecording.create({
          data: {
            id: recordingId,
            tenantId,
            meetingId: meeting.id,
            egressId,
            storageKey,
            startedByUserId: actorUserId
          },
          select: RECORDING_SELECT
        })) as RecordingRow;
      },
      { timeout: 30_000, maxWait: 10_000 }
    );
  } catch (error) {
    // L'egress a demarre mais la ligne n'existe pas : on l'arrete, sinon il enregistrerait sans trace.
    if (egressId) await stopEgress(egressId).catch(() => undefined);
    throw error;
  }

  for (const followUp of followUps) setImmediate(() => void followUp());

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

/** POST /visio/enregistrement/arreter : le statut reste RECORDING jusqu'au webhook. */
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

// --- Fichier et suppression -------------------------------------------------

async function loadScopedRecording(
  tenantId: string,
  syndicateId: string,
  meetingId: string,
  recordingId: string
): Promise<{ row: RecordingRow; syndicateId: string; scheduledAt: Date }> {
  const meeting = await loadMeetingBase(prisma, tenantId, syndicateId, meetingId);
  const row = (await prisma.gMRecording.findFirst({
    where: { id: recordingId, tenantId, meetingId: meeting.id },
    select: RECORDING_SELECT
  })) as RecordingRow | null;
  if (!row) throw new NotFoundError(t('Enregistrement introuvable ou inaccessible'));
  return { row, syndicateId: meeting.syndicateId, scheduledAt: meeting.scheduledAt };
}

/**
 * Chemin disque du fichier, verifie : sous la racine des fichiers deposes, dans le
 * dossier attendu de CETTE AG, nomme d'apres l'enregistrement. `null` sinon.
 */
function resolveRecordingPath(row: RecordingRow, syndicateId: string): string | null {
  const prefix = '/uploads/';
  if (!row.fileUrl?.startsWith(prefix) || row.fileUrl.includes('\0')) return null;
  const root = path.resolve(getUploadsRoot(env.UPLOADS_DIR));
  const folder = path.resolve(root, ...recordingFolder(syndicateId, row.meetingId));
  const absolute = path.resolve(root, row.fileUrl.slice(prefix.length));
  if (path.dirname(absolute) !== folder || path.basename(absolute) !== `${row.id}.mp4`) return null;
  return absolute;
}

export interface RecordingFile {
  absolutePath: string;
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
  return { absolutePath, downloadName: `assemblee-${row.startedAt.toISOString().slice(0, 10)}.mp4` };
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
  if (row.status !== 'AVAILABLE' && row.status !== 'FAILED') {
    throw new ConflictError(t('Cet enregistrement ne peut pas être supprimé dans son état actuel'));
  }

  const absolutePath = resolveRecordingPath(row, ownSyndicateId);
  if (absolutePath) await fs.unlink(absolutePath).catch(() => undefined);
  // Un echec de rapatriement laisse l'objet sur le stockage S3 : on l'efface aussi (au mieux).
  if (isRecordingEnabled()) {
    await deleteRecordingObject(row.storageKey).catch(error => {
      logger.warn('Recording object could not be deleted from storage', { recordingId: row.id, name: nameOf(error) });
    });
  }

  const deletedAt = new Date();
  await prisma.gMRecording.updateMany({
    where: { id: row.id, tenantId },
    data: { status: 'DELETED', deletedAt, deletedByUserId: actorUserId, fileUrl: null }
  });

  logAuditEvent({
    actorUserId,
    tenantId,
    actionKey: AuditActionKey.SYNDIC_MEETING_RECORDING_DELETED,
    entityType: 'GMRecording',
    entityId: row.id,
    payload: { meetingId: row.meetingId, recordingId: row.id, previousStatus: row.status }
  });
  return viewOf({ ...row, status: 'DELETED', fileUrl: null });
}
