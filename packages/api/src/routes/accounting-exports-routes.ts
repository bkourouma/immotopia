import { Router } from 'express';
import { authenticate } from '../middleware/auth-middleware';
import { requireTenantAccess } from '../middleware/tenant-middleware';
import { requirePermission } from '../middleware/rbac-middleware';
import {
  getAccountingMetaHandler,
  getGeneralLedgerHandler,
  getJournalHandler,
  getMandantSubledgerHandler,
  getMandantTrialBalanceHandler,
  getTrialBalanceHandler,
  listAccountsHandler,
  syncAccountingHandler
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

router.get(`${BASE}/meta`, ...guard, getAccountingMetaHandler);
router.get(`${BASE}/accounts`, ...guard, listAccountsHandler);
router.get(`${BASE}/journal`, ...guard, getJournalHandler);
router.get(`${BASE}/general-ledger`, ...guard, getGeneralLedgerHandler);
router.get(`${BASE}/trial-balance`, ...guard, getTrialBalanceHandler);
// Lot 10 : grand livre auxiliaire et balance auxiliaire des mandants.
router.get(`${BASE}/mandant-subledger`, ...guard, getMandantSubledgerHandler);
router.get(`${BASE}/mandant-trial-balance`, ...guard, getMandantTrialBalanceHandler);

// POST /sync garde FINANCE_REPORTS_READ (décision du chef de lot) : c'est un
// recalcul idempotent que toute lecture déclenche déjà ; exiger un droit
// d'écriture empêcherait un comptable en lecture seule d'actualiser.
router.post(`${BASE}/sync`, ...guard, syncAccountingHandler);

export default router;
