import { Router, type RequestHandler } from 'express';
import { authenticate } from '../middleware/auth-middleware';
import { requireTenantAccess } from '../middleware/tenant-middleware';
import { enforcePropertyTenantIsolation } from '../middleware/tenant-isolation-middleware';
import { requireAnyPropertyPermission, requirePropertyPermission } from '../middleware/property-rbac-middleware';
import {
  createChargeScheduleHandler,
  deleteChargeScheduleHandler,
  downloadChargeCallNoticeHandler,
  executeChargeScheduleHandler,
  getChargeScheduleHandler,
  listChargeScheduleRunsHandler,
  listChargeSchedulesHandler,
  pauseChargeScheduleHandler,
  previewChargeScheduleHandler,
  resumeChargeScheduleHandler,
  updateChargeScheduleHandler
} from '../controllers/syndic-charge-schedules-controller';

/**
 * Programmations des appels de charges automatiques et avis d'appel PDF
 * (lot S4, besoin 6).
 *
 * Mêmes permissions que les appels de charges : lecture `PROPERTIES_VIEW`,
 * écriture `PROPERTIES_EDIT`. Classées SYNDIC par le préfixe `/syndics` de
 * `lib/subscription/route-features.ts`.
 *
 * Gardes posées avec leur chemin, jamais en `router.use` nu : ce routeur est
 * monté sur `/api` tout entier.
 */
const router = Router();

const guards: RequestHandler[] = [authenticate, requireTenantAccess, enforcePropertyTenantIsolation];
const canView = requireAnyPropertyPermission(['PROPERTIES_VIEW']);
const canEdit = requirePropertyPermission('PROPERTIES_EDIT');

const SYNDIC = '/tenants/:tenantId/syndics/:syndicId';
const SCHEDULE = `${SYNDIC}/programmations/:scheduleId`;

router.get(`${SYNDIC}/programmations`, ...guards, canView, listChargeSchedulesHandler);
router.post(`${SYNDIC}/programmations`, ...guards, canEdit, createChargeScheduleHandler);
router.get(SCHEDULE, ...guards, canView, getChargeScheduleHandler);
router.patch(SCHEDULE, ...guards, canEdit, updateChargeScheduleHandler);
router.delete(SCHEDULE, ...guards, canEdit, deleteChargeScheduleHandler);
router.post(`${SCHEDULE}/pause`, ...guards, canEdit, pauseChargeScheduleHandler);
router.post(`${SCHEDULE}/reprise`, ...guards, canEdit, resumeChargeScheduleHandler);
router.post(`${SCHEDULE}/executer`, ...guards, canEdit, executeChargeScheduleHandler);
router.get(`${SCHEDULE}/executions`, ...guards, canView, listChargeScheduleRunsHandler);
router.get(`${SCHEDULE}/apercu`, ...guards, canView, previewChargeScheduleHandler);
router.get(`${SYNDIC}/charges/:chargeId/avis`, ...guards, canView, downloadChargeCallNoticeHandler);

export default router;
