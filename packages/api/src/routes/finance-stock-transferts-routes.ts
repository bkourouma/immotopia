import { Router } from 'express';
import { authenticate } from '../middleware/auth-middleware';
import { requireTenantAccess } from '../middleware/tenant-middleware';
import { requireDocumentsCreate } from '../middleware/finance-rbac-middleware';
import { createStockTransferHandler } from '../controllers/finance-stock-transferts-controller';

/**
 * Route du transfert entre lieux — extraite de
 * `finance-stock-inventaire-routes.ts` (lot 040, étape des fondations).
 *
 * **Même chemin et même garde qu'au lot 5** : l'extraction ne change rien de
 * ce que voit un appelant (le catalogue de l'assistant reste identique). Le
 * passage sur les droits `STOCK_*` appartient au territoire API-1.
 *
 * **Gardes posés AVEC leur chemin**, jamais en `router.use(authenticate)` nu :
 * un garde posé sans chemin sur un routeur monté sur `/api` tout entier
 * traverserait toute requête `/api/*`, y compris une route publique montée
 * après lui (incident du lot 1, `finance-routes.ts`).
 */

const router = Router();

router.use('/tenants/:tenantId/finance', authenticate, requireTenantAccess);

// Transfert entre deux lieux. N'écrit AUCUNE écriture comptable et n'impute
// AUCUN chantier : déplacer n'est pas consommer (principe P-7).
router.post('/tenants/:tenantId/finance/stock/transfers', requireDocumentsCreate, createStockTransferHandler);

export default router;
