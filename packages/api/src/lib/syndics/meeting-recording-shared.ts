import { prisma } from '../../utils/database';
import { t } from '../../i18n';

/**
 * Types, lecture et vue des enregistrements d'AG (spec 045) partages par
 * `meeting-recording.ts` (gestionnaire) et `meeting-recording-ingest.ts` (fin
 * d'egress, rapatriement, reprise). Aucune ecriture ici.
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
export const FAILURE_EGRESS = 'EGRESS_FAILED';
export const FAILURE_LIMIT = 'EGRESS_LIMIT';
export const FAILURE_NO_FILE = 'NO_FILE';
export const FAILURE_DOWNLOAD = 'DOWNLOAD_FAILED';
export const FAILURE_LOST = 'EGRESS_LOST';
export const FAILURE_TOO_LARGE = 'TOO_LARGE';

export { RecordingTooLargeError } from './meeting-recording-errors';

export function failureText(code: string | null | undefined): string | null {
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
    case FAILURE_TOO_LARGE:
      return t('Le fichier dépasse la taille maximale : il est conservé sur le stockage de la visio');
    default:
      return t("L'enregistrement a échoué");
  }
}

export interface RecordingRow {
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
  updatedAt: Date | null;
}

export const RECORDING_SELECT = {
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
  endedAt: true,
  updatedAt: true
} as const;

export function nameOf(error: unknown): string {
  return error instanceof Error ? error.name : 'Error';
}

/** Dossier prive des enregistrements d'une AG, relatif a la racine des fichiers deposes. */
export function recordingFolder(syndicateId: string, meetingId: string): string[] {
  return ['syndics', syndicateId, 'assemblees', meetingId, 'enregistrements'];
}

async function loadNames(userIds: Array<string | null>): Promise<Map<string, string>> {
  const ids = Array.from(new Set(userIds.filter((id): id is string => Boolean(id))));
  if (ids.length === 0) return new Map();
  // Select explicite : l'objet User complet porte `passwordHash`.
  const users = await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, fullName: true } });
  return new Map(users.map(user => [user.id, user.fullName?.trim() ?? '']));
}

export function toView(row: RecordingRow, names: Map<string, string>): MeetingRecordingView {
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

export async function viewOf(row: RecordingRow): Promise<MeetingRecordingView> {
  return toView(row, await loadNames([row.startedByUserId]));
}

export async function viewsOf(rows: RecordingRow[]): Promise<MeetingRecordingView[]> {
  const names = await loadNames(rows.map(row => row.startedByUserId));
  return rows.map(row => toView(row, names));
}

// --- « Enregistrement en cours ? » (page publique, interrogee par tous) -----

const ACTIVE_CACHE_TTL_MS = 3000;
const activeCache = new Map<string, { at: number; value: boolean }>();

/** A appeler quand le statut `RECORDING` d'une AG change (et dans les tests). */
export function invalidateActiveRecordingCache(): void {
  activeCache.clear();
}

/**
 * Vue publique : un enregistrement est-il en cours ? Tous les participants
 * interrogent l'etat toutes les 3 s : la reponse est gardee 3 s par AG dans le
 * processus (un changement local l'invalide aussitot).
 */
export async function hasActiveRecording(tenantId: string, meetingId: string): Promise<boolean> {
  const key = `${tenantId}:${meetingId}`;
  const cached = activeCache.get(key);
  const now = Date.now();
  if (cached && now - cached.at < ACTIVE_CACHE_TTL_MS) return cached.value;
  const count = await prisma.gMRecording.count({ where: { tenantId, meetingId, status: 'RECORDING' } });
  if (activeCache.size > 500) activeCache.clear();
  activeCache.set(key, { at: now, value: count > 0 });
  return count > 0;
}
