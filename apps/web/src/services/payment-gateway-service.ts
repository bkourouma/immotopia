import apiClient from '../utils/api-client';

/**
 * Paiement en ligne des loyers — Lot 7, agrégateur PaySecureHub.
 *
 * Contrat gelé entre le backend et ce frontend :
 * `docs/finance/LOT-7-CONTRAT-PAIEMENT-EN-LIGNE.md`. Écrit contre le contrat
 * pendant que l'API est développée en parallèle : mêmes types, mêmes routes,
 * même enveloppe `{ success, data }` que les autres services (`agency-finance-
 * settings-service.ts`).
 *
 * Trois familles de points d'entrée :
 * - Agence — paramètres (§3.1) : compte marchand, activation, test.
 * - Agence — paiements (§3.2) : statut du checkout adossé à un `RentalPayment`.
 * - Portail locataire (§3.3) : disponibilité, création, suivi d'un checkout.
 */

export type PaymentGatewayProvider = 'PAYSECUREHUB';
export type PaymentGatewayMode = 'SIMULATOR' | 'LIVE';
export type PaymentGatewayFeesPayer = 'CLIENT' | 'AGENCY';
export type OnlineCheckoutStatus = 'PENDING' | 'SUCCESS' | 'FAILED' | 'CANCELED' | 'EXPIRED' | 'REVIEW';

type ApiResponse<T> = { success: boolean; data: T };

/** `GET/PUT /tenants/:tenantId/settings/payment-gateway` — contrat §3.1. */
export interface PaymentGatewaySettings {
  provider: PaymentGatewayProvider;
  mode: PaymentGatewayMode;
  isActive: boolean;
  merchantId: string | null;
  /** La clé elle-même n'est jamais renvoyée : seule sa présence l'est. */
  apiKeyConfigured: boolean;
  apiKeyLast4: string | null;
  treasuryAccountId: string | null;
  /** « 5525 — PaySecureHub — compte de collecte », déjà formaté par l'API. */
  treasuryAccountLabel: string | null;
  feesPaidBy: PaymentGatewayFeesPayer;
  /** URL de notification (IPN) à communiquer à l'agrégateur. */
  callbackUrl: string;
  /** Faux en production, sauf démonstration explicitement autorisée. */
  simulatorAvailable: boolean;
  /** Faux si `PAYMENT_SECRETS_KEY` manque côté API : aucune clé enregistrable. */
  encryptionAvailable: boolean;
  lastTest: { at: string; ok: boolean; message: string } | null;
}

/**
 * Corps de `PUT .../settings/payment-gateway`, partiel.
 *
 * `apiKey` est en écriture seule : absente, la clé enregistrée ne change pas ;
 * chaîne vide, elle est effacée. Ne jamais préremplir ce champ avec une valeur
 * reçue de l'API — il n'y en a pas.
 */
export interface UpdatePaymentGatewaySettings {
  mode?: PaymentGatewayMode;
  isActive?: boolean;
  merchantId?: string | null;
  apiKey?: string;
  treasuryAccountId?: string | null;
  feesPaidBy?: PaymentGatewayFeesPayer;
}

/** `POST .../settings/payment-gateway/test` — jamais un 500 : une erreur de l'agrégateur donne `ok: false`. */
export interface PaymentGatewayTestResult {
  ok: boolean;
  message: string;
  balance: { amount: number; currency: string; at: string } | null;
}

/** `GET /portal/tenant/online-payments/availability` — contrat §3.3. */
export interface OnlineCheckoutAvailability {
  available: boolean;
  mode: PaymentGatewayMode | null;
  feesPaidBy: PaymentGatewayFeesPayer | null;
}

/**
 * `POST /portal/tenant/online-payments` et `GET .../online-payments/:codePaiement`.
 *
 * Le frontend redirige vers `checkoutUrl` après création, puis interroge
 * cette même forme au retour pour suivre le statut (contrat §3.3).
 */
export interface OnlineCheckout {
  id: string;
  codePaiement: string;
  status: OnlineCheckoutStatus;
  amount: number;
  currency: string;
  installmentIds: string[];
  checkoutUrl: string | null;
  providerServiceName: string | null;
  failureMessage: string | null;
  paymentId: string;
  createdAt: string;
  completedAt: string | null;
}

/**
 * Résumé attaché à chaque `RentalPayment` côté agence (contrat §3.2) —
 * `GET .../rental/payments`, `GET .../rental/payments/:id` et
 * `POST .../rental/payments/:id/online-check`.
 */
export interface OnlineCheckoutSummary {
  id: string;
  codePaiement: string;
  status: OnlineCheckoutStatus;
  mode: PaymentGatewayMode;
  providerServiceName: string | null;
  providerTransactionId: string | null;
  providerFees: number | null;
  failureMessage: string | null;
  reviewReason: string | null;
  lastCheckedAt: string | null;
}

/**
 * Corps du refus 409 à la création d'un checkout portail : un checkout
 * `PENDING` de moins de 15 minutes couvre déjà une des échéances choisies. Le
 * portail reprend alors ce checkout plutôt que d'en créer un autre.
 */
export interface OnlineCheckoutConflict {
  codePaiement: string;
  checkoutUrl: string | null;
}

// ==================== Agence — paramètres (§3.1) ====================

export async function getPaymentGatewaySettings(tenantId: string): Promise<PaymentGatewaySettings> {
  const response = await apiClient.get<ApiResponse<PaymentGatewaySettings>>(
    `/tenants/${tenantId}/settings/payment-gateway`
  );
  return response.data.data;
}

export async function updatePaymentGatewaySettings(
  tenantId: string,
  input: UpdatePaymentGatewaySettings
): Promise<PaymentGatewaySettings> {
  const response = await apiClient.put<ApiResponse<PaymentGatewaySettings>>(
    `/tenants/${tenantId}/settings/payment-gateway`,
    input
  );
  return response.data.data;
}

export async function testPaymentGatewayConnection(tenantId: string): Promise<PaymentGatewayTestResult> {
  const response = await apiClient.post<ApiResponse<PaymentGatewayTestResult>>(
    `/tenants/${tenantId}/settings/payment-gateway/test`
  );
  return response.data.data;
}

// ==================== Agence — paiements (§3.2) ====================

/** Relance `reconcileCheckout` pour le checkout adossé à ce paiement — 404 s'il n'en a pas. */
export async function checkOnlinePaymentStatus(tenantId: string, paymentId: string): Promise<OnlineCheckoutSummary> {
  const response = await apiClient.post<ApiResponse<OnlineCheckoutSummary>>(
    `/tenants/${tenantId}/rental/payments/${paymentId}/online-check`
  );
  return response.data.data;
}

// ==================== Portail locataire (§3.3) ====================

export async function getOnlinePaymentAvailability(): Promise<OnlineCheckoutAvailability> {
  const response = await apiClient.get<ApiResponse<OnlineCheckoutAvailability>>(
    '/portal/tenant/online-payments/availability'
  );
  return response.data.data;
}

/**
 * Crée un checkout portail pour les échéances choisies.
 *
 * Le refus 409 (checkout `PENDING` déjà en cours pour l'une d'elles) n'est
 * PAS avalé ici : il remonte tel quel, `error.response.data.data` portant
 * `codePaiement` et `checkoutUrl` (`OnlineCheckoutConflict`). L'écran appelant
 * décide alors de reprendre ce checkout plutôt que d'en ouvrir un autre.
 */
export async function createOnlinePaymentCheckout(installmentIds: string[]): Promise<OnlineCheckout> {
  const response = await apiClient.post<ApiResponse<OnlineCheckout>>('/portal/tenant/online-payments', {
    installmentIds
  });
  return response.data.data;
}

export async function getOnlinePaymentCheckout(codePaiement: string): Promise<OnlineCheckout> {
  const response = await apiClient.get<ApiResponse<OnlineCheckout>>(`/portal/tenant/online-payments/${codePaiement}`);
  return response.data.data;
}
