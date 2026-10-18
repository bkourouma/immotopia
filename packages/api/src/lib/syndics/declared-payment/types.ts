/**
 * Types et constantes du paiement mobile money déclaré (spec 047).
 *
 * Recopie à l'identique de `specs/047-syndic-paiement-declare/contracts.md`
 * (§0.1 types partagés, §1 et §2 corps et réponses). Contrat GELÉ : en cas
 * de doute, le signaler au coordinateur plutôt que de le modifier ici.
 * Ce fichier ne dépend pas de Prisma. Le web recopie ces types dans ses
 * services, il ne les importe pas.
 */

// ---------------------------------------------------------------------------
// Constantes (spec D13, R8, R9, R12)
// ---------------------------------------------------------------------------

/** Montant maximal d'une déclaration, en FCFA (D13). */
export const MAX_DECLARATION_AMOUNT = 5_000_000;
/** Nombre maximal de lignes (lots) d'une déclaration. */
export const MAX_DECLARATION_LINES = 10;
/** Déclarations en attente tolérées par lot. */
export const MAX_PENDING_PER_LOT = 10;
/** Appels de charges visés au plus par ligne. */
export const MAX_CHARGE_CALLS_PER_LINE = 24;
/** Avance tolérée de `paidAt` sur l'horloge du serveur, en minutes. */
export const PAID_AT_FUTURE_TOLERANCE_MINUTES = 10;
/** Ancienneté maximale de `paidAt`, en jours. */
export const PAID_AT_MAX_AGE_DAYS = 90;

// ---------------------------------------------------------------------------
// Contracts §0.1
// ---------------------------------------------------------------------------

export type MobileMoneyOperator = 'ORANGE' | 'MTN' | 'MOOV' | 'WAVE' | 'OTHER';
export type DeclarationStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELED';
export type DeclarationRejectReason =
  | 'NOT_FOUND' // « Paiement introuvable »
  | 'AMOUNT_MISMATCH' // « Montant ne correspondant pas »
  | 'REFERENCE_USED' // « Référence déjà utilisée »
  | 'WRONG_NUMBER' // « Numéro de réception erroné »
  | 'OTHER'; // « Autre »
/** Champs que l'IA peut proposer et dont on suit la retouche. */
export type PrefillField = 'operator' | 'amount' | 'paidAt' | 'transactionReference' | 'payerPhone';

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}
export interface DocumentRef {
  id: string;
  kind: 'RECEIPT' | 'QUITTANCE';
  number: string;
}

export interface ReceivingNumber {
  id: string;
  operator: MobileMoneyOperator;
  phoneNumber: string; // E.164
  holderName: string;
  label: string | null;
  isActive: boolean;
  sortOrder: number;
}

/** Vue gestionnaire d'un numéro. */
export interface ReceivingNumberAdmin extends ReceivingNumber {
  treasuryAccountNumber: string; // « 55211 »…
  treasuryBalance: number; // solde comptable du sous-compte dans cette copropriété
  sharedWithCount: number; // autres copropriétés de l'agence qui utilisent ce numéro (D10)
  pendingDeclarations: number;
  createdAt: string;
  updatedAt: string;
}

export interface DeclaredPaymentSettings {
  syndicateId: string;
  enabled: boolean; // défaut false (D11)
  reviewAlertBusinessDays: number; // 1 à 15, défaut 3 (D12)
  proofRequired: boolean; // défaut false (D14)
  payerInstructions: string | null; // 500 caractères au plus
  aiPrefillEnabled: boolean; // défaut false (D9)
  /** Un fournisseur de vision est configuré sur le serveur (PR3 ; false avant). */
  aiPrefillAvailable: boolean;
  /** Lectures IA de l'agence ce mois-ci et quota (300, D9). */
  aiReadsThisMonth: number;
  aiReadsMonthlyQuota: number;
  /** Activé ET au moins un numéro actif. */
  usable: boolean;
}

/** Proposition de l'IA (PR3). Chaque champ peut manquer : il n'est jamais deviné. */
export interface PaymentProofReading {
  readId: string; // à renvoyer dans la déclaration (proofReadId)
  quality: 'OK' | 'UNREADABLE' | 'NOT_A_PAYMENT';
  operator: MobileMoneyOperator | null;
  amount: number | null;
  paidAt: string | null;
  transactionReference: string | null;
  payerPhone: string | null;
  recipientPhone: string | null;
  recipientName: string | null;
  confidence: Partial<Record<PrefillField, number>>; // 0 à 1
  /** Contrôles serveur (R28). */
  warnings: Array<'RECIPIENT_NOT_A_RECEIVING_NUMBER' | 'REFERENCE_ALREADY_DECLARED'>;
  /** Numéro de réception reconnu parmi les numéros actifs, s'il y en a un. */
  matchedReceivingNumberId: string | null;
}

export interface DeclarationLineInput {
  lotId: string;
  amount: number; // part de ce lot, entier > 0
  chargeCallIds: string[]; // 0 à 24, appels ouverts du lot ; [] = plus anciens d'abord
}

export interface DeclarationInput {
  syndicId: string; // portail seulement ; ignoré (absent) côté gestionnaire où il est dans l'URL
  receivingNumberId: string;
  payerPhone: string;
  amount: number; // 1 à 5 000 000 (D13), = somme des lignes
  paidAt: string; // ≤ maintenant + 10 min, ≥ maintenant − 90 jours
  transactionReference: string;
  lines: DeclarationLineInput[]; // 1 à 10, lots distincts de la même copropriété
  comment?: string | null; // 500 caractères au plus
  /** Lecture IA dont la capture devient la preuve (PR3). Exclusif avec un fichier `proof`. */
  proofReadId?: string | null;
}

export type DeclarationAlert =
  | {
      kind: 'REFERENCE_ON_EXISTING_PAYMENT';
      chargePaymentId: string;
      paidAt: string;
      amount: number;
    }
  | { kind: 'PROBABLE_DUPLICATE'; declarationId: string; createdAt: string }
  | { kind: 'EXCESS'; lotId: string; excess: number } // deviendra une avance
  | { kind: 'PARTIAL'; lotId: string; remaining: number }
  | { kind: 'DECLARANT_NOT_CURRENT_OWNER'; lotId: string }
  | { kind: 'AI_FIELDS_EDITED'; fields: PrefillField[] }
  | { kind: 'RECIPIENT_MISMATCH'; recipientPhone: string } // lu par l'IA ≠ numéro choisi
  | { kind: 'FISCAL_YEAR_CLOSED' }
  | { kind: 'OVERDUE'; businessDays: number };

export interface DeclarationLineView {
  id: string;
  lot: { id: string; lotNumber: string };
  amount: number;
  acceptedAmount: number | null;
  chargeCalls: Array<{ id: string; period: string; remainingDue: number }>; // reste dû ACTUEL
  /**
   * TOUS les appels ouverts (reste dû > 0) du lot, le plus ancien d'abord (ordre d'affectation), pour que le
   * gestionnaire affecte le montant à un appel quelconque du lot à la validation. `chargeCalls` reste la
   * proposition par défaut. Vide hors déclaration en attente.
   */
  openCalls: Array<{ id: string; period: string; remainingDue: number }>;
  chargePaymentId: string | null;
  documents: DocumentRef[]; // après validation
}

/** Ligne et détail côté gestionnaire. */
export interface SyndicDeclarationRow {
  id: string;
  status: DeclarationStatus;
  receivingNumber: {
    id: string;
    operator: MobileMoneyOperator;
    phoneNumber: string;
    holderName: string;
  }; // instantané
  declaredBy: { type: 'COOWNER'; contactId: string; name: string } | { type: 'MANAGER'; userId: string; name: string }; // P4
  payerPhone: string;
  amount: number;
  acceptedAmount: number | null;
  paidAt: string;
  acceptedPaidAt: string | null;
  transactionReference: string;
  lines: DeclarationLineView[];
  hasProof: boolean;
  aiPrefilled: boolean;
  aiEditedFields: PrefillField[];
  overdue: boolean;
  alerts: DeclarationAlert[]; // calculées à la lecture ; vides hors PENDING sauf historiques utiles
  comment: string | null;
  rejectReason: DeclarationRejectReason | null;
  reviewNote: string | null;
  reviewedAt: string | null;
  reviewedByName: string | null;
  createdAt: string;
}

/** Vue du copropriétaire. */
export interface CoOwnerDeclaration {
  id: string;
  status: DeclarationStatus;
  syndicate: { id: string; name: string };
  receivingNumber: {
    operator: MobileMoneyOperator;
    phoneNumber: string;
    holderName: string;
  };
  payerPhone: string;
  amount: number;
  acceptedAmount: number | null; // si corrigé
  paidAt: string;
  transactionReference: string;
  lines: Array<{
    lot: { id: string; lotNumber: string };
    amount: number;
    acceptedAmount: number | null;
    chargeCallIds: string[];
  }>;
  documents: DocumentRef[];
  rejectReason: DeclarationRejectReason | null;
  reviewNote: string | null; // note de correction ou de rejet
  canCancel: boolean; // PENDING
  createdAt: string;
  reviewedAt: string | null;
}

// ---------------------------------------------------------------------------
// Contracts §1 et §2 : corps et réponses
// ---------------------------------------------------------------------------

/** §1.2 */
export interface CreateReceivingNumberBody {
  operator: MobileMoneyOperator;
  phoneNumber: string;
  holderName: string; // 2 à 80 caractères
  label?: string | null; // 60 au plus
  isActive?: boolean; // défaut true
}

/** §1.3 : sous-ensemble de 1.2 plus `sortOrder`. */
export interface UpdateReceivingNumberBody {
  operator?: MobileMoneyOperator;
  phoneNumber?: string;
  holderName?: string;
  label?: string | null;
  isActive?: boolean;
  sortOrder?: number;
}

/** §1.5 */
export interface UpdateDeclaredPaymentSettingsBody {
  enabled?: boolean;
  reviewAlertBusinessDays?: number; // 1 à 15
  proofRequired?: boolean;
  payerInstructions?: string | null;
  aiPrefillEnabled?: boolean; // accepté dès PR1, sans effet avant PR3
}

/** §1.6 */
export interface ListDeclarationsResponse {
  items: SyndicDeclarationRow[];
  pagination: Pagination;
  counts: { pending: number; overdue: number; suspectedDuplicate: number };
}

/** §1.9 */
export interface ApproveDeclarationBody {
  /** Absent = validation telle que déclarée. */
  correction?: {
    paidAt?: string; // obligatoire si la date déclarée tombe dans un exercice clos
    lines?: Array<{
      lineId: string;
      acceptedAmount: number;
      chargeCallIds?: string[];
    }>; // toutes les lignes
  } | null;
  note?: string | null; // obligatoire (10 à 500) si correction présente
}
export interface ApproveDeclarationResponse {
  declaration: SyndicDeclarationRow; // status APPROVED
  documents: DocumentRef[];
}

/** §1.10 */
export interface RejectDeclarationBody {
  reason: DeclarationRejectReason;
  note: string; // 10 à 500
}

/** §2.1 */
export interface CoOwnerDeclaredAvailability {
  syndicateId: string;
  available: boolean; // réglage activé, au moins un numéro actif, droit SYNDIC
  receivingNumbers: ReceivingNumber[]; // actifs seulement
  payerInstructions: string | null;
  proofRequired: boolean;
  aiPrefillAvailable: boolean; // false avant PR3, et si quota atteint
  maxAmount: number; // 5 000 000
}
