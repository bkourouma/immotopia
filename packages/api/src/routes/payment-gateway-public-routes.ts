import { Router } from 'express';
import { webhookRateLimiter } from '../middleware/rate-limit-middleware';
import { paymentGatewaySimulatorAvailable } from '../config/env';
import {
  paysecurehubIpnHandler,
  paysecurehubPlatformIpnHandler,
  simulatorPageHandler,
  simulatorActionHandler
} from '../controllers/payment-gateway-public-controller';

/**
 * Points d'entrée publics du paiement en ligne (lot 7) — contrat §3.4.
 * Monté dans `app.ts` AVANT les routeurs qui imposent l'authentification,
 * comme `whatsapp.webhook.route.ts`.
 */
const router = Router();

router.post('/payment-gateway/paysecurehub/ipn', webhookRateLimiter, paysecurehubIpnHandler);
// Compte ImmoTopia : factures d'abonnement des agences (vague 3). Adresse
// distincte de celle des loyers, communiquee a BMI pour ce seul compte.
router.post('/payment-gateway/paysecurehub/platform-ipn', webhookRateLimiter, paysecurehubPlatformIpnHandler);

// Simulateur : monté seulement si disponible sur ce serveur (toujours hors
// production ; en production seulement avec PAYMENT_GATEWAY_SIMULATOR=1).
if (paymentGatewaySimulatorAvailable) {
  router.get('/payment-gateway/simulator/:codePaiement', simulatorPageHandler);
  router.post('/payment-gateway/simulator/:codePaiement/:outcome', simulatorActionHandler);
}

export default router;
