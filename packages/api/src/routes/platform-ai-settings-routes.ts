import { Router } from 'express';
import {
  getAiSettingsHandler,
  listAiModelsHandler,
  updateAiSettingsHandler
} from '../controllers/platform-ai-settings-controller';
import { authenticate } from '../middleware/auth-middleware';
import { requirePermission } from '../middleware/rbac-middleware';
import { requireSuperAdmin } from '../middleware/super-admin-middleware';

/**
 * Réglage ImmoCopilot de la plateforme, monté sur `/api/platform/ai-settings`.
 *
 * Double garde, comme l'export de données d'agence : `requirePermission
 * ('PLATFORM_TENANTS_*')` (inventaire des routes, RBAC) puis `requireSuperAdmin`
 * (seul un compte SUPER_ADMIN actif passe, relu en base). Aucune permission
 * dédiée : le réglage engage toute la plateforme et n'est jamais délégué.
 */
const router = Router();

router.use(authenticate);

const view = requirePermission('PLATFORM_TENANTS_VIEW');
const edit = requirePermission('PLATFORM_TENANTS_EDIT');

router.get('/', view, requireSuperAdmin, getAiSettingsHandler);
router.put('/', edit, requireSuperAdmin, updateAiSettingsHandler);
router.get('/models', view, requireSuperAdmin, listAiModelsHandler);

export default router;
