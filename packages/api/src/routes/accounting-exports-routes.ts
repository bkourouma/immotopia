import { Router } from 'express';
import { authenticate } from '../middleware/auth-middleware';
import { requireTenantAccess } from '../middleware/tenant-middleware';
import { requirePermission } from '../middleware/rbac-middleware';
import {
  getGeneralLedgerHandler,
  getJournalHandler,
  getMandantSubledgerHandler,
  getMandantTrialBalanceHandler,
  getTrialBalanceHandler
} from '../controllers/accounting-exports-controller';

/**
 * Exports comptables — lot 8. Journal, grand livre et balance de la
 * comptabilité opérationnelle, en JSON, CSV ou Excel.
 *
 * Gardes posés avec leur chemin, jamais en `router.use` nu : ce routeur est
 * monté sur `/api` tout entier.
 */
const router = Router();

const guard = [authenticate, requireTenantAccess, requirePermission('FINANCE_REPORTS_READ')];
const BASE = '/tenants/:tenantId/finance/accounting';

router.get(`${BASE}/journal`, ...guard, getJournalHandler);
router.get(`${BASE}/general-ledger`, ...guard, getGeneralLedgerHandler);
router.get(`${BASE}/trial-balance`, ...guard, getTrialBalanceHandler);

export default router;
