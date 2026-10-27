import type { Request, Response } from 'express';
import { runInFrench, t } from '../i18n';
import { asyncHandler, BadRequestError } from '../middleware/error-middleware';
import { assertUuidOrNotFound } from '../lib/documents/mandating-agencies';
import { sendPrivateFile } from '../lib/files/private-files';
import {
  convocationDocxQuerySchema,
  renderChargeCallNoticeDocx,
  renderConvocationDocx,
  renderReceiptDocx
} from '../lib/syndics/word-documents';

/**
 * Documents Word du syndic (avis d'appel, quittance, convocation). Les gardes
 * (session, agence, permission `SYNDIC_VIEW`) sont posées par les routes ;
 * l'appartenance de chaque identifiant à l'agence ET à la copropriété est
 * vérifiée par `lib/syndics/word-documents.ts` (404 sinon).
 */

function tenantIdOf(req: Request): string {
  const tenantId = req.params.tenantId || req.tenantContext?.tenantId;
  if (!tenantId) throw new BadRequestError('Agence manquante dans la requête.');
  return tenantId;
}

const uuidParam = (req: Request, name: string, message: string) => assertUuidOrNotFound(req.params[name], message);
const syndicIdOf = (req: Request) => uuidParam(req, 'syndicId', t('Copropriété introuvable ou inaccessible.'));

export const downloadChargeCallNoticeDocxHandler = asyncHandler(async (req: Request, res: Response) => {
  const chargeId = uuidParam(req, 'chargeId', t('Appel de charges introuvable.'));
  sendPrivateFile(res, await runInFrench(() => renderChargeCallNoticeDocx(tenantIdOf(req), syndicIdOf(req), chargeId)));
});

export const downloadReceiptDocxHandler = asyncHandler(async (req: Request, res: Response) => {
  const receiptId = uuidParam(req, 'receiptId', t('Document introuvable.'));
  sendPrivateFile(res, await runInFrench(() => renderReceiptDocx(tenantIdOf(req), syndicIdOf(req), receiptId)));
});

export const downloadConvocationDocxHandler = asyncHandler(async (req: Request, res: Response) => {
  const query = convocationDocxQuerySchema.parse(req.query);
  const meetingId = uuidParam(req, 'meetingId', t('Assemblée introuvable.'));
  const lotId = uuidParam(req, 'lotId', t('Lot introuvable ou inaccessible pour cette copropriété.'));
  sendPrivateFile(
    res,
    await runInFrench(() => renderConvocationDocx(tenantIdOf(req), syndicIdOf(req), meetingId, lotId, query))
  );
});
