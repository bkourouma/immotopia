import apiClient from '../utils/api-client';
import { isSafeCheckoutUrl } from './public-installment-payment-service';

/**
 * Pages publiques « Payer cet appel » (spec 042, contrat §3). Types recopiés du
 * contrat de l'API, qui ne s'importe pas côté web.
 */

export type OnlinePaymentChannel = 'WAVE' | 'ORANGE_MONEY' | 'MTN_MONEY' | 'MOOV_MONEY' | 'CARD';
export type FeesPaidBy = 'CLIENT' | 'AGENCY';
/** Vue publique : REVIEW est présenté PENDING, EXPIRED est présenté CANCELED. */
export type PublicCheckoutStatus = 'PENDING' | 'SUCCESS' | 'FAILED' | 'CANCELED';

/** Ce que le copropriétaire voit en ouvrant le lien : tout est recalculé côté serveur. */
export interface ChargeCallPaymentPublicDto {
  syndicateName: string;
  lotLabel: string;
  period: string;
  dueDate: string;
  amountDue: number;
  currency: string;
  expiresAt: string;
  paymentMethods: OnlinePaymentChannel[];
  simulated: boolean;
  feesPaidBy: FeesPaidBy;
  paymentInProgress: boolean;
  reviewPending: boolean;
}

export interface ChargeCallPaymentStatusDto {
  status: PublicCheckoutStatus;
  amount: number;
  currency: string;
  syndicateName: string;
  period: string;
}

type ApiResponse<T> = { success: boolean; data: T };

/** Échec commun aux trois appels publics. */
export type PublicChargePaymentFailure = 'invalid' | 'rate_limited' | 'unavailable';

export type PublicChargeCallPaymentResult =
  { status: 'ok'; payment: ChargeCallPaymentPublicDto } | { status: PublicChargePaymentFailure };

export type StartChargeCallPaymentResult =
  | { status: 'ok'; checkoutUrl: string }
  | { status: PublicChargePaymentFailure }
  | { status: 'conflict'; reviewPending: boolean; declarationPending: boolean };

export type ChargeCallPaymentStatusResult =
  { status: 'ok'; payment: ChargeCallPaymentStatusDto } | { status: PublicChargePaymentFailure };

// Appels publics : sans session (`withCredentials: false`), statut HTTP lu ici
// (`validateStatus`) pour que le refresh de session et les redirections de
// l'intercepteur ne se déclenchent jamais. Le jeton / le code part dans le CORPS.
const PUBLIC_CONFIG = { withCredentials: false, validateStatus: () => true } as const;
const BASE = '/public/secure-links/charge-call-payment';

function failureFor(status: number): PublicChargePaymentFailure {
  if (status === 429) return 'rate_limited';
  if (status >= 500) return 'unavailable';
  // 404 uniforme, 400, etc. : se confondent volontairement en « lien invalide ».
  return 'invalid';
}

/** Même garde que le paiement d'un loyer : https absolu, ou http vers localhost seulement. */
export { isSafeCheckoutUrl };

/** Ouvre le lien : copropriété, lot, période, reste dû recalculé par le serveur. */
export async function fetchPublicChargeCallPayment(token: string): Promise<PublicChargeCallPaymentResult> {
  try {
    const response = await apiClient.post<ApiResponse<ChargeCallPaymentPublicDto>>(BASE, { token }, PUBLIC_CONFIG);
    if (response.status === 200 && response.data?.success && response.data.data) {
      return { status: 'ok', payment: response.data.data };
    }
    return { status: failureFor(response.status) };
  } catch {
    return { status: 'unavailable' };
  }
}

/** Démarre (ou reprend) le paiement : retourne l'URL de paiement fournie par le serveur. */
export async function startPublicChargeCallPayment(token: string): Promise<StartChargeCallPaymentResult> {
  try {
    const response = await apiClient.post<ApiResponse<{ checkoutUrl: string }>>(
      `${BASE}/start`,
      { token },
      PUBLIC_CONFIG
    );
    if (response.status === 200 && response.data?.success && typeof response.data.data?.checkoutUrl === 'string') {
      return { status: 'ok', checkoutUrl: response.data.data.checkoutUrl };
    }
    if (response.status === 409) {
      // 409 distincts (contrat §3.2, spec 047 R15) : le code dit si le syndic doit trancher ou s'il vérifie
      // un paiement mobile money déclaré pour cet appel.
      const body = response.data as { code?: unknown } | undefined;
      return {
        status: 'conflict',
        reviewPending: body?.code === 'ONLINE_PAYMENT_UNDER_REVIEW',
        declarationPending: body?.code === 'CHARGE_CALL_DECLARATION_PENDING'
      };
    }
    return { status: failureFor(response.status) };
  } catch {
    return { status: 'unavailable' };
  }
}

/** Statut serveur d'un paiement, d'après le code de retour du fournisseur (jamais une preuve par lui-même). */
export async function fetchPublicChargeCallPaymentStatus(codePaiement: string): Promise<ChargeCallPaymentStatusResult> {
  try {
    const response = await apiClient.post<ApiResponse<ChargeCallPaymentStatusDto>>(
      `${BASE}/status`,
      { codePaiement },
      PUBLIC_CONFIG
    );
    if (response.status === 200 && response.data?.success && response.data.data) {
      return { status: 'ok', payment: response.data.data };
    }
    return { status: failureFor(response.status) };
  } catch {
    return { status: 'unavailable' };
  }
}
