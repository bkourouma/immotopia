import { Router } from 'express';
import { authenticate } from '../middleware/auth-middleware';
import { requireTenantAccess } from '../middleware/tenant-middleware';
import { requireStockTransfer } from '../middleware/stock-rbac-middleware';
import { createStockTransferHandler } from '../controllers/finance-stock-transferts-controller';

/**
 * Route du transfert entre lieux — extraite de
 * `finance-stock-inventaire-routes.ts` (lot 040, fondations). Monté par
 * `src/app.ts`.
 *
 * Même chemin qu'au lot 5 ; la garde passe sur `STOCK_TRANSFER` (lot 040,
 * spec B1-R2).
 *
 * **Gardes posés AVEC leur chemin**, jamais en `router.use(authenticate)` nu
 * (incident du lot 1, `finance-routes.ts`).
 */

const router = Router();

router.use('/tenants/:tenantId/finance', authenticate, requireTenantAccess);

// Transfert entre deux lieux. N'écrit AUCUNE écriture comptable et n'impute
// AUCUN chantier : déplacer n'est pas consommer (principe P-7).
router.post('/tenants/:tenantId/finance/stock/transfers', requireStockTransfer, createStockTransferHandler);

export default router;
