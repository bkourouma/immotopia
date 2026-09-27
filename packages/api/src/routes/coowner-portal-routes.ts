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

export default router;
