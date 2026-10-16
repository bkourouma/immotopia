/**
 * Types partagés du paiement en ligne des charges de copropriété (spec 042,
 * contracts.md §0.1 et §2). Mêmes noms côté web (recopiés, jamais importés).
 */

export type OnlineCheckoutStatus = 'PENDING' | 'SUCCESS' | 'FAILED' | 'CANCELED' | 'EXPIRED' | 'REVIEW';
/** Vue du copropriétaire et de la page publique : REVIEW -> PENDING, EXPIRED -> CANCELED. */
export type PublicCheckoutStatus = 'PENDING' | 'SUCCESS' | 'FAILED' | 'CANCELED';
export type GatewayMode = 'SIMULATOR' | 'LIVE';
/** Recopié de `PaymentGatewayConfig.feesPaidBy` de l'agence, `CLIENT` par défaut. */
export type FeesPaidBy = 'CLIENT' | 'AGENCY';
export type CheckoutOrigin = 'PORTAL' | 'SECURE_LINK';
/** Moyens annoncés au payeur (ne préjuge pas de ceux activés chez PaySecureHub). */
export type OnlinePaymentChannel = 'WAVE' | 'ORANGE_MONEY' | 'MTN_MONEY' | 'MOOV_MONEY' | 'CARD';
export type ReviewKind =
  'AMOUNT_MISMATCH' | 'FISCAL_YEAR_CLOSED' | 'CALLS_UNAVAILABLE' | 'DUPLICATE_TRANSACTION' | 'CONTRARY_STATE';
export type ReviewResolution = 'ACCEPTED' | 'REJECTED';

export const ONLINE_PAYMENT_CHANNELS: readonly OnlinePaymentChannel[] = [
  'WAVE',
  'ORANGE_MONEY',
  'MTN_MONEY',
  'MOOV_MONEY',
  'CARD'
];

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

/** Ligne du suivi gestionnaire. */
export interface SyndicOnlineCheckoutRow {
  id: string;
  codePaiement: string;
  status: OnlineCheckoutStatus;
  origin: CheckoutOrigin;
  mode: GatewayMode;
  amount: number;
  receivedAmount: number | null;
  currency: string;
  lot: { id: string; lotNumber: string };
  payer: { contactId: string; name: string } | null;
  chargeCalls: Array<{ id: string; period: string }>;
  providerServiceName: string | null;
  providerTransactionId: string | null;
  providerFees: number | null;
  failureMessage: string | null;
  reviewKind: ReviewKind | null;
  reviewReason: string | null;
  resolution: ReviewResolution | null;
  resolutionNote: string | null;
  resolvedAt: string | null;
  resolvedByName: string | null;
  chargePaymentId: string | null;
  lastCheckedAt: string | null;
  createdAt: string;
  completedAt: string | null;
}

export interface SyndicOnlineCheckoutsResult {
  items: SyndicOnlineCheckoutRow[];
  pagination: Pagination;
  /** Compteurs de TOUTE la copropriété (pas de la page ni du filtre). */
  counts: Record<OnlineCheckoutStatus, number>;
}

export interface VerifySyndicCheckoutResult {
  checkout: SyndicOnlineCheckoutRow;
  /** `true` si le statut ou l'encaissement a changé pendant cet appel. */
  changed: boolean;
}

export interface DecideSyndicCheckoutResult {
  checkout: SyndicOnlineCheckoutRow;
  /** Présent seulement si cet appel a enregistré l'encaissement. */
  payment: {
    id: string;
    amount: number;
    unallocatedAmount: number;
    documents: DocumentRef[];
  } | null;
}

/** Réponse portail (contracts §2.3 et §2.4). */
export interface CoOwnerOnlineCheckout {
  codePaiement: string;
  status: PublicCheckoutStatus;
  /** `true` quand le statut interne est REVIEW (affiché « en cours de vérification »). */
  underReview: boolean;
  amount: number;
  currency: string;
  chargeCallIds: string[];
  periods: string[];
  checkoutUrl: string | null;
  reused: boolean;
  lot: { id: string; lotNumber: string };
  syndicate: { id: string; name: string };
  mode: GatewayMode;
  feesPaidBy: FeesPaidBy;
  documents: DocumentRef[];
  createdAt: string;
  completedAt: string | null;
}

export type OnlineUnavailableReason = 'NOT_CONFIGURED' | 'SUBSCRIPTION';

/** Disponibilité du paiement en ligne d'UNE copropriété (contracts §2.1, par entrée). */
export interface SyndicOnlineAvailability {
  syndicateId: string;
  available: boolean;
  unavailableReason: OnlineUnavailableReason | null;
  /** `null` si la copropriété n'a pas de configuration utilisable. */
  mode: GatewayMode | null;
  simulated: boolean;
  feesPaidBy: FeesPaidBy;
}

/** Devises acceptées : `XOF` et `FCFA` désignent le même franc CFA. */
export const SUPPORTED_CURRENCIES: readonly string[] = ['XOF', 'FCFA'];

export function isSupportedCurrency(currency: string | null | undefined): boolean {
  return SUPPORTED_CURRENCIES.includes((currency ?? '').trim().toUpperCase());
}
