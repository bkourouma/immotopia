import type { Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler, BadRequestError, NotFoundError } from '../middleware/error-middleware';
import { t } from '../i18n';
import {
  applyReturnFile,
  listReturnImports,
  previewReturnFile,
  rejectRemittanceLine,
  settleAllRemittanceLines,
  settleRemittanceLine,
  type ReturnScope
} from '../lib/direct-debit/returns';
import {
  listReturnImportsQuerySchema,
  rejectLineSchema,
  settleAllSchema,
  settleLineSchema
} from '../lib/direct-debit/returns/schemas';

/**
 * Prélèvement bancaire : retour banque des loyers (spec 042, lot P3, data-model §8.7).
 * Contrôleurs fins ; la logique vit dans lib/direct-debit/returns/. Les routes
 * de loyers passent toujours `{ scope: 'RENTAL_LEASE' }` : le service ne voit que
 * les remises de ce périmètre (P4 appellera les mêmes services pour les charges).
 */

const uuid = z.string().uuid();
const RENTAL_SCOPE: ReturnScope = { scope: 'RENTAL_LEASE' };

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
const actorOf = (req: Request) => req.user?.userId ?? null;

/** `format` arrive en champ texte du formulaire multipart. */
const formatOf = (req: Request): string | undefined =>
  typeof req.body?.format === 'string' ? req.body.format : undefined;

export const settleLineHandler = asyncHandler(async (req: Request, res: Response) => {
  const input = settleLineSchema.parse(req.body ?? {});
  const data = await settleRemittanceLine(
    tenantOf(req),
    RENTAL_SCOPE,
    remittanceOf(req),
    lineOf(req),
    input,
    actorOf(req)
  );
  res.json({ success: true, data });
});

export const rejectLineHandler = asyncHandler(async (req: Request, res: Response) => {
  const input = rejectLineSchema.parse(req.body ?? {});
  const data = await rejectRemittanceLine(
    tenantOf(req),
    RENTAL_SCOPE,
    remittanceOf(req),
    lineOf(req),
    input,
    actorOf(req)
  );
  res.json({ success: true, data });
});

export const settleAllHandler = asyncHandler(async (req: Request, res: Response) => {
  const input = settleAllSchema.parse(req.body ?? {});
  const data = await settleAllRemittanceLines(tenantOf(req), RENTAL_SCOPE, remittanceOf(req), input, actorOf(req));
  res.json({ success: true, data });
});

export const previewReturnHandler = asyncHandler(async (req: Request, res: Response) => {
  const data = await previewReturnFile(tenantOf(req), RENTAL_SCOPE, req.file, formatOf(req));
  res.json({ success: true, data });
});

export const applyReturnHandler = asyncHandler(async (req: Request, res: Response) => {
  const data = await applyReturnFile(tenantOf(req), RENTAL_SCOPE, req.file, formatOf(req), actorOf(req));
  res.json({ success: true, data });
});

export const listReturnImportsHandler = asyncHandler(async (req: Request, res: Response) => {
  const query = listReturnImportsQuerySchema.parse(req.query ?? {});
  res.json({ success: true, data: await listReturnImports(tenantOf(req), RENTAL_SCOPE, query) });
});
