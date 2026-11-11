import { Router, type RequestHandler } from 'express';
import { authenticate } from '../middleware/auth-middleware';
import { requireTenantAccess } from '../middleware/tenant-middleware';
import { enforceTenantIsolation } from '../middleware/tenant-isolation-middleware';
import { requirePermission } from '../middleware/rbac-middleware';
import { requirePaymentsAllocate, requirePaymentsView } from '../middleware/rental-rbac-middleware';
import {
  rentalCollectionAccountLimiter,
  rentalCollectionPayoutLimiter,
  rentalOnlineResolveLimiter,
  rentalOnlineVerifyLimiter
} from '../middleware/rate-limit-middleware';
import {
  createCollectionPayoutHandler,
  getCollectionAccountHandler,
  getOnlineAvailabilityHandler,
  getOnlinePaymentHandler,
  getOnlinePaymentsSummaryHandler,
  listCollectionPayoutsHandler,
  listOnlinePaymentsHandler,
  resolveOnlinePaymentHandler,
  verifyOnlinePaymentHandler
} from '../controllers/rental-online-review-controller';

/**
 * Paiements de loyer en ligne : suivi, vérification, décision REVIEW et compte de collecte,
 * côté gestionnaire (contrat 049 §2). Classées RENTAL par le préfixe `/rental` de
 * `lib/subscription/route-features.ts`.
 *
 * Monté sur `/api` tout entier dans `app.ts` : les gardes se posent AVEC leur chemin
 * (comme `routes/syndic-online-payment-routes.ts`), jamais en `router.use` nu.
 * Ordre obligatoire : `/summary`, `/availability` et `/collection-account*` AVANT `/:checkoutId`.
 */
const router = Router();

const BASE = '/tenants/:tenantId/rental/online-payments';
const guards: RequestHandler[] = [authenticate, requireTenantAccess, enforceTenantIsolation];

router.get(`${BASE}/summary`, ...guards, requirePaymentsView, getOnlinePaymentsSummaryHandler);
router.get(`${BASE}/availability`, ...guards, requirePaymentsView, getOnlineAvailabilityHandler);
router.get(
  `${BASE}/collection-account`,
  ...guards,
  requirePaymentsView,
  rentalCollectionAccountLimiter,
  getCollectionAccountHandler
);
router.get(`${BASE}/collection-account/payouts`, ...guards, requirePaymentsView, listCollectionPayoutsHandler);
// Reversement : comme le virement de trésorerie existant (`POST /treasury/transfers`), il faut aussi
// pouvoir créer une pièce financière.
router.post(
  `${BASE}/collection-account/payouts`,
  ...guards,
  requirePaymentsAllocate,
  requirePermission('FINANCE_DOCUMENTS_CREATE'),
  rentalCollectionPayoutLimiter,
  createCollectionPayoutHandler
);

router.get(BASE, ...guards, requirePaymentsView, listOnlinePaymentsHandler);
router.get(`${BASE}/:checkoutId`, ...guards, requirePaymentsView, getOnlinePaymentHandler);
router.post(
  `${BASE}/:checkoutId/verify`,
  ...guards,
  requirePaymentsAllocate,
  rentalOnlineVerifyLimiter,
  verifyOnlinePaymentHandler
);
router.post(
  `${BASE}/:checkoutId/resolve`,
  ...guards,
  requirePaymentsAllocate,
  rentalOnlineResolveLimiter,
  resolveOnlinePaymentHandler
);

export default router;
