import type { PrismaTransactionClient } from '../../utils/database';
import { ConflictError } from '../../middleware/error-middleware';
import { t } from '../../i18n';
import { logger } from '../../utils/logger';
import { recordAuditEvent } from '../../services/audit-service';
import { AuditActionKey } from '../../types/audit-types';
import { isRecordingEnabled } from '../../services/livekit-service';
import { deleteRecordingObject } from './meeting-recording-storage';
import {
  nameOf,
  recordingFilePath,
  tryLockRecordingTx,
  unlinkIfPresent,
  type MeetingRecordingStatus
} from './meeting-recording-shared';

/**
 * Nettoyage des enregistrements d'AG lors d'une suppression en cascade (spec 045, R12).
 *
 * Les lignes `GMRecording` partent avec leur AG, leur copropriete ou leur agence
 * (`onDelete: Cascade`), mais le MP4 prive et l'objet S3 restant, eux, restent.
 * Tout chemin qui supprime une AG, directement ou en cascade, procede ainsi :
 *   1. DANS la transaction, AVANT la suppression : `collectRecordingsForCascade`
 *      (verrou non bloquant par AG, 409 si un demarrage ou un enregistrement est en
 *      cours, audit critique ecrit dans la transaction) ;
 *   2. APRES le commit : `purgeCascadedRecordings` (efface fichier et objet S3 au
 *      mieux, ne leve jamais, n'audite plus).
 * Ce module ne decide d'aucune conservation ni purge automatique (spec 045, R10).
 *
 * Perimetre TENANT : une future purge d'agence devra le traiter par lots, avec un
 * delai de transaction explicite (verrous et liste `in` proportionnels au nombre d'AG).
 */

export type RecordingCascadeScope =
  { kind: 'MEETING'; meetingId: string } | { kind: 'SYNDICATE'; syndicateId: string } | { kind: 'TENANT' };

export type RecordingCascadeCause = 'MEETING_DELETED' | 'SYNDICATE_DELETED' | 'TENANT_DELETED';

export interface CascadedRecording {
  id: string;
  tenantId: string;
  meetingId: string;
  syndicateId: string;
  status: MeetingRecordingStatus;
  storageKey: string;
}

/** AG du perimetre, TOUJOURS bornees a l'agence. */
function meetingWhere(tenantId: string, scope: RecordingCascadeScope) {
  switch (scope.kind) {
    case 'MEETING':
      return { id: scope.meetingId, syndicate: { tenantId } };
    case 'SYNDICATE':
      return { syndicateId: scope.syndicateId, syndicate: { tenantId } };
    default:
      return { syndicate: { tenantId } };
  }
}

function inProgressError(): ConflictError {
  return new ConflictError(
    t(
      "Un enregistrement d'assemblée est encore en cours ou en traitement : la suppression est impossible pour le moment"
    )
  );
}

async function auditCascaded(
  tx: PrismaTransactionClient,
  rows: CascadedRecording[],
  cause: RecordingCascadeCause,
  actorUserId: string | null
): Promise<void> {
  for (const row of rows) {
    // Une ligne deja DELETED a ete auditee lors de sa suppression.
    if (row.status === 'DELETED') continue;
    await recordAuditEvent(tx, {
      actorUserId,
      tenantId: row.tenantId,
      actionKey: AuditActionKey.SYNDIC_MEETING_RECORDING_DELETED,
      entityType: 'GMRecording',
      entityId: row.id,
      payload: { meetingId: row.meetingId, recordingId: row.id, previousStatus: row.status, cause }
    });
  }
}

/**
 * A appeler DANS la transaction de suppression, avant elle. Le verrou par AG est celui de
 * `startRecording`, pris SANS attente : un demarrage en cours donne un 409 immediat.
 */
export async function collectRecordingsForCascade(
  tx: PrismaTransactionClient,
  tenantId: string,
  scope: RecordingCascadeScope,
  cause: RecordingCascadeCause,
  actorUserId: string | null
): Promise<CascadedRecording[]> {
  const meetings = await tx.generalMeeting.findMany({
    where: meetingWhere(tenantId, scope),
    select: { id: true, syndicateId: true }
  });
  if (meetings.length === 0) return [];

  const ids = meetings.map(meeting => meeting.id).sort();
  for (const meetingId of ids) {
    if (!(await tryLockRecordingTx(tx, meetingId))) throw inProgressError();
  }

  const rows = await tx.gMRecording.findMany({
    where: { tenantId, meetingId: { in: ids } },
    select: { id: true, tenantId: true, meetingId: true, status: true, storageKey: true }
  });
  if (rows.some(row => row.status === 'RECORDING' || row.status === 'PROCESSING')) throw inProgressError();

  const syndicateOf = new Map(meetings.map(meeting => [meeting.id, meeting.syndicateId]));
  const found = rows.map(row => ({
    ...row,
    status: row.status as MeetingRecordingStatus,
    syndicateId: syndicateOf.get(row.meetingId) as string
  }));
  await auditCascaded(tx, found, cause, actorUserId);
  return found;
}

/** Efface le MP4 canonique (derive des identifiants) et son `.part` voisin ; ENOENT tolere. */
async function removeFile(row: CascadedRecording): Promise<void> {
  const absolutePath = recordingFilePath(row.syndicateId, row.meetingId, row.id);
  if (!absolutePath) return;
  for (const candidate of [absolutePath, `${absolutePath}.part`]) {
    try {
      await unlinkIfPresent(candidate);
    } catch (error) {
      logger.warn('Recording file could not be deleted after cascade', { recordingId: row.id, name: nameOf(error) });
    }
  }
}

async function removeObject(row: CascadedRecording): Promise<void> {
  if (!isRecordingEnabled()) {
    if (row.status === 'FAILED') {
      logger.warn('Recording object kept: recording storage is not configured', { recordingId: row.id });
    }
    return;
  }
  // Forme de `buildRecordingStorageKey`, independante du prefixe configure.
  if (!row.storageKey.endsWith(`${row.tenantId}/${row.meetingId}/${row.id}.mp4`)) {
    logger.warn('Recording object key does not match the recording; not deleted', { recordingId: row.id });
    return;
  }
  try {
    await deleteRecordingObject(row.storageKey);
  } catch (error) {
    logger.warn('Recording object could not be deleted from storage', { recordingId: row.id, name: nameOf(error) });
  }
}

/** A appeler APRES le commit. Ne leve jamais : un echec n'empeche pas les enregistrements suivants. */
export async function purgeCascadedRecordings(recordings: CascadedRecording[]): Promise<void> {
  for (const row of recordings) {
    try {
      await removeFile(row);
      await removeObject(row);
    } catch (error) {
      logger.warn('Recording cleanup failed after cascade', { recordingId: row.id, name: nameOf(error) });
    }
  }
}
