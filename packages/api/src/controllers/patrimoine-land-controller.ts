import { Request, Response } from 'express';
import { asyncHandler, BadRequestError } from '../middleware/error-middleware';
import {
  addLandStepSchema,
  changeLandRegularizationStatusSchema,
  changeLandStepStatusSchema,
  createLandRegularizationSchema,
  listLandRegularizationsQuerySchema,
  updateLandRegularizationSchema,
  updateLandStepSchema
} from '../lib/patrimoine/land/schemas';
import {
  addStep,
  changeRegularizationStatus,
  changeStepStatus,
  createRegularization,
  deleteStep,
  getRegularization,
  listRegularizations,
  listTracks,
  updateRegularization,
  updateStep
} from '../lib/patrimoine/land/service';

/**
 * Régularisation foncière (spec 033). Enveloppe `{ success, data }` comme
 * `patrimoine-controller.ts` ; les services lèvent des erreurs typées.
 */

function resolveTenantId(req: Request): string {
  const tenantId = req.params.tenantId || req.tenantContext?.tenantId;
  if (!tenantId) throw new BadRequestError('TenantId manquant');
  return tenantId;
}

function resolveParam(req: Request, key: string, label: string): string {
  const value = req.params[key];
  if (!value) throw new BadRequestError(`${label} manquant`);
  return value;
}

function actorId(req: Request): string | null {
  return req.user?.userId ?? null;
}

export const listLandTracksHandler = asyncHandler(async (_req: Request, res: Response) => {
  res.json({ success: true, data: listTracks() });
});

export const listLandRegularizationsHandler = asyncHandler(async (req: Request, res: Response) => {
  const query = listLandRegularizationsQuerySchema.parse(req.query);
  const data = await listRegularizations(resolveTenantId(req), query);
  res.json({ success: true, data });
});

export const createLandRegularizationHandler = asyncHandler(async (req: Request, res: Response) => {
  const body = createLandRegularizationSchema.parse(req.body ?? {});
  const data = await createRegularization(resolveTenantId(req), actorId(req), body);
  res.status(201).json({ success: true, data });
});

export const getLandRegularizationHandler = asyncHandler(async (req: Request, res: Response) => {
  const data = await getRegularization(resolveTenantId(req), resolveParam(req, 'regularizationId', 'RegularizationId'));
  res.json({ success: true, data });
});

export const updateLandRegularizationHandler = asyncHandler(async (req: Request, res: Response) => {
  const body = updateLandRegularizationSchema.parse(req.body ?? {});
  const data = await updateRegularization(
    resolveTenantId(req),
    resolveParam(req, 'regularizationId', 'RegularizationId'),
    body
  );
  res.json({ success: true, data });
});

export const changeLandRegularizationStatusHandler = asyncHandler(async (req: Request, res: Response) => {
  const body = changeLandRegularizationStatusSchema.parse(req.body ?? {});
  const data = await changeRegularizationStatus(
    resolveTenantId(req),
    actorId(req),
    resolveParam(req, 'regularizationId', 'RegularizationId'),
    body
  );
  res.json({ success: true, data });
});

export const addLandStepHandler = asyncHandler(async (req: Request, res: Response) => {
  const body = addLandStepSchema.parse(req.body ?? {});
  const data = await addStep(
    resolveTenantId(req),
    actorId(req),
    resolveParam(req, 'regularizationId', 'RegularizationId'),
    body
  );
  res.status(201).json({ success: true, data });
});

export const updateLandStepHandler = asyncHandler(async (req: Request, res: Response) => {
  const body = updateLandStepSchema.parse(req.body ?? {});
  const data = await updateStep(
    resolveTenantId(req),
    actorId(req),
    resolveParam(req, 'regularizationId', 'RegularizationId'),
    resolveParam(req, 'stepId', 'StepId'),
    body
  );
  res.json({ success: true, data });
});

export const changeLandStepStatusHandler = asyncHandler(async (req: Request, res: Response) => {
  const body = changeLandStepStatusSchema.parse(req.body ?? {});
  const data = await changeStepStatus(
    resolveTenantId(req),
    actorId(req),
    resolveParam(req, 'regularizationId', 'RegularizationId'),
    resolveParam(req, 'stepId', 'StepId'),
    body
  );
  res.json({ success: true, data });
});

export const deleteLandStepHandler = asyncHandler(async (req: Request, res: Response) => {
  const data = await deleteStep(
    resolveTenantId(req),
    actorId(req),
    resolveParam(req, 'regularizationId', 'RegularizationId'),
    resolveParam(req, 'stepId', 'StepId')
  );
  res.json({ success: true, data });
});
