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

// ---------------------------------------------------------------------------
// Contrats de bail (habitation et commercial)
// ---------------------------------------------------------------------------

/**
 * Preavis du preneur par defaut, quand le bail n'en porte pas : le schema
 * `RentalLease` n'a aucune colonne de preavis. Valeurs validees par le metier
 * (3 mois en habitation, 6 mois en commercial) ; elles remplissent la clause de
 * resiliation du modele plutot que de laisser un champ vide dans un contrat.
 */
export const DEFAULT_NOTICE_HABITATION = '3 mois';
export const DEFAULT_NOTICE_COMMERCIAL = '6 mois';

const LEGAL_FORM_LABELS: Record<string, string> = {
  SARL: 'SARL',
  SA: 'SA',
  EI: 'Entreprise individuelle',
  EURL: 'EURL',
  SAS: 'SAS',
  ASSOCIATION: 'Association',
  OTHER: 'Autre'
};

const IDENTITY_DOCUMENT_LABELS: Record<string, string> = {
  CNI: 'CNI',
  PASSPORT: 'Passeport',
  DRIVING_LICENSE: 'Permis de conduire',
  OTHER: 'Pièce d’identité'
};

/** Forme juridique lisible (`EI` -> « Entreprise individuelle »). */
export function legalFormLabel(legalForm: string | null | undefined): string {
  if (!legalForm) return NON_RENSEIGNE;
  return LEGAL_FORM_LABELS[legalForm] || humanizeEnum(legalForm);
}

/** « CNI n° C0012345 » ; « — » sans numero. */
export function identityDocumentLabel(type: string | null | undefined, number: string | null | undefined): string {
  const digits = (number || '').trim();
  if (!digits) return NON_RENSEIGNE;
  const label = type ? IDENTITY_DOCUMENT_LABELS[type] || humanizeEnum(type) : '';
  return label ? `${label} n° ${digits}` : digits;
}

/** Les elements non vides, sans doublon, joints par `separator` ; « — » s'il n'en reste aucun. */
export function joinPresent(parts: Array<string | null | undefined>, separator = ', '): string {
  const kept: string[] = [];
  for (const part of parts) {
    const text = (part || '').trim();
    if (text && !kept.includes(text)) kept.push(text);
  }
  return kept.length > 0 ? kept.join(separator) : NON_RENSEIGNE;
}

/** Surface en m2, sans zeros inutiles (« 45,5 »), sans l'unite : le modele pose « m² ». */
export function formatSurface(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === '') return NON_RENSEIGNE;
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return NON_RENSEIGNE;
  return num.toLocaleString('fr-FR', { maximumFractionDigits: 2 });
}

function count(n: number, singular: string, pluralForm = `${singular}s`): string {
  return `${n} ${n > 1 ? pluralForm : singular}`;
}

/**
 * Duree d'un bail en mois lisibles : « 24 mois » pour un bail du 1er janvier
 * au 31 decembre (la date de fin est incluse). Un reste de jours est ajoute
 * (« 6 mois et 10 jours ») ; sans date de fin ou dates incoherentes : « — ».
 */
export function leaseDurationLabel(start: Date | null | undefined, end: Date | null | undefined): string {
  if (!start || !end) return NON_RENSEIGNE;
  const s = new Date(start);
  const e = new Date(end);
  if (isNaN(s.getTime()) || isNaN(e.getTime())) return NON_RENSEIGNE;

  // Bornes en jours pleins ; la date de fin est incluse dans le bail.
  const from = new Date(s.getFullYear(), s.getMonth(), s.getDate());
  const until = new Date(e.getFullYear(), e.getMonth(), e.getDate() + 1);
  if (until.getTime() <= from.getTime()) return NON_RENSEIGNE;

  let months = (until.getFullYear() - from.getFullYear()) * 12 + until.getMonth() - from.getMonth();
  if (until.getDate() < from.getDate()) months -= 1;
  months = Math.max(0, months);
  const anchor = new Date(from.getFullYear(), from.getMonth() + months, from.getDate());
  const days = Math.round((until.getTime() - anchor.getTime()) / 86400000);

  if (months === 0) return count(days, 'jour');
  return days > 0 ? `${count(months, 'mois', 'mois')} et ${count(days, 'jour')}` : count(months, 'mois', 'mois');
}

/**
 * Taux de penalite de retard, tel que le modele le lit (« fixees a X du
 * montant du loyer du ») : un pourcentage pour les modes en pourcentage
 * (`penalty_rate` est stocke en pourcentage : 2 = 2 %), le montant fixe
 * deja formate (avec devise) pour le mode `FIXED_AMOUNT`.
 */
export function penaltyRateLabel(
  mode: string | null | undefined,
  rate: number | string | null | undefined,
  fixedAmountText: string
): string {
  if (mode === 'FIXED_AMOUNT') return fixedAmountText;
  const num = Number(rate);
  if (!Number.isFinite(num)) return NON_RENSEIGNE;
  return `${num.toLocaleString('fr-FR', { maximumFractionDigits: 4 })} %`;
}

const FURNISHING_LABELS: Record<string, string> = {
  FURNISHED: 'Meublé',
  UNFURNISHED: 'Non meublé',
  PARTIALLY_FURNISHED: 'Partiellement meublé'
};

export interface EquipmentSource {
  rooms?: number | null;
  bedrooms?: number | null;
  bathrooms?: number | null;
  furnishingStatus?: string | null;
  typeSpecificData?: unknown;
}

/** Liste de textes d'un champ libre du bien (`equipments`, `amenities`, `features`), si c'est un tableau. */
function freeFormFeatures(data: unknown): string[] {
  if (!data || typeof data !== 'object') return [];
  const record = data as Record<string, unknown>;
  for (const key of ['equipments', 'equipements', 'amenities', 'features']) {
    const value = record[key];
    if (Array.isArray(value)) {
      return value.filter((v): v is string => typeof v === 'string' && v.trim() !== '');
    }
  }
  return [];
}

/**
 * Equipements et annexes d'un bien, d'apres ce que la fiche renseigne : nombre
 * de pieces, chambres, salles de bain, statut meuble, puis la liste libre
 * eventuelle du bien. « — » si la fiche ne dit rien.
 */
export function propertyEquipmentLabel(property: EquipmentSource | null | undefined): string {
  if (!property) return NON_RENSEIGNE;
  const parts: string[] = [];
  if (property.rooms) parts.push(count(property.rooms, 'pièce'));
  if (property.bedrooms) parts.push(count(property.bedrooms, 'chambre'));
  if (property.bathrooms) parts.push(count(property.bathrooms, 'salle de bain', 'salles de bain'));
  if (property.furnishingStatus) parts.push(FURNISHING_LABELS[property.furnishingStatus] || '');
  parts.push(...freeFormFeatures(property.typeSpecificData));
  return joinPresent(parts);
}
