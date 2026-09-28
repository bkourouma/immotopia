import { Request, Response } from 'express';
import { asyncHandler, BadRequestError } from '../middleware/error-middleware';
import {
  listHoldingEntitiesQuerySchema,
  createHoldingEntitySchema,
  updateHoldingEntitySchema,
  createEntityHoldingSchema,
  updateEntityHoldingSchema,
  setPropertyHoldingsSchema
} from '../lib/patrimoine/entities/schemas';
import {
  listHoldingEntities,
  getHoldingEntityById,
  createHoldingEntity,
  updateHoldingEntity,
  deleteHoldingEntity,
  createEntityHolding,
  updateEntityHolding,
  deleteEntityHolding,
  getPropertyHoldings,
  setPropertyHoldings
} from '../lib/patrimoine/entities/service';
import { getEntityConsolidation } from '../lib/patrimoine/entities/consolidation-service';

/**
 * Contrôleurs des entités détentrices et de leurs rattachements (lot P4,
 * territoire A2). Modèle : `controllers/property-media-controller.ts`
 * (`asyncHandler` + erreurs typées, jamais de `try/catch` qui devine le
 * statut HTTP).
 */

function requireTenantId(req: Request): string {
  const tenantId = req.tenantContext?.tenantId || req.params.tenantId;
  if (!tenantId) throw new BadRequestError('Contexte agence requis.');
  return tenantId;
}

export const listHoldingEntitiesHandler = asyncHandler(async (req: Request, res: Response) => {
  const query = listHoldingEntitiesQuerySchema.parse(req.query ?? {});
  const data = await listHoldingEntities(requireTenantId(req), {
    search: query.search,
    legalForm: query.legalForm,
    country: query.country,
    includeInactive: query.includeInactive === 'true'
  });
  res.json({ success: true, data });
});

export const createHoldingEntityHandler = asyncHandler(async (req: Request, res: Response) => {
  const body = createHoldingEntitySchema.parse(req.body ?? {});
  const data = await createHoldingEntity(requireTenantId(req), body, req.user?.userId);
  res.status(201).json({ success: true, data });
});

export const getHoldingEntityHandler = asyncHandler(async (req: Request, res: Response) => {
  const data = await getHoldingEntityById(requireTenantId(req), req.params.entityId);
  res.json({ success: true, data });
});

export const updateHoldingEntityHandler = asyncHandler(async (req: Request, res: Response) => {
  const body = updateHoldingEntitySchema.parse(req.body ?? {});
  const data = await updateHoldingEntity(requireTenantId(req), req.params.entityId, body);
  res.json({ success: true, data });
});

export const deleteHoldingEntityHandler = asyncHandler(async (req: Request, res: Response) => {
  await deleteHoldingEntity(requireTenantId(req), req.params.entityId);
  res.status(204).send();
});

export const createEntityHoldingHandler = asyncHandler(async (req: Request, res: Response) => {
  const body = createEntityHoldingSchema.parse(req.body ?? {});
  const data = await createEntityHolding(requireTenantId(req), req.params.entityId, body, req.user?.userId);
  res.status(201).json({ success: true, data });
});

export const updateEntityHoldingHandler = asyncHandler(async (req: Request, res: Response) => {
  const body = updateEntityHoldingSchema.parse(req.body ?? {});
  const data = await updateEntityHolding(
    requireTenantId(req),
    req.params.entityId,
    req.params.holdingId,
    body,
    req.user?.userId
  );
  res.json({ success: true, data });
});

export const deleteEntityHoldingHandler = asyncHandler(async (req: Request, res: Response) => {
  await deleteEntityHolding(requireTenantId(req), req.params.entityId, req.params.holdingId);
  res.status(204).send();
});

export const getEntityConsolidationHandler = asyncHandler(async (req: Request, res: Response) => {
  const data = await getEntityConsolidation(requireTenantId(req), req.params.entityId);
  res.json({ success: true, data });
});

export const getPropertyHoldingsHandler = asyncHandler(async (req: Request, res: Response) => {
  const data = await getPropertyHoldings(requireTenantId(req), req.params.propertyId);
  res.json({ success: true, data });
});

export const setPropertyHoldingsHandler = asyncHandler(async (req: Request, res: Response) => {
  const body = setPropertyHoldingsSchema.parse(req.body ?? {});
  const data = await setPropertyHoldings(requireTenantId(req), req.params.propertyId, body, req.user?.userId);
  res.json({ success: true, data });
});

export { requireTenantId };
