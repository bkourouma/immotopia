import apiClient from '../utils/api-client';
import type {
  InstallmentPaymentPublicDto,
  InstallmentPaymentStatusDto
} from '../types/installment-payment-public-types';

type ApiResponse<T> = { success: boolean; data: T };

/** Échec commun aux trois appels publics. */
export type PublicPaymentFailure = 'invalid' | 'rate_limited' | 'unavailable';

export type PublicInstallmentPaymentResult =
  { status: 'ok'; payment: InstallmentPaymentPublicDto } | { status: PublicPaymentFailure };

export type StartInstallmentPaymentResult =
  | { status: 'ok'; checkoutUrl: string }
  | { status: PublicPaymentFailure }
  | { status: 'conflict'; reviewPending: boolean };

export type InstallmentPaymentStatusResult =
  { status: 'ok'; payment: InstallmentPaymentStatusDto } | { status: PublicPaymentFailure };

// Appels publics : sans session (`withCredentials: false`), statut HTTP lu ici
// (`validateStatus`) pour que le refresh de session et les redirections de
// l'intercepteur ne se déclenchent jamais. Le jeton / le code part dans le CORPS.
const PUBLIC_CONFIG = { withCredentials: false, validateStatus: () => true } as const;
const BASE = '/public/secure-links/installment-payment';

function failureFor(status: number): PublicPaymentFailure {
  if (status === 429) return 'rate_limited';
  if (status >= 500) return 'unavailable';
  // 404 uniforme, 400, etc. : se confondent volontairement en « lien invalide ».
  return 'invalid';
}

/** Ouvre le lien : agence, période, montant dû recalculé par le serveur. */
export async function fetchPublicInstallmentPayment(token: string): Promise<PublicInstallmentPaymentResult> {
  try {
    const response = await apiClient.post<ApiResponse<InstallmentPaymentPublicDto>>(BASE, { token }, PUBLIC_CONFIG);
    if (response.status === 200 && response.data?.success && response.data.data) {
      return { status: 'ok', payment: response.data.data };
    }
    return { status: failureFor(response.status) };
  } catch {
    return { status: 'unavailable' };
  }
}

/** Démarre (ou reprend) le paiement : retourne l'URL de paiement fournie par le serveur. */
export async function startPublicInstallmentPayment(token: string): Promise<StartInstallmentPaymentResult> {
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
      // Le corps peut préciser que le paiement attend la vérification de l'agence.
      const body = response.data as { reviewPending?: unknown; data?: { reviewPending?: unknown } } | undefined;
      return { status: 'conflict', reviewPending: body?.reviewPending === true || body?.data?.reviewPending === true };
    }
    return { status: failureFor(response.status) };
  } catch {
    return { status: 'unavailable' };
  }
}

/** Statut serveur d'un paiement, d'après le code de retour du fournisseur (jamais une preuve par lui-même). */
export async function fetchPublicInstallmentPaymentStatus(
  codePaiement: string
): Promise<InstallmentPaymentStatusResult> {
  try {
    const response = await apiClient.post<ApiResponse<InstallmentPaymentStatusDto>>(
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

/**
 * Une URL de paiement n'est suivie que si elle est absolue en https (http
 * seulement vers localhost, pour le simulateur en développement) et sans
 * identifiants intégrés. Tout le reste (relative, `javascript:`, `data:`…) est refusé.
 */
export function isSafeCheckoutUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value === '' || value.trim() !== value) return false;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.username || url.password) return false;
  if (url.protocol === 'https:') return true;
  return url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
}
