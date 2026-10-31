import type { Request, Response } from 'express';
import { t } from '../i18n';
import { asyncHandler, BadRequestError } from '../middleware/error-middleware';
import { assertUuidOrNotFound } from '../lib/documents/mandating-agencies';
import { getLotTypeRates, updateLotTypeRates } from '../lib/syndics/lot-type-rates';
import { updateLotTypeRatesSchema } from '../lib/syndics/lot-type-rates-schemas';

/**
 * Barème par type de lot d'une copropriété (menu lot 2). Les gardes (session,
 * agence, permission) sont posées par `routes/syndic-charge-schedules-routes.ts`.
 */

function tenantIdOf(req: Request): string {
  const tenantId = req.params.tenantId || req.tenantContext?.tenantId;
  if (!tenantId) throw new BadRequestError('Agence manquante dans la requête.');
  return tenantId;
}

const syndicIdOf = (req: Request) =>
  assertUuidOrNotFound(req.params.syndicId, t('Copropriété introuvable ou inaccessible.'));

export const getLotTypeRatesHandler = asyncHandler(async (req: Request, res: Response) => {
  res.json({ success: true, data: await getLotTypeRates(tenantIdOf(req), syndicIdOf(req)) });
});

export const updateLotTypeRatesHandler = asyncHandler(async (req: Request, res: Response) => {
  const body = updateLotTypeRatesSchema.parse(req.body ?? {});
  const data = await updateLotTypeRates(tenantIdOf(req), syndicIdOf(req), body.rates, req.user?.userId ?? null);
  res.json({ success: true, data });
});
