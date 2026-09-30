import { Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler, BadRequestError } from '../middleware/error-middleware';
import { t } from '../i18n';
import {
  createMandate,
  revokeMandate,
  getPropertyMandates,
  getTenantMandates
} from '../services/property-mandate-service';
import { getTenantIdFromRequest } from '../middleware/tenant-isolation-middleware';
import { CreateMandateRequest } from '../types/property-types';

const createMandateBodySchema = z.object({
  propertyId: z.string().uuid(),
  startDate: z.coerce.date(),
  endDate: z.coerce.date().optional().nullable(),
  scope: z.record(z.unknown()).optional().nullable(),
  notes: z.string().max(5000).optional().nullable()
});

/**
 * Create mandate handler.
 *
 * Corps valide avant tout acces base (400 VALIDATION_ERROR traduit) ; les
 * erreurs typees des services remontent au gestionnaire central, qui ne
 * renvoie jamais le texte d'une erreur technique.
 */
export const createMandateHandler = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const tenantId = req.params.tenantId || getTenantIdFromRequest(req);
  const userId = req.user?.userId;

  const body = createMandateBodySchema.parse(req.body ?? {});
  if (req.params.id && body.propertyId !== req.params.id) {
    throw new BadRequestError(t("Le bien du mandat ne correspond pas à celui de l'adresse"));
  }

  const data: CreateMandateRequest = {
    propertyId: body.propertyId,
    tenantId,
    startDate: body.startDate,
    endDate: body.endDate ?? undefined,
    scope: body.scope ?? undefined,
    notes: body.notes ?? undefined
  };

  const mandate = await createMandate(tenantId, data, userId);

  res.status(201).json({
    success: true,
    data: mandate
  });
});

/**
 * Revoke mandate handler
 */
export const revokeMandateHandler = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const tenantId = req.params.tenantId || getTenantIdFromRequest(req);
  const mandate = await revokeMandate(req.params.mandateId, tenantId, req.user?.userId);

  res.json({
    success: true,
    data: mandate
  });
});

/**
 * Get property mandates handler
 */
export const getPropertyMandatesHandler = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const propertyId = req.params.propertyId || req.params.id;
  const tenantId = req.params.tenantId || getTenantIdFromRequest(req);

  const mandates = await getPropertyMandates(propertyId, tenantId);

  res.json({
    success: true,
    data: mandates
  });
});

/**
 * Get tenant mandates handler
 */
export const getTenantMandatesHandler = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const tenantId = req.params.tenantId || getTenantIdFromRequest(req);

  const mandates = await getTenantMandates(tenantId);

  res.json({
    success: true,
    data: mandates
  });
});
