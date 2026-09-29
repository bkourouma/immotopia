/**
 * Votant d'un lot de copropriete a une date donnee — regle metier de l'AG.
 *
 * Le votant d'un lot est son PROPRIETAIRE A LA DATE DE L'ASSEMBLEE
 * (`GeneralMeeting.scheduledAt`), jamais le proprietaire actuel : un lot
 * vendu entre deux AG votait, a l'AG passee, par son ancien proprietaire. En
 * indivision, tous les indivisaires sont nommes, le plus gros detenteur
 * d'abord. Source : les `LotOwnerProfile` du lot (`contactId`,
 * `ownershipPercentage`, `ownedSince`, `ownedUntil`) — un profil couvre la
 * date si `ownedSince <= date < ownedUntil` (`ownedUntil` null = sans fin),
 * SANS filtrer sur `isActive` (un profil clos garde sa periode passee). Si
 * aucun profil ne couvre la date : repli sur le coproprietaire actuel du lot
 * (`owner`), sinon aucun votant.
 *
 * Fonctions pures : aucun acces base, pour etre testees seules. Inspiration :
 * l'ancienne copie frontend `components/syndics/meeting-voters.ts`
 * (`voterNameAt`) — le calcul vit desormais cote API, aux memes cotes que
 * `meeting-majority.ts` (tantiemes, resultat), pour que l'article 26 compte
 * les coproprietaires distincts A LA DATE de l'AG.
 */
import type { MajorityLot } from './meeting-majority';

export interface VoterContact {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  legalName?: string | null;
  email?: string | null;
}

export interface LotOwnerProfileForVoters {
  contactId: string;
  /** `Decimal` Prisma ou nombre : converti en `number` avant comparaison. */
  ownershipPercentage: number | string;
  ownedSince: Date | string;
  ownedUntil?: Date | string | null;
  contact: VoterContact;
}

export interface LotForVoters {
  id: string;
  coownerId?: string | null;
  ownerContactId?: string | null;
  owner?: VoterContact | null;
}

export interface Voter {
  contactId: string;
  firstName: string | null;
  lastName: string | null;
  legalName: string | null;
  email: string | null;
  ownershipPercentage: number;
}

function toVoter(contact: VoterContact, ownershipPercentage: number): Voter {
  return {
    contactId: contact.id,
    firstName: contact.firstName ?? null,
    lastName: contact.lastName ?? null,
    legalName: contact.legalName ?? null,
    email: contact.email ?? null,
    ownershipPercentage
  };
}

function voterName(voter: Voter): string {
  return voter.legalName?.trim() || [voter.firstName, voter.lastName].filter(Boolean).join(' ').trim();
}

function profileCoversDate(profile: LotOwnerProfileForVoters, at: number): boolean {
  const since = new Date(profile.ownedSince).getTime();
  const until = profile.ownedUntil ? new Date(profile.ownedUntil).getTime() : Infinity;
  return since <= at && at < until;
}

/**
 * Votants d'un lot a `date` : indivisaires actifs a cette date (part
 * decroissante, puis nom), ou repli sur le coproprietaire actuel
 * (`ownershipPercentage` 100) si aucun profil ne couvre la date, ou liste
 * vide si le lot n'a ni profil couvrant ni proprietaire actuel.
 */
export function votersAt(
  lot: LotForVoters,
  profiles: LotOwnerProfileForVoters[],
  date: Date | string | null | undefined
): Voter[] {
  const at = date ? new Date(date).getTime() : Date.now();

  const covering = profiles.filter(profile => profileCoversDate(profile, at));
  if (covering.length > 0) {
    return covering
      .map(profile => toVoter(profile.contact, Number(profile.ownershipPercentage)))
      .sort((a, b) => b.ownershipPercentage - a.ownershipPercentage || voterName(a).localeCompare(voterName(b), 'fr'));
  }

  if (lot.owner) {
    return [toVoter(lot.owner, 100)];
  }

  return [];
}

/**
 * Cle stable du « coproprietaire » d'un lot a la date : ids des votants
 * tries jointe par `+`. Sans votant, repli sur l'identite actuelle du lot
 * (`coownerId ?? ownerContactId ?? null`), pour que `ownerKeyOf`
 * (`meeting-majority.ts`) retombe sur son repli habituel (`lot:${id}`).
 */
export function voterKey(voters: Voter[], lot: LotForVoters): string | null {
  if (voters.length === 0) {
    return lot.coownerId ?? lot.ownerContactId ?? null;
  }
  return voters
    .map(voter => voter.contactId)
    .sort()
    .join('+');
}

export interface LotForMajorityAtDate extends LotForVoters {
  generalShares: number;
}

/**
 * Transforme des lots (avec leurs profils de propriete) en `MajorityLot[]`
 * dont `coownerId`/`ownerContactId` valent la cle du coproprietaire A LA
 * DATE de l'AG (`voterKey`), pour que l'article 26 (double majorite) compte
 * les coproprietaires distincts a cette date-la — deux lots d'un meme
 * proprietaire a l'epoque de l'AG comptent pour UN coproprietaire, meme s'ils
 * ont aujourd'hui deux proprietaires differents (ou l'inverse).
 */
export function toMajorityLotsAt(
  lots: LotForMajorityAtDate[],
  profilesByLotId: Map<string, LotOwnerProfileForVoters[]>,
  date: Date | string | null | undefined
): MajorityLot[] {
  return lots.map(lot => {
    const voters = votersAt(lot, profilesByLotId.get(lot.id) ?? [], date);
    const key = voterKey(voters, lot);
    return {
      id: lot.id,
      generalShares: lot.generalShares,
      coownerId: key,
      ownerContactId: key
    };
  });
}
