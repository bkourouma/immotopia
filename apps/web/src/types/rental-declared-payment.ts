/**
 * Types et constantes du paiement mobile money déclaré du module Gestion
 * locative (spec 049, famille « Déclarations »).
 *
 * Recopie de packages/api/src/lib/rental/declared-payment/types.ts (contenu
 * identique) : le web ne l'importe pas de l'API. Dates en chaînes ISO 8601.
 * Contrat : specs/049-locatif-paiement-parite-syndic/contracts.md.
 */

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

/** Montant maximal d'une déclaration, en FCFA (comme MAX_DECLARATION_AMOUNT du Syndic). */
export const RENTAL_MAX_DECLARATION_AMOUNT = 5_000_000;
/** Seuil d'alerte par défaut, en jours ouvrés (H4). */
export const RENTAL_DEFAULT_REVIEW_ALERT_BUSINESS_DAYS = 3;
export const RENTAL_REVIEW_ALERT_BUSINESS_DAYS_MIN = 1;
export const RENTAL_REVIEW_ALERT_BUSINESS_DAYS_MAX = 15;

/** Quotas de lecture IA de la capture. */
export const RENTAL_PROOF_READ_QUOTAS = {
  /** Par contact (compte locataire), par minute. */
  perMinute: 5,
  /** Par contact, par jour. */
  perDay: 30,
  /** Par agence, par mois civil UTC. */
  tenantPerMonth: 300,
  /** Par contact, par mois civil UTC. */
  contactPerMonth: 30
} as const;

/** Avance tolérée de `paidAt` sur l'horloge du serveur, en minutes. */
export const RENTAL_PAID_AT_FUTURE_TOLERANCE_MINUTES = 10;
/** Ancienneté maximale de `paidAt`, en jours. */
export const RENTAL_PAID_AT_MAX_AGE_DAYS = 90;

// ---------------------------------------------------------------------------
// Types communs
// ---------------------------------------------------------------------------

export type RentalMobileMoneyOperator = 'ORANGE' | 'MTN' | 'MOOV' | 'WAVE' | 'OTHER';

/**
 * Extension « autres modes » (additive) : modes de paiement déclarables. Absent = MOBILE_MONEY.
 * Valeurs de `RentalPaymentMethod` (hors DIRECT_DEBIT).
 */
export const RENTAL_DECLARATION_PAYMENT_METHODS = [
  'MOBILE_MONEY',
  'CASH',
  'CHECK',
  'BANK_TRANSFER',
  'CARD',
  'OTHER'
] as const;
export type RentalDeclarationPaymentMethod = (typeof RENTAL_DECLARATION_PAYMENT_METHODS)[number];

/** Valeurs réelles de `PaymentDeclarationStatus` (schema.prisma) : CANCELED existe. */
export type RentalDeclarationStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELED';

export const RENTAL_DECLARATION_REJECT_REASONS = [
  'NOT_FOUND', // « Paiement introuvable »
  'AMOUNT_MISMATCH', // « Montant ne correspondant pas »
  'REFERENCE_USED', // « Référence déjà utilisée »
  'WRONG_NUMBER', // « Numéro de réception erroné »
  'OTHER' // « Autre » : note obligatoire
] as const;
export type RentalDeclarationRejectReason = (typeof RENTAL_DECLARATION_REJECT_REASONS)[number];

/** Champs que l'IA peut proposer. */
export type RentalPrefillField = 'operator' | 'amount' | 'paidAt' | 'reference' | 'payerPhone';

/** Liste paginée générique des nouvelles routes (`data` de l'enveloppe). */
export interface RentalPaginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

// ---------------------------------------------------------------------------
// 1. Numéros de réception
// ---------------------------------------------------------------------------

export interface RentalReceivingNumberDto {
  id: string;
  operator: RentalMobileMoneyOperator;
  /** E.164 (`+225XXXXXXXXXX`), stocké normalisé. */
  phone: string;
  label: string | null;
  active: boolean;
  /** Compte de trésorerie mobile money de l'opérateur, DÉRIVÉ (jamais saisi). */
  treasuryAccountId: string | null;
  /** Numéro comptable du compte (« 5522 »…). */
  treasuryAccountNumber: string | null;
  /** Déclarations (tous statuts) liées à ce numéro. */
  declarationsCount: number;
  pendingDeclarations: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateRentalReceivingNumberBody {
  operator: RentalMobileMoneyOperator;
  /** Format libre ; normalisé par le serveur. */
  phone: string;
  /** 60 caractères au plus. */
  label?: string | null;
  /** Défaut true. */
  active?: boolean;
}

export interface UpdateRentalReceivingNumberBody {
  operator?: RentalMobileMoneyOperator;
  phone?: string;
  label?: string | null;
  active?: boolean;
}

// ---------------------------------------------------------------------------
// 2. Réglages
// ---------------------------------------------------------------------------

export interface RentalDeclaredPaymentSettingsDto {
  /** Défaut true (H4). */
  enabled: boolean;
  /** Défaut false. */
  proofRequired: boolean;
  /** Défaut false. */
  aiPrefillEnabled: boolean;
  /** 1 à 15, défaut 3. */
  reviewAlertBusinessDays: number;
  /** Un fournisseur de vision est configuré sur le serveur. */
  aiPrefillAvailable: boolean;
  /** Lectures IA de l'agence ce mois-ci et quota mensuel de l'agence. */
  aiReadsThisMonth: number;
  aiReadsMonthlyQuota: number;
  /** Activé ET au moins un numéro actif. */
  usable: boolean;
}

export interface UpdateRentalDeclaredPaymentSettingsBody {
  enabled?: boolean;
  proofRequired?: boolean;
  aiPrefillEnabled?: boolean;
  /** 1 à 15. */
  reviewAlertBusinessDays?: number;
}

// ---------------------------------------------------------------------------
// 3. Déclarations (vue gestionnaire)
// ---------------------------------------------------------------------------

export type RentalDeclarationAlert =
  | { kind: 'DUPLICATE_SUSPECTED'; otherDeclarationId: string }
  | { kind: 'AMOUNT_DIFFERS_FROM_DUE'; due: number }
  | { kind: 'AI_FIELDS_EDITED'; fields: RentalPrefillField[] }
  | { kind: 'RECIPIENT_MISMATCH'; recipientPhone: string }
  | { kind: 'OVERDUE'; businessDays: number };

export interface RentalPaymentDeclarationDto {
  id: string;
  status: RentalDeclarationStatus;
  leaseId: string;
  leaseNumber: string | null;
  /** Locataire déclarant ou gestionnaire (déclaration pour un tiers). */
  declaredBy: { type: 'TENANT'; clientId: string; name: string } | { type: 'MANAGER'; userId: string; name: string };
  /**
   * Extension additive : nom du locataire déclarant enregistré (`declared_by`),
   * distinct du gestionnaire quand la déclaration a été saisie pour un tiers.
   */
  tenantName?: string;
  installment: {
    id: string;
    periodYear: number;
    periodMonth: number;
    dueDate: string;
    remainingDue: number;
  } | null;
  receivingNumber: {
    id: string;
    operator: RentalMobileMoneyOperator;
    phone: string;
  } | null;
  operator: RentalMobileMoneyOperator | null;
  /** Extension : mode déclaré (MOBILE_MONEY par défaut). */
  paymentMethod?: RentalDeclarationPaymentMethod;
  payerPhone: string | null;
  amount: number;
  /** Montant retenu à la validation ; null avant validation. */
  acceptedAmount: number | null;
  paidAt: string;
  /** Null possible pour les anciennes déclarations. */
  reference: string | null;
  hasProof: boolean;
  aiPrefilled: boolean;
  aiEditedFields: RentalPrefillField[];
  duplicateSuspected: boolean;
  overdue: boolean;
  alerts: RentalDeclarationAlert[];
  notes: string | null;
  rejectReason: RentalDeclarationRejectReason | null;
  reviewNote: string | null;
  reviewedAt: string | null;
  reviewedByName: string | null;
  /** Paiement créé à la validation. */
  paymentId: string | null;
  createdAt: string;
}

export interface RentalDeclarationListQuery {
  /** Locataire, référence, téléphone payeur, numéro de bail. */
  search?: string;
  status?: RentalDeclarationStatus | 'ALL';
  receivingNumberId?: string;
  leaseId?: string;
  /** YYYY-MM-DD (sur paidAt). */
  from?: string;
  to?: string;
  /** Alertes (doublon probable, montant différent, retard) seulement. */
  flagged?: boolean;
  page?: number;
  /** 1 à 100, défaut 20. */
  pageSize?: number;
}

export interface ApproveDeclarationBody {
  /** Absent = montant déclaré. */
  acceptedAmount?: number | null;
  /** Obligatoire (10 à 500) si acceptedAmount diffère du montant déclaré. */
  note?: string | null;
  /** Ancien nom accepté (compatibilité) ; équivaut à `note`. */
  reviewNotes?: string | null;
}

export interface ApproveDeclarationResponse {
  declaration: RentalPaymentDeclarationDto;
  payment: { id: string; amount: number; paymentDate: string };
  installment: {
    id: string;
    status: string;
    amountPaid: number;
    remainingDue: number;
  } | null;
  /** True si un événement APPROVED_WITH_CORRECTION a été journalisé. */
  corrected: boolean;
}

export interface RejectDeclarationBody {
  rejectReason: RentalDeclarationRejectReason;
  /** 10 à 500 ; obligatoire si rejectReason = OTHER. */
  note?: string | null;
  /** Ancien nom accepté (compatibilité) ; équivaut à `note`. */
  reviewNotes?: string | null;
}

export interface CreateDeclarationForThirdPartyBody {
  leaseId: string;
  installmentId?: string | null;
  /** Extension : mode (MOBILE_MONEY par défaut). Les trois champs suivants ne sont requis que pour MOBILE_MONEY. */
  paymentMethod?: RentalDeclarationPaymentMethod;
  receivingNumberId?: string;
  operator?: RentalMobileMoneyOperator;
  /** Obligatoire. */
  reference?: string;
  /** Plafonné à RENTAL_MAX_DECLARATION_AMOUNT. */
  amount: number;
  paidAt: string;
  payerPhone?: string | null;
  notes?: string | null;
}

export interface PendingDeclarationSummary {
  id: string;
  amount: number;
  declaredAt: string;
  reference?: string | null;
}

export interface PendingCountDto {
  pending: number;
  overdue: number;
}

// ---------------------------------------------------------------------------
// 4. Portail locataire
// ---------------------------------------------------------------------------

export interface DeclarePaymentReceivingNumber {
  id: string;
  operator: RentalMobileMoneyOperator;
  /** Numéro complet, à composer. */
  phone: string;
  label: string | null;
}

export interface DeclarePaymentAvailabilityDto {
  enabled: boolean;
  /** Activé, au moins un numéro actif. */
  available: boolean;
  receivingNumbers: DeclarePaymentReceivingNumber[];
  proofRequired: boolean;
  /** False si coupé, sans fournisseur ou quota atteint. */
  aiPrefillAvailable: boolean;
  maxAmount: number;
  instructions: string | null;
  /** Extension : modes déclarables (MOBILE_MONEY seulement si un numéro actif existe). */
  allowedMethods?: RentalDeclarationPaymentMethod[];
}

export interface DeclarePaymentBody {
  installmentId?: string | null;
  /** Extension : mode (MOBILE_MONEY par défaut). Les trois champs suivants ne sont requis que pour MOBILE_MONEY. */
  paymentMethod?: RentalDeclarationPaymentMethod;
  receivingNumberId?: string;
  operator?: RentalMobileMoneyOperator;
  /** Obligatoire (nouvelles déclarations). */
  reference?: string;
  amount: number;
  paidAt: string;
  payerPhone?: string | null;
  notes?: string | null;
  /** Lecture IA dont la capture devient la preuve ; exclusif avec le fichier `proof`. */
  proofReadId?: string | null;
}

export interface TenantPortalDeclarationDto {
  id: string;
  status: RentalDeclarationStatus;
  leaseId: string;
  installment: {
    id: string;
    periodYear: number;
    periodMonth: number;
    dueDate: string;
  } | null;
  receivingNumber: {
    operator: RentalMobileMoneyOperator;
    phone: string;
  } | null;
  payerPhone: string | null;
  /** Extension : mode déclaré (MOBILE_MONEY par défaut). */
  paymentMethod?: RentalDeclarationPaymentMethod;
  amount: number;
  acceptedAmount: number | null;
  paidAt: string;
  reference: string | null;
  rejectReason: RentalDeclarationRejectReason | null;
  /** Note de correction ou de rejet. */
  reviewNote: string | null;
  /** True si status = PENDING. */
  canCancel: boolean;
  /** Présent seulement dans la réponse de création. */
  duplicateSuspected?: boolean;
  createdAt: string;
  reviewedAt: string | null;
}

export interface ProofReadResultDto {
  proofReadId: string;
  quality: 'OK' | 'UNREADABLE' | 'NOT_A_PAYMENT';
  operator: RentalMobileMoneyOperator | null;
  amount: number | null;
  reference: string | null;
  paidAt: string | null;
  payerPhone: string | null;
  recipientPhone: string | null;
  /** 0 à 1 par champ proposé. */
  confidence: Partial<Record<RentalPrefillField, number>>;
  warnings: Array<'RECIPIENT_NOT_A_RECEIVING_NUMBER' | 'REFERENCE_ALREADY_DECLARED'>;
  matchedReceivingNumberId: string | null;
}
