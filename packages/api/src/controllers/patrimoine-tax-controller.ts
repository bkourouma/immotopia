import { Request, Response } from 'express';
import { asyncHandler, BadRequestError } from '../middleware/error-middleware';
import {
  taxEstimateQuerySchema,
  taxProfileSchema,
  propertyTaxEstimateQuerySchema,
  taxParametersQuerySchema
} from '../lib/patrimoine/tax/schemas';
import {
  getPropertyTaxProfile,
  setPropertyTaxProfile,
  getPropertyTaxEstimate,
  getEntityTaxEstimate,
  getTaxParameters
} from '../lib/patrimoine/tax/service';

/**
 * Contrôleurs fiscaux (profil, estimations, référentiel) — lot P4,
 * territoire A2. `TaxParameter` est un modèle GLOBAL, en lecture seule ici :
 * aucune route d'écriture.
 */

function requireTenantId(req: Request): string {
  const tenantId = req.tenantContext?.tenantId || req.params.tenantId;
  if (!tenantId) throw new BadRequestError('Contexte agence requis.');
  return tenantId;
}

export const getEntityTaxEstimateHandler = asyncHandler(async (req: Request, res: Response) => {
  const query = taxEstimateQuerySchema.parse(req.query ?? {});
  const data = await getEntityTaxEstimate(requireTenantId(req), req.params.entityId, { year: query.year });
  res.json({ success: true, data });
});

export const getPropertyTaxProfileHandler = asyncHandler(async (req: Request, res: Response) => {
  const data = await getPropertyTaxProfile(requireTenantId(req), req.params.propertyId);
  res.json({ success: true, data });
});

export const setPropertyTaxProfileHandler = asyncHandler(async (req: Request, res: Response) => {
  const body = taxProfileSchema.parse(req.body ?? {});
  const data = await setPropertyTaxProfile(requireTenantId(req), req.params.propertyId, body, req.user?.userId);
  res.json({ success: true, data });
});

export const getPropertyTaxEstimateHandler = asyncHandler(async (req: Request, res: Response) => {
  const query = propertyTaxEstimateQuerySchema.parse(req.query ?? {});
  const data = await getPropertyTaxEstimate(requireTenantId(req), req.params.propertyId, {
    year: query.year,
    country: query.country
  });
  res.json({ success: true, data });
});

export const getTaxParametersHandler = asyncHandler(async (req: Request, res: Response) => {
  const query = taxParametersQuerySchema.parse(req.query ?? {});
  const data = await getTaxParameters({ country: query.country, year: query.year });
  res.json({ success: true, data });
});
