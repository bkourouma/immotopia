import { Router } from 'express';
import { authenticate } from '../middleware/auth-middleware';
import { requireTenantAccess } from '../middleware/tenant-middleware';
import { requirePropertyPermission } from '../middleware/property-rbac-middleware';
import { getPropertyOwnershipHandler, setPropertyOwnershipHandler } from '../controllers/property-ownership-controller';

/**
 * Indivision d'un bien — lot 4. Mêmes permissions que la fiche du bien ;
 * l'appartenance du bien à l'agence est vérifiée par le service. Gardes posés
 * avec leur chemin, jamais en `router.use` nu : ce routeur est monté sur
 * `/api` tout entier.
 */
const router = Router();
const PATH = '/tenants/:tenantId/properties/:propertyId/ownership';

router.get(
  PATH,
  authenticate,
  requireTenantAccess,
  requirePropertyPermission('PROPERTIES_VIEW'),
  getPropertyOwnershipHandler
);
router.put(
  PATH,
  authenticate,
  requireTenantAccess,
  requirePropertyPermission('PROPERTIES_EDIT'),
  setPropertyOwnershipHandler
);

export default router;
