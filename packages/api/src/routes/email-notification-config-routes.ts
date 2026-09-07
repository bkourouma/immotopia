import { Router } from 'express';
import { authenticate } from '../middleware/auth-middleware';
import { requireTenantAccess } from '../middleware/tenant-middleware';
import { enforceTenantIsolation } from '../middleware/tenant-isolation-middleware';
import { listHandler, updateHandler, resetHandler } from '../controllers/email-notification-config-controller';

const router = Router({ mergeParams: true });

router.use(authenticate);
router.use(requireTenantAccess);
router.use(enforceTenantIsolation);

router.get('/', listHandler);
router.patch('/:key', updateHandler);
router.post('/:key/reset', resetHandler);

export default router;
