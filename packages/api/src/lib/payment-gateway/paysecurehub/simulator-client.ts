import { randomUUID } from 'crypto';
import { prisma } from '../../../utils/database';
import { env } from '../../../config/env';
import { mapProviderState } from '../status-mapping';
import type {
  BalanceResult,
  BuildAwayRequest,
  BuildAwayResult,
  GatewayClient,
  GatewayCredentials,
  ProviderStatus
} from '../types';

/**
 * Implémentation simulateur : aucun appel réseau. `buildAway` renvoie l'URL
 * de notre propre page de simulation ; `getStatus` lit `simulatedOutcome`,
 * écrit en base par `POST /payment-gateway/simulator/:codePaiement/:outcome`
 * (contrat §3.4) — jamais une réponse fabriquée ici, pour que le
 * rapprochement suive exactement le même chemin qu'en mode réel.
 */
export const simulatorClient: GatewayClient = {
  async buildAway(_credentials: GatewayCredentials, request: BuildAwayRequest): Promise<BuildAwayResult> {
    const url = `${env.BACKEND_URL.replace(/\/$/, '')}/api/payment-gateway/simulator/${request.codePaiement}`;
    return {
      url,
      tokens: randomUUID(),
      code: '00',
      message: 'Simulateur PaySecureHub'
    };
  },

  async getStatus(_credentials: GatewayCredentials, codePaiement: string): Promise<ProviderStatus> {
    const checkout = await prisma.onlinePaymentCheckout.findUnique({
      where: { codePaiement },
      select: { simulatedOutcome: true, amount: true }
    });

    // Absence de choix du locataire : « en attente », comme un agrégateur
    // réel qui n'a encore rien à rapporter.
    const rawState = checkout?.simulatedOutcome ?? null;

    return {
      rawState,
      mappedState: mapProviderState(rawState),
      transactionId: checkout ? `SIM-${codePaiement}` : null,
      amount: checkout ? Number(checkout.amount) : null,
      fees: 0,
      serviceName: 'Simulateur',
      error: null,
      raw: { simulatedOutcome: rawState }
    };
  },

  async getBalance(): Promise<BalanceResult> {
    return { amount: 0, currency: 'FCFA' };
  }
};
