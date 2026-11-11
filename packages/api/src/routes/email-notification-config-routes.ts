import { Router } from 'express';
import { authenticate } from '../middleware/auth-middleware';
import { requireTenantAccess, requireTenantCollaborator } from '../middleware/tenant-middleware';
import { enforceTenantIsolation } from '../middleware/tenant-isolation-middleware';
import { requirePermission } from '../middleware/rbac-middleware';
import { requireNotificationKeyFeature } from '../lib/subscription/notification-feature-gate';
import { listHandler, updateHandler, resetHandler } from '../controllers/email-notification-config-controller';

const router = Router({ mergeParams: true });

router.use(authenticate);
router.use(requireTenantAccess);
// requireTenantAccess also passes for client-type members (renters/owners);
// notification settings are an agency back-office feature.
router.use(requireTenantCollaborator);
router.use(enforceTenantIsolation);

// Lecture : ouverte aux collaborateurs (l'espace Communication n'est pas filtre par permission dans le menu).
router.get('/', listHandler);
// Ecriture : le gabarit saisi part tel quel aux clients de l'agence (TEN-05) ; reservee aux roles
// qui gerent les parametres de l'agence (TENANT_SETTINGS_EDIT, comme document-branding-routes.ts).
const settingsEdit = requirePermission('TENANT_SETTINGS_EDIT');
router.patch('/:key', settingsEdit, requireNotificationKeyFeature, updateHandler);
router.post('/:key/reset', settingsEdit, requireNotificationKeyFeature, resetHandler);

export default router;
