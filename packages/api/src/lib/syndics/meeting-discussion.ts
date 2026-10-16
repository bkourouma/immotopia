import { prisma } from '../../utils/database';
import { ConflictError, NotFoundError, TooManyRequestsError } from '../../middleware/error-middleware';
import { invalidSecureLinkError } from '../secure-links';
import { t } from '../../i18n';
import { logger } from '../../utils/logger';
import { logAuditEvent } from '../../services/audit-service';
import { AuditActionKey } from '../../types/audit-types';
import {
  buildMeetingRoomName,
  getRoomParticipant,
  isVisioEnabled,
  sendDiscussionEvent
} from '../../services/livekit-service';
import { contactDisplayName } from './meeting-live-rules';
import { loadMeetingBase, loadMeetingBaseById } from './meeting-live-context';
import { withAccess } from './meeting-live-public';
import { DISCUSSION_MAX_LENGTH } from './meeting-live-schemas';
import { MANAGER_IDENTITY_PREFIX } from './meeting-visio';

/**
 * Discussion ecrite moderee de la visio de l'AG (spec 046), cote metier.
 *
 * Les messages sont envoyes a l'API, enregistres (`GMChatMessage`, `tenantId` porte), puis diffuses PAR LE
 * SERVEUR sur le sujet `ag-discussion` : personne n'a `canPublishData`. Aucune donnee de vote, de lot, de
 * tantieme ni de coordonnee ne passe par ce canal. Le texte est un texte brut : il n'est jamais interprete.
 *
 * Toute requete est filtree par `tenantId` ET par l'AG ; un `messageId` ou un `participantId` d'une autre
 * AG ou d'une autre agence recoit la meme 404 qu'un objet inexistant.
 */

export { DISCUSSION_MAX_LENGTH, normalizeDiscussionText } from './meeting-live-schemas';

/** Messages relus : 200 cote copropriétaire, 1 000 cote gestionnaire (M2). */
const PUBLIC_HISTORY_LIMIT = 200;
const MANAGER_HISTORY_LIMIT = 1000;

export interface DiscussionMessageView {
  id: string;
  authorKind: 'COOWNER' | 'MANAGER';
  /** Identite LiveKit : id du `GMParticipant` ou `gestionnaire-<userId>`. */
  authorIdentity: string;
  authorName: string;
  /** `null` quand le message est masque (vue copropriétaire). */
  body: string | null;
  hidden: boolean;
  createdAt: string;
}

export interface PublicDiscussionView {
  open: boolean;
  muted: boolean;
  canWrite: boolean;
  maxLength: number;
  messages: DiscussionMessageView[];
}

export type ManagerDiscussionMessageView = Omit<DiscussionMessageView, 'body'> & {
  /** Toujours le texte, meme masque. */
  body: string;
  participantId: string | null;
  hiddenAt: string | null;
  hiddenByName: string | null;
};

export interface ManagerDiscussionView {
  enabled: boolean;
  open: boolean;
  maxLength: number;
  mutedParticipantIds: string[];
  messages: ManagerDiscussionMessageView[];
}

const MESSAGE_SELECT = {
  id: true,
  authorKind: true,
  participantId: true,
  authorUserId: true,
  authorName: true,
  body: true,
  hiddenAt: true,
  hiddenByUserId: true,
  createdAt: true
} as const;

interface MessageRow {
  id: string;
  authorKind: 'COOWNER' | 'MANAGER';
  participantId: string | null;
  authorUserId: string | null;
  authorName: string;
  body: string;
  hiddenAt: Date | null;
  hiddenByUserId: string | null;
  createdAt: Date;
}

function authorIdentityOf(row: MessageRow): string {
  if (row.authorKind === 'MANAGER') return `${MANAGER_IDENTITY_PREFIX}${row.authorUserId ?? ''}`;
  // Participant supprime depuis (SetNull) : plus d'identite de salle a rapprocher.
  return row.participantId ?? '';
}

function toPublicMessage(row: MessageRow): DiscussionMessageView {
  const hidden = row.hiddenAt != null;
  return {
    id: row.id,
    authorKind: row.authorKind,
    authorIdentity: authorIdentityOf(row),
    authorName: row.authorName,
    // Le texte d'un message masque n'est JAMAIS servi aux copropriétaires.
    body: hidden ? null : row.body,
    hidden,
    createdAt: row.createdAt.toISOString()
  };
}

function toManagerMessage(row: MessageRow, hiddenByName: string | null): ManagerDiscussionMessageView {
  return {
    id: row.id,
    authorKind: row.authorKind,
    authorIdentity: authorIdentityOf(row),
    authorName: row.authorName,
    body: row.body,
    hidden: row.hiddenAt != null,
    createdAt: row.createdAt.toISOString(),
    participantId: row.participantId ?? null,
    hiddenAt: row.hiddenAt ? row.hiddenAt.toISOString() : null,
    hiddenByName
  };
}

function assertEnabled(): void {
  if (!isVisioEnabled()) throw new ConflictError(t("La visio intégrée n'est pas activée"));
}

function assertInProgress(status: string): void {
  if (status !== 'IN_PROGRESS') {
    throw new ConflictError(t("L'assemblée n'est pas en cours : la visio est fermée"));
  }
}

/** Les N derniers messages de CETTE AG et de CETTE agence, en ordre chronologique. */
async function loadLastMessages(tenantId: string, meetingId: string, limit: number): Promise<MessageRow[]> {
  const rows = await prisma.gMChatMessage.findMany({
    where: { tenantId, meetingId },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit,
    select: MESSAGE_SELECT
  });
  return (rows as MessageRow[]).reverse();
}

/** Un message de CETTE AG et de CETTE agence, ou la meme 404 qu'un message inexistant. */
async function loadMessage(tenantId: string, meetingId: string, messageId: string): Promise<MessageRow> {
  const row = await prisma.gMChatMessage.findFirst({
    where: { id: messageId, tenantId, meetingId },
    select: MESSAGE_SELECT
  });
  if (!row) throw new NotFoundError(t('Message introuvable ou inaccessible'));
  return row as MessageRow;
}

/** Discussion fermee par le gestionnaire ? (`GeneralMeeting` n'a pas de champ d'agence : via la copropriete.) */
async function isChatClosed(tenantId: string, meetingId: string): Promise<boolean> {
  const meeting = await prisma.generalMeeting.findFirst({
    where: { id: meetingId, syndicate: { tenantId } },
    select: { chatClosedAt: true }
  });
  return meeting?.chatClosedAt != null;
}

/** Noms des utilisateurs (select explicite : l'objet `User` complet porte `passwordHash`). */
async function loadUserNames(userIds: Array<string | null>): Promise<Map<string, string>> {
  const ids = Array.from(new Set(userIds.filter((id): id is string => Boolean(id))));
  const names = new Map<string, string>();
  if (ids.length === 0) return names;
  const users = await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, fullName: true } });
  for (const user of users) names.set(user.id, user.fullName?.trim() ?? '');
  return names;
}

/**
 * Diffusion au mieux (M15) : le message est deja enregistre ; un echec est journalise sans detail et ne
 * fait jamais echouer l'appelant (les autres le verront a leur prochaine lecture de l'historique).
 */
async function broadcast(
  tenantId: string,
  meetingId: string,
  payload: Record<string, unknown>,
  destinationIdentities?: string[]
): Promise<void> {
  if (!isVisioEnabled()) return;
  try {
    await sendDiscussionEvent(buildMeetingRoomName(tenantId, meetingId), payload, destinationIdentities);
  } catch (error) {
    logger.warn('Visio discussion broadcast failed', {
      meetingId,
      type: payload.type,
      errorName: error instanceof Error ? error.name : 'Error'
    });
  }
}

// --- Plafond par assemblée ----------------------------------------------------

/** Envois autorisés par minute et par AG, copropriétaires et gestionnaire confondus (spec 046). */
export const DISCUSSION_MEETING_LIMIT_PER_MINUTE = 120;
const MEETING_WINDOW_MS = 60_000;
const MEETING_COUNTER_MAX_ENTRIES = 5000;

/** Compteur en mémoire du processus, fenêtre fixe d'une minute, par `tenantId:meetingId`. */
const meetingSendCounters = new Map<string, { windowStart: number; count: number }>();

/** Compte un envoi pour l'AG ; au-delà du plafond de la minute : 429 (`TooManyRequestsError`). */
function consumeMeetingSendSlot(tenantId: string, meetingId: string, now = Date.now()): void {
  const key = `${tenantId}:${meetingId}`;
  const entry = meetingSendCounters.get(key);
  if (!entry || now - entry.windowStart >= MEETING_WINDOW_MS) {
    if (meetingSendCounters.size >= MEETING_COUNTER_MAX_ENTRIES) {
      for (const [k, v] of meetingSendCounters) {
        if (now - v.windowStart >= MEETING_WINDOW_MS) meetingSendCounters.delete(k);
      }
      if (meetingSendCounters.size >= MEETING_COUNTER_MAX_ENTRIES) meetingSendCounters.clear();
    }
    meetingSendCounters.set(key, { windowStart: now, count: 1 });
    return;
  }
  if (entry.count >= DISCUSSION_MEETING_LIMIT_PER_MINUTE) {
    throw new TooManyRequestsError(t('Trop de messages dans cette assemblée, patientez un instant'));
  }
  entry.count += 1;
}

/** Remise à zéro des compteurs par AG (tests). */
export function _resetDiscussionMeetingLimitForTests(): void {
  meetingSendCounters.clear();
}

// --- Copropriétaire (lien personnel) ----------------------------------------

interface PublicParticipant {
  id: string;
  contactId: string;
  joinedAt: Date | null;
  chatMutedAt: Date | null;
}

/**
 * Conditions communes de lecture et d'ecriture (M1, M2) : visio configuree, AG en cours, participant
 * present dans l'AG (`joinedAt`). Participant disparu : la 404 uniforme du lien.
 */
async function requirePublicParticipant(
  tenantId: string,
  meetingId: string,
  participantId: string
): Promise<PublicParticipant> {
  assertEnabled();
  const meeting = await loadMeetingBaseById(prisma, tenantId, meetingId);
  assertInProgress(meeting.status);
  const participant = await prisma.gMParticipant.findFirst({
    where: { id: participantId, tenantId, meetingId },
    select: { id: true, contactId: true, joinedAt: true, chatMutedAt: true }
  });
  if (!participant) throw invalidSecureLinkError();
  if (!participant.joinedAt) throw new ConflictError(t("Rejoignez l'assemblée avant d'entrer en visio"));
  return participant;
}

/** POST /public/assemblees/discussion : etat de la discussion et 200 derniers messages. */
export async function getPublicDiscussion(token: string): Promise<PublicDiscussionView> {
  return withAccess(token, async access => {
    const tenantId = access.link.tenantId;
    const meetingId = access.participant.meetingId;
    const participant = await requirePublicParticipant(tenantId, meetingId, access.participant.id);
    const [closed, rows] = await Promise.all([
      isChatClosed(tenantId, meetingId),
      loadLastMessages(tenantId, meetingId, PUBLIC_HISTORY_LIMIT)
    ]);
    const open = !closed;
    const muted = participant.chatMutedAt != null;
    return {
      open,
      muted,
      canWrite: open && !muted,
      maxLength: DISCUSSION_MAX_LENGTH,
      messages: rows.map(toPublicMessage)
    };
  });
}

/** POST /public/assemblees/discussion/envoyer : le copropriétaire present dans la salle ecrit (texte deja normalise). */
export async function sendPublicDiscussionMessage(token: string, body: string): Promise<DiscussionMessageView> {
  return withAccess(token, async access => {
    const tenantId = access.link.tenantId;
    const meetingId = access.participant.meetingId;
    const participant = await requirePublicParticipant(tenantId, meetingId, access.participant.id);
    if (await isChatClosed(tenantId, meetingId)) {
      throw new ConflictError(t('La discussion est fermée par le gestionnaire'));
    }
    if (participant.chatMutedAt) {
      throw new ConflictError(t("Le gestionnaire a suspendu votre droit d'écrire"));
    }
    // Present dans la salle (meme controle que la main levee) : sinon 409.
    const present = await getRoomParticipant(buildMeetingRoomName(tenantId, meetingId), participant.id);
    if (!present) throw new ConflictError(t("Vous n'êtes pas dans la visio"));

    // Select limite au nom : aucune coordonnee ne part dans la salle.
    const contact = await prisma.crmContact.findFirst({
      where: { id: participant.contactId, tenantId },
      select: { firstName: true, lastName: true, legalName: true }
    });
    consumeMeetingSendSlot(tenantId, meetingId);
    // Fermeture et coupure relues dans la transaction de création : un envoi en vol après l'une ou l'autre
    // (le contrôle de présence ci-dessus est un appel réseau, hors transaction) est refusé.
    const created = await prisma.$transaction(async tx => {
      const [meetingState, fresh] = await Promise.all([
        tx.generalMeeting.findFirst({
          where: { id: meetingId, syndicate: { tenantId } },
          select: { chatClosedAt: true }
        }),
        tx.gMParticipant.findFirst({
          where: { id: participant.id, tenantId, meetingId },
          select: { chatMutedAt: true }
        })
      ]);
      if (!fresh) throw invalidSecureLinkError();
      if (meetingState?.chatClosedAt != null) {
        throw new ConflictError(t('La discussion est fermée par le gestionnaire'));
      }
      if (fresh.chatMutedAt) throw new ConflictError(t("Le gestionnaire a suspendu votre droit d'écrire"));
      return tx.gMChatMessage.create({
        data: {
          tenantId,
          meetingId,
          authorKind: 'COOWNER',
          participantId: participant.id,
          authorName: (contact ? contactDisplayName(contact) : '') || t('Copropriétaire'),
          body
        },
        select: MESSAGE_SELECT
      });
    });
    const view = toPublicMessage(created as MessageRow);
    await broadcast(tenantId, meetingId, { type: 'message', message: view });
    return view;
  });
}

// --- Gestionnaire -----------------------------------------------------------

/** GET /visio/discussion : toute la discussion (masques compris), a tout moment. */
export async function getManagerDiscussion(
  tenantId: string,
  syndicateId: string,
  meetingId: string
): Promise<ManagerDiscussionView> {
  // La portee (agence, copropriete, AG) est verifiee d'abord : 404 inchange.
  const meeting = await loadMeetingBase(prisma, tenantId, syndicateId, meetingId);
  const [closed, muted, rows] = await Promise.all([
    isChatClosed(tenantId, meeting.id),
    prisma.gMParticipant.findMany({
      where: { tenantId, meetingId: meeting.id, chatMutedAt: { not: null } },
      select: { id: true }
    }),
    loadLastMessages(tenantId, meeting.id, MANAGER_HISTORY_LIMIT)
  ]);
  const names = await loadUserNames(rows.map(row => row.hiddenByUserId));
  return {
    enabled: isVisioEnabled(),
    open: !closed,
    maxLength: DISCUSSION_MAX_LENGTH,
    mutedParticipantIds: muted.map(row => row.id),
    messages: rows.map(row =>
      toManagerMessage(row, row.hiddenByUserId ? (names.get(row.hiddenByUserId) ?? '') || null : null)
    )
  };
}

/** POST /visio/discussion/messages : le gestionnaire ecrit (annonces, reponses) pendant la seance. */
export async function sendManagerDiscussionMessage(
  tenantId: string,
  syndicateId: string,
  meetingId: string,
  userId: string,
  body: string
): Promise<ManagerDiscussionMessageView> {
  const meeting = await loadMeetingBase(prisma, tenantId, syndicateId, meetingId);
  assertEnabled();
  assertInProgress(meeting.status);
  // Select explicite : l'objet User complet porte `passwordHash`.
  const user = await prisma.user.findFirst({ where: { id: userId }, select: { id: true, fullName: true } });
  if (!user) throw new NotFoundError(t('Utilisateur introuvable ou inaccessible'));

  consumeMeetingSendSlot(tenantId, meeting.id);
  const created = await prisma.gMChatMessage.create({
    data: {
      tenantId,
      meetingId: meeting.id,
      authorKind: 'MANAGER',
      authorUserId: user.id,
      authorName: user.fullName?.trim() || t('Gestionnaire'),
      body
    },
    select: MESSAGE_SELECT
  });
  const row = created as MessageRow;
  await broadcast(tenantId, meeting.id, { type: 'message', message: toPublicMessage(row) });
  return toManagerMessage(row, null);
}

/** POST /visio/discussion/messages/:messageId/masquer : masque ou retablit un message (idempotent). */
export async function setDiscussionMessageHidden(
  tenantId: string,
  syndicateId: string,
  meetingId: string,
  messageId: string,
  hidden: boolean,
  actorUserId: string | null
): Promise<ManagerDiscussionMessageView> {
  const meeting = await loadMeetingBase(prisma, tenantId, syndicateId, meetingId);
  const current = await loadMessage(tenantId, meeting.id, messageId);
  if ((current.hiddenAt != null) === hidden) {
    const names = await loadUserNames([current.hiddenByUserId]);
    return toManagerMessage(current, current.hiddenByUserId ? names.get(current.hiddenByUserId) || null : null);
  }

  await prisma.gMChatMessage.updateMany({
    where: { id: current.id, tenantId, meetingId: meeting.id },
    data: hidden ? { hiddenAt: new Date(), hiddenByUserId: actorUserId } : { hiddenAt: null, hiddenByUserId: null }
  });
  const updated = await loadMessage(tenantId, meeting.id, current.id);

  logAuditEvent({
    actorUserId,
    tenantId,
    actionKey: hidden
      ? AuditActionKey.SYNDIC_MEETING_CHAT_MESSAGE_HIDDEN
      : AuditActionKey.SYNDIC_MEETING_CHAT_MESSAGE_RESTORED,
    entityType: 'GMChatMessage',
    entityId: current.id,
    // Jamais le texte du message.
    payload: { meetingId: meeting.id, messageId: current.id }
  });
  await broadcast(
    tenantId,
    meeting.id,
    hidden ? { type: 'hidden', id: current.id } : { type: 'restored', message: toPublicMessage(updated) }
  );
  const names = await loadUserNames([updated.hiddenByUserId]);
  return toManagerMessage(updated, updated.hiddenByUserId ? names.get(updated.hiddenByUserId) || null : null);
}

/** POST /visio/discussion/etat : ferme ou rouvre la discussion pour toute la salle (idempotent). */
export async function setDiscussionOpen(
  tenantId: string,
  syndicateId: string,
  meetingId: string,
  open: boolean,
  actorUserId: string | null
): Promise<{ open: boolean }> {
  const meeting = await loadMeetingBase(prisma, tenantId, syndicateId, meetingId);
  if (meeting.status === 'COMPLETED' || meeting.status === 'CANCELLED') {
    throw new ConflictError(t("L'assemblée est close ou annulée : la discussion ne peut plus être modifiée"));
  }
  const closed = await isChatClosed(tenantId, meeting.id);
  if (!closed === open) return { open };

  await prisma.generalMeeting.updateMany({
    where: { id: meeting.id, syndicate: { tenantId } },
    data: { chatClosedAt: open ? null : new Date() }
  });
  logAuditEvent({
    actorUserId,
    tenantId,
    actionKey: open ? AuditActionKey.SYNDIC_MEETING_CHAT_OPENED : AuditActionKey.SYNDIC_MEETING_CHAT_CLOSED,
    entityType: 'GeneralMeeting',
    entityId: meeting.id,
    payload: { meetingId: meeting.id }
  });
  await broadcast(tenantId, meeting.id, { type: 'state', open });
  return { open };
}

/** POST /visio/participants/:participantId/ecriture : coupe ou retablit l'ecriture d'un participant (idempotent). */
export async function setParticipantWriting(
  tenantId: string,
  syndicateId: string,
  meetingId: string,
  participantId: string,
  allowed: boolean,
  actorUserId: string | null
): Promise<{ participantId: string; muted: boolean }> {
  const meeting = await loadMeetingBase(prisma, tenantId, syndicateId, meetingId);
  const participant = await prisma.gMParticipant.findFirst({
    where: { id: participantId, tenantId, meetingId: meeting.id },
    select: { id: true, contactId: true, chatMutedAt: true }
  });
  if (!participant) throw new NotFoundError(t('Participant introuvable ou inaccessible'));

  const muted = !allowed;
  if ((participant.chatMutedAt != null) === muted) return { participantId: participant.id, muted };

  await prisma.gMParticipant.updateMany({
    where: { id: participant.id, tenantId, meetingId: meeting.id },
    data: { chatMutedAt: muted ? new Date() : null }
  });
  logAuditEvent({
    actorUserId,
    tenantId,
    actionKey: muted
      ? AuditActionKey.SYNDIC_MEETING_CHAT_PARTICIPANT_MUTED
      : AuditActionKey.SYNDIC_MEETING_CHAT_PARTICIPANT_UNMUTED,
    entityType: 'GMParticipant',
    entityId: participant.id,
    payload: { meetingId: meeting.id, participantId: participant.id, contactId: participant.contactId }
  });
  // Message cible : seul le participant concerne en est prevenu.
  await broadcast(tenantId, meeting.id, { type: 'muted', muted }, [participant.id]);
  return { participantId: participant.id, muted };
}
