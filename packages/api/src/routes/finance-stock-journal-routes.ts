import { Router } from 'express';
import { authenticate } from '../middleware/auth-middleware';
import { requireTenantAccess } from '../middleware/tenant-middleware';
import { requireAccountsRead } from '../middleware/finance-rbac-middleware';
import { listStockMovementsHandler } from '../controllers/finance-stock-journal-controller';

/**
 * Route du journal des mouvements de stock — extraite de
 * `finance-stock-mouvements-routes.ts` (lot 040, étape des fondations).
 *
 * **Même chemin et même garde qu'au lot 5** : l'extraction ne change rien de
 * ce que voit un appelant. Le territoire API-3 y ajoutera l'export, les auteurs,
 * le contexte terrain, les factures réceptionnables et le carnet des preneurs.
 *
 * **Gardes posés AVEC leur chemin**, jamais en `router.use(authenticate)` nu
 * (incident du lot 1, `finance-routes.ts`). Une route future
 * `/stock/movements/:movementId` devra être déclarée APRÈS les chemins à
 * segment fixe (`/stock/movements/export.csv`, `/stock/movements/authors`).
 */

const router = Router();

router.use('/tenants/:tenantId/finance', authenticate, requireTenantAccess);

// Journal des mouvements, filtrable par article, lieu, chantier, nature et
// période.
router.get('/tenants/:tenantId/finance/stock/movements', requireAccountsRead, listStockMovementsHandler);

export default router;
