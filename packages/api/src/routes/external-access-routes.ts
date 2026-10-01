import { Router } from 'express';
import { authenticate } from '../middleware/auth-middleware';
import { requireTenantAccess } from '../middleware/tenant-middleware';
import { requireAnyPropertyPermission, requirePropertyPermission } from '../middleware/property-rbac-middleware';
import {
  createExternalAccessGrantHandler,
  getExternalAccessGrantHandler,
  getExternalAccessScopeOptionsHandler,
  listExternalAccessGrantsHandler,
  listExternalAccessLogHandler,
  listPropertyDocumentsForSharingHandler,
  revokeExternalAccessGrantHandler,
  sendExternalAccessLinkHandler,
  updateExternalAccessGrantHandler
} from '../controllers/external-access-controller';

/**
 * Accès en lecture seule des tiers de confiance — côté agence (lot B3,
 * spec 034). Montées sur `/api` dans `app.ts`, juste après `patrimoineRoutes` ;
 * chemins sous `/tenants/:tenantId/patrimoine`, déjà couverts par la règle
 * `PATRIMOINE` de `lib/subscription/route-features.ts`.
 *
 * Permissions : `PROPERTIES_VIEW` (liste, détail, journal, options) et
 * `PROPERTIES_EDIT` (création, modification, révocation, renvoi), comme le
 * reste du patrimoine : le périmètre porte sur des biens et leurs documents,
 * pas de nouvelle permission. Gardes posées route par route (jamais en
 * `router.use` nu : ce routeur est monté sur `/api` avec les autres).
 *
 * Les chemins littéraux (`scope-options`, `property-documents/:propertyId`)
 * sont déclarés AVANT `/:grantId`.
 */
const router = Router();
const BASE = '/tenants/:tenantId/patrimoine/external-access';

router.get(
  BASE,
  authenticate,
  requireTenantAccess,
  requireAnyPropertyPermission(['PROPERTIES_VIEW']),
  listExternalAccessGrantsHandler
);
router.get(
  `${BASE}/scope-options`,
  authenticate,
  requireTenantAccess,
  requireAnyPropertyPermission(['PROPERTIES_VIEW']),
  getExternalAccessScopeOptionsHandler
);
router.get(
  `${BASE}/property-documents/:propertyId`,
  authenticate,
  requireTenantAccess,
  requireAnyPropertyPermission(['PROPERTIES_VIEW']),
  listPropertyDocumentsForSharingHandler
);
router.post(
  BASE,
  authenticate,
  requireTenantAccess,
  requirePropertyPermission('PROPERTIES_EDIT'),
  createExternalAccessGrantHandler
);
router.get(
  `${BASE}/:grantId`,
  authenticate,
  requireTenantAccess,
  requireAnyPropertyPermission(['PROPERTIES_VIEW']),
  getExternalAccessGrantHandler
);
router.patch(
  `${BASE}/:grantId`,
  authenticate,
  requireTenantAccess,
  requirePropertyPermission('PROPERTIES_EDIT'),
  updateExternalAccessGrantHandler
);
router.post(
  `${BASE}/:grantId/revoke`,
  authenticate,
  requireTenantAccess,
  requirePropertyPermission('PROPERTIES_EDIT'),
  revokeExternalAccessGrantHandler
);
router.post(
  `${BASE}/:grantId/send-link`,
  authenticate,
  requireTenantAccess,
  requirePropertyPermission('PROPERTIES_EDIT'),
  sendExternalAccessLinkHandler
);
router.get(
  `${BASE}/:grantId/access-log`,
  authenticate,
  requireTenantAccess,
  requireAnyPropertyPermission(['PROPERTIES_VIEW']),
  listExternalAccessLogHandler
);

export default router;
