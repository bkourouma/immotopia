import { Router } from 'express';
import { authenticate } from '../middleware/auth-middleware';
import { requireTenantAccess } from '../middleware/tenant-middleware';
import { enforcePropertyTenantIsolation } from '../middleware/tenant-isolation-middleware';
import { requireAnyPropertyPermission } from '../middleware/property-rbac-middleware';
import { exportNetWorthHandler } from '../controllers/patrimoine-net-worth-export-controller';

/**
 * Exports du patrimoine multi-actifs (lot 5). Monté sur `/api` dans `app.ts`.
 * Chemins sous `/tenants/:tenantId/patrimoine`, couverts par la règle
 * `{ prefix: '/patrimoine', feature: 'PATRIMOINE' }` de
 * `lib/subscription/route-features.ts` et autorisés à un espace PARTICULIER
 * par `lib/subscription/particulier-routes.ts`.
 */

/**
 * Permission de lecture de l'export : UNE seule constante, à remplacer par
 * `PATRIMOINE_PERSONAL_VIEW` quand la permission dédiée existera.
 */
const NET_WORTH_EXPORT_READ_PERMISSIONS = ['PROPERTIES_VIEW'];

const router = Router();
const BASE = '/tenants/:tenantId/patrimoine';

const read = [
  authenticate,
  requireTenantAccess,
  enforcePropertyTenantIsolation,
  requireAnyPropertyPermission(NET_WORTH_EXPORT_READ_PERMISSIONS)
];

router.get(`${BASE}/net-worth/export`, ...read, exportNetWorthHandler);

export default router;
