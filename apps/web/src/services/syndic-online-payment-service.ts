import apiClient from '../utils/api-client';

/**
 * Paiement en ligne des charges de copropriété, côté gestionnaire (spec 042).
 * Contrat : `specs/042-syndic-paiement-mobile/contracts.md` §0.1 et §1. Les
 * types sont recopiés de l'API, jamais importés.
 */

export type OnlineCheckoutStatus = 'PENDING' | 'SUCCESS' | 'FAILED' | 'CANCELED' | 'EXPIRED' | 'REVIEW';
export type GatewayMode = 'SIMULATOR' | 'LIVE';
export type FeesPaidBy = 'CLIENT' | 'AGENCY';
export type CheckoutOrigin = 'PORTAL' | 'SECURE_LINK';
export type ReviewKind =
  'AMOUNT_MISMATCH' | 'FISCAL_YEAR_CLOSED' | 'CALLS_UNAVAILABLE' | 'DUPLICATE_TRANSACTION' | 'CONTRARY_STATE';
export type ReviewResolution = 'ACCEPTED' | 'REJECTED';

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

/** 1.1 */
export interface SyndicPaymentGatewaySettings {
  syndicateId: string;
  provider: 'PAYSECUREHUB';
  mode: GatewayMode;
  isActive: boolean;
  merchantId: string | null;
  apiKeyConfigured: boolean;
  apiKeyLast4: string | null;
  usable: boolean;
  callbackUrl: string;
  simulatorAvailable: boolean;
  encryptionAvailable: boolean;
  lastTest: { at: string; ok: boolean; message: string } | null;
  agencyFeesPaidBy: FeesPaidBy;
  collectionAccount: { accountNumber: '5525'; exists: boolean; balance: number };
  updatedAt: string | null;
}

/** 1.2 */
export interface UpdateSyndicPaymentGatewayBody {
  mode?: GatewayMode;
  isActive?: boolean;
  merchantId?: string | null;
  /** Écriture seule : absent = inchangée ; '' = efface. */
  apiKey?: string;
}

/** 1.3 */
export interface SyndicPaymentGatewayTestResult {
  ok: boolean;
  message: string;
  balance: { amount: number; currency: string; at: string } | null;
}

/** 1.4 */
export interface SyndicProviderBalance {
  available: boolean;
  balance: { amount: number; currency: string; at: string } | null;
  message: string | null;
}

/** 1.5 */
export interface SyndicOnlineCheckoutsQuery {
  status?: OnlineCheckoutStatus[];
  origin?: CheckoutOrigin;
  lotId?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

export interface SyndicOnlineCheckoutsResult {
  items: SyndicOnlineCheckoutRow[];
  pagination: Pagination;
  counts: Record<OnlineCheckoutStatus, number>;
}

/** 1.6 */
export interface VerifySyndicCheckoutResult {
  checkout: SyndicOnlineCheckoutRow;
  changed: boolean;
}

/** 1.7 */
export interface DecideSyndicCheckoutBody {
  decision: 'ACCEPT' | 'REJECT';
  note: string;
  paidAt?: string;
}

export interface DecideSyndicCheckoutResult {
  checkout: SyndicOnlineCheckoutRow;
  payment: {
    id: string;
    amount: number;
    unallocatedAmount: number;
    documents: DocumentRef[];
  } | null;
}

/** 1.8 */
export interface SyndicGatewayPayout {
  entryId: string;
  reference: string;
  date: string;
  amount: number;
  note: string | null;
  /** Compte reversé : 5525 ou un sous-compte 5521x d'un numéro de réception (spec 047). */
  treasuryAccountNumber?: string;
  createdAt: string;
}
export type SyndicGatewayPayoutsResult = { items: SyndicGatewayPayout[] };

/** 1.9 */
export interface RecordGatewayPayoutBody {
  amount: number;
  date: string;
  reference: string;
  note?: string | null;
  /** 5525 par défaut ; sinon le sous-compte 5521x d'un numéro de réception de la copropriété. */
  treasuryAccountNumber?: string;
}
export interface RecordGatewayPayoutResult {
  entryId: string;
  reference: string;
  amount: number;
  date: string;
  treasuryAccountNumber?: string;
  /** Solde du compte reversé après l'écriture. */
  collectionBalanceAfter: number;
}

/** 1.10 */
export interface CreateChargeCallPaymentLinkBody {
  delivery: 'SEND' | 'COPY';
  ttlDays?: number;
}
export type CreateChargeCallPaymentLinkResult =
  | { linkId: string; url: string; expiresAt: string; amountDue: number; currency: string }
  | {
      sent: true;
      channel: 'EMAIL' | 'WHATSAPP';
      linkId: string;
      expiresAt: string;
      amountDue: number;
      currency: string;
    }
  | { sent: false; reason: 'NO_ELIGIBLE_CHANNEL' | 'EVENT_DISABLED' | 'SEND_FAILED' | 'RECIPIENT_NOT_FOUND' };

export interface ChargeCallPaymentLinkSummary {
  id: string;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
  status: 'ACTIVE' | 'EXPIRED' | 'REVOKED';
  viewCount: number;
  lastViewedAt: string | null;
  createdByUserId: string | null;
  payment: { status: 'NONE' | OnlineCheckoutStatus; amount: number | null; updatedAt: string | null };
}

type Envelope<T> = { success: boolean; data: T };

const base = (tenantId: string, syndicId: string) => `/tenants/${tenantId}/syndics/${syndicId}`;

/** 1.1 */
export async function getSyndicGatewaySettings(
  tenantId: string,
  syndicId: string
): Promise<SyndicPaymentGatewaySettings> {
  const response = await apiClient.get<Envelope<SyndicPaymentGatewaySettings>>(
    `${base(tenantId, syndicId)}/paiement-en-ligne/configuration`
  );
  return response.data.data;
}

/** 1.2 */
export async function updateSyndicGatewaySettings(
  tenantId: string,
  syndicId: string,
  body: UpdateSyndicPaymentGatewayBody
): Promise<SyndicPaymentGatewaySettings> {
  const response = await apiClient.put<Envelope<SyndicPaymentGatewaySettings>>(
    `${base(tenantId, syndicId)}/paiement-en-ligne/configuration`,
    body
  );
  return response.data.data;
}

/** 1.3 */
export async function testSyndicGatewayConnection(
  tenantId: string,
  syndicId: string
): Promise<SyndicPaymentGatewayTestResult> {
  const response = await apiClient.post<Envelope<SyndicPaymentGatewayTestResult>>(
    `${base(tenantId, syndicId)}/paiement-en-ligne/configuration/test`
  );
  return response.data.data;
}

/** 1.4 */
export async function getSyndicProviderBalance(tenantId: string, syndicId: string): Promise<SyndicProviderBalance> {
  const response = await apiClient.get<Envelope<SyndicProviderBalance>>(
    `${base(tenantId, syndicId)}/paiement-en-ligne/solde`
  );
  return response.data.data;
}

/** 1.5 */
export async function listSyndicOnlineCheckouts(
  tenantId: string,
  syndicId: string,
  query: SyndicOnlineCheckoutsQuery = {}
): Promise<SyndicOnlineCheckoutsResult> {
  const response = await apiClient.get<Envelope<SyndicOnlineCheckoutsResult>>(
    `${base(tenantId, syndicId)}/paiements-en-ligne`,
    {
      params: {
        status: query.status && query.status.length > 0 ? query.status.join(',') : undefined,
        origin: query.origin || undefined,
        lotId: query.lotId || undefined,
        from: query.from || undefined,
        to: query.to || undefined,
        page: query.page,
        limit: query.limit
      }
    }
  );
  return response.data.data;
}

/** 1.6 */
export async function verifySyndicOnlineCheckout(
  tenantId: string,
  syndicId: string,
  checkoutId: string
): Promise<VerifySyndicCheckoutResult> {
  const response = await apiClient.post<Envelope<VerifySyndicCheckoutResult>>(
    `${base(tenantId, syndicId)}/paiements-en-ligne/${checkoutId}/verifier`
  );
  return response.data.data;
}

/** 1.7 */
export async function decideSyndicOnlineCheckout(
  tenantId: string,
  syndicId: string,
  checkoutId: string,
  body: DecideSyndicCheckoutBody
): Promise<DecideSyndicCheckoutResult> {
  const response = await apiClient.post<Envelope<DecideSyndicCheckoutResult>>(
    `${base(tenantId, syndicId)}/paiements-en-ligne/${checkoutId}/trancher`,
    body
  );
  return response.data.data;
}

/** 1.8 */
export async function listSyndicGatewayPayouts(
  tenantId: string,
  syndicId: string,
  limit?: number
): Promise<SyndicGatewayPayoutsResult> {
  const response = await apiClient.get<Envelope<SyndicGatewayPayoutsResult>>(
    `${base(tenantId, syndicId)}/paiement-en-ligne/reversements`,
    { params: { limit } }
  );
  return response.data.data;
}

/** 1.9 */
export async function recordSyndicGatewayPayout(
  tenantId: string,
  syndicId: string,
  body: RecordGatewayPayoutBody
): Promise<RecordGatewayPayoutResult> {
  const response = await apiClient.post<Envelope<RecordGatewayPayoutResult>>(
    `${base(tenantId, syndicId)}/paiement-en-ligne/reversements`,
    body
  );
  return response.data.data;
}

/** 1.10 : POST /charges/:chargeId/lien-paiement */
export async function createChargeCallPaymentLink(
  tenantId: string,
  syndicId: string,
  chargeId: string,
  body: CreateChargeCallPaymentLinkBody
): Promise<CreateChargeCallPaymentLinkResult> {
  const response = await apiClient.post<Envelope<CreateChargeCallPaymentLinkResult>>(
    `${base(tenantId, syndicId)}/charges/${chargeId}/lien-paiement`,
    body
  );
  return response.data.data;
}

/** 1.10 : GET /charges/:chargeId/liens-paiement */
export async function listChargeCallPaymentLinks(
  tenantId: string,
  syndicId: string,
  chargeId: string
): Promise<ChargeCallPaymentLinkSummary[]> {
  const response = await apiClient.get<Envelope<ChargeCallPaymentLinkSummary[]>>(
    `${base(tenantId, syndicId)}/charges/${chargeId}/liens-paiement`
  );
  return response.data.data;
}

/** 1.10 : DELETE /charges/:chargeId/lien-paiement/:linkId */
export async function revokeChargeCallPaymentLink(
  tenantId: string,
  syndicId: string,
  chargeId: string,
  linkId: string
): Promise<{ revoked: true }> {
  const response = await apiClient.delete<Envelope<{ revoked: true }>>(
    `${base(tenantId, syndicId)}/charges/${chargeId}/lien-paiement/${linkId}`
  );
  return response.data.data;
}
