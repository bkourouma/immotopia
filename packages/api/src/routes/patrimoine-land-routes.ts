import { Router } from 'express';
import { authenticate } from '../middleware/auth-middleware';
import { requireTenantAccess } from '../middleware/tenant-middleware';
import { enforcePropertyTenantIsolation } from '../middleware/tenant-isolation-middleware';
import { requireAnyPropertyPermission, requirePropertyPermission } from '../middleware/property-rbac-middleware';
import {
  addLandStepHandler,
  changeLandRegularizationStatusHandler,
  changeLandStepStatusHandler,
  createLandRegularizationHandler,
  deleteLandStepHandler,
  getLandRegularizationHandler,
  listLandRegularizationsHandler,
  listLandTracksHandler,
  updateLandRegularizationHandler,
  updateLandStepHandler
} from '../controllers/patrimoine-land-controller';

/**
 * Regularisation fonciere (spec 033, lot B2). Meme pile de middlewares que
 * `patrimoine-routes.ts` ; la feature PATRIMOINE est deja couverte par le
 * prefixe `/patrimoine` (`lib/subscription/route-features.ts`). Lecture :
 * PROPERTIES_VIEW ; ecriture : PROPERTIES_EDIT.
 */
const router = Router();

router.use(authenticate);
router.use(requireTenantAccess);
router.use(enforcePropertyTenantIsolation);

const BASE = '/tenants/:tenantId/patrimoine';
const REGULARIZATION = `${BASE}/land-regularizations/:regularizationId`;

router.get(`${BASE}/land-tracks`, requireAnyPropertyPermission(['PROPERTIES_VIEW']), listLandTracksHandler);

router.get(
  `${BASE}/land-regularizations`,
  requireAnyPropertyPermission(['PROPERTIES_VIEW']),
  listLandRegularizationsHandler
);
router.post(
  `${BASE}/land-regularizations`,
  requirePropertyPermission('PROPERTIES_EDIT'),
  createLandRegularizationHandler
);
router.get(REGULARIZATION, requireAnyPropertyPermission(['PROPERTIES_VIEW']), getLandRegularizationHandler);
router.patch(REGULARIZATION, requirePropertyPermission('PROPERTIES_EDIT'), updateLandRegularizationHandler);
router.post(
  `${REGULARIZATION}/status`,
  requirePropertyPermission('PROPERTIES_EDIT'),
  changeLandRegularizationStatusHandler
);

router.post(`${REGULARIZATION}/steps`, requirePropertyPermission('PROPERTIES_EDIT'), addLandStepHandler);
router.patch(`${REGULARIZATION}/steps/:stepId`, requirePropertyPermission('PROPERTIES_EDIT'), updateLandStepHandler);
router.post(
  `${REGULARIZATION}/steps/:stepId/status`,
  requirePropertyPermission('PROPERTIES_EDIT'),
  changeLandStepStatusHandler
);
router.delete(`${REGULARIZATION}/steps/:stepId`, requirePropertyPermission('PROPERTIES_EDIT'), deleteLandStepHandler);

export default router;
