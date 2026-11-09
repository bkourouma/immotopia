/**
 * Contrat 049 section 2 : paiement en ligne du locatif (suivi, REVIEW, compte de collecte).
 *
 * Ce fichier est recopie a l'identique (sans import) dans
 * `apps/web/src/types/rental-online-payment.ts`. Toute modification se fait dans
 * les deux fichiers. Dates : chaine ISO 8601. Montants : nombres en unites (FCFA).
 */

/** Valeurs reelles de l'enum Prisma `OnlineCheckoutStatus`. */
export type RentalOnlineCheckoutStatus = 'PENDING' | 'SUCCESS' | 'FAILED' | 'CANCELED' | 'EXPIRED' | 'REVIEW';

/**
 * Motif de mise en REVIEW (la tentative n'est jamais encaissee seule).
 * - AMOUNT_MISMATCH : montant paye selon la passerelle different du montant attendu.
 * - CONTRARY_STATE : la passerelle rapporte un echec/annulation apres un succes deja connu,
 *   ou un succes tardif apres expiration.
 * - DUPLICATE_TRANSACTION : transaction fournisseur deja enregistree sur une autre tentative.
 * - INSTALLMENT_UNAVAILABLE : une echeance visee est deja soldee, annulee ou n'appartient
 *   plus au bail/locataire courant.
 */
export type RentalOnlineReviewKind =
  'AMOUNT_MISMATCH' | 'CONTRARY_STATE' | 'DUPLICATE_TRANSACTION' | 'INSTALLMENT_UNAVAILABLE';

export type RentalOnlineReviewDecision = 'ACCEPT' | 'REJECT';
export type RentalOnlineReviewResolution = 'ACCEPT' | 'REJECT';
export type RentalOnlineGatewayMode = 'SIMULATOR' | 'LIVE';
export type RentalOnlineCheckoutOrigin = 'PORTAL' | 'SECURE_LINK';

export interface RentalOnlinePaginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface RentalOnlinePaymentInstallmentRef {
  id: string;
  periodYear: number;
  periodMonth: number;
  dueDate: string;
  amountDue: number;
}

/** Ligne du suivi : tentative + bail + locataire + echeances. */
export interface RentalOnlinePaymentRowDto {
  id: string;
  codePaiement: string;
  status: RentalOnlineCheckoutStatus;
  origin: RentalOnlineCheckoutOrigin;
  mode: RentalOnlineGatewayMode;
  /** Montant demande. */
  amount: number;
  /** Montant paye selon la passerelle, des qu'elle l'a rapporte. */
  receivedAmount: number | null;
  currency: string;
  leaseId: string;
  leaseReference: string | null;
  propertyLabel: string | null;
  /** Locataire ayant lance la tentative (renterClientId) ; null si la fiche a disparu. */
  renter: { clientId: string; name: string } | null;
  installments: RentalOnlinePaymentInstallmentRef[];
  providerServiceName: string | null;
  providerTransactionId: string | null;
  providerFees: number | null;
  failureMessage: string | null;
  reviewKind: RentalOnlineReviewKind | null;
  /** Texte a afficher pour expliquer le motif. */
  reviewReason: string | null;
  resolution: RentalOnlineReviewResolution | null;
  resolutionNote: string | null;
  resolvedAt: string | null;
  resolvedByName: string | null;
  /** RentalPayment lie (toujours present). */
  paymentId: string;
  /** Vrai si l'encaissement est enregistre et alloue. */
  collected: boolean;
  lastCheckedAt: string | null;
  createdAt: string;
  completedAt: string | null;
}

export type RentalOnlinePaymentLogKind =
  'CREATED' | 'PROVIDER_CHECK' | 'IPN' | 'STATUS_CHANGED' | 'REVIEW' | 'RESOLVED';

export interface RentalOnlinePaymentLogEntryDto {
  at: string;
  kind: RentalOnlinePaymentLogKind;
  status: RentalOnlineCheckoutStatus | null;
  providerState: string | null;
  message: string;
  /** Null pour une action automatique (webhook, job). */
  actorName: string | null;
}

export interface RentalOnlinePaymentDetailDto extends RentalOnlinePaymentRowDto {
  checkAttempts: number;
  lastProviderState: string | null;
  /** Jamais de jeton ni d'URL de checkout dans ce DTO. */
  log: RentalOnlinePaymentLogEntryDto[];
  payment: {
    id: string;
    status: string;
    amount: number;
    paidAt: string | null;
    receiptNumber: string | null;
    unallocatedAmount: number;
  };
}

export interface RentalOnlinePaymentsSummaryDto {
  /** Compteurs de TOUTE l'agence, tous filtres ignores. */
  counts: Record<RentalOnlineCheckoutStatus, number>;
  reviewPending: number;
  reviewByKind: Record<RentalOnlineReviewKind, number>;
  oldestReviewAt: string | null;
}

export interface ListOnlinePaymentsQuery {
  /** Liste separee par des virgules de RentalOnlineCheckoutStatus ; defaut : tous. */
  status?: string;
  reviewKind?: RentalOnlineReviewKind;
  /** Recherche : code de paiement, nom du locataire, reference du bail, transaction. */
  search?: string;
  leaseId?: string;
  /** YYYY-MM-DD, borne sur createdAt ; `to` inclus. */
  from?: string;
  to?: string;
  /** Defaut 1. */
  page?: number;
  /** Defaut 20, max 100. */
  pageSize?: number;
}

export interface VerifyOnlinePaymentResultDto {
  checkout: RentalOnlinePaymentRowDto;
  /** Vrai si le statut ou l'encaissement a change pendant cet appel. */
  changed: boolean;
}

export interface ResolveOnlinePaymentBody {
  decision: RentalOnlineReviewDecision;
  /** Obligatoire pour REJECT (1 a 500) ; facultatif pour ACCEPT. */
  note?: string;
  /** ACCEPT seulement : YYYY-MM-DD, pas dans le futur ; defaut : aujourd'hui. */
  paidAt?: string;
}

export interface ResolveOnlinePaymentResultDto {
  checkout: RentalOnlinePaymentRowDto;
  /** Present seulement si cet appel a enregistre l'encaissement (ACCEPT). */
  payment: {
    id: string;
    amount: number;
    unallocatedAmount: number;
    allocatedInstallmentIds: string[];
    receiptNumber: string | null;
  } | null;
}

export type RentalCollectionProviderUnavailableReason =
  'NOT_CONFIGURED' | 'SIMULATOR' | 'NO_CREDENTIALS' | 'UNREACHABLE';

export interface RentalCollectionPayoutDto {
  /** Id du TreasuryTransfer. */
  transferId: string;
  /** Numero de virement (VIR-AAAA-NNNN). */
  number: string;
  toTreasuryAccountId: string;
  toLabel: string;
  amount: number;
  /** Date du virement (ISO). */
  date: string;
  note: string | null;
  createdByName: string | null;
  createdAt: string;
}

export interface RentalCollectionAccountDto {
  accountNumber: '5525';
  /** Compte de tresorerie 5525 (cree a la demande par ensureCollectionAccountTx). Null tant qu'il n'existe pas. */
  treasuryAccountId: string | null;
  /** Solde comptable du 5525 (0 s'il n'existe pas). */
  ledgerBalance: number;
  currency: string;
  provider: {
    available: boolean;
    /** Solde chez PaySecureHub ; null si illisible. */
    balance: { amount: number; currency: string; at: string } | null;
    unavailableReason: RentalCollectionProviderUnavailableReason | null;
    /** Message traduit (motif). */
    message: string | null;
  };
  /** 5 derniers virements du 5525 vers un compte de tresorerie, non annules. */
  recentPayouts: RentalCollectionPayoutDto[];
}

export interface ListCollectionPayoutsQuery {
  page?: number;
  pageSize?: number;
}

export interface CreateCollectionPayoutBody {
  toTreasuryAccountId: string;
  /** > 0, max 9_999_999_999.99 ; ne peut depasser le solde du 5525. */
  amount: number;
  /** YYYY-MM-DD, pas dans le futur. */
  date: string;
  /** Max 500. */
  note?: string;
}

export interface CreateCollectionPayoutResultDto {
  payout: RentalCollectionPayoutDto;
  /** Solde du 5525 apres le virement. */
  ledgerBalanceAfter: number;
}

export type RentalOnlineUnavailableReason = 'NOT_CONFIGURED' | 'INACTIVE' | 'SIMULATOR_FORBIDDEN' | 'SUBSCRIPTION';

/** GET /online-payments/availability (gestionnaire). */
export interface OnlinePaymentAvailabilityDto {
  /** config active ET (mode != SIMULATOR OU simulateur autorise) ET droit RENTAL. */
  usable: boolean;
  unavailableReason: RentalOnlineUnavailableReason | null;
  mode: RentalOnlineGatewayMode | null;
  simulated: boolean;
  feesPaidBy: 'CLIENT' | 'AGENCY' | null;
  simulatorAvailable: boolean;
  encryptionAvailable: boolean;
}

/**
 * GET /api/portal/tenant/online-payments/availability. Additif : `available`, `mode`
 * et `feesPaidBy` existants sont conserves ; `available` devient le `usable` durci.
 */
export interface PortalOnlinePaymentAvailabilityDto {
  available: boolean;
  unavailableReason: RentalOnlineUnavailableReason | null;
  mode: RentalOnlineGatewayMode | null;
  feesPaidBy: 'CLIENT' | 'AGENCY' | null;
  simulated: boolean;
}
