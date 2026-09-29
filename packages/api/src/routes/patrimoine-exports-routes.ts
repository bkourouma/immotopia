import { Router } from 'express';
import { authenticate } from '../middleware/auth-middleware';
import { requireTenantAccess } from '../middleware/tenant-middleware';
import { enforcePropertyTenantIsolation } from '../middleware/tenant-isolation-middleware';
import { requirePatrimoinePersonalView } from '../middleware/patrimoine-rbac-middleware';
import { exportNetWorthHandler } from '../controllers/patrimoine-net-worth-export-controller';

/**
 * Exports du patrimoine multi-actifs (lot 5). Monté sur `/api` dans `app.ts`.
 * Chemins sous `/tenants/:tenantId/patrimoine`, couverts par la règle
 * `{ prefix: '/patrimoine', feature: 'PATRIMOINE' }` de
 * `lib/subscription/route-features.ts` et autorisés à un espace PARTICULIER
 * par `lib/subscription/particulier-routes.ts`.
 */

/**
 * L'export contient la valeur nette, les actifs non immobiliers et les dettes :
 * mêmes données personnelles que `net-worth`, donc même permission dédiée
 * `PATRIMOINE_PERSONAL_VIEW` (pas `PROPERTIES_VIEW`, que porte tout membre d'agence).
 */
const router = Router();
const BASE = '/tenants/:tenantId/patrimoine';

const read = [authenticate, requireTenantAccess, enforcePropertyTenantIsolation, requirePatrimoinePersonalView];

router.get(`${BASE}/net-worth/export`, ...read, exportNetWorthHandler);

export default router;
