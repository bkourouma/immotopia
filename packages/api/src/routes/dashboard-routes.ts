import { Router } from 'express';
import { authenticate } from '../middleware/auth-middleware';
import { requireTenantAccess } from '../middleware/tenant-middleware';
import { enforceTenantIsolation } from '../middleware/tenant-isolation-middleware';
import { getTenantDashboardHandler } from '../controllers/dashboard-controller';

const router = Router();

router.use(authenticate);
router.use(requireTenantAccess);
router.use(enforceTenantIsolation);

// Membership is the only gate here: the payload itself hides the blocks the
// caller has no permission for (see dashboard-service).
router.get('/:tenantId/dashboard', getTenantDashboardHandler);

export default router;
