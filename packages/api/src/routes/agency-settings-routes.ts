import { Router } from 'express';
import { authenticate } from '../middleware/auth-middleware';
import { requireTenantAccess } from '../middleware/tenant-middleware';
import { requirePermission } from '../middleware/rbac-middleware';
import {
  getAgencyFinanceSettingsHandler,
  updateAgencyFinanceSettingsHandler
} from '../controllers/agency-finance-settings-controller';

/**
 * Paramètres de l'agence qui ne relèvent pas de son identité (`PATCH
 * /tenants/:tenantId`) : aujourd'hui la fiscalité, les honoraires de gestion et
 * les comptes de la gestion locative.
 *
 * Mêmes permissions que la page « Paramètres de l'agence » où ils s'affichent.
 * Gardes posés avec leur chemin, jamais en `router.use` nu : ce routeur est
 * monté sur `/api` tout entier.
 */
const router = Router();

const PATH = '/tenants/:tenantId/settings/finance';

router.get(
  PATH,
  authenticate,
  requireTenantAccess,
  requirePermission('TENANT_SETTINGS_VIEW'),
  getAgencyFinanceSettingsHandler
);
router.put(
  PATH,
  authenticate,
  requireTenantAccess,
  requirePermission('TENANT_SETTINGS_EDIT'),
  updateAgencyFinanceSettingsHandler
);

export default router;
