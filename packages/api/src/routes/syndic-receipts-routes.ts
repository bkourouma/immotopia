import { Router, type RequestHandler } from 'express';
import { authenticate } from '../middleware/auth-middleware';
import { requireTenantAccess } from '../middleware/tenant-middleware';
import { enforcePropertyTenantIsolation } from '../middleware/tenant-isolation-middleware';
import { requireAnyPropertyPermission, requirePropertyPermission } from '../middleware/property-rbac-middleware';
import { receiptPrintRateLimiter, receiptResendRateLimiter } from '../middleware/rate-limit-middleware';
import {
  backfillQuittancesHandler,
  downloadReceiptHandler,
  listLotReceiptsHandler,
  listSyndicateReceiptsHandler,
  printReceiptsHandler,
  resendReceiptHandler
} from '../controllers/syndic-receipts-controller';

/**
 * Reçus de paiement et quittances de charges (lot S3).
 *
 * Mêmes permissions que les appels de charges : lecture `PROPERTIES_VIEW`
 * (listes, téléchargement, impression groupée), écriture `PROPERTIES_EDIT`
 * (renvoi par e-mail, rattrapage). Classées SYNDIC par le préfixe `/syndics`
 * de `lib/subscription/route-features.ts`.
 *
 * Gardes posées avec leur chemin, jamais en `router.use` nu : ce routeur est
 * monté sur `/api` tout entier.
 */
const router = Router();

const guards: RequestHandler[] = [authenticate, requireTenantAccess, enforcePropertyTenantIsolation];
const canView = requireAnyPropertyPermission(['PROPERTIES_VIEW']);
const canEdit = requirePropertyPermission('PROPERTIES_EDIT');

const SYNDIC = '/tenants/:tenantId/syndics/:syndicId';

router.get(`${SYNDIC}/quittances`, ...guards, canView, listSyndicateReceiptsHandler);
// Limiteurs par utilisateur et agence, posés APRÈS les gardes (ils lisent la session et l'agence).
router.get(`${SYNDIC}/quittances/impression`, ...guards, canView, receiptPrintRateLimiter, printReceiptsHandler);
router.post(`${SYNDIC}/quittances/generer-manquantes`, ...guards, canEdit, backfillQuittancesHandler);
router.get(`${SYNDIC}/quittances/:receiptId/fichier`, ...guards, canView, downloadReceiptHandler);
router.post(
  `${SYNDIC}/quittances/:receiptId/envoi`,
  ...guards,
  canEdit,
  receiptResendRateLimiter,
  resendReceiptHandler
);
router.get(`${SYNDIC}/lots/:lotId/quittances`, ...guards, canView, listLotReceiptsHandler);

export default router;
