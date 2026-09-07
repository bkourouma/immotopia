import { Router } from 'express';
import { authenticate } from '../middleware/auth-middleware';
import { requireTenantAccess, requireTenantCollaborator } from '../middleware/tenant-middleware';
import { enforceTenantIsolation } from '../middleware/tenant-isolation-middleware';
import { listHandler, updateHandler, resetHandler } from '../controllers/email-notification-config-controller';

const router = Router({ mergeParams: true });

router.use(authenticate);
router.use(requireTenantAccess);
// requireTenantAccess also passes for client-type members (renters/owners);
// notification settings are an agency back-office feature.
router.use(requireTenantCollaborator);
router.use(enforceTenantIsolation);

router.get('/', listHandler);
router.patch('/:key', updateHandler);
router.post('/:key/reset', resetHandler);

export default router;
