import { Router } from 'express';
import { authenticate } from '../middleware/auth-middleware';
import { requireTenantAccess } from '../middleware/tenant-middleware';
import {
  requireStockDispose,
  requireStockIssue,
  requireStockReceive,
  requireStockView
} from '../middleware/stock-rbac-middleware';
import {
  createStockIssueHandler,
  createStockReceiptHandler,
  createStockScrapHandler,
  createStockSupplierReturnHandler,
  listStockBalancesHandler
} from '../controllers/finance-stock-mouvements-controller';

/**
 * Routes agence des mouvements de stock — lot 5, deuxième sous-lot, étendues
 * par le lot 040 : réceptions, sorties, retours fournisseur, rebuts, soldes.
 *
 * Monté par `src/app.ts`.
 *
 * **Gardes posés AVEC leur chemin**, jamais en `router.use(authenticate)` nu :
 * un garde posé sans chemin sur un routeur monté sur `/api` tout entier
 * traverserait toute requête `/api/*`, y compris une route publique montée
 * après lui (incident du lot 1, `finance-routes.ts`).
 *
 * **Droits du stock** (lot 040, spec B1-R2) : chaque route passe sur sa garde
 * `STOCK_*` ; la migration de données a reporté ces droits sur tous les rôles
 * qui portaient les droits financiers, personne ne perd un accès.
 *
 * Aucune route ne porte de paramètre de chemin autre que `tenantId`.
 */

const router = Router();

router.use('/tenants/:tenantId/finance', authenticate, requireTenantAccess);

// Réception : bon BR, aucune écriture comptable (la facture a porté la valeur au 311).
router.post('/tenants/:tenantId/finance/stock/receipts', requireStockReceive, createStockReceiptHandler);

// Sortie vers un chantier : LE geste qui impute (P-7). Bon BS, 1 à 50 lignes.
router.post('/tenants/:tenantId/finance/stock/issues', requireStockIssue, createStockIssueHandler);

// Retour fournisseur (A6) : C311 / D401 / écart 603, compte du fournisseur réglé.
router.post('/tenants/:tenantId/finance/stock/supplier-returns', requireStockDispose, createStockSupplierReturnHandler);

// Rebut (A6) : D603 / C311, jamais imputé à un chantier.
router.post('/tenants/:tenantId/finance/stock/scraps', requireStockDispose, createStockScrapHandler);

// Soldes par (article, lieu), masqués pour l'appelant (§8.1, §8.2).
router.get('/tenants/:tenantId/finance/stock/balances', requireStockView, listStockBalancesHandler);

// Journal des mouvements : `finance-stock-journal-routes.ts` (territoire API-3).

export default router;
