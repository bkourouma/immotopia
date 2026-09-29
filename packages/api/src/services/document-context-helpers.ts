/**
 * Aides pures des contextes de documents (quittance, releve de compte).
 *
 * Le moteur de rendu (`docx-renderer`) remplace toute valeur vide par le champ
 * en clair (`{{NOM}}`) : une donnee absente doit donc devenir un texte lisible
 * (`NON_RENSEIGNE`), jamais une chaine vide.
 */

/** Texte lisible pour une donnee optionnelle absente. */
export const NON_RENSEIGNE = '—';

/** La valeur nettoyee, ou « — » si elle est absente ou vide. */
export function orDash(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return NON_RENSEIGNE;
  const text = String(value).trim();
  return text === '' ? NON_RENSEIGNE : text;
}

const PROPERTY_TYPE_LABELS: Record<string, string> = {
  APPARTEMENT: 'Appartement',
  MAISON_VILLA: 'Maison / Villa',
  STUDIO: 'Studio',
  DUPLEX_TRIPLEX: 'Duplex / Triplex',
  CHAMBRE_COLOCATION: 'Chambre en colocation',
  BUREAU: 'Bureau',
  BOUTIQUE_COMMERCIAL: 'Boutique / Local commercial',
  ENTREPOT_INDUSTRIEL: 'Entrepôt / Local industriel',
  TERRAIN: 'Terrain',
  IMMEUBLE: 'Immeuble',
  PARKING_BOX: 'Parking / Box',
  LOT_PROGRAMME_NEUF: 'Lot de programme neuf'
};

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  CASH: 'Espèces',
  BANK_TRANSFER: 'Virement bancaire',
  CHECK: 'Chèque',
  MOBILE_MONEY: 'Mobile Money',
  CARD: 'Carte bancaire',
  OTHER: 'Autre'
};

function humanizeEnum(value: string): string {
  const text = value.replace(/_/g, ' ').toLowerCase();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Libelle francais d'un type de bien (`MAISON_VILLA` -> « Maison / Villa »). */
export function propertyTypeLabel(type: string | null | undefined): string {
  if (!type) return NON_RENSEIGNE;
  return PROPERTY_TYPE_LABELS[type] || humanizeEnum(type);
}

/** Libelle francais d'un moyen de paiement (`BANK_TRANSFER` -> « Virement bancaire »). */
export function paymentMethodLabel(method: string | null | undefined): string {
  if (!method) return NON_RENSEIGNE;
  return PAYMENT_METHOD_LABELS[method] || humanizeEnum(method);
}

const MONTHS_FR = [
  'janvier',
  'février',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'août',
  'septembre',
  'octobre',
  'novembre',
  'décembre'
];

/** « juin 2026 » a partir du mois (1-12) et de l'annee ; « — » si invalide. */
export function monthLabel(month: number | null | undefined, year: number | null | undefined): string {
  if (!month || !year || month < 1 || month > 12) return NON_RENSEIGNE;
  return `${MONTHS_FR[month - 1]} ${year}`;
}

/** Une periode (« juin 2026 ») ou une plage (« avril 2026 à juin 2026 »). */
export function periodRangeLabel(periods: Array<{ month: number; year: number }>): string {
  if (periods.length === 0) return NON_RENSEIGNE;
  const sorted = [...periods].sort((a, b) => a.year * 12 + a.month - (b.year * 12 + b.month));
  const first = monthLabel(sorted[0].month, sorted[0].year);
  const last = sorted[sorted.length - 1];
  const lastLabel = monthLabel(last.month, last.year);
  return first === lastLabel ? first : `${first} à ${lastLabel}`;
}

export interface InstallmentDue {
  rent: number;
  /** Charges de service et autres frais. */
  charges: number;
  penalties: number;
}

export interface PaymentBreakdown {
  rent: number;
  charges: number;
  penalties: number;
  total: number;
}

/**
 * Ventile un paiement sur les composantes de l'echeance : loyer, puis charges,
 * puis penalites, chacune plafonnee a son montant du (un paiement partiel
 * remplit donc d'abord le loyer). Ce qui excede une echeance, et la part du
 * paiement non affectee a une echeance (`unallocated`), sont ajoutes au loyer :
 * le total est toujours la somme exacte des montants affectes.
 */
export function breakdownPayment(
  parts: Array<{ due: InstallmentDue; allocated: number }>,
  unallocated = 0
): PaymentBreakdown {
  let rent = 0;
  let charges = 0;
  let penalties = 0;

  for (const { due, allocated } of parts) {
    let remaining = Math.max(0, allocated);
    const rentPart = Math.min(remaining, due.rent);
    remaining -= rentPart;
    const chargesPart = Math.min(remaining, due.charges);
    remaining -= chargesPart;
    const penaltiesPart = Math.min(remaining, due.penalties);
    remaining -= penaltiesPart;
    rent += rentPart + remaining;
    charges += chargesPart;
    penalties += penaltiesPart;
  }

  rent += Math.max(0, unallocated);
  return { rent, charges, penalties, total: rent + charges + penalties };
}
