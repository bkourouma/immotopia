import { promises as fs } from 'fs';
import * as path from 'path';
import { EgressStatus, type EgressInfo } from 'livekit-server-sdk';
import { prisma, type PrismaTransactionClient } from '../../utils/database';
import { env } from '../../config/env';
import { logger } from '../../utils/logger';
import { logAuditEvent } from '../../services/audit-service';
import { AuditActionKey } from '../../types/audit-types';
import { runWithTenantContext } from '../../utils/tenant-context';
import { getUploadsRoot } from '../../utils/project-root';
import { getEgressStatus, isEgressActive } from '../../services/livekit-service';
import { loadMeetingBaseById } from './meeting-live-context';
import { RecordingTooLargeError } from './meeting-recording-errors';
import { deleteRecordingObject, downloadRecordingObject } from './meeting-recording-storage';
import {
  FAILURE_DOWNLOAD,
  FAILURE_EGRESS,
  FAILURE_LIMIT,
  FAILURE_LOST,
  FAILURE_NO_FILE,
  FAILURE_TOO_LARGE,
  RECORDING_SELECT,
  invalidateActiveRecordingCache,
  nameOf,
  recordingFolder,
  type RecordingRow
} from './meeting-recording-shared';

/**
 * Fin d'un egress (webhook `egress_ended` ou reconciliation), rapatriement du
 * MP4 vers le stockage prive et reprise des rapatriements interrompus
 * (spec 045, R4 et R5).
 */

export type RecordingFollowUp = () => Promise<void>;

/** Travail differe a la fin d'une transaction : audits a emettre APRES la validation. */
export type AfterCommit = Array<() => void>;

function nanosToMs(value: bigint | number | undefined): number {
  const n = Number(value ?? 0);
  return n > 0 ? Math.round(n / 1e6) : 0;
}

/** Echec de l'egress : statut non « COMPLETE » ou aucun fichier produit. */
function failureCodeOf(info: EgressInfo | null): string | null {
  if (!info) return FAILURE_LOST;
  const hasFile = (info.fileResults?.length ?? 0) > 0;
  if (info.status === EgressStatus.EGRESS_LIMIT_REACHED) return hasFile ? null : FAILURE_LIMIT;
  if (info.status === EgressStatus.EGRESS_FAILED || info.status === EgressStatus.EGRESS_ABORTED) return FAILURE_EGRESS;
  return hasFile ? null : FAILURE_NO_FILE;
}

export function auditAvailability(
  row: Pick<RecordingRow, 'tenantId' | 'meetingId' | 'id'>,
  status: 'AVAILABLE' | 'FAILED'
): void {
  logAuditEvent({
    actorUserId: null,
    tenantId: row.tenantId,
    actionKey: AuditActionKey.SYNDIC_MEETING_RECORDING_AVAILABLE,
    entityType: 'GMRecording',
    entityId: row.id,
    payload: { meetingId: row.meetingId, recordingId: row.id, status }
  });
}

function endedData(info: EgressInfo | null, failure: string | null, webhookEventId: string | null) {
  const endedMs = nanosToMs(info?.endedAt);
  const endedAt = endedMs > 0 ? new Date(endedMs) : new Date();
  if (failure !== null) return { status: 'FAILED' as const, endedAt, failureReason: failure, webhookEventId };
  const file = info?.fileResults?.[0];
  const durationSeconds = file && Number(file.duration) > 0 ? Math.round(Number(file.duration) / 1e9) : null;
  return { status: 'PROCESSING' as const, endedAt, durationSeconds, webhookEventId };
}

/**
 * Applique la fin de l'egress a une ligne `RECORDING` : `FAILED` (motif court) ou
 * `PROCESSING` (fin et duree). Conditionne par `status = RECORDING` : deux
 * traitements simultanes n'ecrivent qu'une fois. Rend le travail a faire APRES la
 * reponse (rapatriement), ou null. Avec `afterCommit`, l'audit d'un echec est
 * differe jusqu'a la validation de la transaction de l'appelant.
 */
export async function applyEgressEnded(
  client: PrismaTransactionClient,
  row: RecordingRow,
  info: EgressInfo | null,
  webhookEventId: string | null,
  afterCommit?: AfterCommit
): Promise<RecordingFollowUp | null> {
  const failure = failureCodeOf(info);
  const updated = await client.gMRecording.updateMany({
    where: { id: row.id, tenantId: row.tenantId, status: 'RECORDING' },
    data: endedData(info, failure, webhookEventId)
  });
  if (updated.count === 0) return null;
  invalidateActiveRecordingCache();

  if (failure !== null) {
    if (afterCommit) afterCommit.push(() => auditAvailability(row, 'FAILED'));
    else auditAvailability(row, 'FAILED');
    return null;
  }
  return () => repatriateRecording(row.tenantId, row.id);
}

// --- Rapatriement ----------------------------------------------------------

/** Enregistrements en cours de rapatriement dans CE processus : jamais deux fois le meme en parallele. */
const repatriating = new Set<string>();

async function markFailed(row: RecordingRow, reason: string): Promise<void> {
  const updated = await prisma.gMRecording.updateMany({
    where: { id: row.id, tenantId: row.tenantId, status: 'PROCESSING' },
    data: { status: 'FAILED', failureReason: reason }
  });
  if (updated.count > 0) auditAvailability(row, 'FAILED');
}

async function bringBack(row: RecordingRow): Promise<void> {
  const tenantId = row.tenantId;
  const meeting = await loadMeetingBaseById(prisma, tenantId, row.meetingId);
  const segments = recordingFolder(meeting.syndicateId, meeting.id);
  const destination = path.join(getUploadsRoot(env.UPLOADS_DIR), ...segments, `${row.id}.mp4`);
  // Reste d'un telechargement interrompu : jamais repris, toujours recommence.
  await fs.unlink(`${destination}.part`).catch(() => undefined);
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
}

/**
 * Rapatrie le MP4 du stockage S3 vers le stockage prive (flux), passe `AVAILABLE`
 * puis supprime l'objet S3 au mieux. Un echec passe `FAILED` (objet CONSERVE).
 * Ne leve jamais : appele apres la reponse du webhook ou en reprise.
 */
export async function repatriateRecording(tenantId: string, recordingId: string): Promise<void> {
  if (repatriating.has(recordingId)) return;
  repatriating.add(recordingId);
  try {
    await runWithTenantContext({ tenantId }, async () => {
      let row: RecordingRow | null = null;
      try {
        row = (await prisma.gMRecording.findFirst({
          where: { id: recordingId, tenantId },
          select: RECORDING_SELECT
        })) as RecordingRow | null;
        if (!row || row.status !== 'PROCESSING') return;
        await bringBack(row);
      } catch (error) {
        logger.warn('Recording could not be brought back', { recordingId, name: nameOf(error) });
        if (!row) return;
        const reason = error instanceof RecordingTooLargeError ? FAILURE_TOO_LARGE : FAILURE_DOWNLOAD;
        await markFailed(row, reason).catch(inner => {
          logger.error('Recording failure could not be saved', { recordingId, name: nameOf(inner) });
        });
      }
    });
  } finally {
    repatriating.delete(recordingId);
  }
}

export function isRepatriating(recordingId: string): boolean {
  return repatriating.has(recordingId);
}

// --- Reprise ---------------------------------------------------------------

/** Delai apres l'arret au-delà duquel un enregistrement sans webhook est verifie aupres de LiveKit. */
const RECONCILE_AFTER_MS = 60_000;
/** Un rapatriement (PROCESSING) sans progres depuis ce delai est relance. */
export const STUCK_PROCESSING_MS = 10 * 60_000;

async function reconcileOne(row: RecordingRow): Promise<boolean> {
  let info: EgressInfo | null;
  try {
    info = await getEgressStatus(row.egressId);
  } catch {
    return false; // LiveKit en panne : la ligne reste telle quelle.
  }
  if (info && isEgressActive(info)) return false;
  const followUp = await applyEgressEnded(prisma, row, info, null);
  if (followUp) setImmediate(() => void followUp());
  return true;
}

async function resumeStuck(row: RecordingRow, now: number): Promise<boolean> {
  const idle = row.updatedAt ? now - row.updatedAt.getTime() : 0;
  if (idle <= STUCK_PROCESSING_MS || isRepatriating(row.id)) return false;
  // Horodatage rafraichi : les lectures suivantes ne relancent pas encore.
  await prisma.gMRecording.updateMany({
    where: { id: row.id, tenantId: row.tenantId, status: 'PROCESSING' },
    data: { updatedAt: new Date() }
  });
  setImmediate(() => void repatriateRecording(row.tenantId, row.id));
  return true;
}

/**
 * Filet de securite, appele a la lecture de la liste :
 * - `RECORDING` arrete depuis plus d'une minute, ou AG qui n'est plus en cours, alors que le webhook
 *   `egress_ended` n'est jamais arrive : verifie aupres de LiveKit et traite comme une fin d'egress ;
 * - `PROCESSING` sans progres depuis plus de 10 min (processus redemarre pendant le rapatriement) :
 *   rapatriement relance.
 * Rend vrai si une ligne a pu changer.
 */
export async function reconcileStaleRecordings(rows: RecordingRow[], meetingStatus: string): Promise<boolean> {
  const now = Date.now();
  let changed = false;
  for (const row of rows) {
    if (row.status === 'PROCESSING') {
      changed = (await resumeStuck(row, now)) || changed;
      continue;
    }
    if (row.status !== 'RECORDING') continue;
    const stoppedLongAgo = row.stoppedAt !== null && now - row.stoppedAt.getTime() > RECONCILE_AFTER_MS;
    if (!stoppedLongAgo && meetingStatus === 'IN_PROGRESS') continue;
    changed = (await reconcileOne(row)) || changed;
  }
  return changed;
}

// --- Webhook ---------------------------------------------------------------

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
