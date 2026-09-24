import { Router } from 'express';
import { authenticate } from '../middleware/auth-middleware';
import { requireTenantAccess } from '../middleware/tenant-middleware';
import { requirePermission } from '../middleware/rbac-middleware';
import {
  createAccountHandler,
  createTaxRemittanceHandler,
  createTransferHandler,
  getWithholdingHandler,
  listAccountsHandler,
  listTaxRemittancesHandler,
  listTransfersHandler,
  patchAccountHandler,
  voidTaxRemittanceHandler,
  voidTransferHandler
} from '../controllers/treasury-controller';

/**
 * Trésorerie de l'agence — lot 10 (conformité SYSCOHADA).
 *
 * Mapping des permissions, comme `finance-rbac-middleware.ts` :
 * - Consultation (`GET *`) → `FINANCE_ACCOUNTS_READ`.
 * - Créer/modifier un compte de trésorerie (`POST`/`PATCH /accounts`) →
 *   `FINANCE_SETTINGS_MANAGE` : c'est du paramétrage, pas une pièce.
 * - Virements et versements DGI (`POST /transfers`, `POST /tax-remittances`) →
 *   `FINANCE_DOCUMENTS_CREATE`.
 * - Annulations (`POST .../void`) → `FINANCE_DOCUMENTS_VALIDATE`.
 */
const router = Router();
const BASE = '/tenants/:tenantId/treasury';
const guard = (permission: string) => [authenticate, requireTenantAccess, requirePermission(permission)];

router.get(`${BASE}/accounts`, ...guard('FINANCE_ACCOUNTS_READ'), listAccountsHandler);
router.post(`${BASE}/accounts`, ...guard('FINANCE_SETTINGS_MANAGE'), createAccountHandler);
router.patch(`${BASE}/accounts/:id`, ...guard('FINANCE_SETTINGS_MANAGE'), patchAccountHandler);

router.get(`${BASE}/transfers`, ...guard('FINANCE_ACCOUNTS_READ'), listTransfersHandler);
router.post(`${BASE}/transfers`, ...guard('FINANCE_DOCUMENTS_CREATE'), createTransferHandler);
router.post(`${BASE}/transfers/:id/void`, ...guard('FINANCE_DOCUMENTS_VALIDATE'), voidTransferHandler);

router.get(`${BASE}/withholding`, ...guard('FINANCE_ACCOUNTS_READ'), getWithholdingHandler);

router.get(`${BASE}/tax-remittances`, ...guard('FINANCE_ACCOUNTS_READ'), listTaxRemittancesHandler);
router.post(`${BASE}/tax-remittances`, ...guard('FINANCE_DOCUMENTS_CREATE'), createTaxRemittanceHandler);
router.post(`${BASE}/tax-remittances/:id/void`, ...guard('FINANCE_DOCUMENTS_VALIDATE'), voidTaxRemittanceHandler);

export default router;
