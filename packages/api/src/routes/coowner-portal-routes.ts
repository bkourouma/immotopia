import { Router, type Request } from 'express';
import rateLimit from 'express-rate-limit';
import { authenticate } from '../middleware/auth-middleware';
import { requireCoOwnerPortalAccess } from '../middleware/coowner-portal-access';
import { coOwnerChargeNoticeRateLimiter, coOwnerPortalPdfRateLimiter } from '../middleware/rate-limit-middleware';
import {
  downloadCoOwnerDocumentHandler,
  getCoOwnerLotAccountHandler,
  listCoOwnerChargeCallsHandler,
  listCoOwnerDocumentsHandler,
  listCoOwnerLotsHandler,
  listCoOwnerMeetingsHandler
} from '../controllers/coowner-portal-controller';
import {
  downloadCoOwnerLotStatementHandler,
  downloadCoOwnerReceiptHandler,
  getCoOwnerLotMonthlyTrackingHandler,
  getCoOwnerSyndicateHandler,
  listCoOwnerPaymentsHandler,
  listCoOwnerReceiptsHandler,
  readCoOwnerIssuerLogoHandler,
  readCoOwnerSyndicateLogoHandler
} from '../controllers/coowner-portal-finance-controller';
import { downloadCoOwnerChargeCallNoticeHandler } from '../controllers/coowner-charge-notice-controller';
import {
  getCoOwnerOnlinePaymentAvailabilityHandler,
  getCoOwnerOnlinePaymentHandler,
  startCoOwnerOnlinePaymentHandler
} from '../controllers/coowner-online-payment-controller';

/**
 * Limiteurs du paiement en ligne, posés APRÈS `authenticate` et la garde du
 * portail : un budget par compte (repli sur l'IP), aux clés propres.
 * Le statut est interrogé toutes les 3 s pendant ~2 min (~40 requêtes).
 */
const onlinePaymentLimiter = (name: string, max: number) =>
  rateLimit({
    windowMs: 60 * 1000,
    max,
    keyGenerator: (req: Request) => `coowner-online-${name}:${req.user?.userId ?? req.ip ?? 'anonyme'}`,
    message: { success: false, message: 'Trop de requêtes. Veuillez réessayer dans une minute.' },
    standardHeaders: true,
    legacyHeaders: false
  });
const coOwnerOnlinePaymentAvailabilityLimiter = onlinePaymentLimiter('availability', 60);
const coOwnerOnlinePaymentStartLimiter = onlinePaymentLimiter('start', 10);
const coOwnerOnlinePaymentStatusLimiter = onlinePaymentLimiter('status', 90);

/**
 * Portail copropriétaire, monté sur `/api/portal/copropriete` (app.ts).
 * Lecture seule ; chaque route passe par `requireCoOwnerPortalAccess`.
 * Comme les deux autres portails, hors abonnement (route-features, D8).
 */
const router = Router();

router.use(authenticate);
router.use(requireCoOwnerPortalAccess);

router.get('/lots', listCoOwnerLotsHandler);
router.get('/lots/:lotId/compte', getCoOwnerLotAccountHandler);
router.get('/appels', listCoOwnerChargeCallsHandler);
// Lot S4 : avis d'appel de charges PDF d'un appel du perimetre.
router.get('/appels/:chargeId/avis', coOwnerChargeNoticeRateLimiter, downloadCoOwnerChargeCallNoticeHandler);
router.get('/documents', listCoOwnerDocumentsHandler);
router.get('/documents/:documentId/fichier', downloadCoOwnerDocumentHandler);
router.get('/assemblees', listCoOwnerMeetingsHandler);

// Lot S5 (besoin 2) : paiements, reçus et quittances, relevé PDF, suivi
// mensuel, fiche de la copropriété. Toujours limité aux lots du
// copropriétaire connecté.
router.get('/paiements', listCoOwnerPaymentsHandler);
router.get('/quittances', listCoOwnerReceiptsHandler);
router.get('/quittances/:receiptId/fichier', coOwnerPortalPdfRateLimiter, downloadCoOwnerReceiptHandler);
router.get('/lots/:lotId/releve', coOwnerPortalPdfRateLimiter, downloadCoOwnerLotStatementHandler);
router.get('/lots/:lotId/suivi-mensuel', getCoOwnerLotMonthlyTrackingHandler);
router.get('/coproprietes/:syndicId', getCoOwnerSyndicateHandler);
router.get('/coproprietes/:syndicId/logo', readCoOwnerSyndicateLogoHandler);
router.get('/coproprietes/:syndicId/logo-emetteur', readCoOwnerIssuerLogoHandler);

// Spec 042 : paiement en ligne des charges. `disponibilite` AVANT `:codePaiement`.
// Droit SYNDIC contrôlé dans le moteur (le portail est hors garde d'abonnement).
router.get(
  '/paiements-en-ligne/disponibilite',
  coOwnerOnlinePaymentAvailabilityLimiter,
  getCoOwnerOnlinePaymentAvailabilityHandler
);
router.post('/paiements-en-ligne', coOwnerOnlinePaymentStartLimiter, startCoOwnerOnlinePaymentHandler);
router.get('/paiements-en-ligne/:codePaiement', coOwnerOnlinePaymentStatusLimiter, getCoOwnerOnlinePaymentHandler);

export default router;
