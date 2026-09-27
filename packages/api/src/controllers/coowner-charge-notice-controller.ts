import type { Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler, ForbiddenError } from '../middleware/error-middleware';
import { sendPrivateFile } from '../lib/files/private-files';
import { getChargeCallNoticeForCoOwner } from '../lib/syndics/charge-call-notice';

/**
 * Portail copropriétaire : avis d'appel de charges PDF (lot S4).
 *
 * Fichier à part de `coowner-portal-controller.ts` (qu'un autre lot modifie
 * en parallèle). Même règle : le périmètre vient exclusivement de la garde
 * `requireCoOwnerPortalAccess` ; l'identifiant d'appel n'est qu'un filtre à
 * l'intérieur de ce périmètre, 404 au-dehors.
 */

const chargeParamsSchema = z.object({ chargeId: z.string().uuid() });

export const downloadCoOwnerChargeCallNoticeHandler = asyncHandler(async (req: Request, res: Response) => {
  if (!req.coOwnerPortal) throw new ForbiddenError('Accès portail copropriétaire refusé.');
  const { chargeId } = chargeParamsSchema.parse(req.params);
  sendPrivateFile(res, await getChargeCallNoticeForCoOwner(req.coOwnerPortal.scope, chargeId));
});
