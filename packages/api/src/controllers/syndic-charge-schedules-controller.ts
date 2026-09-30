import type { Request, Response } from 'express';
import { t } from '../i18n';
import { asyncHandler, BadRequestError } from '../middleware/error-middleware';
import { assertUuidOrNotFound } from '../lib/documents/mandating-agencies';
import { sendPrivateFile } from '../lib/files/private-files';
import {
  createChargeSchedule,
  deleteChargeSchedule,
  executeChargeScheduleNow,
  getChargeSchedule,
  listChargeScheduleRuns,
  listChargeSchedules,
  pauseChargeSchedule,
  previewChargeSchedule,
  resendChargeScheduleRunNotices,
  resumeChargeSchedule,
  updateChargeSchedule
} from '../lib/syndics/charge-schedules';
import {
  createChargeScheduleSchema,
  scheduleRunsQuerySchema,
  updateChargeScheduleSchema
} from '../lib/syndics/charge-schedule-schemas';
import { getChargeCallNoticeForTenant } from '../lib/syndics/charge-call-notice';

/**
 * Programmations des appels de charges et avis d'appel PDF (lot S4). Les
 * gardes (session, agence, permission) sont posées par
 * `routes/syndic-charge-schedules-routes.ts` ; l'appartenance de la
 * copropriété, de la programmation, du budget et de l'appel à l'agence est
 * vérifiée par le service (404 sinon).
 */

function tenantIdOf(req: Request): string {
  const tenantId = req.params.tenantId || req.tenantContext?.tenantId;
  if (!tenantId) throw new BadRequestError('Agence manquante dans la requête.');
  return tenantId;
}

const syndicIdOf = (req: Request) =>
  assertUuidOrNotFound(req.params.syndicId, t('Copropriété introuvable ou inaccessible.'));
const scheduleIdOf = (req: Request) => assertUuidOrNotFound(req.params.scheduleId, 'Programmation introuvable.');
const chargeIdOf = (req: Request) => assertUuidOrNotFound(req.params.chargeId, 'Appel de charges introuvable.');
const runIdOf = (req: Request) => assertUuidOrNotFound(req.params.runId, 'Exécution introuvable.');

export const listChargeSchedulesHandler = asyncHandler(async (req: Request, res: Response) => {
  res.json({ success: true, data: await listChargeSchedules(tenantIdOf(req), syndicIdOf(req)) });
});

export const getChargeScheduleHandler = asyncHandler(async (req: Request, res: Response) => {
  res.json({ success: true, data: await getChargeSchedule(tenantIdOf(req), syndicIdOf(req), scheduleIdOf(req)) });
});

export const createChargeScheduleHandler = asyncHandler(async (req: Request, res: Response) => {
  const body = createChargeScheduleSchema.parse(req.body ?? {});
  const schedule = await createChargeSchedule(tenantIdOf(req), syndicIdOf(req), body, req.user?.userId ?? null);
  res.status(201).json({ success: true, data: schedule });
});

export const updateChargeScheduleHandler = asyncHandler(async (req: Request, res: Response) => {
  const body = updateChargeScheduleSchema.parse(req.body ?? {});
  const schedule = await updateChargeSchedule(tenantIdOf(req), syndicIdOf(req), scheduleIdOf(req), body);
  res.json({ success: true, data: schedule });
});

export const deleteChargeScheduleHandler = asyncHandler(async (req: Request, res: Response) => {
  res.json({ success: true, data: await deleteChargeSchedule(tenantIdOf(req), syndicIdOf(req), scheduleIdOf(req)) });
});

export const pauseChargeScheduleHandler = asyncHandler(async (req: Request, res: Response) => {
  res.json({ success: true, data: await pauseChargeSchedule(tenantIdOf(req), syndicIdOf(req), scheduleIdOf(req)) });
});

export const resumeChargeScheduleHandler = asyncHandler(async (req: Request, res: Response) => {
  res.json({ success: true, data: await resumeChargeSchedule(tenantIdOf(req), syndicIdOf(req), scheduleIdOf(req)) });
});

export const executeChargeScheduleHandler = asyncHandler(async (req: Request, res: Response) => {
  const result = await executeChargeScheduleNow(tenantIdOf(req), syndicIdOf(req), scheduleIdOf(req));
  res.json({ success: true, data: result });
});

export const resendChargeScheduleRunNoticesHandler = asyncHandler(async (req: Request, res: Response) => {
  const result = await resendChargeScheduleRunNotices(
    tenantIdOf(req),
    syndicIdOf(req),
    scheduleIdOf(req),
    runIdOf(req)
  );
  res.json({ success: true, data: result });
});

export const listChargeScheduleRunsHandler = asyncHandler(async (req: Request, res: Response) => {
  const query = scheduleRunsQuerySchema.parse(req.query);
  const runs = await listChargeScheduleRuns(tenantIdOf(req), syndicIdOf(req), scheduleIdOf(req), query);
  res.json({ success: true, data: runs });
});

export const previewChargeScheduleHandler = asyncHandler(async (req: Request, res: Response) => {
  res.json({ success: true, data: await previewChargeSchedule(tenantIdOf(req), syndicIdOf(req), scheduleIdOf(req)) });
});

export const downloadChargeCallNoticeHandler = asyncHandler(async (req: Request, res: Response) => {
  sendPrivateFile(res, await getChargeCallNoticeForTenant(tenantIdOf(req), syndicIdOf(req), chargeIdOf(req)));
});
