import { Router, type RequestHandler } from 'express';
import { authenticate } from '../middleware/auth-middleware';
import { requireTenantAccess } from '../middleware/tenant-middleware';
import { enforcePropertyTenantIsolation } from '../middleware/tenant-isolation-middleware';
import { requireAnyPropertyPermission, requirePropertyPermission } from '../middleware/property-rbac-middleware';
import { chargeCallNoticeRateLimiter, chargeScheduleExecuteRateLimiter } from '../middleware/rate-limit-middleware';
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
  resendChargeScheduleRunNoticesHandler,
  resumeChargeScheduleHandler,
  updateChargeScheduleHandler
} from '../controllers/syndic-charge-schedules-controller';

/**
 * Programmations des appels de charges automatiques et avis d'appel PDF
 * (lot S4, besoin 6).
 *
 * Mêmes permissions que les appels de charges : lecture `SYNDIC_VIEW`,
 * écriture `SYNDIC_EDIT`. Classées SYNDIC par le préfixe `/syndics` de
 * `lib/subscription/route-features.ts`.
 *
 * Gardes posées avec leur chemin, jamais en `router.use` nu : ce routeur est
 * monté sur `/api` tout entier.
 */
const router = Router();

const guards: RequestHandler[] = [authenticate, requireTenantAccess, enforcePropertyTenantIsolation];
const canView = requireAnyPropertyPermission(['SYNDIC_VIEW']);
const canEdit = requirePropertyPermission('SYNDIC_EDIT');

const SYNDIC = '/tenants/:tenantId/syndics/:syndicId';
const SCHEDULE = `${SYNDIC}/programmations/:scheduleId`;

router.get(`${SYNDIC}/programmations`, ...guards, canView, listChargeSchedulesHandler);
router.post(`${SYNDIC}/programmations`, ...guards, canEdit, createChargeScheduleHandler);
router.get(SCHEDULE, ...guards, canView, getChargeScheduleHandler);
router.patch(SCHEDULE, ...guards, canEdit, updateChargeScheduleHandler);
router.delete(SCHEDULE, ...guards, canEdit, deleteChargeScheduleHandler);
router.post(`${SCHEDULE}/pause`, ...guards, canEdit, pauseChargeScheduleHandler);
router.post(`${SCHEDULE}/reprise`, ...guards, canEdit, resumeChargeScheduleHandler);
// Limiteurs par utilisateur et agence, posés APRÈS les gardes (ils lisent la session et l'agence).
router.post(`${SCHEDULE}/executer`, ...guards, canEdit, chargeScheduleExecuteRateLimiter, executeChargeScheduleHandler);
router.get(`${SCHEDULE}/executions`, ...guards, canView, listChargeScheduleRunsHandler);
// Même limiteur que « Exécuter » : un renvoi part aussi des e-mails/WhatsApp.
router.post(
  `${SCHEDULE}/executions/:runId/renvoyer-avis`,
  ...guards,
  canEdit,
  chargeScheduleExecuteRateLimiter,
  resendChargeScheduleRunNoticesHandler
);
router.get(`${SCHEDULE}/apercu`, ...guards, canView, previewChargeScheduleHandler);
router.get(
  `${SYNDIC}/charges/:chargeId/avis`,
  ...guards,
  canView,
  chargeCallNoticeRateLimiter,
  downloadChargeCallNoticeHandler
);

export default router;
