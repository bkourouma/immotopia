/**
 * Historique des propriétaires d'un lot : règle UNIQUE de « borne de visibilité »
 * du portail copropriétaire et de refus OWNER_CHANGED du lien de paiement
 * (lot P, décision du 18/10). Réexportée par `coowner-portal.ts`.
 *
 * Le portail masquait tout ce qui précède `LotOwnerProfile.ownedSince` pour ne
 * pas montrer l'historique d'un ANCIEN propriétaire (audit S5). Mais quand le
 * syndic saisit ses copropriétaires sur une copropriété existante, `ownedSince`
 * vaut « aujourd'hui » et le copropriétaire ne voyait plus ses propres appels.
 *
 * Un « ancien propriétaire » est un profil d'un AUTRE contact (hors contacts du
 * compte) dont la propriété a pris fin avant ou au début du profil courant :
 *   - `ownedUntil` renseigné, au plus tard le jour (UTC) où commence le profil
 *     courant ; ou
 *   - profil inactif (clos sans date de fin) ayant commencé avant lui.
 * Un co-indivisaire encore propriétaire en même temps (profil actif non clos
 * qui chevauche) n'est PAS un ancien propriétaire, même s'il a commencé avant.
 *
 * S'il y a un ancien propriétaire, la borne de visibilité est le début du profil
 * courant ; sinon il n'y a pas de borne (`null`) : tout l'historique du lot est
 * visible, payable et déclarable.
 *
 * Fonctions pures, sans accès base : l'appelant fournit tous les profils du lot,
 * actifs ou non (la fiche d'un ancien propriétaire peut avoir été désactivée).
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** Jour calendaire UTC d'une date (les dates de détention sont des dates de jour). */
export function utcDayNumber(date: Date): number {
  return Math.floor(date.getTime() / DAY_MS);
}

export interface LotOwnerProfileHistoryRow {
  contactId: string;
  ownedSince: Date;
  ownedUntil: Date | null;
  isActive: boolean;
}

/** La propriété décrite par `profile` a-t-elle pris fin avant ou au début du jour `ownedSince` ? */
function endedByStartOf(profile: LotOwnerProfileHistoryRow, ownedSince: Date): boolean {
  const since = utcDayNumber(ownedSince);
  if (profile.ownedUntil && utcDayNumber(profile.ownedUntil) <= since) return true;
  return !profile.isActive && utcDayNumber(profile.ownedSince) < since;
}

/**
 * Existe-t-il un ancien propriétaire (autre contact que `ownContactIds`, propriété
 * terminée avant ou au début de `ownedSince`) ? Voir l'en-tête du fichier.
 */
export function hasPreviousOtherOwner(
  ownedSince: Date,
  ownContactIds: Iterable<string>,
  lotProfiles: LotOwnerProfileHistoryRow[]
): boolean {
  const own = new Set(ownContactIds);
  return lotProfiles.some(profile => !own.has(profile.contactId) && endedByStartOf(profile, ownedSince));
}

/**
 * Borne de visibilité du portail pour un lot : `ownedSince` s'il y a eu un ancien
 * propriétaire, sinon `null` (aucune borne).
 */
export function resolveVisibleSince(
  ownedSince: Date,
  ownContactIds: Iterable<string>,
  lotProfiles: LotOwnerProfileHistoryRow[]
): Date | null {
  return hasPreviousOtherOwner(ownedSince, ownContactIds, lotProfiles) ? ownedSince : null;
}
