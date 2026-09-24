import { Router } from 'express';
import { webhookRateLimiter } from '../middleware/rate-limit-middleware';
import { paymentGatewaySimulatorAvailable } from '../config/env';
import {
  paysecurehubIpnHandler,
  simulatorPageHandler,
  simulatorActionHandler
} from '../controllers/payment-gateway-public-controller';

/**
 * Points d'entrée publics du paiement en ligne (lot 7) — contrat §3.4.
 * Monté dans `index.ts` AVANT les routeurs qui imposent l'authentification,
 * comme `whatsapp.webhook.route.ts`.
 */
const router = Router();

router.post('/payment-gateway/paysecurehub/ipn', webhookRateLimiter, paysecurehubIpnHandler);

// Simulateur : monté seulement si disponible sur ce serveur (toujours hors
// production ; en production seulement avec PAYMENT_GATEWAY_SIMULATOR=1).
if (paymentGatewaySimulatorAvailable) {
  router.get('/payment-gateway/simulator/:codePaiement', simulatorPageHandler);
  router.post('/payment-gateway/simulator/:codePaiement/:outcome', simulatorActionHandler);
}

export default router;
