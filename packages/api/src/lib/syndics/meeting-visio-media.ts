import { TrackSource } from 'livekit-server-sdk';
import { prisma } from '../../utils/database';
import { ConflictError } from '../../middleware/error-middleware';
import { t } from '../../i18n';
import { logger } from '../../utils/logger';
import { logAuditEvent } from '../../services/audit-service';
import { AuditActionKey } from '../../types/audit-types';
import {
  buildMeetingRoomName,
  listRoomParticipants,
  muteParticipantTracks,
  setCanSpeak
} from '../../services/livekit-service';
import { loadMeetingBase } from './meeting-live-context';
import {
  assertEnabled,
  assertMediaModerationOpen,
  getVisioAdminView,
  loadMeetingParticipant,
  UUID_PATTERN,
  type MeetingVisioAdminView
} from './meeting-visio';
import { isMediaAllowed, normalizeMediaPolicy } from './meeting-visio-media-rules';

/**
 * Moderation du micro et de la camera des copropriétaires en visio (spec 045, V16) : couper les pistes d'un
 * participant, interdire ou rendre le micro et la camera a tous. L'interdiction individuelle vit dans
 * `meeting-visio.ts` (`setParticipantSpeaking`, route `/parole`). Les droits sont decides ici, cote serveur,
 * et ecrits en base AVANT d'etre appliques a la salle : ils survivent a une reconnexion (le jeton les relit).
 */

export type MutableSource = 'MICROPHONE' | 'CAMERA';

const SOURCE_BY_NAME: Record<MutableSource, TrackSource> = {
  MICROPHONE: TrackSource.MICROPHONE,
  CAMERA: TrackSource.CAMERA
};

/**
 * POST /visio/participants/:participantId/couper : coupe (mute) le micro et/ou la camera deja publies
 * d'un participant. Une coupure n'est pas une interdiction : il peut les rouvrir, c'est `/parole` qui interdit.
 */
export async function muteVisioParticipant(
  tenantId: string,
  syndicateId: string,
  meetingId: string,
  participantId: string,
  sources: MutableSource[],
  actorUserId: string | null
): Promise<MeetingVisioAdminView & { mutedTracks: number }> {
  const meeting = await loadMeetingBase(prisma, tenantId, syndicateId, meetingId);
  const participant = await loadMeetingParticipant(tenantId, meeting.id, participantId);
  assertEnabled();
  assertMediaModerationOpen(meeting.status);

  const roomName = buildMeetingRoomName(tenantId, meeting.id);
  const mutedTracks = await muteParticipantTracks(
    roomName,
    participant.id,
    sources.map(source => SOURCE_BY_NAME[source])
  );
  // Absent de la salle (ou parti entre la lecture et l'ecriture) : rien a couper.
  if (mutedTracks === null) throw new ConflictError(t("Ce participant n'est pas dans la visio"));

  logAuditEvent({
    actorUserId,
    tenantId,
    actionKey: AuditActionKey.SYNDIC_MEETING_VISIO_PARTICIPANT_MUTED,
    entityType: 'GMParticipant',
    entityId: participant.id,
    payload: {
      meetingId: meeting.id,
      participantId: participant.id,
      contactId: participant.contactId,
      sources,
      mutedTracks
    }
  });
  const view = await getVisioAdminView(tenantId, syndicateId, meetingId);
  return { ...view, mutedTracks };
}

/**
 * Aligne la salle sur le droit decide en base : pour chaque copropriétaire de CETTE AG present, le droit de
 * publier de LiveKit devient `isMediaAllowed(politique, verrou)`. Les mains levees ne sont pas baissees.
 */
async function syncRoomMediaRights(
  tenantId: string,
  meetingId: string,
  roomName: string,
  mediaLocked: boolean
): Promise<void> {
  const infos = await listRoomParticipants(roomName);
  const present = new Map(infos.filter(info => UUID_PATTERN.test(info.identity)).map(info => [info.identity, info]));
  if (present.size === 0) return;
  // Seuls les participants de CETTE AG et de CETTE agence : une autre identite de la salle n'est jamais touchee.
  const rows = await prisma.gMParticipant.findMany({
    where: { tenantId, meetingId, id: { in: [...present.keys()] } },
    select: { id: true, mediaPolicy: true }
  });
  for (const row of rows) {
    const expected = isMediaAllowed(normalizeMediaPolicy(row.mediaPolicy), mediaLocked);
    const actual = present.get(row.id)?.permission?.canPublish ?? false;
    if (expected !== actual) await setCanSpeak(roomName, row.id, expected, { lowerHand: false });
  }
}

/**
 * POST /visio/media/verrou : interdit (`locked`) ou rend a tous les copropriétaires la possibilite d'activer
 * micro et camera. Interdire retire aussi les exceptions accordees (`ALLOWED`) : « tous » veut dire tous, le
 * gestionnaire redonne ensuite la parole a qui il veut. Rendre ne leve pas une interdiction individuelle
 * (`BLOCKED`). Idempotent : une repetition resynchronise la salle sans changer l'etat.
 */
export async function setMeetingMediaLock(
  tenantId: string,
  syndicateId: string,
  meetingId: string,
  locked: boolean,
  actorUserId: string | null
): Promise<MeetingVisioAdminView> {
  const meeting = await loadMeetingBase(prisma, tenantId, syndicateId, meetingId);
  assertEnabled();
  assertMediaModerationOpen(meeting.status);

  const wasLocked = meeting.mediaLockedAt != null;
  let clearedExceptions = 0;
  await prisma.$transaction(async tx => {
    if (wasLocked !== locked) {
      await tx.generalMeeting.updateMany({
        where: { id: meeting.id, syndicate: { tenantId } },
        data: { mediaLockedAt: locked ? new Date() : null }
      });
    }
    if (locked) {
      const cleared = await tx.gMParticipant.updateMany({
        where: { tenantId, meetingId: meeting.id, mediaPolicy: 'ALLOWED' },
        data: { mediaPolicy: 'DEFAULT' }
      });
      clearedExceptions = cleared.count;
    }
  });
  if (wasLocked !== locked || clearedExceptions > 0) {
    logAuditEvent({
      actorUserId,
      tenantId,
      actionKey: locked
        ? AuditActionKey.SYNDIC_MEETING_VISIO_MEDIA_LOCKED
        : AuditActionKey.SYNDIC_MEETING_VISIO_MEDIA_UNLOCKED,
      entityType: 'GeneralMeeting',
      entityId: meeting.id,
      payload: { meetingId: meeting.id, ...(clearedExceptions > 0 ? { clearedExceptions } : {}) }
    });
  }

  // La decision est posee : si LiveKit echoue (503), le gestionnaire repete l'action, qui resynchronise.
  await syncRoomMediaRights(tenantId, meeting.id, buildMeetingRoomName(tenantId, meeting.id), locked);
  return getVisioAdminView(tenantId, syndicateId, meetingId);
}

const ROOM_NAME_PATTERN = /^t_([0-9a-f-]{36})__ag_([0-9a-f-]{36})$/i;

/**
 * Webhook `participant_joined` (V16f) : un jeton copropriétaire émis avant une interdiction (10 min, non
 * révocable) permet de publier à la (re)connexion. Le droit est relu en base, pour CETTE agence et CETTE AG
 * (lues dans le nom de salle, puis vérifiées par la requête), et retiré si interdit. Jamais dans l'autre sens.
 * Au mieux : une erreur est journalisée, jamais relancée (le webhook répond 200).
 */
export async function enforceMediaRightsOnJoin(
  roomName: string,
  identity: string,
  canPublish: boolean | undefined
): Promise<void> {
  if (canPublish === false || !UUID_PATTERN.test(identity)) return;
  const match = ROOM_NAME_PATTERN.exec(roomName);
  if (!match || !UUID_PATTERN.test(match[1]) || !UUID_PATTERN.test(match[2])) return;
  try {
    const row = await prisma.gMParticipant.findFirst({
      where: { id: identity, tenantId: match[1], meetingId: match[2] },
      select: { mediaPolicy: true, meeting: { select: { mediaLockedAt: true } } }
    });
    if (!row) return;
    if (isMediaAllowed(normalizeMediaPolicy(row.mediaPolicy), row.meeting?.mediaLockedAt != null)) return;
    await setCanSpeak(roomName, identity, false, { lowerHand: false });
  } catch (error) {
    logger.warn('Visio media right could not be enforced on join', {
      roomName,
      name: error instanceof Error ? error.name : 'Error'
    });
  }
}
