import { Router } from 'express';
import { authenticate } from '../middleware/auth-middleware';
import { requireTenantAccess } from '../middleware/tenant-middleware';
import { requirePermission } from '../middleware/rbac-middleware';
import { requireOwnerPortalAccess } from '../middleware/owner-portal-access';
import {
  createOwnerPayoutHandler,
  getMyOwnerAccountHandler,
  getOwnerAccountHandler,
  listOwnerAccountsHandler,
  voidOwnerPayoutHandler
} from '../controllers/owner-account-controller';

/**
 * Compte courant des propriétaires et reversements — lot 3 de la gestion
 * locative.
 *
 * Gardes posés avec leur chemin, jamais en `router.use` nu : ce routeur est
 * monté sur `/api` tout entier.
 */
const router = Router();

const guard = (permission: string) => [authenticate, requireTenantAccess, requirePermission(permission)];
const BASE = '/tenants/:tenantId/owner-accounts';

router.get(BASE, ...guard('FINANCE_ACCOUNTS_READ'), listOwnerAccountsHandler);
router.get(`${BASE}/:ownerClientId`, ...guard('FINANCE_ACCOUNTS_READ'), getOwnerAccountHandler);
router.post(`${BASE}/:ownerClientId/payouts`, ...guard('FINANCE_DOCUMENTS_CREATE'), createOwnerPayoutHandler);
router.post(
  `${BASE}/:ownerClientId/payouts/:payoutId/void`,
  ...guard('FINANCE_DOCUMENTS_VALIDATE'),
  voidOwnerPayoutHandler
);

export default router;

/**
 * Portail : le compte du propriétaire connecté.
 *
 * Routeur à part, monté sur `/api/portal/owner` à côté des autres routes du
 * portail. Monté sur `/api` avec le reste, il passait derrière le routeur des
 * relevés, dont le `router.use(requireTenantAccess)` sans chemin intercepte
 * toute requête `/api/*` qui l'atteint — et répondait « Tenant ID requis. ».
 */
export const ownerAccountPortalRouter = Router();
ownerAccountPortalRouter.get('/account', authenticate, requireOwnerPortalAccess, getMyOwnerAccountHandler);
