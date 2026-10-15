import { prisma, type PrismaTransactionClient } from '../../utils/database';
import { env } from '../../config/env';
import { logger } from '../../utils/logger';
import { ConflictError, NotFoundError } from '../../middleware/error-middleware';
import { t } from '../../i18n';
import { logAuditEvent } from '../../services/audit-service';
import { AuditActionKey } from '../../types/audit-types';
import { assertBelongsToTenant } from '../../utils/tenant-ownership';
import { countActiveSecureLinksByObject, createSecureLink, revokeSecureLinksForObject } from '../secure-links';
import { MEETING_CONTACT_SELECT } from './meeting-lots';
import { contactDisplayName, isMeetingFrozen, isOnline, meetingLinkTtlDays } from './meeting-live-rules';
import {
  eligibleContactIds,
  loadLiveContext,
  loadMeetingBase,
  loadMeetingBaseById,
  votableLotsFor,
  type LiveMeetingBase
} from './meeting-live-context';
import type { CoOwnerPortalScope } from './coowner-portal';

/**
 * Participants a une AG et liens personnels (spec 043, D1, D8, D9).
 *
 * Un `GMParticipant` par contact et par AG porte les liens : chaque lien est
 * un `SecureLink` de portee `GENERAL_MEETING_ACCESS` dont `objectId` est
 * l'identifiant du participant. Un nouveau lien ne revoque pas les precedents.
 */

export const MEETING_LINK_OBJECT_TYPE = 'GM_PARTICIPANT';
const MEETING_LINK_SCOPE = 'GENERAL_MEETING_ACCESS' as const;

export interface MeetingParticipantView {
  contactId: string;
  name: string;
  email: string | null;
  phone: string | null;
  lotNumbers: string[];
  joinedAt: Date | null;
  lastSeenAt: Date | null;
  online: boolean;
  activeLinks: number;
}

/** Participant du contact pour cette AG, cree s'il manque (idempotent). */
export async function ensureParticipant(
  client: PrismaTransactionClient,
  tenantId: string,
  meetingId: string,
  contactId: string
): Promise<{ id: string }> {
  const find = () =>
    client.gMParticipant.findFirst({ where: { meetingId, contactId, tenantId }, select: { id: true } });
  const existing = await find();
  if (existing) return existing;
  try {
    return await client.gMParticipant.create({ data: { tenantId, meetingId, contactId }, select: { id: true } });
  } catch (error) {
    // Deux demandes simultanees : la seconde retombe sur la ligne de la premiere.
    if ((error as { code?: string } | null)?.code === 'P2002') {
      const raced = await find();
      if (raced) return raced;
    }
    throw error;
  }
}

/** Cree un lien personnel pour un contact (participant cree au besoin). Le jeton est remis une fois. */
async function issueLink(
  tenantId: string,
  meeting: Pick<LiveMeetingBase, 'id' | 'scheduledAt'>,
  contactId: string,
  actorUserId: string | null
) {
  const participant = await ensureParticipant(prisma, tenantId, meeting.id, contactId);
  const link = await createSecureLink({
    tenantId,
    scope: MEETING_LINK_SCOPE,
    objectType: MEETING_LINK_OBJECT_TYPE,
    objectId: participant.id,
    createdByUserId: actorUserId,
    ttlDays: meetingLinkTtlDays(meeting.scheduledAt, env.SECURE_LINK_MAX_TTL_DAYS)
  });
  logAuditEvent({
    actorUserId,
    tenantId,
    actionKey: AuditActionKey.SYNDIC_MEETING_LINK_ISSUED,
    entityType: 'GMParticipant',
    entityId: participant.id,
    payload: { meetingId: meeting.id, contactId, participantId: participant.id, linkId: link.id }
  });
  return { participantId: participant.id, url: link.url, expiresAt: link.expiresAt };
}

function assertLinkable(meeting: LiveMeetingBase): void {
  if (!isMeetingFrozen(meeting.status)) return;
  throw new ConflictError(
    meeting.status === 'COMPLETED'
      ? t("Assemblée clôturée : aucun lien d'accès ne peut être créé")
      : t("Assemblée annulée : aucun lien d'accès ne peut être créé")
  );
}

/** POST /participants/:contactId/lien */
export async function issueParticipantLink(
  tenantId: string,
  syndicateId: string,
  meetingId: string,
  contactId: string,
  actorUserId: string | null
): Promise<{ url: string; expiresAt: Date }> {
  const meeting = await loadMeetingBase(prisma, tenantId, syndicateId, meetingId);
  assertLinkable(meeting);

  const ctx = await loadLiveContext(prisma, tenantId, meeting);
  if (!eligibleContactIds(ctx).has(contactId)) {
    throw new NotFoundError(t('Contact introuvable ou inaccessible'));
  }
  await assertBelongsToTenant(prisma, 'crmContact', contactId, tenantId, {
    message: t('Contact introuvable ou inaccessible')
  });

  const { url, expiresAt } = await issueLink(tenantId, meeting, contactId, actorUserId);
  return { url, expiresAt };
}

/** DELETE /participants/:contactId/liens */
export async function revokeParticipantLinks(
  tenantId: string,
  syndicateId: string,
  meetingId: string,
  contactId: string,
  actorUserId: string | null
): Promise<{ revoked: number }> {
  const meeting = await loadMeetingBase(prisma, tenantId, syndicateId, meetingId);
  const participant = await prisma.gMParticipant.findFirst({
    where: { meetingId: meeting.id, contactId, tenantId },
    select: { id: true }
  });

  if (!participant) {
    const ctx = await loadLiveContext(prisma, tenantId, meeting);
    if (!eligibleContactIds(ctx).has(contactId)) {
      throw new NotFoundError(t('Contact introuvable ou inaccessible'));
    }
    return { revoked: 0 };
  }

  const revoked = await revokeSecureLinksForObject(tenantId, MEETING_LINK_OBJECT_TYPE, participant.id, actorUserId);
  logAuditEvent({
    actorUserId,
    tenantId,
    actionKey: AuditActionKey.SYNDIC_MEETING_LINKS_REVOKED,
    entityType: 'GMParticipant',
    entityId: participant.id,
    payload: { meetingId: meeting.id, contactId, participantId: participant.id, revoked }
  });
  return { revoked };
}

/** GET /participants : copropriétaires pouvant voter (ou mandataires) et leur état de connexion. */
export async function listMeetingParticipants(
  tenantId: string,
  syndicateId: string,
  meetingId: string,
  now: Date = new Date()
): Promise<MeetingParticipantView[]> {
  const meeting = await loadMeetingBase(prisma, tenantId, syndicateId, meetingId);
  const ctx = await loadLiveContext(prisma, tenantId, meeting);

  const contactIds = new Set<string>([
    ...eligibleContactIds(ctx),
    ...ctx.participants.map(participant => participant.contactId)
  ]);
  if (contactIds.size === 0) return [];

  const contacts = await prisma.crmContact.findMany({
    where: { tenantId, id: { in: Array.from(contactIds) } },
    select: { ...MEETING_CONTACT_SELECT, phonePrimary: true }
  });
  const participantByContact = new Map(ctx.participants.map(participant => [participant.contactId, participant]));
  const linkCounts = await countActiveSecureLinksByObject(
    tenantId,
    MEETING_LINK_SCOPE,
    MEETING_LINK_OBJECT_TYPE,
    ctx.participants.map(participant => participant.id)
  );
  const lotNumberById = new Map(ctx.lots.map(lot => [lot.id, lot.lotNumber]));

  return contacts
    .map(contact => {
      const participant = participantByContact.get(contact.id);
      return {
        contactId: contact.id,
        name: contactDisplayName(contact),
        email: contact.email ?? null,
        phone: contact.phonePrimary ?? null,
        lotNumbers: votableLotsFor(ctx, contact.id)
          .map(lot => lotNumberById.get(lot.lotId) ?? '')
          .filter(Boolean)
          .sort((a, b) => a.localeCompare(b, 'fr', { numeric: true })),
        joinedAt: participant?.joinedAt ?? null,
        lastSeenAt: participant?.lastSeenAt ?? null,
        online: participant ? isOnline(participant.lastSeenAt, now) : false,
        activeLinks: participant ? (linkCounts.get(participant.id) ?? 0) : 0
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
}

/**
 * Lien pour la convocation : ne leve jamais. En cas d'echec, renvoie une
 * chaine vide (la convocation part sans lien plutot que de ne pas partir).
 */
export async function createConvocationLink(
  tenantId: string,
  meeting: { id: string; scheduledAt: Date },
  contactId: string
): Promise<string> {
  try {
    const { url } = await issueLink(tenantId, meeting, contactId, null);
    return url;
  } catch (error) {
    logger.warn('Convocation link could not be created', {
      meetingId: meeting.id,
      contactId,
      errorName: error instanceof Error ? error.name : 'UnknownError'
    });
    return '';
  }
}

/** POST /api/portal/copropriete/assemblees/:meetingId/acces */
export async function issueCoOwnerPortalMeetingLink(
  scope: CoOwnerPortalScope,
  meetingId: string,
  actorUserId: string | null
): Promise<{ url: string }> {
  const meeting = await loadMeetingBaseById(prisma, scope.tenantId, meetingId);
  if (!scope.syndicateIds.includes(meeting.syndicateId)) {
    throw new NotFoundError(t('Assemblée générale introuvable ou inaccessible'));
  }
  assertLinkable(meeting);

  const ctx = await loadLiveContext(prisma, scope.tenantId, meeting);
  const contactId = scope.contactIds.find(id => votableLotsFor(ctx, id).length > 0);
  if (!contactId) throw new NotFoundError(t('Assemblée générale introuvable ou inaccessible'));

  const { url } = await issueLink(scope.tenantId, meeting, contactId, actorUserId);
  return { url };
}
