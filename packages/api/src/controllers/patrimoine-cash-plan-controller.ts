import type { Request, Response } from 'express';
import { asyncHandler, BadRequestError } from '../middleware/error-middleware';
import { cashPlanQuerySchema, cashPlanSettingsSchema } from '../lib/patrimoine/cash-plan-schemas';
import { getCashPlan, updateCashPlanSettings } from '../lib/patrimoine/cash-plan-service';

function resolveTenantId(req: Request): string {
  // Le contexte posé par `requireTenantAccess` est la seule valeur dont l'appartenance a été vérifiée.
  const tenantId = req.tenantContext?.tenantId || req.params.tenantId;
  if (!tenantId) throw new BadRequestError('TenantId manquant');
  return tenantId;
}

/** `GET /tenants/:tenantId/patrimoine/cash-plan` — plan de trésorerie prévisionnel sur 12 ou 24 mois. */
export const getCashPlanHandler = asyncHandler(async (req: Request, res: Response) => {
  const query = cashPlanQuerySchema.parse(req.query);
  const data = await getCashPlan(resolveTenantId(req), query);
  res.json({ success: true, data });
});

/** `PUT /tenants/:tenantId/patrimoine/cash-plan/settings` — date d'exigibilité annuelle de la taxe foncière. */
export const updateCashPlanSettingsHandler = asyncHandler(async (req: Request, res: Response) => {
  const body = cashPlanSettingsSchema.parse(req.body ?? {});
  const data = await updateCashPlanSettings(resolveTenantId(req), req.user?.userId, body);
  res.json({ success: true, data });
});
