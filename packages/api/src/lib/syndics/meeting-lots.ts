import type { PrismaTransactionClient } from '../../utils/database';
import type { MajorityLot } from './meeting-majority';
import { toMajorityLotsAt, votersAt, type LotOwnerProfileForVoters, type Voter } from './meeting-voters';

/**
 * Lecture des lots d'une copropriete tels que l'assemblee les voit : tantiemes
 * et votants A LA DATE de l'AG (`votersAt`). Partage par la lecture du detail,
 * le recalcul des resultats et l'AG en direct (spec 043).
 */

/** Champs d'un contact CRM exposes dans une assemblee (mandant, mandataire). */
export const MEETING_CONTACT_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  legalName: true,
  email: true
} as const;

/**
 * Profils de propriete d'un lot, tels que necessaires a `votersAt` /
 * `toMajorityLotsAt` : `select` minimal — jamais `portalAccessToken` ni le
 * reste de `LotOwnerProfile` dans une reponse.
 */
export const LOT_OWNER_PROFILE_SELECT_FOR_VOTERS = {
  contactId: true,
  ownershipPercentage: true,
  ownedSince: true,
  ownedUntil: true,
  contact: { select: MEETING_CONTACT_SELECT }
} as const;

/**
 * `LotOwnerProfile.ownershipPercentage` est un `Prisma.Decimal` : converti en
 * `number` ici (frontiere Prisma), pour que `meeting-voters.ts` reste un
 * module pur sans dependance a Prisma.
 */
export function normalizeOwnerProfilesForVoters(
  profiles: Array<{
    contactId: string;
    ownershipPercentage: unknown;
    ownedSince: Date;
    ownedUntil: Date | null;
    contact: {
      id: string;
      firstName: string | null;
      lastName: string | null;
      legalName: string | null;
      email: string | null;
    };
  }>
): LotOwnerProfileForVoters[] {
  return profiles.map(profile => ({
    ...profile,
    ownershipPercentage: Number(profile.ownershipPercentage)
  }));
}

export interface MeetingLotsData {
  /** Lots tels que lus (sans `ownerProfiles`), avec leurs votants a la date. */
  lots: Array<{
    id: string;
    lotNumber: string;
    generalShares: number;
    voters: Voter[];
  }>;
  /** Lots pour le calcul de majorite (cle du coproprietaire a la date de l'AG). */
  majorityLots: MajorityLot[];
}

export async function loadMeetingLots(
  client: PrismaTransactionClient,
  syndicateId: string,
  scheduledAt: Date | string
): Promise<MeetingLotsData> {
  const rawLots = await client.syndicateLot.findMany({
    where: { syndicateId },
    select: {
      id: true,
      lotNumber: true,
      generalShares: true,
      coownerId: true,
      ownerContactId: true,
      owner: { select: MEETING_CONTACT_SELECT },
      ownerProfiles: { select: LOT_OWNER_PROFILE_SELECT_FOR_VOTERS }
    }
  });
  const profilesByLotId = new Map<string, LotOwnerProfileForVoters[]>(
    rawLots.map(lot => [lot.id, normalizeOwnerProfilesForVoters(lot.ownerProfiles ?? [])])
  );
  const majorityLots = toMajorityLotsAt(rawLots, profilesByLotId, scheduledAt);
  const lots = rawLots.map(lot => ({
    id: lot.id,
    lotNumber: lot.lotNumber,
    generalShares: lot.generalShares,
    voters: votersAt(lot, profilesByLotId.get(lot.id) ?? [], scheduledAt)
  }));
  return { lots, majorityLots };
}
