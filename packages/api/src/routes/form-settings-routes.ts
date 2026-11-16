import { Router } from 'express';
import { authenticate } from '../middleware/auth-middleware';
import { requireTenantAccess } from '../middleware/tenant-middleware';
import { requirePermission } from '../middleware/rbac-middleware';
import {
  getFormModesHandler,
  getFormSettingsHandler,
  updateFormSettingsHandler
} from '../controllers/form-settings-controller';

/**
 * Formulaires paramétrables, côté agence (contrat §5). Monté sur `/api` :
 * gardes posées avec leur chemin, jamais en `router.use` nu.
 */
const router = Router();

const SETTINGS = '/tenants/:tenantId/settings/forms';

router.get(
  SETTINGS,
  authenticate,
  requireTenantAccess,
  requirePermission('TENANT_SETTINGS_VIEW'),
  getFormSettingsHandler
);
router.put(
  `${SETTINGS}/:formKey`,
  authenticate,
  requireTenantAccess,
  requirePermission('TENANT_SETTINGS_EDIT'),
  updateFormSettingsHandler
);

// Lecture des modes pour les écrans de saisie : tout membre de l'agence.
router.get('/tenants/:tenantId/forms/:formKey/modes', authenticate, requireTenantAccess, getFormModesHandler);

export default router;
