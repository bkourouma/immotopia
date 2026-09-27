import { Router, type RequestHandler } from 'express';
import { authenticate } from '../middleware/auth-middleware';
import { requireTenantAccess } from '../middleware/tenant-middleware';
import { enforcePropertyTenantIsolation } from '../middleware/tenant-isolation-middleware';
import { requireAnyPropertyPermission, requirePropertyPermission } from '../middleware/property-rbac-middleware';
import {
  getLotAdvanceHandler,
  getMonthlyTrackingHandler,
  listLotOpenCallsHandler,
  previewLotPaymentHandler,
  recordLotPaymentHandler
} from '../controllers/syndic-lot-payments-controller';

/**
 * Paiements par lot, avance et suivi mensuel des charges (lot S2).
 *
 * Memes permissions que les appels de charges (`syndic-routes.ts`) : lecture
 * `PROPERTIES_VIEW`, paiement `PROPERTIES_EDIT` (l'apercu aussi : il n'a de
 * sens que pour qui peut enregistrer le paiement). Classees SYNDIC par le
 * prefixe `/syndics` de `lib/subscription/route-features.ts`.
 *
 * Gardes posees avec leur chemin, jamais en `router.use` nu : ce routeur est
 * monte sur `/api` tout entier.
 */
const router = Router();

const guards: RequestHandler[] = [authenticate, requireTenantAccess, enforcePropertyTenantIsolation];
const canView = requireAnyPropertyPermission(['PROPERTIES_VIEW']);
const canEdit = requirePropertyPermission('PROPERTIES_EDIT');

const LOT = '/tenants/:tenantId/syndics/:syndicId/lots/:lotId';

router.post(`${LOT}/paiements`, ...guards, canEdit, recordLotPaymentHandler);
router.post(`${LOT}/paiements/apercu`, ...guards, canEdit, previewLotPaymentHandler);
router.get(`${LOT}/avance`, ...guards, canView, getLotAdvanceHandler);
router.get(`${LOT}/appels-ouverts`, ...guards, canView, listLotOpenCallsHandler);
router.get('/tenants/:tenantId/syndics/:syndicId/suivi-mensuel', ...guards, canView, getMonthlyTrackingHandler);

export default router;
