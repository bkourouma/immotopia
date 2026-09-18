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

/**
 * Gardes limités au préfixe que ce routeur sert réellement.
 *
 * Ils étaient posés en `router.use(authenticate)` sans chemin. Ce routeur étant
 * monté sur `/api` tout entier, Express faisait traverser ce garde à **toute**
 * requête `/api/*` avant de la proposer aux routeurs montés après lui — dont
 * `/api/geographic`, déclaré public. Le sélecteur de commune de l'écran Biens
 * recevait donc un 401 et restait vide, sans que rien n'indique pourquoi.
 *
 * Avec le chemin, le garde ne s'applique plus qu'aux routes de ce fichier, qui
 * partagent toutes ce préfixe.
 */
router.use('/tenants/:tenantId/finance', authenticate, requireTenantAccess);

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
