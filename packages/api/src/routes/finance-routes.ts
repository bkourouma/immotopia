import { Router } from 'express';
import { authenticate } from '../middleware/auth-middleware';
import { requireTenantAccess } from '../middleware/tenant-middleware';
import { requireAccountsRead, requireDocumentsCreate, requireReportsRead } from '../middleware/finance-rbac-middleware';
import {
  createBillingRunHandler,
  getAccountStatementHandler,
  getBillingRunHandler,
  getClientsAgingBalanceHandler,
  getClientsBalanceHandler,
  listBillingRunsHandler,
  printAccountStatementHandler
} from '../controllers/finance-controller';

/**
 * Routes agence du module financier opérationnel — lot 1, volet clients.
 *
 * **Ce fichier ne se monte pas lui-même** : c'est le rôle de
 * `src/index.ts`, hors du territoire de cet agent (fichier-registre monté à
 * l'intégration). Modèle : `routes/syndic-routes.ts`.
 *
 * Contrat : `specs/016-finance-operationnelle/contracts/openapi.yaml`.
 */

const router = Router();

router.use(authenticate);
router.use(requireTenantAccess);

router.get('/tenants/:tenantId/finance/clients/balance', requireReportsRead, getClientsBalanceHandler);

router.get('/tenants/:tenantId/finance/clients/balance-agee', requireReportsRead, getClientsAgingBalanceHandler);

router.get('/tenants/:tenantId/finance/accounts/:accountId/statement', requireAccountsRead, getAccountStatementHandler);

router.get(
  '/tenants/:tenantId/finance/accounts/:accountId/statement.pdf',
  requireAccountsRead,
  printAccountStatementHandler
);

router.get('/tenants/:tenantId/finance/billing-runs', requireReportsRead, listBillingRunsHandler);

router.get('/tenants/:tenantId/finance/billing-runs/:runId', requireReportsRead, getBillingRunHandler);

router.post('/tenants/:tenantId/finance/billing-runs', requireDocumentsCreate, createBillingRunHandler);

export default router;
