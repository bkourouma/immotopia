import type { Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler, BadRequestError, NotFoundError } from '../middleware/error-middleware';
import { t } from '../i18n';
import {
  cancelRemittance,
  cancelRemittanceLine,
  createRemittance,
  exportRemittance,
  getRemittance,
  listRemittances,
  refreshRemittance,
  resendPrenotifications,
  submitRemittance,
  validateRemittance
} from '../lib/direct-debit/remittances';
import {
  cancelLineSchema,
  cancelRemittanceSchema,
  createRemittanceSchema,
  listRemittancesQuerySchema
} from '../lib/direct-debit/remittance-schemas';

/**
 * Prélèvement bancaire : remises de loyers (spec 042, lot P2).
 * Contrôleurs fins ; la logique métier vit dans lib/direct-debit/remittances.ts.
 * Les erreurs typées remontent au gestionnaire central (asyncHandler).
 */

const uuid = z.string().uuid();

function tenantOf(req: Request): string {
  const tenantId = req.tenantContext?.tenantId || req.params.tenantId;
  if (!tenantId) throw new BadRequestError(t('TenantId manquant'));
  return tenantId;
}

/** Un identifiant qui n est pas un UUID ne désigne rien : 404, pas 500. */
function idParam(req: Request, name: string, message: string): string {
  const parsed = uuid.safeParse(req.params[name]);
  if (!parsed.success) throw new NotFoundError(message);
  return parsed.data;
}

const remittanceOf = (req: Request) => idParam(req, 'remittanceId', t('Remise introuvable.'));
const lineOf = (req: Request) => idParam(req, 'lineId', t('Ligne de remise introuvable.'));
const actorOf = (req: Request) => req.user?.userId;

export const listRemittancesHandler = asyncHandler(async (req: Request, res: Response) => {
  const query = listRemittancesQuerySchema.parse(req.query ?? {});
  res.json({ success: true, data: await listRemittances(tenantOf(req), query) });
});

export const createRemittanceHandler = asyncHandler(async (req: Request, res: Response) => {
  const input = createRemittanceSchema.parse(req.body ?? {});
  const data = await createRemittance(tenantOf(req), input, actorOf(req));
  res.status(201).json({ success: true, data });
});

export const getRemittanceHandler = asyncHandler(async (req: Request, res: Response) => {
  res.json({ success: true, data: await getRemittance(tenantOf(req), remittanceOf(req)) });
});

export const refreshRemittanceHandler = asyncHandler(async (req: Request, res: Response) => {
  res.json({ success: true, data: await refreshRemittance(tenantOf(req), remittanceOf(req), actorOf(req)) });
});

export const cancelRemittanceLineHandler = asyncHandler(async (req: Request, res: Response) => {
  const input = cancelLineSchema.parse(req.body ?? {});
  const data = await cancelRemittanceLine(tenantOf(req), remittanceOf(req), lineOf(req), input.reason, actorOf(req));
  res.json({ success: true, data });
});

export const validateRemittanceHandler = asyncHandler(async (req: Request, res: Response) => {
  res.json({ success: true, data: await validateRemittance(tenantOf(req), remittanceOf(req), actorOf(req)) });
});

export const resendPrenotificationsHandler = asyncHandler(async (req: Request, res: Response) => {
  res.json({ success: true, data: await resendPrenotifications(tenantOf(req), remittanceOf(req), actorOf(req)) });
});

export const exportRemittanceHandler = asyncHandler(async (req: Request, res: Response) => {
  const file = await exportRemittance(tenantOf(req), remittanceOf(req), actorOf(req));
  res.setHeader('Content-Type', file.contentType);
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(file.fileName)}`);
  res.setHeader('Content-Length', file.buffer.length.toString());
  // Le fichier porte les IBAN complets : ni cache navigateur ni cache intermédiaire.
  res.setHeader('Cache-Control', 'no-store');
  res.send(file.buffer);
});

export const submitRemittanceHandler = asyncHandler(async (req: Request, res: Response) => {
  res.json({ success: true, data: await submitRemittance(tenantOf(req), remittanceOf(req), actorOf(req)) });
});

export const cancelRemittanceHandler = asyncHandler(async (req: Request, res: Response) => {
  const input = cancelRemittanceSchema.parse(req.body ?? {});
  const data = await cancelRemittance(tenantOf(req), remittanceOf(req), input.reason, actorOf(req));
  res.json({ success: true, data });
});
