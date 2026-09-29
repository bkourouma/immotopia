import { Router } from 'express';
import { authenticate } from '../middleware/auth-middleware';
import { requireTenantAccess } from '../middleware/tenant-middleware';
import { enforcePropertyTenantIsolation } from '../middleware/tenant-isolation-middleware';
import { requireAnyPropertyPermission, requirePropertyPermission } from '../middleware/property-rbac-middleware';
import {
  archiveAssetHandler,
  createAssetHandler,
  createAssetValuationHandler,
  createDebtHandler,
  deleteAssetHoldingHandler,
  deleteAssetValuationHandler,
  deleteDebtHandler,
  disposeAssetHandler,
  getAssetHandler,
  getNetWorthHandler,
  getNetWorthHistoryHandler,
  listAssetHoldingsHandler,
  listAssetValuationsHandler,
  listAssetsHandler,
  listDebtsHandler,
  setAssetHoldingHandler,
  suggestAssetValuationHandler,
  updateAssetHandler,
  updateAssetValuationHandler,
  updateDebtHandler
} from '../controllers/patrimoine-assets-controller';

/**
 * Patrimoine multi-actifs (lot 1, spec 023). Contrat :
 * `specs/023-patrimoine-multi-actifs/contracts/api.md`.
 *
 * Monté sur `/api` dans `app.ts`. Chemins sous `/tenants/:tenantId/patrimoine`,
 * couverts par la règle `{ prefix: '/patrimoine', feature: 'PATRIMOINE' }` de
 * `lib/subscription/route-features.ts`. Gardes posées route par route (jamais
 * en `router.use` nu). Ordre : chemins statiques (`net-worth/history`) avant
 * les chemins paramétrés. `enforcePropertyTenantIsolation` ne lit que le
 * contexte d'agence, il ne dépend d'aucun `:propertyId`.
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

router.get(`${BASE}/net-worth`, ...read, getNetWorthHandler);
router.get(`${BASE}/net-worth/history`, ...read, getNetWorthHistoryHandler);
router.get(`${BASE}/assets`, ...read, listAssetsHandler);
router.post(`${BASE}/assets`, ...write, createAssetHandler);
router.get(`${BASE}/assets/:assetId`, ...read, getAssetHandler);
router.patch(`${BASE}/assets/:assetId`, ...write, updateAssetHandler);
router.post(`${BASE}/assets/:assetId/dispose`, ...write, disposeAssetHandler);
router.post(`${BASE}/assets/:assetId/archive`, ...write, archiveAssetHandler);
router.get(`${BASE}/assets/:assetId/valuations`, ...read, listAssetValuationsHandler);
// Suggestion : lecture seule (aucune écriture), donc garde PROPERTIES_VIEW. Chemin statique avant `:valuationId`.
router.post(`${BASE}/assets/:assetId/valuations/suggest`, ...read, suggestAssetValuationHandler);
router.post(`${BASE}/assets/:assetId/valuations`, ...write, createAssetValuationHandler);
router.patch(`${BASE}/assets/:assetId/valuations/:valuationId`, ...write, updateAssetValuationHandler);
router.delete(`${BASE}/assets/:assetId/valuations/:valuationId`, ...write, deleteAssetValuationHandler);
router.get(`${BASE}/assets/:assetId/holdings`, ...read, listAssetHoldingsHandler);
router.put(`${BASE}/assets/:assetId/holdings/:entityId`, ...write, setAssetHoldingHandler);
router.delete(`${BASE}/assets/:assetId/holdings/:entityId`, ...write, deleteAssetHoldingHandler);
router.get(`${BASE}/debts`, ...read, listDebtsHandler);
router.post(`${BASE}/debts`, ...write, createDebtHandler);
router.patch(`${BASE}/debts/:debtId`, ...write, updateDebtHandler);
router.delete(`${BASE}/debts/:debtId`, ...write, deleteDebtHandler);

export default router;
