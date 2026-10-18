import type { PrismaTransactionClient } from '../../utils/database';
import { NotFoundError } from '../../middleware/error-middleware';
import { t } from '../../i18n';
import { loadMeetingLots, MEETING_CONTACT_SELECT, type MeetingLotsData } from './meeting-lots';
import { contactDisplayName, resolveVotableLots, type VotableLot } from './meeting-live-rules';

/**
 * Lecture partagee de l'AG en direct (spec 043) : l'assemblee, ses lots et
 * votants a la date, les resolutions et leurs votes, les emargements, les
 * participants et les pouvoirs. Les vues du gestionnaire et du copropriétaire
 * en sont deux projections.
 *
 * `GeneralMeeting` n'a pas de champ d'agence : l'isolation passe par
 * `syndicate.tenantId`, dans chaque `where`. `GMParticipant` et
 * `GMAttendance` portent `tenantId` directement.
 */

export interface LiveMeetingBase {
  id: string;
  type: string;
  status: string;
  scheduledAt: Date;
  startTime: Date | null;
  endTime: Date | null;
  location: string | null;
  videoConferenceUrl: string | null;
  syndicateId: string;
  syndicate: { id: string; name: string; tenantId: string };
  /** Micro et caméra interdits à tous par le gestionnaire (spec 045, V16) ; absent = non. */
  mediaLockedAt?: Date | null;
}

const MEETING_BASE_SELECT = {
  id: true,
  type: true,
  status: true,
  scheduledAt: true,
  startTime: true,
  endTime: true,
  location: true,
  videoConferenceUrl: true,
  syndicateId: true,
  mediaLockedAt: true,
  syndicate: { select: { id: true, name: true, tenantId: true } }
} as const;

/**
 * « AG introuvable » : sous-classe dediee pour que les appelants (lien
 * personnel) la reconnaissent par `instanceof`, jamais par le texte traduit.
 */
export class MeetingNotFoundError extends NotFoundError {
  constructor() {
    super(t('Assemblée générale introuvable ou inaccessible'));
  }
}

function meetingNotFound(): NotFoundError {
  return new MeetingNotFoundError();
}

/** Assemblee de l'agence et de la copropriete, ou 404 identique a une assemblee inexistante. */
export async function loadMeetingBase(
  client: PrismaTransactionClient,
  tenantId: string,
  syndicateId: string,
  meetingId: string
): Promise<LiveMeetingBase> {
  const meeting = await client.generalMeeting.findFirst({
    where: { id: meetingId, syndicateId, syndicate: { tenantId } },
    select: MEETING_BASE_SELECT
  });
  if (!meeting) throw meetingNotFound();
  return meeting as LiveMeetingBase;
}

/** Variante sans copropriete connue (lien personnel, portail). */
export async function loadMeetingBaseById(
  client: PrismaTransactionClient,
  tenantId: string,
  meetingId: string
): Promise<LiveMeetingBase> {
  const meeting = await client.generalMeeting.findFirst({
    where: { id: meetingId, syndicate: { tenantId } },
    select: MEETING_BASE_SELECT
  });
  if (!meeting) throw meetingNotFound();
  return meeting as LiveMeetingBase;
}

export interface LiveVote {
  lotId: string;
  vote: 'FOR' | 'AGAINST' | 'ABSTAIN';
  source: 'MANAGER' | 'CO_OWNER' | 'PROXY_HOLDER';
  castByContactId: string | null;
  updatedAt: Date;
}

export interface LiveResolution {
  id: string;
  title: string;
  description: string | null;
  majorityRule: string | null;
  voteStatus: 'PENDING' | 'OPEN' | 'CLOSED';
  voteOpenedAt: Date | null;
  voteClosedAt: Date | null;
  votes: LiveVote[];
}

export interface LiveAttendanceRow {
  lotId: string;
  status: 'PRESENT' | 'REPRESENTED' | 'ABSENT';
  mode: 'ONLINE' | 'IN_PERSON';
  recordedBy: 'SELF' | 'MANAGER';
  attendeeContactId: string | null;
  representedByContactId: string | null;
  updatedAt: Date;
}

export interface LiveParticipantRow {
  id: string;
  contactId: string;
  joinedAt: Date | null;
  lastSeenAt: Date | null;
}

export interface LiveContext extends MeetingLotsData {
  meeting: LiveMeetingBase;
  resolutions: LiveResolution[];
  attendances: LiveAttendanceRow[];
  participants: LiveParticipantRow[];
  proxies: Array<{ grantorContactId: string; representativeContactId: string }>;
}

export async function loadLiveContext(
  client: PrismaTransactionClient,
  tenantId: string,
  meeting: LiveMeetingBase
): Promise<LiveContext> {
  const lotsData = await loadMeetingLots(client, meeting.syndicateId, meeting.scheduledAt);
  const [resolutions, attendances, participants, proxies] = await Promise.all([
    client.gMResolution.findMany({
      where: { meetingId: meeting.id },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        title: true,
        description: true,
        majorityRule: true,
        voteStatus: true,
        voteOpenedAt: true,
        voteClosedAt: true,
        votes: { select: { lotId: true, vote: true, source: true, castByContactId: true, updatedAt: true } }
      }
    }),
    client.gMAttendance.findMany({
      where: { meetingId: meeting.id, tenantId },
      select: {
        lotId: true,
        status: true,
        mode: true,
        recordedBy: true,
        attendeeContactId: true,
        representedByContactId: true,
        updatedAt: true
      }
    }),
    client.gMParticipant.findMany({
      where: { meetingId: meeting.id, tenantId },
      select: { id: true, contactId: true, joinedAt: true, lastSeenAt: true }
    }),
    client.gMProxy.findMany({
      where: { meetingId: meeting.id },
      select: { grantorContactId: true, representativeContactId: true }
    })
  ]);
  return {
    ...lotsData,
    meeting,
    resolutions: resolutions as LiveResolution[],
    attendances: attendances as LiveAttendanceRow[],
    participants: participants as LiveParticipantRow[],
    proxies
  };
}

/**
 * Lots que `contactId` peut voter dans cette AG (D6). Les lots a 0 tantieme
 * (desactives) ne votent pas.
 */
export function votableLotsFor(ctx: LiveContext, contactId: string): VotableLot[] {
  return resolveVotableLots(
    contactId,
    ctx.lots
      .filter(lot => lot.generalShares > 0)
      .map(lot => ({ lotId: lot.id, voterContactIds: lot.voters.map(voter => voter.contactId) })),
    ctx.proxies.filter(proxy => proxy.representativeContactId === contactId).map(proxy => proxy.grantorContactId)
  );
}

/** Contacts qui peuvent recevoir un lien : votants d'un lot a la date, ou mandataires d'un pouvoir de l'AG. */
export function eligibleContactIds(ctx: LiveContext): Set<string> {
  const ids = new Set<string>();
  for (const lot of ctx.lots) {
    if (lot.generalShares <= 0) continue;
    for (const voter of lot.voters) ids.add(voter.contactId);
  }
  for (const proxy of ctx.proxies) ids.add(proxy.representativeContactId);
  return ids;
}

/** Noms des contacts de l'agence (jamais les coordonnees), pour l'affichage gestionnaire. */
export async function loadContactNames(
  client: PrismaTransactionClient,
  tenantId: string,
  contactIds: Array<string | null | undefined>
): Promise<Map<string, string>> {
  const ids = Array.from(new Set(contactIds.filter((id): id is string => Boolean(id))));
  const names = new Map<string, string>();
  if (ids.length === 0) return names;
  const contacts = await client.crmContact.findMany({
    where: { tenantId, id: { in: ids } },
    select: MEETING_CONTACT_SELECT
  });
  for (const contact of contacts) names.set(contact.id, contactDisplayName(contact));
  return names;
}
