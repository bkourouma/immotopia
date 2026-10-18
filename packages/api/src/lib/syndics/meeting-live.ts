import { prisma, type PrismaTransactionClient } from '../../utils/database';
import { ConflictError, NotFoundError } from '../../middleware/error-middleware';
import { t } from '../../i18n';
import { logAuditEvent } from '../../services/audit-service';
import { AuditActionKey } from '../../types/audit-types';
import { assertBelongsToTenant } from '../../utils/tenant-ownership';
import { computeMeetingAttendance, computeResolutionTally, normalizeMajorityRule } from './meeting-majority';
import { lockMeetingTx, recomputeMeetingResultsTx } from './meeting-results';
import {
  canCloseVote,
  canOpenVote,
  isMeetingFrozen,
  isOnline,
  type LiveAttendanceMode,
  type LiveAttendanceStatus
} from './meeting-live-rules';
import {
  loadContactNames,
  loadLiveContext,
  loadMeetingBase,
  votableLotsFor,
  type LiveContext,
  type LiveMeetingBase
} from './meeting-live-context';
import { notifyVisioRefresh } from './meeting-visio';

/**
 * AG en direct, cote gestionnaire (spec 043) : vue de la console, emargement,
 * ouverture et cloture du vote de chaque resolution.
 *
 * Toute ecriture se fait dans une transaction qui prend d'abord le verrou de
 * l'assemblee (`lockMeetingTx`) : un vote, un emargement et une cloture
 * simultanes ne perdent aucun ecrit dans les compteurs stockes.
 */

export interface LiveMeetingAdminView {
  meeting: {
    id: string;
    type: string;
    status: string;
    scheduledAt: Date;
    startTime: Date | null;
    endTime: Date | null;
    location: string | null;
    videoConferenceUrl: string | null;
    syndicate: { id: string; name: string };
  };
  attendance: ReturnType<typeof computeMeetingAttendance>;
  lots: Array<{
    lotId: string;
    lotNumber: string;
    generalShares: number;
    voters: Array<{ contactId: string; name: string }>;
    attendance: null | {
      status: LiveAttendanceStatus;
      mode: LiveAttendanceMode;
      recordedBy: 'SELF' | 'MANAGER';
      attendeeContactId: string | null;
      attendeeName: string | null;
      representedByContactId: string | null;
      representedByName: string | null;
      updatedAt: Date;
    };
    online: boolean;
  }>;
  resolutions: Array<{
    id: string;
    title: string;
    description: string | null;
    majorityRule: string;
    voteStatus: 'PENDING' | 'OPEN' | 'CLOSED';
    voteOpenedAt: Date | null;
    voteClosedAt: Date | null;
    ballotCount: number;
    tally: ReturnType<typeof computeResolutionTally>;
    votes: Array<{
      lotId: string;
      vote: string;
      source: string;
      castByContactId: string | null;
      updatedAt: Date;
    }>;
  }>;
  participants: { invited: number; joined: number; online: number };
  serverTime: string;
}

function voterName(voter: { firstName: string | null; lastName: string | null; legalName: string | null }): string {
  return voter.legalName?.trim() || [voter.firstName, voter.lastName].filter(Boolean).join(' ').trim();
}

export async function buildAdminView(
  client: PrismaTransactionClient,
  tenantId: string,
  ctx: LiveContext,
  now: Date = new Date()
): Promise<LiveMeetingAdminView> {
  const { meeting } = ctx;
  const allVotes = ctx.resolutions.flatMap(resolution => resolution.votes);
  const attendance = computeMeetingAttendance(ctx.majorityLots, allVotes, ctx.attendances);

  const names = await loadContactNames(
    client,
    tenantId,
    ctx.attendances.flatMap(row => [row.attendeeContactId, row.representedByContactId])
  );

  // Un lot est « en ligne » si un participant qui peut le voter a ete vu il y a moins de 30 s.
  const onlineParticipants = ctx.participants.filter(participant => isOnline(participant.lastSeenAt, now));
  const onlineLotIds = new Set<string>();
  for (const participant of onlineParticipants) {
    for (const lot of votableLotsFor(ctx, participant.contactId)) onlineLotIds.add(lot.lotId);
  }

  const attendanceByLot = new Map(ctx.attendances.map(row => [row.lotId, row]));
  const knownLotIds = new Set(ctx.lots.map(lot => lot.id));

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
      syndicate: { id: meeting.syndicate.id, name: meeting.syndicate.name }
    },
    attendance,
    lots: ctx.lots.map(lot => {
      const row = attendanceByLot.get(lot.id);
      return {
        lotId: lot.id,
        lotNumber: lot.lotNumber,
        generalShares: lot.generalShares,
        voters: lot.voters.map(voter => ({ contactId: voter.contactId, name: voterName(voter) })),
        attendance: row
          ? {
              status: row.status,
              mode: row.mode,
              recordedBy: row.recordedBy,
              attendeeContactId: row.attendeeContactId,
              attendeeName: row.attendeeContactId ? (names.get(row.attendeeContactId) ?? null) : null,
              representedByContactId: row.representedByContactId,
              representedByName: row.representedByContactId ? (names.get(row.representedByContactId) ?? null) : null,
              updatedAt: row.updatedAt
            }
          : null,
        online: onlineLotIds.has(lot.id)
      };
    }),
    resolutions: ctx.resolutions.map(resolution => ({
      id: resolution.id,
      title: resolution.title,
      description: resolution.description,
      majorityRule: normalizeMajorityRule(resolution.majorityRule),
      voteStatus: resolution.voteStatus,
      voteOpenedAt: resolution.voteOpenedAt,
      voteClosedAt: resolution.voteClosedAt,
      ballotCount: resolution.votes.filter(vote => knownLotIds.has(vote.lotId)).length,
      tally: computeResolutionTally(resolution.majorityRule, ctx.majorityLots, resolution.votes),
      votes: resolution.votes.map(vote => ({
        lotId: vote.lotId,
        vote: vote.vote,
        source: vote.source,
        castByContactId: vote.castByContactId,
        updatedAt: vote.updatedAt
      }))
    })),
    participants: {
      invited: ctx.participants.length,
      joined: ctx.participants.filter(participant => participant.joinedAt).length,
      online: onlineParticipants.length
    },
    serverTime: now.toISOString()
  };
}

/** GET /direct : vue de la console. */
export async function getLiveAdminView(
  tenantId: string,
  syndicateId: string,
  meetingId: string
): Promise<LiveMeetingAdminView> {
  const meeting = await loadMeetingBase(prisma, tenantId, syndicateId, meetingId);
  const ctx = await loadLiveContext(prisma, tenantId, meeting);
  return buildAdminView(prisma, tenantId, ctx);
}

async function readAdminView(tenantId: string, syndicateId: string, meetingId: string) {
  // Relu apres la validation de la transaction (le client global ne voit pas l'ecriture en cours).
  return getLiveAdminView(tenantId, syndicateId, meetingId);
}

function assertAttendanceWritable(meeting: LiveMeetingBase): void {
  if (!isMeetingFrozen(meeting.status)) return;
  throw new ConflictError(
    meeting.status === 'COMPLETED'
      ? t('Assemblée clôturée : les présences sont figées')
      : t('Assemblée annulée : les présences ne peuvent plus être modifiées')
  );
}

export interface SetAttendanceInput {
  lotIds: string[];
  status: LiveAttendanceStatus;
  mode?: LiveAttendanceMode;
  representedByContactId?: string | null;
}

/**
 * Emargement par le gestionnaire (un lot ou plusieurs). Cree ou remplace la
 * ligne de chaque lot ; `ABSENT` garde la ligne (le lot sort du quorum s'il
 * n'a pas vote). Un lot ou un contact d'une autre agence = 404.
 */
export async function setLotAttendances(
  tenantId: string,
  syndicateId: string,
  meetingId: string,
  actorUserId: string | null,
  input: SetAttendanceInput
): Promise<LiveMeetingAdminView> {
  const lotIds = Array.from(new Set(input.lotIds));

  await prisma.$transaction(async tx => {
    const meeting = await loadMeetingBase(tx, tenantId, syndicateId, meetingId);
    await lockMeetingTx(tx, meeting.id);
    assertAttendanceWritable(meeting);

    const lots = await tx.syndicateLot.findMany({
      where: { id: { in: lotIds }, syndicateId, syndicate: { tenantId } },
      select: { id: true }
    });
    if (lots.length !== lotIds.length) {
      throw new NotFoundError(t('Lot introuvable ou inaccessible'));
    }

    const representedBy = input.status === 'REPRESENTED' ? (input.representedByContactId ?? null) : null;
    if (representedBy) {
      await assertBelongsToTenant(tx, 'crmContact', representedBy, tenantId, {
        message: t('Contact introuvable ou inaccessible')
      });
    }

    const ctx = await loadLiveContext(tx, tenantId, meeting);
    const votersByLot = new Map(ctx.lots.map(lot => [lot.id, lot.voters]));
    const mode: LiveAttendanceMode = input.mode ?? 'IN_PERSON';

    for (const lotId of lotIds) {
      const attendeeContactId =
        input.status === 'ABSENT'
          ? null
          : input.status === 'REPRESENTED'
            ? representedBy
            : (votersByLot.get(lotId)?.[0]?.contactId ?? null);
      const data = {
        status: input.status,
        mode,
        attendeeContactId,
        representedByContactId: representedBy,
        recordedBy: 'MANAGER' as const,
        recordedByUserId: actorUserId
      };
      await tx.gMAttendance.upsert({
        where: { meetingId_lotId: { meetingId: meeting.id, lotId } },
        update: data,
        create: { tenantId, meetingId: meeting.id, lotId, ...data }
      });
    }

    await recomputeMeetingResultsTx(tx, syndicateId, meeting.id, meeting.scheduledAt);
  });

  logAuditEvent({
    actorUserId,
    tenantId,
    actionKey: AuditActionKey.SYNDIC_MEETING_ATTENDANCE_SET,
    entityType: 'GeneralMeeting',
    entityId: meetingId,
    payload: { meetingId, lotIds, status: input.status, mode: input.mode ?? 'IN_PERSON' }
  });

  return readAdminView(tenantId, syndicateId, meetingId);
}

type VoteTransition = 'OPEN' | 'CLOSE';

async function transitionVote(
  tenantId: string,
  syndicateId: string,
  meetingId: string,
  resolutionId: string,
  actorUserId: string | null,
  transition: VoteTransition
): Promise<LiveMeetingAdminView> {
  await prisma.$transaction(async tx => {
    const meeting = await loadMeetingBase(tx, tenantId, syndicateId, meetingId);
    await lockMeetingTx(tx, meeting.id);

    const resolution = await tx.gMResolution.findFirst({
      where: { id: resolutionId, meetingId: meeting.id },
      select: { id: true, voteStatus: true }
    });
    if (!resolution) throw new NotFoundError(t('Résolution introuvable ou inaccessible'));

    if (meeting.status !== 'IN_PROGRESS') {
      throw new ConflictError(
        meeting.status === 'PLANNED'
          ? t("La séance n'est pas ouverte : ouvrez-la avant de gérer les votes")
          : t('Assemblée clôturée ou annulée : les votes ne peuvent plus être ouverts ni clos')
      );
    }

    if (transition === 'OPEN') {
      if (!canOpenVote(resolution.voteStatus)) {
        throw new ConflictError(t('Le vote de cette résolution est déjà ouvert'));
      }
      await tx.gMResolution.update({
        where: { id: resolution.id },
        data: { voteStatus: 'OPEN', voteOpenedAt: new Date(), voteClosedAt: null }
      });
    } else {
      if (!canCloseVote(resolution.voteStatus)) {
        throw new ConflictError(t("Le vote de cette résolution n'est pas ouvert"));
      }
      await tx.gMResolution.update({
        where: { id: resolution.id },
        data: { voteStatus: 'CLOSED', voteClosedAt: new Date() }
      });
    }
  });

  logAuditEvent({
    actorUserId,
    tenantId,
    actionKey:
      transition === 'OPEN' ? AuditActionKey.SYNDIC_MEETING_VOTE_OPENED : AuditActionKey.SYNDIC_MEETING_VOTE_CLOSED,
    entityType: 'GMResolution',
    entityId: resolutionId,
    payload: { meetingId, resolutionId }
  });

  // Spec 045 : la salle relit l'etat (au mieux, apres la transaction).
  notifyVisioRefresh(tenantId, meetingId);

  return readAdminView(tenantId, syndicateId, meetingId);
}

export function openResolutionVote(
  tenantId: string,
  syndicateId: string,
  meetingId: string,
  resolutionId: string,
  actorUserId: string | null
) {
  return transitionVote(tenantId, syndicateId, meetingId, resolutionId, actorUserId, 'OPEN');
}

export function closeResolutionVote(
  tenantId: string,
  syndicateId: string,
  meetingId: string,
  resolutionId: string,
  actorUserId: string | null
) {
  return transitionVote(tenantId, syndicateId, meetingId, resolutionId, actorUserId, 'CLOSE');
}
