import { Router } from 'express';
import { authenticate } from '../middleware/auth-middleware';
import { requireTenantAccess } from '../middleware/tenant-middleware';
import { requirePermission } from '../middleware/rbac-middleware';
import {
  getFinalSettlementHandler,
  getLeaseEventsHandler,
  recordAmendmentHandler,
  renewLeaseHandler,
  reviseRentHandler,
  terminateLeaseHandler
} from '../controllers/lease-lifecycle-controller';

/**
 * Vie du bail — lot 5 de la gestion locative.
 *
 * Gardes posés avec leur chemin, jamais en `router.use` nu : ce routeur est
 * monté sur `/api` tout entier.
 */
const router = Router();

const guard = (permission: string) => [authenticate, requireTenantAccess, requirePermission(permission)];
const LEASE = '/tenants/:tenantId/rental/leases/:leaseId';

router.get(`${LEASE}/events`, ...guard('RENTAL_LEASES_VIEW'), getLeaseEventsHandler);
router.post(`${LEASE}/events/revision`, ...guard('RENTAL_LEASES_EDIT'), reviseRentHandler);
router.post(`${LEASE}/events/renewal`, ...guard('RENTAL_LEASES_EDIT'), renewLeaseHandler);
router.post(`${LEASE}/events/amendment`, ...guard('RENTAL_LEASES_EDIT'), recordAmendmentHandler);
router.post(`${LEASE}/events/termination`, ...guard('RENTAL_LEASES_EDIT'), terminateLeaseHandler);
router.get(`${LEASE}/final-settlement`, ...guard('RENTAL_LEASES_VIEW'), getFinalSettlementHandler);

export default router;
