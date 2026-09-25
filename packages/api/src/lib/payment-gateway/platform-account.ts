import type { PaymentGatewayMode } from '@prisma/client';
import { env, paymentGatewaySimulatorAvailable } from '../../config/env';
import { BadRequestError } from '../../middleware/error-middleware';
import type { GatewayCredentials } from './types';

/**
 * Compte PaySecureHub PROPRE A IMMOTOPIA, qui encaisse l'abonnement des
 * agences (factures PLATFORM). Distinct des comptes marchands des agences
 * (`PaymentGatewayConfig`, lot 7) : ses identifiants viennent uniquement de
 * l'environnement (`PLATFORM_PAYSECUREHUB_*`, src/config/env.ts), jamais de
 * la base ni d'une valeur en dur.
 */

export function platformGatewayMode(): PaymentGatewayMode {
  return env.PLATFORM_PAYSECUREHUB_MODE;
}

/** Le paiement en ligne des factures d'abonnement est-il possible sur ce serveur ? */
export function isPlatformGatewayAvailable(mode: PaymentGatewayMode = platformGatewayMode()): boolean {
  if (mode === 'SIMULATOR') return paymentGatewaySimulatorAvailable;
  return Boolean(env.PLATFORM_PAYSECUREHUB_API_KEY?.trim() && env.PLATFORM_PAYSECUREHUB_MERCHANT_ID?.trim());
}

/**
 * Identifiants du compte ImmoTopia pour un `GatewayClient`. `tenantId` est
 * l'agence qui paie : le client reel ne l'envoie pas, le simulateur s'en sert
 * pour filtrer sa lecture (garde multi-tenant).
 */
export function platformCredentials(tenantId: string, mode: PaymentGatewayMode): GatewayCredentials {
  if (mode === 'LIVE' && !isPlatformGatewayAvailable('LIVE')) {
    throw new BadRequestError("Le paiement en ligne de l'abonnement n'est pas paramétré.");
  }
  return {
    tenantId,
    merchantId: mode === 'LIVE' ? env.PLATFORM_PAYSECUREHUB_MERCHANT_ID ?? '' : '',
    apiKey: mode === 'LIVE' ? env.PLATFORM_PAYSECUREHUB_API_KEY ?? '' : '',
    baseUrl: env.PAYSECUREHUB_BASE_URL,
    timeoutMs: env.PAYSECUREHUB_TIMEOUT_MS
  };
}

/** Adresse de notification propre aux factures d'abonnement (distincte de celle des loyers). */
export function platformIpnUrl(): string {
  return `${env.BACKEND_URL.replace(/\/$/, '')}/api/payment-gateway/paysecurehub/platform-ipn`;
}

/** Retour de l'agence apres paiement : sa page Abonnement, qui suit le statut. */
export function platformReturnUrl(tenantId: string, codePaiement: string): string {
  return `${env.FRONTEND_URL.replace(/\/$/, '')}/tenant/${encodeURIComponent(tenantId)}/settings/abonnement?paiement=${encodeURIComponent(codePaiement)}`;
}
