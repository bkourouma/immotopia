import { Router } from 'express';
import { authenticate } from '../middleware/auth-middleware';
import { requireTenantAccess, requireTenantCollaborator } from '../middleware/tenant-middleware';
import { enforceTenantIsolation } from '../middleware/tenant-isolation-middleware';
import { requireNotificationKeyFeature } from '../lib/subscription/notification-feature-gate';
import { listHandler, updateHandler, resetHandler } from '../controllers/email-notification-config-controller';

const router = Router({ mergeParams: true });

router.use(authenticate);
router.use(requireTenantAccess);
// requireTenantAccess also passes for client-type members (renters/owners);
// notification settings are an agency back-office feature.
router.use(requireTenantCollaborator);
router.use(enforceTenantIsolation);

router.get('/', listHandler);
router.patch('/:key', requireNotificationKeyFeature, updateHandler);
router.post('/:key/reset', requireNotificationKeyFeature, resetHandler);

export default router;
