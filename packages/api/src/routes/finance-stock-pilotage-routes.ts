import { Router } from 'express';
import { authenticate } from '../middleware/auth-middleware';
import { requireTenantAccess } from '../middleware/tenant-middleware';
import { requireSettingsManage } from '../middleware/finance-rbac-middleware';
import { requireStockAlertsView, requireStockValuesView } from '../middleware/stock-rbac-middleware';
import {
  acknowledgeStockAlertHandler,
  getStockControlsHandler,
  getStockIndicatorsHandler,
  listStockAlertsHandler,
  updateStockControlsHandler
} from '../controllers/finance-stock-pilotage-controller';

/**
 * Routes du pilotage du stock — lot 040 (alertes, indicateurs, réglages de
 * contrôle). Monté dans `app.ts` par les fondations ; les routes vivent ici.
 *
 * **Gardes posés avec leur chemin**, jamais en `router.use` nu : ce routeur
 * est monté sur `/api` tout entier, et un garde sans chemin traverserait toute
 * requête `/api/*` (incident du lot 1, `finance-routes.ts`).
 *
 * Droits (spec B1, contrat) :
 * - alertes : `STOCK_ALERTS_VIEW` (lecture et traitement) ;
 * - indicateurs : `STOCK_VALUES_VIEW` ;
 * - réglages de contrôle : lecture `STOCK_VALUES_VIEW` (ils portent des
 *   seuils, donc des valeurs), écriture `FINANCE_SETTINGS_MANAGE` (B1-R3).
 *
 * `/stock/settings/controls` ne recouvre pas `/stock/settings`
 * (référentiel) : Express compare le chemin entier.
 */

const router = Router();

router.use('/tenants/:tenantId/finance/stock', authenticate, requireTenantAccess);

// A. Alertes de l'agence, plus récentes d'abord (curseur).
router.get('/tenants/:tenantId/finance/stock/alerts', requireStockAlertsView, listStockAlertsHandler);

// B. Une alerte marquée « traitée » (note facultative). Jamais supprimée.
router.post(
  '/tenants/:tenantId/finance/stock/alerts/:alertId/acknowledge',
  requireStockAlertsView,
  acknowledgeStockAlertHandler
);

// C. Indicateurs par lieu et par mois, jamais par personne.
router.get('/tenants/:tenantId/finance/stock/indicators', requireStockValuesView, getStockIndicatorsHandler);

// D. Réglages de contrôle — lecture (défauts appliqués, aucune ligne créée).
router.get('/tenants/:tenantId/finance/stock/settings/controls', requireStockValuesView, getStockControlsHandler);

// E. Réglages de contrôle — modification (STOCK_CONTROLS_UPDATED, critique).
router.patch('/tenants/:tenantId/finance/stock/settings/controls', requireSettingsManage, updateStockControlsHandler);

export default router;
