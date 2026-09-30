/**
 * Loyer EFFECTIF d'un bail à une date : fonction unique et pure.
 *
 * Une révision a une date d'effet. Avant cette date, le loyer du bail est
 * l'ancien ; à partir d'elle, le nouveau. Les lecteurs (échéances générées,
 * campagne de facturation, agrégats) passent par cette fonction plutôt que de
 * lire `rent_amount` à l'aveugle.
 *
 * `lease.rent_amount` reste le loyer EN VIGUEUR (il ne change qu'à la date
 * d'effet, voir `applyDueRevisions`) ; les révisions planifiées le prolongent
 * pour les dates futures, et `previousRent` de la plus ancienne révision
 * ultérieure donne le loyer d'une date antérieure à toutes les révisions.
 */

export interface RentRevision {
  effectiveDate: Date | string;
  newRent: unknown;
  newCharges?: unknown;
  previousRent?: unknown;
  previousCharges?: unknown;
}

const asNumber = (value: unknown): number | null => (value === null || value === undefined ? null : Number(value));

export function effectiveRentAt(
  lease: { rent_amount: unknown; service_charge_amount: unknown },
  revisions: RentRevision[] | null | undefined,
  date: Date
): { rent: number; charges: number } {
  const sorted = (revisions ?? [])
    .filter(revision => asNumber(revision.newRent) !== null)
    .map(revision => ({ ...revision, at: new Date(revision.effectiveDate).getTime() }))
    .sort((a, b) => a.at - b.at);

  const courant = { rent: Number(lease.rent_amount), charges: Number(lease.service_charge_amount ?? 0) };
  if (sorted.length === 0) return courant;

  const applicables = sorted.filter(revision => revision.at <= date.getTime());
  const derniere = applicables[applicables.length - 1];
  if (derniere) {
    return {
      rent: asNumber(derniere.newRent) ?? courant.rent,
      charges: asNumber(derniere.newCharges) ?? courant.charges
    };
  }

  // Avant toute révision : le loyer d'avant la plus ancienne.
  const premiere = sorted[0];
  return {
    rent: asNumber(premiere.previousRent) ?? courant.rent,
    charges: asNumber(premiere.previousCharges) ?? courant.charges
  };
}

/** Le bail avec les montants effectifs à `date` (les autres champs sont inchangés). */
export function withEffectiveAmounts<T extends { rent_amount: unknown; service_charge_amount: unknown }>(
  lease: T,
  revisions: RentRevision[] | null | undefined,
  date: Date
): T {
  const { rent, charges } = effectiveRentAt(lease, revisions, date);
  return { ...lease, rent_amount: rent, service_charge_amount: charges };
}
