import type { PrismaTransactionClient } from '../../utils/database';
import { ConflictError } from '../../middleware/error-middleware';
import { t } from '../../i18n';
import { logger } from '../../utils/logger';
import { logAuditEvent } from '../../services/audit-service';
import { AuditActionKey } from '../../types/audit-types';
import { isRecordingEnabled } from '../../services/livekit-service';
import { deleteRecordingObject } from './meeting-recording-storage';
import {
  lockRecordingTx,
  nameOf,
  resolveRecordingPath,
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
 *      (releve les enregistrements, prend les verrous, refuse (409) si l'un est en
 *      cours ou en traitement) ;
 *   2. APRES le commit : `purgeCascadedRecordings` (efface fichier et objet S3 au
 *      mieux, audite, ne leve jamais).
 * Ce module ne decide d'aucune conservation ni purge automatique (spec 045, R10).
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
  fileUrl: string | null;
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

/**
 * A appeler DANS la transaction de suppression, avant elle. Le verrou par AG est
 * celui de `startRecording` : un demarrage concurrent attend la fin de la
 * suppression puis echoue proprement.
 */
export async function collectRecordingsForCascade(
  tx: PrismaTransactionClient,
  tenantId: string,
  scope: RecordingCascadeScope
): Promise<CascadedRecording[]> {
  const meetings = await tx.generalMeeting.findMany({
    where: meetingWhere(tenantId, scope),
    select: { id: true, syndicateId: true }
  });
  if (meetings.length === 0) return [];

  const ids = meetings.map(meeting => meeting.id).sort();
  for (const meetingId of ids) await lockRecordingTx(tx, meetingId);

  const rows = await tx.gMRecording.findMany({
    where: { tenantId, meetingId: { in: ids } },
    select: { id: true, tenantId: true, meetingId: true, status: true, storageKey: true, fileUrl: true }
  });
  if (rows.some(row => row.status === 'RECORDING' || row.status === 'PROCESSING')) {
    throw new ConflictError(
      t(
        "Un enregistrement d'assemblée est encore en cours ou en traitement : la suppression est impossible pour le moment"
      )
    );
  }
  const syndicateOf = new Map(meetings.map(meeting => [meeting.id, meeting.syndicateId]));
  return rows.map(row => ({
    ...row,
    status: row.status as MeetingRecordingStatus,
    syndicateId: syndicateOf.get(row.meetingId) as string
  }));
}

async function removeFile(row: CascadedRecording): Promise<void> {
  const absolutePath = resolveRecordingPath(row, row.syndicateId);
  if (!absolutePath) return;
  try {
    await unlinkIfPresent(absolutePath);
  } catch (error) {
    logger.warn('Recording file could not be deleted after cascade', { recordingId: row.id, name: nameOf(error) });
  }
}

async function removeObject(row: CascadedRecording): Promise<void> {
  if (!isRecordingEnabled()) return;
  try {
    await deleteRecordingObject(row.storageKey);
  } catch (error) {
    logger.warn('Recording object could not be deleted from storage', { recordingId: row.id, name: nameOf(error) });
  }
}

/** A appeler APRES le commit. Ne leve jamais : un echec n'empeche pas les enregistrements suivants. */
export async function purgeCascadedRecordings(
  recordings: CascadedRecording[],
  actorUserId: string | null,
  cause: RecordingCascadeCause
): Promise<void> {
  for (const row of recordings) {
    try {
      await removeFile(row);
      await removeObject(row);
      // Une ligne deja DELETED a ete auditee lors de sa suppression.
      if (row.status === 'DELETED') continue;
      logAuditEvent({
        actorUserId,
        tenantId: row.tenantId,
        actionKey: AuditActionKey.SYNDIC_MEETING_RECORDING_DELETED,
        entityType: 'GMRecording',
        entityId: row.id,
        payload: { meetingId: row.meetingId, recordingId: row.id, previousStatus: row.status, cause }
      });
    } catch (error) {
      logger.warn('Recording cleanup failed after cascade', { recordingId: row.id, name: nameOf(error) });
    }
  }
}
