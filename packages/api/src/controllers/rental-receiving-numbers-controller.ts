import type { Request, Response } from 'express';
import { t } from '../i18n';
import { asyncHandler, BadRequestError } from '../middleware/error-middleware';
import { assertUuidOrNotFound } from '../lib/documents/mandating-agencies';
import {
  createReceivingNumber,
  deleteReceivingNumber,
  listReceivingNumbers,
  updateReceivingNumber
} from '../lib/rental/declared-payment/receiving-numbers';
import { getSettingsDto, updateSettings } from '../lib/rental/declared-payment/settings';
import { listReceivingNumbersQuerySchema } from '../lib/rental/declared-payment/admin-schemas';

/**
 * Numéros de réception et réglages du paiement de loyer déclaré, côté
 * gestionnaire (contrat §1.1 et §1.2). Les gardes (session, agence,
 * `RENTAL_PAYMENTS_VIEW` / `RENTAL_PAYMENTS_ALLOCATE`) sont posées par
 * `routes/rental-declared-payment-routes.ts`. Aucun identifiant d'agence n'est lu d'un corps.
 */

function tenantIdOf(req: Request): string {
  const tenantId = req.params.tenantId || req.tenantContext?.tenantId;
  if (!tenantId) throw new BadRequestError(t('Agence manquante dans la requête.'));
  return tenantId;
}

function userIdOf(req: Request): string {
  const userId = req.user?.userId;
  if (!userId) throw new BadRequestError(t('Utilisateur manquant dans la requête.'));
  return userId;
}

const numberIdOf = (req: Request) => assertUuidOrNotFound(req.params.numberId, t('Numéro de réception introuvable.'));

export const listReceivingNumbersHandler = asyncHandler(async (req: Request, res: Response) => {
  const query = listReceivingNumbersQuerySchema.parse(req.query);
  const active = query.active === undefined ? undefined : query.active === 'true';
  res.json({ success: true, data: await listReceivingNumbers(tenantIdOf(req), { active }) });
});

export const createReceivingNumberHandler = asyncHandler(async (req: Request, res: Response) => {
  const data = await createReceivingNumber(tenantIdOf(req), userIdOf(req), req.body ?? {});
  res.status(201).json({ success: true, data });
});

export const updateReceivingNumberHandler = asyncHandler(async (req: Request, res: Response) => {
  const data = await updateReceivingNumber(tenantIdOf(req), userIdOf(req), numberIdOf(req), req.body ?? {});
  res.json({ success: true, data });
});

export const deleteReceivingNumberHandler = asyncHandler(async (req: Request, res: Response) => {
  const data = await deleteReceivingNumber(tenantIdOf(req), userIdOf(req), numberIdOf(req));
  res.json({ success: true, data });
});

export const getDeclaredSettingsHandler = asyncHandler(async (req: Request, res: Response) => {
  res.json({ success: true, data: await getSettingsDto(tenantIdOf(req)) });
});

export const updateDeclaredSettingsHandler = asyncHandler(async (req: Request, res: Response) => {
  const data = await updateSettings(tenantIdOf(req), userIdOf(req), req.body ?? {});
  res.json({ success: true, data });
});
