/**
 * Types des pages publiques de paiement d'un loyer par lien sécurisé (spec 039).
 * Miroir du contrat de l'API : les dates sont des chaînes ISO.
 */

export type InstallmentPaymentMethod = 'WAVE' | 'ORANGE_MONEY' | 'MTN_MONEY' | 'MOOV_MONEY';

export type InstallmentPaymentStatus = 'PENDING' | 'SUCCESS' | 'FAILED' | 'CANCELED';

/** Ce que le locataire voit en ouvrant le lien : tout est recalculé côté serveur. */
export interface InstallmentPaymentPublicDto {
  agencyName: string;
  periodYear: number;
  periodMonth: number;
  dueDate: string;
  amountDue: number;
  currency: string;
  expiresAt: string;
  paymentMethods: InstallmentPaymentMethod[];
  /** Vrai en recette/dev : le paiement est simulé, aucun argent ne circule. */
  simulated: boolean;
  /** Un paiement en ligne est déjà en cours pour cette échéance. */
  paymentInProgress: boolean;
  /** Un paiement est en cours de vérification par l'agence : aucun nouveau paiement possible. */
  reviewPending: boolean;
}

export interface InstallmentPaymentStatusDto {
  status: InstallmentPaymentStatus;
  amount: number;
  currency: string;
  agencyName: string;
  periodYear: number;
  periodMonth: number;
}

/** Résumé d'un lien côté agence (jamais de jeton, de hash ni d'URL). */
export interface InstallmentPaymentLinkSummary {
  id: string;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
  status: 'ACTIVE' | 'EXPIRED' | 'REVOKED';
  viewCount: number;
  lastViewedAt: string | null;
  createdByUserId: string | null;
  payment: {
    status: 'NONE' | 'PENDING' | 'SUCCESS' | 'FAILED' | 'CANCELED' | 'EXPIRED' | 'REVIEW';
    amount: number | null;
    updatedAt: string | null;
  };
}
