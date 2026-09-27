import type { DocumentIssuer } from '../documents/document-branding';
import type { ChargeReceiptKind } from './charge-receipt-numbering';

/**
 * Données FIGÉES d'un reçu ou d'une quittance (lot S3), stockées dans
 * `SyndicChargeReceipt.snapshot` à l'émission. Tout ce que le document
 * affiche est ici : l'impression groupée et la reconstruction d'un PDF perdu
 * ne relisent jamais les tables vivantes (un copropriétaire qui change de nom,
 * un mandant qui change d'adresse ne modifient pas un original déjà émis).
 *
 * Seules les IMAGES (logo, signature, cachet) sont relues à l'impression.
 * Le snapshot note la clé de stockage de chacune à l'émission
 * (`issuerImages`) ; une image n'est apposée que si l'émetteur et la clé
 * actuels sont les mêmes (voir `brandingForSnapshot`,
 * `charge-receipt-delivery.ts`). Une clé est régénérée à chaque dépôt : une
 * signature remplacée depuis ne s'appose jamais sur un original plus ancien.
 */

export const CHARGE_RECEIPT_SNAPSHOT_VERSION = 1;

export interface SnapshotIssuer extends DocumentIssuer {
  /** Identifiant du mandant, ou `AGENCY`. */
  key: string;
}

export interface SnapshotPeriod {
  label: string | null;
  /** AAAA-MM-JJ ou `null` quand l'appel n'a pas de bornes structurées. */
  start: string | null;
  end: string | null;
}

/** Un règlement (paiement ou avance imputée) d'un appel soldé. */
export interface SnapshotSettlement {
  paidAt: string;
  method: string | null;
  reference: string | null;
  amount: number;
  source: 'PAYMENT' | 'ADVANCE';
}

/** Une affectation du paiement d'un reçu. */
export interface SnapshotAllocation {
  chargeCallId: string;
  period: SnapshotPeriod;
  callAmount: number;
  allocated: number;
  source: 'PAYMENT' | 'ADVANCE';
  /** Reste dû sur l'appel après ce paiement. */
  outstandingAfter: number;
}

/** Clés de stockage des images de l'émetteur au moment de l'émission (jamais exposées au client). */
export interface SnapshotIssuerImages {
  logo: string | null;
  signature: string | null;
  stamp: string | null;
}

export interface ChargeReceiptSnapshot {
  version: number;
  kind: ChargeReceiptKind;
  number: string;
  issuedAt: string;
  currency: string;
  /** Montant du document : l'appel soldé (quittance), le paiement (reçu). */
  amount: number;
  issuer: SnapshotIssuer;
  /** Absent d'un document émis avant ce champ : il sort alors sans image de l'émetteur. */
  issuerImages?: SnapshotIssuerImages;
  syndicate: {
    name: string;
    address: string | null;
    registrationNo: string | null;
    cadastralReference: string | null;
  };
  lot: { number: string; type: string; label: string | null };
  coowner: { name: string; address: string | null } | null;
  /** Quittance : l'appel soldé. */
  call: { id: string; period: SnapshotPeriod; amount: number; dueDate: string } | null;
  /** Quittance : règlements de l'appel, dans l'ordre. */
  settlements: SnapshotSettlement[];
  /** Quittance : date du dernier règlement. */
  settledAt: string | null;
  /** Reçu : le paiement. */
  payment: { id: string; amount: number; paidAt: string; method: string | null; reference: string | null } | null;
  /** Reçu : affectations de ce paiement (et de son avance imputée). */
  allocations: SnapshotAllocation[];
  /** Reçu : reste dû total sur les appels touchés par ce paiement. */
  outstandingAfter: number;
  /** Reçu : part du paiement restée en avance. */
  advance: number;
  /** Reçu : avance totale du lot après ce paiement. */
  lotAdvanceBalance: number;
  /**
   * Quittance créée par le rattrapage : contenu reconstitué, pas figé à
   * l'époque. Modes et références de paiement retirés (le payeur n'est pas
   * connu avec certitude) ; le copropriétaire est celui du jour du rattrapage.
   */
  backfilled: boolean;
}

/** Libellés des modes de paiement saisis par l'écran (`LotPaymentModal`). */
const METHOD_LABELS: Record<string, string> = {
  ESPECES: 'Espèces',
  CASH: 'Espèces',
  VIREMENT: 'Virement',
  CHEQUE: 'Chèque',
  MOBILE_MONEY: 'Mobile money',
  CARTE: 'Carte bancaire'
};

export function paymentMethodLabel(method: string | null | undefined): string | null {
  const trimmed = method?.trim();
  if (!trimmed) return null;
  return METHOD_LABELS[trimmed.toUpperCase()] ?? trimmed;
}

/** Nom affiché d'un contact CRM (personne ou société). */
export function contactDisplayName(
  contact: { firstName?: string | null; lastName?: string | null; legalName?: string | null } | null | undefined
): string | null {
  if (!contact) return null;
  const person = [contact.firstName, contact.lastName].filter(Boolean).join(' ').trim();
  return person || contact.legalName?.trim() || null;
}

const LOT_TYPE_LABELS: Record<string, string> = {
  APARTMENT: 'Appartement',
  PARKING: 'Parking',
  CELLAR: 'Cave',
  OFFICE: 'Bureau',
  COMMERCIAL: 'Local commercial',
  OTHER: 'Autre'
};

export function lotTypeLabel(type: string | null | undefined): string {
  return (type && LOT_TYPE_LABELS[type]) || type || '';
}

/** AAAA-MM-JJ d'une date (UTC) ; `null` pour une date absente. */
export function isoDay(value: Date | null | undefined): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

/** JJ/MM/AAAA d'une date AAAA-MM-JJ ou ISO (UTC). */
export function frenchDay(value: string | null | undefined): string {
  if (!value) return '';
  const [year, month, day] = value.slice(0, 10).split('-');
  return `${day}/${month}/${year}`;
}

/** Période lisible : libellé, et bornes quand elles le précisent. */
export function periodText(period: SnapshotPeriod | null | undefined): string {
  if (!period) return '';
  const bounds = period.start && period.end ? `du ${frenchDay(period.start)} au ${frenchDay(period.end)}` : '';
  if (period.label && bounds) return `${period.label} (${bounds})`;
  return period.label || bounds;
}
