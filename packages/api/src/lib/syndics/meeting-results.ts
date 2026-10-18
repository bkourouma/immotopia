import type { PrismaTransactionClient } from '../../utils/database';
import { computeMeetingAttendance, computeResolutionTally } from './meeting-majority';
import { loadMeetingLots } from './meeting-lots';

/**
 * Verrou de l'assemblee (spec 043) : toute transaction qui ecrit un vote, un
 * emargement ou un etat de vote le prend avant de recalculer, pour que les
 * compteurs stockes ne perdent aucun ecrit simultane. Verrou consultatif
 * Postgres, libere a la fin de la transaction.
 */
export async function lockMeetingTx(tx: PrismaTransactionClient, meetingId: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${meetingId}))`;
}

/**
 * Recalcule les compteurs et le resultat de chaque resolution de l'assemblee,
 * puis le quorum (tantiemes presents ou representes / tantiemes totaux : lots
 * emarges PRESENT ou REPRESENTED, ou ayant vote). A appeler sous le verrou de
 * l'assemblee.
 *
 * Le resultat stocke suit la meme regle que la lecture (`getMeetingByTenant`) —
 * le votant d'un lot est son proprietaire a la date de l'AG (`scheduledAt`),
 * fournie par l'appelant pour eviter une lecture redondante.
 */
export async function recomputeMeetingResultsTx(
  tx: PrismaTransactionClient,
  syndicateId: string,
  meetingId: string,
  scheduledAt: Date
) {
  const { majorityLots } = await loadMeetingLots(tx, syndicateId, scheduledAt);
  const resolutions = await tx.gMResolution.findMany({
    where: { meetingId },
    select: { id: true, majorityRule: true, votes: { select: { lotId: true, vote: true } } }
  });
  const attendances = await tx.gMAttendance.findMany({
    where: { meetingId },
    select: { lotId: true, status: true, mode: true }
  });

  for (const resolution of resolutions) {
    const tally = computeResolutionTally(resolution.majorityRule, majorityLots, resolution.votes, attendances);
    await tx.gMResolution.update({
      where: { id: resolution.id },
      data: {
        result: tally.result,
        votesFor: tally.votesFor,
        votesAgainst: tally.votesAgainst,
        votesAbstain: tally.votesAbstain,
        sharesFor: tally.sharesFor
      }
    });
  }

  const attendance = computeMeetingAttendance(
    majorityLots,
    resolutions.flatMap(resolution => resolution.votes),
    attendances
  );
  await tx.generalMeeting.update({
    where: { id: meetingId },
    data: { quorum: attendance.quorumPercent }
  });
  return attendance;
}
