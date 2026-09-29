import { Router } from 'express';
import { authenticate } from '../middleware/auth-middleware';
import { requireTenantAccess } from '../middleware/tenant-middleware';
import { enforcePropertyTenantIsolation } from '../middleware/tenant-isolation-middleware';
import { requireAnyPropertyPermission, requirePropertyPermission } from '../middleware/property-rbac-middleware';
import {
  createScenarioHandler,
  deleteScenarioHandler,
  getScenarioHandler,
  listScenariosHandler,
  projectionHandler,
  runScenarioHandler,
  updateScenarioHandler
} from '../controllers/patrimoine-projections-controller';

/**
 * Projections et simulations du patrimoine (lot 3, spec 025). Contrat :
 * `specs/025-patrimoine-projections-simulations/contracts/api.md`.
 *
 * Monté sur `/api` dans `app.ts`. Chemins sous `/tenants/:tenantId/patrimoine`,
 * couverts par la règle `{ prefix: '/patrimoine', feature: 'PATRIMOINE' }` de
 * `lib/subscription/route-features.ts`. Gardes posées route par route. La
 * projection et l'exécution d'un scénario sont en lecture seule malgré le POST :
 * garde `PROPERTIES_VIEW`. Ordre : chemins statiques avant `:scenarioId`.
 */
const router = Router();
const BASE = '/tenants/:tenantId/patrimoine';

const read = [
  authenticate,
  requireTenantAccess,
  enforcePropertyTenantIsolation,
  requireAnyPropertyPermission(['PROPERTIES_VIEW'])
];
const write = [
  authenticate,
  requireTenantAccess,
  enforcePropertyTenantIsolation,
  requirePropertyPermission('PROPERTIES_EDIT')
];

router.post(`${BASE}/projections`, ...read, projectionHandler);
router.get(`${BASE}/scenarios`, ...read, listScenariosHandler);
router.post(`${BASE}/scenarios`, ...write, createScenarioHandler);
router.get(`${BASE}/scenarios/:scenarioId`, ...read, getScenarioHandler);
router.patch(`${BASE}/scenarios/:scenarioId`, ...write, updateScenarioHandler);
router.delete(`${BASE}/scenarios/:scenarioId`, ...write, deleteScenarioHandler);
router.post(`${BASE}/scenarios/:scenarioId/run`, ...read, runScenarioHandler);

export default router;
