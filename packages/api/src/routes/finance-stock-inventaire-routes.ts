import { Router } from 'express';
import { authenticate } from '../middleware/auth-middleware';
import { requireTenantAccess } from '../middleware/tenant-middleware';
import {
  requireStockCount,
  requireStockCountOrValidate,
  requireStockCountValidate,
  requireStockView
} from '../middleware/stock-rbac-middleware';
import {
  cancelStockCountHandler,
  closeStockCountHandler,
  createStockCountHandler,
  getStockCountHandler,
  justifyStockCountLineHandler,
  listStockCountsHandler,
  removeStockCountLineHandler,
  setAsideStockCountLineHandler,
  setAsideUncountedHandler,
  setStockCountLineHandler,
  validateStockCountHandler
} from '../controllers/finance-stock-inventaire-controller';

/**
 * Routes agence de l'inventaire physique — lot 5, passées sur les droits du
 * stock par le lot 040 (spec B1-R2 ; contrat `contracts/openapi.yaml`, tag
 * « Inventaires ») :
 *
 * | Geste                                   | Droit                                |
 * | --------------------------------------- | ------------------------------------ |
 * | lire (liste, détail)                    | STOCK_VIEW                           |
 * | ouvrir, compter, retirer, clore         | STOCK_COUNT                          |
 * | justifier un écart                      | STOCK_COUNT ou STOCK_COUNT_VALIDATE  |
 * | écarter, valider, abandonner            | STOCK_COUNT_VALIDATE                 |
 *
 * Celui qui compte ne valide pas (A1) : la garde de route ne suffit pas, le
 * domaine compare le validateur aux compteurs.
 *
 * **Gardes posés AVEC leur chemin**, jamais en `router.use(authenticate)` nu :
 * un garde posé sans chemin sur un routeur monté sur `/api` traverserait toute
 * requête `/api/*` (incident du lot 1, `finance-routes.ts`).
 *
 * ──────────────────────────────────────────────────────────────────────────
 * LES CHEMINS À SEGMENT FIXE SE MONTENT AVANT LE DÉTAIL, ET L'ORDRE EST LA
 * SEULE CHOSE QUI LES EN PROTÈGE. `GET /stock/counts/:countId` reste la
 * DERNIÈRE route déclarée sous `/stock/counts/` : un futur
 * `/stock/counts/summary` placé après lui serait avalé par le paramètre. Le
 * procès-verbal `GET …/counts/:countId/report.pdf` (territoire des bons) a un
 * segment de plus : aucune capture possible.
 * ──────────────────────────────────────────────────────────────────────────
 */

const router = Router();

const COUNTS = '/tenants/:tenantId/finance/stock/counts';
const COUNT = `${COUNTS}/:countId`;

router.use('/tenants/:tenantId/finance', authenticate, requireTenantAccess);

// Ouvrir un inventaire (DRAFT, à l'aveugle), sans ligne.
router.post(COUNTS, requireStockCount, createStockCountHandler);

// Saisir ou ressaisir le comptage d'un article : PUT, rappeler le même article
// REMPLACE son comptage. L'attendu est figé par le service, jamais reçu.
router.put(`${COUNT}/lines`, requireStockCount, setStockCountLineHandler);

// Justifier l'écart d'une ligne, après la clôture du comptage.
router.put(`${COUNT}/lines/:itemId/justification`, requireStockCountOrValidate, justifyStockCountLineHandler);

// Écarter une ligne d'un inventaire clos (non ajustée, imprimée au PV).
router.post(`${COUNT}/lines/:itemId/set-aside`, requireStockCountValidate, setAsideStockCountLineHandler);

// Retirer une ligne d'un inventaire en cours (DRAFT).
router.delete(`${COUNT}/lines/:itemId`, requireStockCount, removeStockCountLineHandler);

// Clore le comptage : les écarts deviennent visibles, les non-comptés naissent.
router.post(`${COUNT}/close`, requireStockCount, closeStockCountHandler);

// Écarter d'un coup les lignes non comptées (motif commun).
router.post(`${COUNT}/set-aside-uncounted`, requireStockCountValidate, setAsideUncountedHandler);

// Valider : les écarts deviennent des ajustements, le PVI naît.
router.post(`${COUNT}/validate`, requireStockCountValidate, validateStockCountHandler);

// Abandonner un inventaire en cours (DRAFT).
router.post(`${COUNT}/cancel`, requireStockCountValidate, cancelStockCountHandler);

// Liste des inventaires (sans lignes par défaut).
router.get(COUNTS, requireStockView, listStockCountsHandler);

// Détail d'un inventaire. DERNIÈRE route déclarée sous `/stock/counts/`.
router.get(COUNT, requireStockView, getStockCountHandler);

export default router;
