import { TrackSource, type ParticipantInfo } from 'livekit-server-sdk';
import { prisma } from '../../utils/database';
import { ConflictError, NotFoundError } from '../../middleware/error-middleware';
import { invalidSecureLinkError } from '../secure-links';
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
  isRecordingEnabled,
  isVisioEnabled,
  listRoomParticipants,
  mintModeratorToken,
  mintParticipantToken,
  removeParticipant,
  roomExists,
  sendRefreshSignal,
  setCanSpeak,
  setHandRaised,
  VisioUnavailableError,
  type VisioToken
} from '../../services/livekit-service';
import { contactDisplayName } from './meeting-live-rules';
import { loadMeetingBase, loadMeetingBaseById } from './meeting-live-context';
import { withAccess } from './meeting-live-public';
import { revokeParticipantLinks } from './meeting-participants';
import { findActiveRecording, type MeetingRecordingView } from './meeting-recording';
import { hasPermission } from '../../services/permission-service';
import { isMediaAllowed, normalizeMediaPolicy, policyForAllowed, type MediaPolicy } from './meeting-visio-media-rules';

/**
 * Visio integree a l'AG en direct (spec 045), cote metier : jetons de salle,
 * main levee, parole, exclusion. Le vote ne passe JAMAIS par la visio.
 *
 * Identites LiveKit : id du `GMParticipant` (copropriétaire) et
 * `gestionnaire-<userId>` (gestionnaire). Une identite qui n'est ni l'un ni
 * l'autre (enregistreur `EG_…`, agent, participant d'une autre AG ou agence) est
 * ignoree de la vue du gestionnaire et seulement COMPTEE (`unrecognized`).
 */

export const MANAGER_IDENTITY_PREFIX = 'gestionnaire-';

/** Piste (micro ou caméra) d'un participant : publiée ? coupée (mute) ? */
export interface MeetingVisioTrackState {
  published: boolean;
  muted: boolean;
}

export interface MeetingVisioParticipantView {
  identity: string;
  kind: 'COOWNER' | 'MANAGER';
  participantId: string | null;
  contactId: string | null;
  name: string;
  handRaisedAt: string | null;
  /** Droit de publier tel que LiveKit le tient à l'instant (peut retarder sur `mediaAllowed`). */
  canSpeak: boolean;
  /** Droit décidé par le serveur (spec 045, V16) : politique du participant et interdiction globale. */
  mediaAllowed: boolean;
  /** `DEFAULT` suit l'interdiction globale, `ALLOWED` l'outrepasse, `BLOCKED` l'interdit. Toujours `DEFAULT` pour un gestionnaire. */
  mediaPolicy: MediaPolicy;
  mic: MeetingVisioTrackState;
  camera: MeetingVisioTrackState;
  joinedAt: string | null;
  /** Ecriture coupee dans la discussion (spec 046, M6) ; toujours `false` pour un gestionnaire. */
  chatMuted: boolean;
}

export interface MeetingVisioAdminView {
  enabled: boolean;
  roomName: string | null;
  roomActive: boolean;
  /** Micro et caméra interdits à tous les copropriétaires par le gestionnaire (spec 045, V16). */
  mediaLocked: boolean;
  participants: MeetingVisioParticipantView[];
  /** Enregistrement (spec 045, R1) : configuré ? et celui qui est en cours. */
  recording: { enabled: boolean; active: MeetingRecordingView | null };
  /**
   * Vrai si un sous-appel (liste LiveKit, existence de la salle, droits des gestionnaires, lecture de
   * l'enregistrement) a échoué : la vue est partielle (`participants` éventuellement vide, `roomActive`
   * faux, `recording.active` null) mais la visio RESTE configurée (`enabled`). Le front garde ses cartes.
   */
  degraded: boolean;
  /** Identités présentes dans la salle qui ne correspondent à aucun participant ni gestionnaire de CETTE AG. */
  unrecognized: number;
}

/** `GMParticipant.id` est une colonne `uuid` : toute autre identité ne peut pas être un copropriétaire. */
export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function assertEnabled(): void {
  if (!isVisioEnabled()) throw new ConflictError(t("La visio intégrée n'est pas activée"));
}

// --- Copropriétaire (lien personnel) ----------------------------------------

/**
 * Le jeton de salle se redemande (reconnexion, onglet rechargé) : un seul audit par participant et par
 * 10 min, mémoire du processus (best effort, perdu au redémarrage).
 */
const TOKEN_AUDIT_INTERVAL_MS = 10 * 60_000;
const lastTokenAudit = new Map<string, number>();

function shouldAuditPublicToken(participantId: string, now = Date.now()): boolean {
  const last = lastTokenAudit.get(participantId);
  if (last !== undefined && now - last < TOKEN_AUDIT_INTERVAL_MS) return false;
  if (lastTokenAudit.size > 5000) lastTokenAudit.clear();
  lastTokenAudit.set(participantId, now);
  return true;
}

/** Remise à zéro de la mémoire d'audit (tests). */
export function _resetVisioAuditThrottleForTests(): void {
  lastTokenAudit.clear();
}

/** POST /public/assemblees/visio : jeton de salle du copropriétaire qui a rejoint l'AG en cours. */
export async function issuePublicVisioToken(token: string): Promise<VisioToken & { mediaAllowed: boolean }> {
  return withAccess(token, async access => {
    assertEnabled();
    const tenantId = access.link.tenantId;
    const meeting = await loadMeetingBaseById(prisma, tenantId, access.participant.meetingId);
    if (meeting.status !== 'IN_PROGRESS') {
      throw new ConflictError(t("L'assemblée n'est pas en cours : la visio est fermée"));
    }
    const participant = await prisma.gMParticipant.findFirst({
      where: { id: access.participant.id, tenantId },
      // Politique ET verrou dans UNE lecture : un verrou pose entre deux requetes ne peut pas etre manque.
      select: {
        id: true,
        contactId: true,
        joinedAt: true,
        mediaPolicy: true,
        meeting: { select: { mediaLockedAt: true } }
      }
    });
    // Participant disparu : la 404 uniforme du lien, pas un message qui distingue le cas.
    if (!participant) throw invalidSecureLinkError();
    if (!participant.joinedAt) throw new ConflictError(t("Rejoignez l'assemblée avant d'entrer en visio"));

    // Select limite au nom : aucune coordonnee ne part dans la salle.
    const contact = await prisma.crmContact.findFirst({
      where: { id: participant.contactId, tenantId },
      select: { firstName: true, lastName: true, legalName: true }
    });

    const roomName = buildMeetingRoomName(tenantId, meeting.id);
    await ensureRoom(roomName);
    // Droit de publier décidé ICI, à chaque émission de jeton : une interdiction survit à une reconnexion.
    const mediaAllowed = isMediaAllowed(
      normalizeMediaPolicy(participant.mediaPolicy),
      (participant.meeting?.mediaLockedAt ?? meeting.mediaLockedAt) != null
    );
    const visioToken = await mintParticipantToken({
      roomName,
      identity: participant.id,
      name: contact ? contactDisplayName(contact) : '',
      canPublish: mediaAllowed
    });

    if (shouldAuditPublicToken(participant.id)) {
      logAuditEvent({
        actorUserId: null,
        tenantId,
        actionKey: AuditActionKey.SYNDIC_MEETING_VISIO_TOKEN_ISSUED,
        entityType: 'GMParticipant',
        entityId: participant.id,
        payload: { meetingId: meeting.id, role: 'PARTICIPANT', participantId: participant.id, mediaAllowed }
      });
    }
    return { ...visioToken, mediaAllowed };
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
    // Parti entre la lecture et l'écriture (`false`) : même 409 que s'il n'était pas là.
    if (!present || (await setHandRaised(roomName, access.participant.id, raised)) === false) {
      throw new ConflictError(t("Vous n'êtes pas dans la visio"));
    }
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

function trackStateOf(info: ParticipantInfo, source: TrackSource): MeetingVisioTrackState {
  const tracks = (info.tracks ?? []).filter(track => track.source === source);
  if (tracks.length === 0) return { published: false, muted: false };
  return { published: true, muted: tracks.every(track => track.muted) };
}

interface RoomIdentities {
  managers: Map<string, ParticipantInfo>;
  coowners: Map<string, ParticipantInfo>;
  /** Identités qui ne peuvent être ni un gestionnaire ni un copropriétaire (enregistreur `EG_…`, agent…). */
  foreign: number;
}

function splitIdentities(infos: ParticipantInfo[]): RoomIdentities {
  const managers = new Map<string, ParticipantInfo>();
  const coowners = new Map<string, ParticipantInfo>();
  let foreign = 0;
  for (const info of infos) {
    if (info.identity.startsWith(MANAGER_IDENTITY_PREFIX)) {
      managers.set(info.identity.slice(MANAGER_IDENTITY_PREFIX.length), info);
    } else if (UUID_PATTERN.test(info.identity)) {
      coowners.set(info.identity, info);
    } else {
      // Jamais interrogée en base : un `id IN ('EG_…')` sur une colonne uuid fait échouer TOUTE la requête.
      foreign += 1;
    }
  }
  return { managers, coowners, foreign };
}

/**
 * Un participant qui publie alors que le serveur le lui interdit (jeton émis avant l'interdiction et rejoué à
 * une reconnexion, interdiction posée pendant une coupure de LiveKit) est ramené au droit décidé. Au mieux : un
 * échec est journalisé et la vue reste lisible. Jamais dans l'autre sens : rien n'est rouvert d'office.
 */
async function enforceMediaRights(roomName: string, views: MeetingVisioParticipantView[]): Promise<void> {
  for (const view of views) {
    if (view.kind !== 'COOWNER' || !view.canSpeak || view.mediaAllowed) continue;
    try {
      if ((await setCanSpeak(roomName, view.identity, false, { lowerHand: false })) !== false) view.canSpeak = false;
    } catch (error) {
      logger.warn('Visio media right could not be enforced', {
        roomName,
        name: error instanceof Error ? error.name : 'Error'
      });
    }
  }
}

async function coownerViews(
  tenantId: string,
  meetingId: string,
  coowners: Map<string, ParticipantInfo>,
  mediaLocked: boolean
): Promise<MeetingVisioParticipantView[]> {
  if (coowners.size === 0) return [];
  const participants = await prisma.gMParticipant.findMany({
    where: { tenantId, meetingId, id: { in: [...coowners.keys()] } },
    select: { id: true, contactId: true, chatMutedAt: true, mediaPolicy: true }
  });
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
    const info = coowners.get(row.id);
    if (!info) continue;
    const contact = contactById.get(row.contactId);
    const mediaPolicy = normalizeMediaPolicy(row.mediaPolicy);
    views.push({
      identity: info.identity,
      kind: 'COOWNER',
      participantId: row.id,
      contactId: row.contactId,
      name: contact ? contactDisplayName(contact) : '',
      handRaisedAt: handRaisedAtOf(info),
      canSpeak: info.permission?.canPublish ?? false,
      mediaAllowed: isMediaAllowed(mediaPolicy, mediaLocked),
      mediaPolicy,
      mic: trackStateOf(info, TrackSource.MICROPHONE),
      camera: trackStateOf(info, TrackSource.CAMERA),
      joinedAt: joinedAtIso(info),
      chatMuted: row.chatMutedAt != null
    });
  }
  return views;
}

/**
 * Accès « client » historique (TenantClient) à CETTE agence AVEC le droit SYNDIC_EDIT dans cette agence :
 * c'est exactement ce que `requireTenantAccess` + `requirePropertyPermission('SYNDIC_EDIT')` acceptent pour
 * émettre un jeton de modérateur (POST /visio/jeton) sans membre ACTIF. Le droit est lu pour CETTE agence
 * seulement (`hasPermission(userId, clé, tenantId)`) : un droit d'une autre agence ne compte pas.
 */
async function tokenHoldersWithEditRight(tenantId: string, userIds: string[]): Promise<Map<string, string>> {
  const known = new Map<string, string>();
  if (userIds.length === 0) return known;
  const clients = await prisma.tenantClient.findMany({
    where: { tenantId, userId: { in: userIds } },
    select: { userId: true }
  });
  const allowed: string[] = [];
  for (const client of clients) {
    if (await hasPermission(client.userId, 'SYNDIC_EDIT', tenantId)) allowed.push(client.userId);
  }
  if (allowed.length === 0) return known;
  // Select explicite : l'objet User complet porte `passwordHash`.
  const users = await prisma.user.findMany({ where: { id: { in: allowed } }, select: { id: true, fullName: true } });
  for (const user of users) known.set(user.id, user.fullName?.trim() ?? '');
  return known;
}

/**
 * Utilisateurs autorisés à animer la salle de cette agence : ceux qui ont pu obtenir un jeton de modérateur
 * pour elle — membres ACTIFS, super-administrateur, accès client avec SYNDIC_EDIT. Jamais un utilisateur
 * sans lien avec CETTE agence.
 */
async function authorizedManagers(tenantId: string, userIds: string[]): Promise<Map<string, string>> {
  const known = new Map<string, string>();
  if (userIds.length === 0) return known;
  const memberships = await prisma.membership.findMany({
    where: { tenantId, status: 'ACTIVE', userId: { in: userIds } },
    select: { userId: true, user: { select: { fullName: true } } }
  });
  for (const membership of memberships) known.set(membership.userId, membership.user?.fullName?.trim() ?? '');
  const others = userIds.filter(userId => !known.has(userId));
  if (others.length > 0) {
    // Select explicite : l'objet User complet porte `passwordHash`.
    const admins = await prisma.user.findMany({
      where: { id: { in: others }, globalRole: 'SUPER_ADMIN' },
      select: { id: true, fullName: true }
    });
    for (const admin of admins) known.set(admin.id, admin.fullName?.trim() ?? '');
  }
  const remaining = userIds.filter(userId => !known.has(userId));
  for (const [userId, name] of await tokenHoldersWithEditRight(tenantId, remaining)) known.set(userId, name);
  return known;
}

/** Une identité gestionnaire sans droit sur cette agence n'a rien à faire dans la salle : retirée, au mieux. */
async function evictStrangers(roomName: string, strangers: ParticipantInfo[]): Promise<void> {
  for (const info of strangers) {
    try {
      await removeParticipant(roomName, info.identity, { revokeTokens: true });
      logger.warn('Visio participant without right on this agency was removed', { roomName });
    } catch (error) {
      logger.warn('Visio participant without right could not be removed', {
        roomName,
        name: error instanceof Error ? error.name : 'Error'
      });
    }
  }
}

function sortViews(views: MeetingVisioParticipantView[]): MeetingVisioParticipantView[] {
  // Mains levées d'abord (la plus ancienne en tête), puis ordre alphabétique.
  return views.sort((a, b) => {
    if (a.handRaisedAt && b.handRaisedAt) return a.handRaisedAt.localeCompare(b.handRaisedAt);
    if (a.handRaisedAt) return -1;
    if (b.handRaisedAt) return 1;
    return a.name.localeCompare(b.name, 'fr');
  });
}

interface Reconciled {
  participants: MeetingVisioParticipantView[];
  unrecognized: number;
  degraded: boolean;
}

/**
 * Droits des gestionnaires présents : en cas d'échec de la vérification, on ne sait pas, donc on n'expulse
 * personne (`null`) et la vue est marquée dégradée.
 */
async function safeAuthorizedManagers(tenantId: string, userIds: string[]): Promise<Map<string, string> | null> {
  try {
    return await authorizedManagers(tenantId, userIds);
  } catch (error) {
    logger.warn('Visio managers could not be verified', {
      name: error instanceof Error ? error.name : 'Error'
    });
    return null;
  }
}

/** Rapproche les participants LiveKit des GMParticipant de CETTE AG et des utilisateurs autorisés de CETTE agence. */
async function reconcile(
  tenantId: string,
  meetingId: string,
  roomName: string,
  infos: ParticipantInfo[],
  mediaLocked: boolean
): Promise<Reconciled> {
  const { managers, coowners, foreign } = splitIdentities(infos);
  const [views, verified] = await Promise.all([
    coownerViews(tenantId, meetingId, coowners, mediaLocked),
    safeAuthorizedManagers(tenantId, [...managers.keys()])
  ]);
  await enforceMediaRights(roomName, views);
  const unrecognized = foreign + (coowners.size - views.length);
  if (verified === null) return { participants: sortViews(views), unrecognized, degraded: true };
  const allowed = verified;
  const strangers: ParticipantInfo[] = [];
  for (const [userId, info] of managers) {
    const name = allowed.get(userId);
    if (name === undefined) {
      strangers.push(info);
      continue;
    }
    views.push({
      identity: info.identity,
      kind: 'MANAGER',
      participantId: null,
      contactId: null,
      name: name || info.name || '',
      handRaisedAt: null,
      canSpeak: info.permission?.canPublish ?? false,
      mediaAllowed: true,
      mediaPolicy: 'DEFAULT',
      mic: trackStateOf(info, TrackSource.MICROPHONE),
      camera: trackStateOf(info, TrackSource.CAMERA),
      joinedAt: joinedAtIso(info),
      chatMuted: false
    });
  }
  await evictStrangers(roomName, strangers);
  return { participants: sortViews(views), unrecognized, degraded: false };
}

/** Lecture LiveKit de la salle ; un échec de LiveKit (503) donne une vue dégradée, pas une erreur. */
async function readRoom(
  roomName: string
): Promise<{ infos: ParticipantInfo[]; roomActive: boolean; degraded: boolean }> {
  try {
    const infos = await listRoomParticipants(roomName);
    const roomActive = infos.length > 0 || (await roomExists(roomName));
    return { infos, roomActive, degraded: false };
  } catch (error) {
    if (!(error instanceof VisioUnavailableError)) throw error;
    logger.warn('Visio room could not be read, degraded view returned', { roomName });
    return { infos: [], roomActive: false, degraded: true };
  }
}

async function readActiveRecording(
  tenantId: string,
  meetingId: string
): Promise<{ active: MeetingRecordingView | null; degraded: boolean }> {
  try {
    return { active: await findActiveRecording(tenantId, meetingId), degraded: false };
  } catch (error) {
    logger.warn('Active recording could not be read, degraded view returned', {
      meetingId,
      name: error instanceof Error ? error.name : 'Error'
    });
    return { active: null, degraded: true };
  }
}

/** GET /visio */
export async function getVisioAdminView(
  tenantId: string,
  syndicateId: string,
  meetingId: string
): Promise<MeetingVisioAdminView> {
  // La portée (agence, copropriété, AG) est vérifiée d'abord : 404 inchangé.
  const meeting = await loadMeetingBase(prisma, tenantId, syndicateId, meetingId);
  if (!isVisioEnabled()) {
    return {
      enabled: false,
      roomName: null,
      roomActive: false,
      mediaLocked: meeting.mediaLockedAt != null,
      participants: [],
      recording: { enabled: false, active: null },
      degraded: false,
      unrecognized: 0
    };
  }
  const roomName = buildMeetingRoomName(tenantId, meeting.id);
  const room = await readRoom(roomName);
  const mediaLocked = meeting.mediaLockedAt != null;
  const reconciled = await reconcile(tenantId, meeting.id, roomName, room.infos, mediaLocked);
  const recording = await readActiveRecording(tenantId, meeting.id);
  return {
    enabled: true,
    roomName,
    roomActive: room.roomActive,
    mediaLocked,
    participants: reconciled.participants,
    recording: { enabled: isRecordingEnabled(), active: recording.active },
    degraded: room.degraded || reconciled.degraded || recording.degraded,
    unrecognized: reconciled.unrecognized
  };
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
export async function loadMeetingParticipant(tenantId: string, meetingId: string, participantId: string) {
  const participant = await prisma.gMParticipant.findFirst({
    where: { id: participantId, tenantId, meetingId },
    select: { id: true, contactId: true }
  });
  if (!participant) throw new NotFoundError(t('Participant introuvable ou inaccessible'));
  return participant;
}

/** La visio d'une AG close ou annulée est fermée : plus de modération du micro ni de la caméra. */
export function assertMediaModerationOpen(status: string): void {
  if (status === 'COMPLETED' || status === 'CANCELLED') {
    throw new ConflictError(t("L'assemblée est close ou annulée : la visio est fermée"));
  }
}

/**
 * POST /visio/participants/:participantId/parole : autorise (`allowed`) ou interdit à CE participant d'activer
 * micro et caméra (spec 045, V16). La décision est écrite en base d'abord (elle survit à une reconnexion et vaut
 * même si le participant n'est pas encore dans la salle), puis appliquée à la salle s'il y est : interdit = ses
 * pistes publiées sont retirées par LiveKit. « Donner la parole » = lever l'interdiction (et, sous une
 * interdiction globale, l'outrepasser pour lui).
 */
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
  assertMediaModerationOpen(meeting.status);
  const mediaPolicy = policyForAllowed(allowed, meeting.mediaLockedAt != null);

  await prisma.gMParticipant.updateMany({
    where: { id: participant.id, tenantId, meetingId: meeting.id },
    data: { mediaPolicy }
  });
  logAuditEvent({
    actorUserId,
    tenantId,
    actionKey: allowed
      ? AuditActionKey.SYNDIC_MEETING_VISIO_SPEAK_GRANTED
      : AuditActionKey.SYNDIC_MEETING_VISIO_SPEAK_REVOKED,
    entityType: 'GMParticipant',
    entityId: participant.id,
    payload: { meetingId: meeting.id, participantId: participant.id, contactId: participant.contactId, mediaPolicy }
  });

  // Absent de la salle (ou parti entre la lecture et l'écriture) : la décision est déjà posée, il la
  // trouvera dans son prochain jeton.
  const roomName = buildMeetingRoomName(tenantId, meeting.id);
  if (await getRoomParticipant(roomName, participant.id)) {
    await setCanSpeak(roomName, participant.id, allowed);
  }
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

  // Liens révoqués AVANT le retrait : sinon il rentre aussitôt avec le lien qu'il détient encore.
  const revokedLinks = revokeLinks
    ? (await revokeParticipantLinks(tenantId, syndicateId, meetingId, participant.contactId, actorUserId)).revoked
    : 0;
  // Avec la révocation, le jeton de salle déjà détenu est invalidé aussi.
  await removeParticipant(roomName, participant.id, { revokeTokens: revokeLinks });

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
