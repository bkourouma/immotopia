/**
 * Proprietaire d'un lot de copropriete : UNE seule regle de resolution, lue par
 * l'affichage (liste des lots), le compte du lot et le recouvrement
 * (BUG-2026-09-30-087).
 *
 * La source de verite est l'ensemble des profils proprietaires ACTUELS du lot
 * (`LotOwnerProfile` actif, non termine) : indivision = plusieurs profils dont
 * les parts se partagent le lot. Le « proprietaire principal » — celui que
 * portent `SyndicateLot.ownerContactId`/`coownerId` (compte du lot, votes,
 * recouvrement) — est le profil de plus forte part ; a part egale, le plus
 * ancien (`ownedSince`), puis l'identifiant, pour un choix stable.
 */

import type { PrismaTransactionClient } from '../../utils/database';

export interface OwnerProfileLike {
  id: string;
  contactId: string;
  ownershipPercentage: number | string | { toString(): string };
  ownedSince: Date | string;
  ownedUntil?: Date | string | null;
  isActive: boolean;
  contact?: {
    firstName?: string | null;
    lastName?: string | null;
    legalName?: string | null;
    email?: string | null;
  } | null;
}

/** Profil qui compte : actif et non termine a la date donnee. */
export function isCurrentOwnerProfile(profile: OwnerProfileLike, now: Date = new Date()): boolean {
  if (!profile.isActive) return false;
  // Un profil futur (vente en cours) ne compte pas encore.
  if (new Date(profile.ownedSince).getTime() > now.getTime()) return false;
  if (!profile.ownedUntil) return true;
  return new Date(profile.ownedUntil).getTime() > now.getTime();
}

const percentageOf = (profile: OwnerProfileLike) => Math.round(Number(profile.ownershipPercentage.toString()) * 100);

/** Profils actuels, du plus grand au plus petit (tri stable : part, anciennete, identifiant). */
export function currentOwnerProfilesSorted<T extends OwnerProfileLike>(profiles: T[], now: Date = new Date()): T[] {
  return profiles
    .filter(profile => isCurrentOwnerProfile(profile, now))
    .sort(
      (a, b) =>
        percentageOf(b) - percentageOf(a) ||
        new Date(a.ownedSince).getTime() - new Date(b.ownedSince).getTime() ||
        a.id.localeCompare(b.id)
    );
}

export function pickPrimaryOwnerProfile<T extends OwnerProfileLike>(profiles: T[], now: Date = new Date()): T | null {
  return currentOwnerProfilesSorted(profiles, now)[0] ?? null;
}

export function ownerProfileName(profile: OwnerProfileLike): string {
  const contact = profile.contact;
  if (!contact) return profile.contactId;
  const name = [contact.firstName, contact.lastName].filter(Boolean).join(' ').trim();
  return name || contact.legalName || contact.email || profile.contactId;
}

/**
 * Libelle des proprietaires d'un lot : « Nom » pour un proprietaire unique a
 * 100 %, « Nom 1 (50 %), Nom 2 (50 %) » en indivision. Chaine vide sans profil.
 */
export function formatLotOwners<T extends OwnerProfileLike>(profiles: T[], now: Date = new Date()): string {
  const current = currentOwnerProfilesSorted(profiles, now);
  if (current.length === 0) return '';
  if (current.length === 1 && percentageOf(current[0]) >= 10000) return ownerProfileName(current[0]);
  return current
    .map(profile => `${ownerProfileName(profile)} (${Number((percentageOf(profile) / 100).toFixed(2))} %)`)
    .join(', ');
}

/** Proprietaires exposes par l'API sur chaque lot (liste, compte, recouvrement). */
export function presentLotOwners<T extends OwnerProfileLike>(profiles: T[], now: Date = new Date()) {
  const current = currentOwnerProfilesSorted(profiles, now);
  return {
    owners: current.map(profile => ({
      contactId: profile.contactId,
      name: ownerProfileName(profile),
      percentage: percentageOf(profile) / 100,
      ownedSince: profile.ownedSince
    })),
    ownersLabel: formatLotOwners(profiles, now)
  };
}

/**
 * Aligne le proprietaire du lot (`ownerContactId`, `coownerId`, `ownerSince`) sur
 * son proprietaire principal actuel. Sans profil actuel, le lot est laisse tel
 * quel (proprietaire saisi a la main ou importe). Renvoie l'identifiant du
 * contact retenu, ou null.
 */
export async function syncLotOwnerFromProfilesTx(tx: PrismaTransactionClient, lotId: string): Promise<string | null> {
  const profiles = await tx.lotOwnerProfile.findMany({
    where: { lotId },
    select: { id: true, contactId: true, ownershipPercentage: true, ownedSince: true, ownedUntil: true, isActive: true }
  });
  const primary = pickPrimaryOwnerProfile(profiles);
  if (!primary) return null;
  await tx.syndicateLot.update({
    where: { id: lotId },
    data: { ownerContactId: primary.contactId, coownerId: primary.contactId, ownerSince: new Date(primary.ownedSince) }
  });
  return primary.contactId;
}
