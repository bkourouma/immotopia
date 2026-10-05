import { Router } from 'express';
import { authenticate } from '../middleware/auth-middleware';
import { requireTenantAccess } from '../middleware/tenant-middleware';
import {
  requireStockTakersManage,
  requireStockValuesView,
  requireStockView
} from '../middleware/stock-rbac-middleware';
import {
  createStockTakerHandler,
  exportStockMovementsHandler,
  getInvoiceReceiptsHandler,
  getStockFieldContextHandler,
  listReceivableInvoicesHandler,
  listStockMovementAuthorsHandler,
  listStockMovementsHandler,
  listStockTakersHandler,
  updateStockTakerHandler
} from '../controllers/finance-stock-journal-controller';

/**
 * Routes du journal, du terrain et du carnet des preneurs — lot 040,
 * territoire API-3 (spec A5, A8-R1, B2, B3-R1). Monté par `app.ts`
 * (fondations).
 *
 * **Gardes posés AVEC leur chemin**, jamais en `router.use(authenticate)` nu
 * (incident du lot 1, `finance-routes.ts`). Les routes du stock passent sur
 * les droits `STOCK_*` (B1-R2) : le journal passe de `FINANCE_ACCOUNTS_READ` à
 * `STOCK_VIEW` ; les trois filtres par personne sont refusés par le service
 * sans STOCK_VALUES_VIEW (`403 STOCK_VALUE_FIELD_FORBIDDEN`).
 *
 * **Segments fixes avant segments paramétrés** : `/stock/movements/export.csv`
 * et `/stock/movements/authors` sont déclarés avant toute route future
 * `/stock/movements/:movementId`.
 */

const router = Router();

const base = '/tenants/:tenantId/finance';

router.use(base, authenticate, requireTenantAccess);

// Journal des mouvements, paginé par curseur, filtrable (A5-R1, A5-R2).
router.get(`${base}/stock/movements`, requireStockView, listStockMovementsHandler);

// Export CSV du journal, mêmes filtres, 50 000 lignes au plus (A5-R3).
router.get(`${base}/stock/movements/export.csv`, requireStockView, exportStockMovementsHandler);

// Auteurs de mouvements, pour le filtre par utilisateur (STOCK_VALUES_VIEW).
router.get(`${base}/stock/movements/authors`, requireStockValuesView, listStockMovementAuthorsHandler);

// Contexte terrain : tout l'écran mobile en un appel (B3-R1).
router.get(`${base}/stock/field-context`, requireStockView, getStockFieldContextHandler);

// Factures validées réceptionnables, au-delà des 50 du contexte terrain (Q9).
router.get(`${base}/stock/receivable-invoices`, requireStockView, listReceivableInvoicesHandler);

// Réceptions et retours d'une facture, ses lignes, le cumul par article (A8-R1).
router.get(`${base}/stock/supplier-invoices/:invoiceId/receipts`, requireStockView, getInvoiceReceiptsHandler);

// Carnet des preneurs (B2) : lecture STOCK_VIEW, écriture STOCK_TAKERS_MANAGE.
router.get(`${base}/stock/takers`, requireStockView, listStockTakersHandler);
router.post(`${base}/stock/takers`, requireStockTakersManage, createStockTakerHandler);
router.patch(`${base}/stock/takers/:takerId`, requireStockTakersManage, updateStockTakerHandler);

export default router;
