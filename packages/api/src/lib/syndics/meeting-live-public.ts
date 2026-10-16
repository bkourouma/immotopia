import { prisma } from '../../utils/database';
import { ConflictError, NotFoundError } from '../../middleware/error-middleware';
import { t } from '../../i18n';
import { runWithTenantContext } from '../../utils/tenant-context';
import { logAuditEvent } from '../../services/audit-service';
import { AuditActionKey } from '../../types/audit-types';
import { invalidSecureLinkError, verifySecureLink, type VerifiedSecureLink } from '../secure-links';
import { computeMeetingAttendance, computeResolutionTally, normalizeMajorityRule } from './meeting-majority';
import { lockMeetingTx, recomputeMeetingResultsTx } from './meeting-results';
import { MEETING_CONTACT_SELECT } from './meeting-lots';
import {
  contactDisplayName,
  isMeetingFrozen,
  isResultVisible,
  planAttendanceForContact,
  shouldTouchLastSeen,
  voteSourceForRole,
  LAST_SEEN_WRITE_INTERVAL_MS
} from './meeting-live-rules';
import {
  loadLiveContext,
  loadMeetingBaseById,
  MeetingNotFoundError,
  votableLotsFor,
  type LiveContext
} from './meeting-live-context';
import { MEETING_LINK_OBJECT_TYPE } from './meeting-participants';
import { isVisioEnabled } from '../../services/livekit-service';

/**
 * AG en direct, cote copropriétaire, par lien personnel sans connexion
 * (spec 043). Le jeton est la seule preuve d'acces : tout refus (jeton
 * inconnu, expire, revoque, agence suspendue, participant ou assemblee
 * disparus) est la meme 404 uniforme (`invalidSecureLinkError`).
 *
 * La vue ne montre JAMAIS le sens des votes des autres lots, ni les noms et
 * coordonnees des autres copropriétaires ; le resultat d'une resolution
 * n'apparait qu'a la cloture de son vote (ou de l'AG).
 */

export interface LiveMeetingPublicView {
  meeting: {
    id: string;
    type: string;
    status: string;
    scheduledAt: Date;
    startTime: Date | null;
    endTime: Date | null;
    location: string | null;
    videoConferenceUrl: string | null;
    syndicateName: string;
    agenda: Array<{ orderIndex: number; title: string }>;
  };
  me: { contactId: string; name: string; joined: boolean; joinedAt: Date | null };
  myLots: Array<{
    lotId: string;
    lotNumber: string;
    generalShares: number;
    role: 'OWNER' | 'PROXY';
    grantorName: string | null;
    attendanceStatus: 'PRESENT' | 'REPRESENTED' | 'ABSENT' | null;
  }>;
  attendance: {
    quorumPercent: number;
    representedShares: number;
    totalShares: number;
    representedLots: number;
    totalLots: number;
  };
  resolutions: Array<{
    id: string;
    title: string;
    description: string | null;
    majorityRule: string;
    voteStatus: 'PENDING' | 'OPEN' | 'CLOSED';
    voteOpenedAt: Date | null;
    voteClosedAt: Date | null;
    ballotCount: number;
    totalLots: number;
    myVotes: Array<{ lotId: string; vote: string; source: string }>;
    result: null | {
      result: 'APPROVED' | 'REJECTED' | null;
      sharesFor: number;
      sharesAgainst: number;
      sharesAbstain: number;
      totalShares: number;
      votesFor: number;
      votesAgainst: number;
      votesAbstain: number;
    };
  }>;
  canVote: boolean;
  /** Visio integree (spec 045) : LiveKit est-il configure ? Rien d'autre n'est expose. */
  visio: { enabled: boolean };
  serverTime: string;
}

export interface AccessedParticipant {
  id: string;
  contactId: string;
  meetingId: string;
  joinedAt: Date | null;
  lastSeenAt: Date | null;
}

export interface Access {
  link: VerifiedSecureLink;
  participant: AccessedParticipant;
}

/**
 * Jeton -> participant. Execute sous le contexte d'agence du lien. A appeler
 * a l'interieur de `runWithTenantContext` pour la suite des lectures.
 */
async function resolveAccess(token: string): Promise<Access> {
  const link = await verifySecureLink(token, 'GENERAL_MEETING_ACCESS');
  if (link.objectType !== MEETING_LINK_OBJECT_TYPE) throw invalidSecureLinkError();

  const participant = await runWithTenantContext({ tenantId: link.tenantId }, () =>
    prisma.gMParticipant.findFirst({
      where: { id: link.objectId, tenantId: link.tenantId },
      select: { id: true, contactId: true, meetingId: true, joinedAt: true, lastSeenAt: true }
    })
  );
  if (!participant) throw invalidSecureLinkError();
  return { link, participant };
}

/** Toute erreur de domaine « objet introuvable » d'un lien devient la 404 uniforme. */
export async function withAccess<T>(token: string, run: (access: Access) => Promise<T>): Promise<T> {
  const access = await resolveAccess(token);
  return runWithTenantContext({ tenantId: access.link.tenantId }, async () => {
    try {
      return await run(access);
    } catch (error) {
      // Assemblee supprimee, lot disparu : pas de message qui distingue les cas pour un jeton.
      if (error instanceof MeetingNotFoundError) {
        throw invalidSecureLinkError();
      }
      throw error;
    }
  });
}

async function buildPublicView(
  access: Access,
  ctx: LiveContext,
  participant: AccessedParticipant,
  now: Date
): Promise<LiveMeetingPublicView> {
  const tenantId = access.link.tenantId;
  const { meeting } = ctx;

  const [agenda, contact] = await Promise.all([
    prisma.gMAgendaItem.findMany({
      where: { meetingId: meeting.id },
      orderBy: [{ orderIndex: 'asc' }, { createdAt: 'asc' }],
      select: { orderIndex: true, title: true }
    }),
    prisma.crmContact.findFirst({
      where: { id: participant.contactId, tenantId },
      select: MEETING_CONTACT_SELECT
    })
  ]);

  const votable = votableLotsFor(ctx, participant.contactId);
  const lotById = new Map(ctx.lots.map(lot => [lot.id, lot]));
  const attendanceByLot = new Map(ctx.attendances.map(row => [row.lotId, row]));
  const myLotIds = new Set(votable.map(lot => lot.lotId));

  const myLots = votable.flatMap(entry => {
    const lot = lotById.get(entry.lotId);
    if (!lot) return [];
    // Le mandant n'est nomme que pour un lot qu'on represente par son pouvoir.
    const grantor =
      entry.role === 'PROXY' ? lot.voters.find(voter => voter.contactId === entry.grantorContactId) : undefined;
    return [
      {
        lotId: lot.id,
        lotNumber: lot.lotNumber,
        generalShares: lot.generalShares,
        role: entry.role,
        grantorName: grantor ? contactDisplayName(grantor) || null : null,
        attendanceStatus: attendanceByLot.get(lot.id)?.status ?? null
      }
    ];
  });

  const allVotes = ctx.resolutions.flatMap(resolution => resolution.votes);
  const attendance = computeMeetingAttendance(ctx.majorityLots, allVotes, ctx.attendances);
  const joined = Boolean(participant.joinedAt);

  return {
    meeting: {
      id: meeting.id,
      type: meeting.type,
      status: meeting.status,
      scheduledAt: meeting.scheduledAt,
      startTime: meeting.startTime,
      endTime: meeting.endTime,
      location: meeting.location,
      videoConferenceUrl: meeting.videoConferenceUrl,
      syndicateName: meeting.syndicate.name,
      agenda
    },
    me: {
      contactId: participant.contactId,
      name: contact ? contactDisplayName(contact) : '',
      joined,
      joinedAt: participant.joinedAt
    },
    myLots,
    attendance: {
      quorumPercent: attendance.quorumPercent,
      representedShares: attendance.representedShares,
      totalShares: attendance.totalShares,
      representedLots: attendance.representedLots,
      totalLots: attendance.totalLots
    },
    resolutions: ctx.resolutions.map(resolution => {
      const visible = isResultVisible(resolution.voteStatus, meeting.status);
      const tally = visible
        ? computeResolutionTally(resolution.majorityRule, ctx.majorityLots, resolution.votes)
        : null;
      return {
        id: resolution.id,
        title: resolution.title,
        description: resolution.description,
        majorityRule: normalizeMajorityRule(resolution.majorityRule),
        voteStatus: resolution.voteStatus,
        voteOpenedAt: resolution.voteOpenedAt,
        voteClosedAt: resolution.voteClosedAt,
        ballotCount: resolution.votes.filter(vote => lotById.has(vote.lotId)).length,
        totalLots: ctx.lots.length,
        // Seulement les votes de MES lots, quelle que soit leur origine.
        myVotes: resolution.votes
          .filter(vote => myLotIds.has(vote.lotId))
          .map(vote => ({ lotId: vote.lotId, vote: vote.vote, source: vote.source })),
        result: tally
          ? {
              result: tally.result,
              sharesFor: tally.sharesFor,
              sharesAgainst: tally.sharesAgainst,
              sharesAbstain: tally.sharesAbstain,
              totalShares: tally.totalShares,
              votesFor: tally.votesFor,
              votesAgainst: tally.votesAgainst,
              votesAbstain: tally.votesAbstain
            }
          : null
      };
    }),
    canVote: meeting.status === 'IN_PROGRESS' && myLots.length > 0 && joined,
    visio: { enabled: isVisioEnabled() },
    serverTime: now.toISOString()
  };
}

async function readView(access: Access, now: Date = new Date()): Promise<LiveMeetingPublicView> {
  const tenantId = access.link.tenantId;
  const participant = await prisma.gMParticipant.findFirst({
    where: { id: access.participant.id, tenantId },
    select: { id: true, contactId: true, meetingId: true, joinedAt: true, lastSeenAt: true }
  });
  if (!participant) throw invalidSecureLinkError();
  const meeting = await loadMeetingBaseById(prisma, tenantId, participant.meetingId);
  const ctx = await loadLiveContext(prisma, tenantId, meeting);
  return buildPublicView(access, ctx, participant, now);
}

/** POST /etat : met a jour `lastSeenAt` (au plus toutes les 10 s) et rend la vue. */
export async function getPublicLiveState(token: string): Promise<LiveMeetingPublicView> {
  return withAccess(token, async access => {
    const now = new Date();
    if (shouldTouchLastSeen(access.participant.lastSeenAt, now)) {
      // Condition dans la requete : deux onglets du meme participant n'ecrivent pas deux fois.
      await prisma.gMParticipant.updateMany({
        where: {
          id: access.participant.id,
          tenantId: access.link.tenantId,
          OR: [{ lastSeenAt: null }, { lastSeenAt: { lt: new Date(now.getTime() - LAST_SEEN_WRITE_INTERVAL_MS) } }]
        },
        data: { lastSeenAt: now }
      });
    }
    return readView(access, now);
  });
}

/** POST /rejoindre : emarge les lots votables (idempotent) et marque le participant comme ayant rejoint. */
export async function joinPublicMeeting(token: string): Promise<LiveMeetingPublicView> {
  return withAccess(token, async access => {
    const tenantId = access.link.tenantId;
    let newlyJoined = false;
    let emarged: string[] = [];

    await prisma.$transaction(async tx => {
      await lockMeetingTx(tx, access.participant.meetingId);
      const meeting = await loadMeetingBaseById(tx, tenantId, access.participant.meetingId);
      if (isMeetingFrozen(meeting.status)) {
        throw new ConflictError(
          meeting.status === 'COMPLETED'
            ? t("L'assemblée est clôturée : elle ne peut plus être rejointe")
            : t("L'assemblée est annulée : elle ne peut pas être rejointe")
        );
      }

      const ctx = await loadLiveContext(tx, tenantId, meeting);
      const votable = votableLotsFor(ctx, access.participant.contactId);
      const plans = planAttendanceForContact(access.participant.contactId, votable, ctx.attendances);

      for (const plan of plans) {
        const data = {
          status: plan.status,
          mode: 'ONLINE' as const,
          attendeeContactId: plan.attendeeContactId,
          representedByContactId: plan.representedByContactId,
          recordedBy: 'SELF' as const,
          recordedByUserId: null
        };
        await tx.gMAttendance.upsert({
          where: { meetingId_lotId: { meetingId: meeting.id, lotId: plan.lotId } },
          update: data,
          create: { tenantId, meetingId: meeting.id, lotId: plan.lotId, ...data }
        });
      }
      emarged = plans.map(plan => plan.lotId);

      const current = await tx.gMParticipant.findFirst({
        where: { id: access.participant.id, tenantId },
        select: { joinedAt: true }
      });
      const now = new Date();
      newlyJoined = !current?.joinedAt;
      await tx.gMParticipant.updateMany({
        where: { id: access.participant.id, tenantId },
        data: { ...(newlyJoined ? { joinedAt: now } : {}), lastSeenAt: now }
      });

      if (plans.length > 0) {
        await recomputeMeetingResultsTx(tx, meeting.syndicateId, meeting.id, meeting.scheduledAt);
      }
    });

    if (newlyJoined || emarged.length > 0) {
      logAuditEvent({
        actorUserId: null,
        tenantId,
        actionKey: AuditActionKey.SYNDIC_MEETING_JOINED,
        entityType: 'GMParticipant',
        entityId: access.participant.id,
        payload: {
          meetingId: access.participant.meetingId,
          participantId: access.participant.id,
          contactId: access.participant.contactId,
          lotIds: emarged
        }
      });
    }

    return readView(access);
  });
}

export interface PublicVoteInput {
  resolutionId: string;
  votes: Array<{ lotId: string; vote: 'FOR' | 'AGAINST' | 'ABSTAIN' }>;
}

/**
 * POST /voter. Tout ou rien : un lot qui n'est pas votable par ce contact (ou
 * d'une autre agence) rejette la demande entiere avec la meme 404 qu'un lot
 * inexistant ; AG non en cours ou resolution non ouverte = 409.
 */
export async function castPublicVotes(token: string, input: PublicVoteInput): Promise<LiveMeetingPublicView> {
  return withAccess(token, async access => {
    const tenantId = access.link.tenantId;
    const contactId = access.participant.contactId;
    // Dernier choix par lot si la demande en repete un.
    const choices = new Map(input.votes.map(entry => [entry.lotId, entry.vote]));
    const castEvents: Array<{ lotId: string; source: string }> = [];

    await prisma.$transaction(async tx => {
      await lockMeetingTx(tx, access.participant.meetingId);
      const meeting = await loadMeetingBaseById(tx, tenantId, access.participant.meetingId);

      const participant = await tx.gMParticipant.findFirst({
        where: { id: access.participant.id, tenantId },
        select: { joinedAt: true }
      });
      if (!participant) throw invalidSecureLinkError();

      if (meeting.status !== 'IN_PROGRESS') {
        throw new ConflictError(t("L'assemblée n'est pas en cours : le vote est fermé"));
      }
      if (!participant.joinedAt) {
        throw new ConflictError(t("Rejoignez l'assemblée avant de voter"));
      }

      const resolution = await tx.gMResolution.findFirst({
        where: { id: input.resolutionId, meetingId: meeting.id },
        select: { id: true, voteStatus: true }
      });
      if (!resolution) throw new NotFoundError(t('Résolution introuvable ou inaccessible'));
      if (resolution.voteStatus !== 'OPEN') {
        throw new ConflictError(t("Le vote de cette résolution n'est pas ouvert"));
      }

      const ctx = await loadLiveContext(tx, tenantId, meeting);
      const votable = votableLotsFor(ctx, contactId);
      const votableByLot = new Map(votable.map(entry => [entry.lotId, entry]));
      for (const lotId of choices.keys()) {
        if (!votableByLot.has(lotId)) throw new NotFoundError(t('Lot introuvable ou inaccessible'));
      }

      // Un vote existant n'est pas toujours remplacable (decision D6) : le
      // syndic garde la main sur ce qu'il a saisi, et un mandataire ne remplace
      // pas le vote que le coproprietaire a donne lui-meme. Tout ou rien.
      const existingVotes = await tx.gMVote.findMany({
        where: { resolutionId: resolution.id, lotId: { in: [...choices.keys()] } },
        select: { lotId: true, source: true, castByContactId: true }
      });
      for (const existing of existingVotes) {
        if (existing.source === 'MANAGER') {
          throw new ConflictError(
            t('Le vote de ce lot a été enregistré par le syndic : adressez-vous à lui pour le modifier.')
          );
        }
        if (existing.source === 'CO_OWNER' && votableByLot.get(existing.lotId)?.role === 'PROXY') {
          throw new ConflictError(
            t(
              'Le copropriétaire de ce lot a déjà voté lui-même : son vote ne peut pas être remplacé par son mandataire.'
            )
          );
        }
      }

      for (const [lotId, vote] of choices) {
        const entry = votableByLot.get(lotId)!;
        const source = voteSourceForRole(entry.role);
        await tx.gMVote.upsert({
          where: { resolutionId_lotId: { resolutionId: resolution.id, lotId } },
          update: { vote, source, castByContactId: contactId, castByUserId: null },
          create: { resolutionId: resolution.id, lotId, vote, source, castByContactId: contactId }
        });
        castEvents.push({ lotId, source });
      }

      // Un lot qui vote est present : emargement cree si besoin, jamais retrograde.
      const plans = planAttendanceForContact(
        contactId,
        votable.filter(entry => choices.has(entry.lotId)),
        ctx.attendances
      );
      for (const plan of plans) {
        const data = {
          status: plan.status,
          mode: 'ONLINE' as const,
          attendeeContactId: plan.attendeeContactId,
          representedByContactId: plan.representedByContactId,
          recordedBy: 'SELF' as const,
          recordedByUserId: null
        };
        await tx.gMAttendance.upsert({
          where: { meetingId_lotId: { meetingId: meeting.id, lotId: plan.lotId } },
          update: data,
          create: { tenantId, meetingId: meeting.id, lotId: plan.lotId, ...data }
        });
      }

      await recomputeMeetingResultsTx(tx, meeting.syndicateId, meeting.id, meeting.scheduledAt);
    });

    // Le sens du vote n'entre jamais dans l'audit.
    for (const event of castEvents) {
      logAuditEvent({
        actorUserId: null,
        tenantId,
        actionKey: AuditActionKey.SYNDIC_MEETING_VOTE_CAST,
        entityType: 'GMResolution',
        entityId: input.resolutionId,
        payload: {
          meetingId: access.participant.meetingId,
          resolutionId: input.resolutionId,
          lotId: event.lotId,
          source: event.source,
          contactId
        }
      });
    }

    return readView(access);
  });
}
