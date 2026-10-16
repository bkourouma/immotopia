import type { ParticipantInfo } from 'livekit-server-sdk';
import { prisma } from '../../utils/database';
import { ConflictError, NotFoundError } from '../../middleware/error-middleware';
import { t } from '../../i18n';
import { logger } from '../../utils/logger';
import { logAuditEvent } from '../../services/audit-service';
import { AuditActionKey } from '../../types/audit-types';
import {
  buildMeetingRoomName,
  deleteRoom,
  ensureRoom,
  getRoomParticipant,
  HAND_RAISED_ATTRIBUTE,
  isVisioEnabled,
  listRoomParticipants,
  mintModeratorToken,
  mintParticipantToken,
  removeParticipant,
  roomExists,
  sendRefreshSignal,
  setCanSpeak,
  setHandRaised,
  type VisioToken
} from '../../services/livekit-service';
import { contactDisplayName } from './meeting-live-rules';
import { loadMeetingBase, loadMeetingBaseById } from './meeting-live-context';
import { withAccess } from './meeting-live-public';
import { revokeParticipantLinks } from './meeting-participants';

/**
 * Visio integree a l'AG en direct (spec 045), cote metier : jetons de salle,
 * main levee, parole, exclusion. Le vote ne passe JAMAIS par la visio.
 *
 * Identites LiveKit : id du `GMParticipant` (copropriétaire) et
 * `gestionnaire-<userId>` (gestionnaire). Une identite qui n'est ni l'un ni
 * l'autre est ignoree de la vue du gestionnaire.
 */

const MANAGER_IDENTITY_PREFIX = 'gestionnaire-';

export interface MeetingVisioParticipantView {
  identity: string;
  kind: 'COOWNER' | 'MANAGER';
  participantId: string | null;
  contactId: string | null;
  name: string;
  handRaisedAt: string | null;
  canSpeak: boolean;
  joinedAt: string | null;
}

export interface MeetingVisioAdminView {
  enabled: boolean;
  roomName: string | null;
  roomActive: boolean;
  participants: MeetingVisioParticipantView[];
}

function assertEnabled(): void {
  if (!isVisioEnabled()) throw new ConflictError(t("La visio intégrée n'est pas activée"));
}

// --- Copropriétaire (lien personnel) ----------------------------------------

/** POST /public/assemblees/visio : jeton de salle du copropriétaire qui a rejoint l'AG en cours. */
export async function issuePublicVisioToken(token: string): Promise<VisioToken> {
  return withAccess(token, async access => {
    assertEnabled();
    const tenantId = access.link.tenantId;
    const meeting = await loadMeetingBaseById(prisma, tenantId, access.participant.meetingId);
    if (meeting.status !== 'IN_PROGRESS') {
      throw new ConflictError(t("L'assemblée n'est pas en cours : la visio est fermée"));
    }
    const participant = await prisma.gMParticipant.findFirst({
      where: { id: access.participant.id, tenantId },
      select: { id: true, contactId: true, joinedAt: true }
    });
    if (!participant) throw new NotFoundError(t('Participant introuvable ou inaccessible'));
    if (!participant.joinedAt) throw new ConflictError(t("Rejoignez l'assemblée avant d'entrer en visio"));

    // Select limite au nom : aucune coordonnee ne part dans la salle.
    const contact = await prisma.crmContact.findFirst({
      where: { id: participant.contactId, tenantId },
      select: { firstName: true, lastName: true, legalName: true }
    });

    const roomName = buildMeetingRoomName(tenantId, meeting.id);
    await ensureRoom(roomName);
    const visioToken = await mintParticipantToken({
      roomName,
      identity: participant.id,
      name: contact ? contactDisplayName(contact) : ''
    });

    logAuditEvent({
      actorUserId: null,
      tenantId,
      actionKey: AuditActionKey.SYNDIC_MEETING_VISIO_TOKEN_ISSUED,
      entityType: 'GMParticipant',
      entityId: participant.id,
      payload: { meetingId: meeting.id, role: 'PARTICIPANT', participantId: participant.id }
    });
    return visioToken;
  });
}

/** POST /public/assemblees/visio/main : lève ou baisse la main du participant présent dans la salle. */
export async function setPublicHandRaised(token: string, raised: boolean): Promise<{ raised: boolean }> {
  return withAccess(token, async access => {
    assertEnabled();
    const tenantId = access.link.tenantId;
    const meeting = await loadMeetingBaseById(prisma, tenantId, access.participant.meetingId);
    if (meeting.status !== 'IN_PROGRESS') {
      throw new ConflictError(t("L'assemblée n'est pas en cours : la visio est fermée"));
    }
    const roomName = buildMeetingRoomName(tenantId, meeting.id);
    const present = await getRoomParticipant(roomName, access.participant.id);
    if (!present) throw new ConflictError(t("Vous n'êtes pas dans la visio"));
    await setHandRaised(roomName, access.participant.id, raised);
    return { raised };
  });
}

// --- Gestionnaire -----------------------------------------------------------

function joinedAtIso(info: ParticipantInfo): string | null {
  const ms = Number(info.joinedAtMs) || Number(info.joinedAt) * 1000;
  return ms > 0 ? new Date(ms).toISOString() : null;
}

function handRaisedAtOf(info: ParticipantInfo): string | null {
  return info.attributes?.[HAND_RAISED_ATTRIBUTE] || null;
}

/** Rapproche les participants LiveKit des GMParticipant de CETTE AG et des membres de CETTE agence. */
async function reconcile(
  tenantId: string,
  meetingId: string,
  infos: ParticipantInfo[]
): Promise<MeetingVisioParticipantView[]> {
  const managerIds = new Map<string, ParticipantInfo>();
  const coownerIds = new Map<string, ParticipantInfo>();
  for (const info of infos) {
    if (info.identity.startsWith(MANAGER_IDENTITY_PREFIX)) {
      managerIds.set(info.identity.slice(MANAGER_IDENTITY_PREFIX.length), info);
    } else {
      coownerIds.set(info.identity, info);
    }
  }

  const [participants, memberships] = await Promise.all([
    coownerIds.size > 0
      ? prisma.gMParticipant.findMany({
          where: { tenantId, meetingId, id: { in: [...coownerIds.keys()] } },
          select: { id: true, contactId: true }
        })
      : Promise.resolve([]),
    managerIds.size > 0
      ? prisma.membership.findMany({
          where: { tenantId, status: 'ACTIVE', userId: { in: [...managerIds.keys()] } },
          select: { userId: true, user: { select: { fullName: true } } }
        })
      : Promise.resolve([])
  ]);
  const contacts =
    participants.length > 0
      ? await prisma.crmContact.findMany({
          where: { tenantId, id: { in: participants.map(row => row.contactId) } },
          select: { id: true, firstName: true, lastName: true, legalName: true }
        })
      : [];
  const contactById = new Map(contacts.map(contact => [contact.id, contact]));

  const views: MeetingVisioParticipantView[] = [];
  for (const row of participants) {
    const info = coownerIds.get(row.id);
    if (!info) continue;
    const contact = contactById.get(row.contactId);
    views.push({
      identity: info.identity,
      kind: 'COOWNER',
      participantId: row.id,
      contactId: row.contactId,
      name: contact ? contactDisplayName(contact) : '',
      handRaisedAt: handRaisedAtOf(info),
      canSpeak: info.permission?.canPublish ?? false,
      joinedAt: joinedAtIso(info)
    });
  }
  for (const membership of memberships) {
    const info = managerIds.get(membership.userId);
    if (!info) continue;
    views.push({
      identity: info.identity,
      kind: 'MANAGER',
      participantId: null,
      contactId: null,
      name: membership.user?.fullName?.trim() || info.name || '',
      handRaisedAt: null,
      canSpeak: info.permission?.canPublish ?? false,
      joinedAt: joinedAtIso(info)
    });
  }

  // Mains levées d'abord (la plus ancienne en tête), puis ordre alphabétique.
  return views.sort((a, b) => {
    if (a.handRaisedAt && b.handRaisedAt) return a.handRaisedAt.localeCompare(b.handRaisedAt);
    if (a.handRaisedAt) return -1;
    if (b.handRaisedAt) return 1;
    return a.name.localeCompare(b.name, 'fr');
  });
}

/** GET /visio */
export async function getVisioAdminView(
  tenantId: string,
  syndicateId: string,
  meetingId: string
): Promise<MeetingVisioAdminView> {
  const meeting = await loadMeetingBase(prisma, tenantId, syndicateId, meetingId);
  assertEnabled();
  const roomName = buildMeetingRoomName(tenantId, meeting.id);
  const infos = await listRoomParticipants(roomName);
  const roomActive = infos.length > 0 || (await roomExists(roomName));
  const participants = await reconcile(tenantId, meeting.id, infos);
  return { enabled: true, roomName, roomActive, participants };
}

/** POST /visio/jeton : jeton de modérateur (AG planifiée ou en cours). */
export async function issueModeratorToken(
  tenantId: string,
  syndicateId: string,
  meetingId: string,
  userId: string
): Promise<VisioToken> {
  const meeting = await loadMeetingBase(prisma, tenantId, syndicateId, meetingId);
  assertEnabled();
  if (meeting.status !== 'PLANNED' && meeting.status !== 'IN_PROGRESS') {
    throw new ConflictError(t("L'assemblée est close ou annulée : la visio est fermée"));
  }
  // Select explicite : l'objet User complet porte `passwordHash`.
  const user = await prisma.user.findFirst({ where: { id: userId }, select: { id: true, fullName: true } });
  if (!user) throw new NotFoundError(t('Utilisateur introuvable ou inaccessible'));

  const roomName = buildMeetingRoomName(tenantId, meeting.id);
  await ensureRoom(roomName);
  const visioToken = await mintModeratorToken({
    roomName,
    identity: `${MANAGER_IDENTITY_PREFIX}${user.id}`,
    name: user.fullName?.trim() || t('Gestionnaire')
  });

  logAuditEvent({
    actorUserId: userId,
    tenantId,
    actionKey: AuditActionKey.SYNDIC_MEETING_VISIO_TOKEN_ISSUED,
    entityType: 'GeneralMeeting',
    entityId: meeting.id,
    payload: { meetingId: meeting.id, role: 'MODERATOR', userId }
  });
  return visioToken;
}

/** Participant de CETTE AG et de CETTE agence, ou la même 404 qu'un participant inexistant. */
async function loadMeetingParticipant(tenantId: string, meetingId: string, participantId: string) {
  const participant = await prisma.gMParticipant.findFirst({
    where: { id: participantId, tenantId, meetingId },
    select: { id: true, contactId: true }
  });
  if (!participant) throw new NotFoundError(t('Participant introuvable ou inaccessible'));
  return participant;
}

/** POST /visio/participants/:participantId/parole */
export async function setParticipantSpeaking(
  tenantId: string,
  syndicateId: string,
  meetingId: string,
  participantId: string,
  allowed: boolean,
  actorUserId: string | null
): Promise<MeetingVisioAdminView> {
  const meeting = await loadMeetingBase(prisma, tenantId, syndicateId, meetingId);
  const participant = await loadMeetingParticipant(tenantId, meeting.id, participantId);
  assertEnabled();
  const roomName = buildMeetingRoomName(tenantId, meeting.id);
  const present = await getRoomParticipant(roomName, participant.id);
  if (!present) throw new ConflictError(t("Ce participant n'est pas dans la visio"));
  await setCanSpeak(roomName, participant.id, allowed);

  logAuditEvent({
    actorUserId,
    tenantId,
    actionKey: allowed
      ? AuditActionKey.SYNDIC_MEETING_VISIO_SPEAK_GRANTED
      : AuditActionKey.SYNDIC_MEETING_VISIO_SPEAK_REVOKED,
    entityType: 'GMParticipant',
    entityId: participant.id,
    payload: { meetingId: meeting.id, participantId: participant.id, contactId: participant.contactId }
  });
  return getVisioAdminView(tenantId, syndicateId, meetingId);
}

/** POST /visio/participants/:participantId/exclure */
export async function removeVisioParticipant(
  tenantId: string,
  syndicateId: string,
  meetingId: string,
  participantId: string,
  revokeLinks: boolean,
  actorUserId: string | null
): Promise<MeetingVisioAdminView & { revokedLinks: number }> {
  const meeting = await loadMeetingBase(prisma, tenantId, syndicateId, meetingId);
  const participant = await loadMeetingParticipant(tenantId, meeting.id, participantId);
  assertEnabled();
  const roomName = buildMeetingRoomName(tenantId, meeting.id);

  await removeParticipant(roomName, participant.id);
  const revokedLinks = revokeLinks
    ? (await revokeParticipantLinks(tenantId, syndicateId, meetingId, participant.contactId, actorUserId)).revoked
    : 0;

  logAuditEvent({
    actorUserId,
    tenantId,
    actionKey: AuditActionKey.SYNDIC_MEETING_VISIO_PARTICIPANT_REMOVED,
    entityType: 'GMParticipant',
    entityId: participant.id,
    payload: {
      meetingId: meeting.id,
      participantId: participant.id,
      contactId: participant.contactId,
      revokedLinks
    }
  });
  const view = await getVisioAdminView(tenantId, syndicateId, meetingId);
  return { ...view, revokedLinks };
}

// --- Effets de bord au mieux -----------------------------------------------

/**
 * Signal « relis l'état » à la salle après l'ouverture ou la clôture d'un
 * vote. Au mieux : ne bloque ni ne lève jamais (l'interrogation HTTP reste la
 * référence).
 */
export function notifyVisioRefresh(tenantId: string, meetingId: string): void {
  if (!isVisioEnabled()) return;
  void sendRefreshSignal(buildMeetingRoomName(tenantId, meetingId)).catch(error => {
    logger.warn('Visio refresh signal failed', { meetingId, errorName: error instanceof Error ? error.name : 'Error' });
  });
}

/** Ferme la salle d'une AG clôturée ou annulée. Au mieux : un échec n'empêche pas la clôture. */
export async function closeMeetingRoom(tenantId: string, meetingId: string): Promise<void> {
  if (!isVisioEnabled()) return;
  try {
    await deleteRoom(buildMeetingRoomName(tenantId, meetingId));
  } catch (error) {
    logger.warn('Visio room could not be closed', {
      meetingId,
      errorName: error instanceof Error ? error.name : 'Error'
    });
  }
}
