import { Router, type RequestHandler } from 'express';
import { authenticate } from '../middleware/auth-middleware';
import { requireTenantAccess } from '../middleware/tenant-middleware';
import { enforcePropertyTenantIsolation } from '../middleware/tenant-isolation-middleware';
import { requireAnyPropertyPermission, requirePropertyPermission } from '../middleware/property-rbac-middleware';
import { requirePermission } from '../middleware/rbac-middleware';
import {
  syndicGatewayBalanceRateLimiter,
  syndicGatewayTestRateLimiter,
  syndicGatewayWriteRateLimiter
} from '../middleware/rate-limit-middleware';
import {
  createChargeCallPaymentLinkHandler,
  decideCheckoutHandler,
  getGatewaySettingsHandler,
  getProviderBalanceHandler,
  listChargeCallPaymentLinksHandler,
  listCheckoutsHandler,
  listPayoutsHandler,
  recordPayoutHandler,
  revokeChargeCallPaymentLinkHandler,
  testGatewayConnectionHandler,
  updateGatewaySettingsHandler,
  verifyCheckoutHandler
} from '../controllers/syndic-online-payment-controller';

/**
 * Paiement mobile des copropriétaires, côté gestionnaire (spec 042, contrat §1).
 *
 * Lecture `SYNDIC_VIEW`, écriture `SYNDIC_EDIT`; la configuration (clé API) et
 * son test exigent en plus `TENANT_SETTINGS_EDIT`. Classées SYNDIC par le
 * préfixe `/syndics` de `lib/subscription/route-features.ts`.
 *
 * Gardes posées avec leur chemin, jamais en `router.use` nu : ce routeur est
 * monté sur `/api` tout entier.
 */
const router = Router();

const guards: RequestHandler[] = [authenticate, requireTenantAccess, enforcePropertyTenantIsolation];
const canView = requireAnyPropertyPermission(['SYNDIC_VIEW']);
const canEdit = requirePropertyPermission('SYNDIC_EDIT');
const canEditSecrets = requirePermission('TENANT_SETTINGS_EDIT');

const BASE = '/tenants/:tenantId/syndics/:syndicId';
const GATEWAY = `${BASE}/paiement-en-ligne`;

// 1.1 à 1.4 : configuration de la copropriété.
router.get(`${GATEWAY}/configuration`, ...guards, canView, getGatewaySettingsHandler);
router.put(
  `${GATEWAY}/configuration`,
  ...guards,
  canEdit,
  canEditSecrets,
  syndicGatewayWriteRateLimiter,
  updateGatewaySettingsHandler
);
router.post(
  `${GATEWAY}/configuration/test`,
  ...guards,
  canEdit,
  canEditSecrets,
  syndicGatewayTestRateLimiter,
  testGatewayConnectionHandler
);
router.get(`${GATEWAY}/solde`, ...guards, canView, syndicGatewayBalanceRateLimiter, getProviderBalanceHandler);

// 1.5 à 1.7 : suivi des paiements, vérification et décision sur un paiement en revue.
router.get(`${BASE}/paiements-en-ligne`, ...guards, canView, listCheckoutsHandler);
router.post(
  `${BASE}/paiements-en-ligne/:checkoutId/verifier`,
  ...guards,
  canEdit,
  syndicGatewayWriteRateLimiter,
  verifyCheckoutHandler
);
router.post(
  `${BASE}/paiements-en-ligne/:checkoutId/trancher`,
  ...guards,
  canEdit,
  syndicGatewayWriteRateLimiter,
  decideCheckoutHandler
);

// 1.8 et 1.9 : reversements du compte de collecte 5525.
router.get(`${GATEWAY}/reversements`, ...guards, canView, listPayoutsHandler);
router.post(`${GATEWAY}/reversements`, ...guards, canEdit, syndicGatewayWriteRateLimiter, recordPayoutHandler);

// 1.10 : lien « Payer cet appel » (créer ou copier, envoyer, lister, révoquer).
router.post(
  `${BASE}/charges/:chargeId/lien-paiement`,
  ...guards,
  canEdit,
  syndicGatewayWriteRateLimiter,
  createChargeCallPaymentLinkHandler
);
router.get(`${BASE}/charges/:chargeId/liens-paiement`, ...guards, canView, listChargeCallPaymentLinksHandler);
router.delete(
  `${BASE}/charges/:chargeId/lien-paiement/:linkId`,
  ...guards,
  canEdit,
  syndicGatewayWriteRateLimiter,
  revokeChargeCallPaymentLinkHandler
);

export default router;
