import { Router } from 'express';
import { authenticate } from '../middleware/auth-middleware';
import { requireTenantAccess } from '../middleware/tenant-middleware';
import { requirePropertyPermission } from '../middleware/property-rbac-middleware';
import {
  listHoldingEntitiesHandler,
  createHoldingEntityHandler,
  getHoldingEntityHandler,
  updateHoldingEntityHandler,
  deleteHoldingEntityHandler,
  createEntityHoldingHandler,
  updateEntityHoldingHandler,
  deleteEntityHoldingHandler,
  getEntityConsolidationHandler,
  getPropertyHoldingsHandler,
  setPropertyHoldingsHandler
} from '../controllers/patrimoine-entities-controller';
import {
  getEntityTaxEstimateHandler,
  getPropertyTaxProfileHandler,
  setPropertyTaxProfileHandler,
  getPropertyTaxEstimateHandler,
  getTaxParametersHandler
} from '../controllers/patrimoine-tax-controller';

/**
 * Entités détentrices (SCI/holding), rattachement bien -> entité et
 * fiscalité CI/ML — lot P4, territoire A2. Contrat : section 3 de
 * `p4-contrat.md`.
 *
 * Monté sur `/api` dans `app.ts`, juste après `patrimoineRoutes`. Chemins
 * sous `/tenants/:tenantId/patrimoine`, couverts par la règle `{ prefix:
 * '/patrimoine', feature: 'PATRIMOINE' }` de `lib/subscription/route-features.ts`
 * (non modifié ici). Gardes posées par leur chemin (modèle :
 * `routes/property-ownership-routes.ts`), jamais en `router.use` nu.
 */
const router = Router();
const BASE = '/tenants/:tenantId/patrimoine';

router.get(
  `${BASE}/entities`,
  authenticate,
  requireTenantAccess,
  requirePropertyPermission('PROPERTIES_VIEW'),
  listHoldingEntitiesHandler
);
router.post(
  `${BASE}/entities`,
  authenticate,
  requireTenantAccess,
  requirePropertyPermission('PROPERTIES_EDIT'),
  createHoldingEntityHandler
);
router.get(
  `${BASE}/entities/:entityId`,
  authenticate,
  requireTenantAccess,
  requirePropertyPermission('PROPERTIES_VIEW'),
  getHoldingEntityHandler
);
router.patch(
  `${BASE}/entities/:entityId`,
  authenticate,
  requireTenantAccess,
  requirePropertyPermission('PROPERTIES_EDIT'),
  updateHoldingEntityHandler
);
router.delete(
  `${BASE}/entities/:entityId`,
  authenticate,
  requireTenantAccess,
  requirePropertyPermission('PROPERTIES_EDIT'),
  deleteHoldingEntityHandler
);

router.post(
  `${BASE}/entities/:entityId/holdings`,
  authenticate,
  requireTenantAccess,
  requirePropertyPermission('PROPERTIES_EDIT'),
  createEntityHoldingHandler
);
router.patch(
  `${BASE}/entities/:entityId/holdings/:holdingId`,
  authenticate,
  requireTenantAccess,
  requirePropertyPermission('PROPERTIES_EDIT'),
  updateEntityHoldingHandler
);
router.delete(
  `${BASE}/entities/:entityId/holdings/:holdingId`,
  authenticate,
  requireTenantAccess,
  requirePropertyPermission('PROPERTIES_EDIT'),
  deleteEntityHoldingHandler
);

router.get(
  `${BASE}/entities/:entityId/consolidation`,
  authenticate,
  requireTenantAccess,
  requirePropertyPermission('PROPERTIES_VIEW'),
  getEntityConsolidationHandler
);
router.get(
  `${BASE}/entities/:entityId/tax-estimate`,
  authenticate,
  requireTenantAccess,
  requirePropertyPermission('PROPERTIES_VIEW'),
  getEntityTaxEstimateHandler
);

router.get(
  `${BASE}/properties/:propertyId/holdings`,
  authenticate,
  requireTenantAccess,
  requirePropertyPermission('PROPERTIES_VIEW'),
  getPropertyHoldingsHandler
);
router.put(
  `${BASE}/properties/:propertyId/holdings`,
  authenticate,
  requireTenantAccess,
  requirePropertyPermission('PROPERTIES_EDIT'),
  setPropertyHoldingsHandler
);

router.get(
  `${BASE}/properties/:propertyId/tax-profile`,
  authenticate,
  requireTenantAccess,
  requirePropertyPermission('PROPERTIES_VIEW'),
  getPropertyTaxProfileHandler
);
router.put(
  `${BASE}/properties/:propertyId/tax-profile`,
  authenticate,
  requireTenantAccess,
  requirePropertyPermission('PROPERTIES_EDIT'),
  setPropertyTaxProfileHandler
);
router.get(
  `${BASE}/properties/:propertyId/tax-estimate`,
  authenticate,
  requireTenantAccess,
  requirePropertyPermission('PROPERTIES_VIEW'),
  getPropertyTaxEstimateHandler
);

router.get(
  `${BASE}/tax-parameters`,
  authenticate,
  requireTenantAccess,
  requirePropertyPermission('PROPERTIES_VIEW'),
  getTaxParametersHandler
);

export default router;
