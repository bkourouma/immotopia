import { Router } from 'express';
import { authenticate } from '../middleware/auth-middleware';
import { requireCoOwnerPortalAccess } from '../middleware/coowner-portal-access';
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
router.get('/documents', listCoOwnerDocumentsHandler);
router.get('/documents/:documentId/fichier', downloadCoOwnerDocumentHandler);
router.get('/assemblees', listCoOwnerMeetingsHandler);

// Lot S5 (besoin 2) : paiements, reçus et quittances, relevé PDF, suivi
// mensuel, fiche de la copropriété. Toujours limité aux lots du
// copropriétaire connecté ; pas de paiement en ligne (P4).
router.get('/paiements', listCoOwnerPaymentsHandler);
router.get('/quittances', listCoOwnerReceiptsHandler);
router.get('/quittances/:receiptId/fichier', downloadCoOwnerReceiptHandler);
router.get('/lots/:lotId/releve', downloadCoOwnerLotStatementHandler);
router.get('/lots/:lotId/suivi-mensuel', getCoOwnerLotMonthlyTrackingHandler);
router.get('/coproprietes/:syndicId', getCoOwnerSyndicateHandler);
router.get('/coproprietes/:syndicId/logo', readCoOwnerSyndicateLogoHandler);
router.get('/coproprietes/:syndicId/logo-emetteur', readCoOwnerIssuerLogoHandler);

export default router;
