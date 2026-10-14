import { Request, Response } from 'express';
import { asyncHandler } from '../middleware/error-middleware';
import { recordStockTransfer } from '../lib/finance/stock-transferts';
import { createStockTransferSchema } from '../lib/finance/schemas-stock-transferts';
import { sendStockWrite, stockRequestContext } from './finance-stock-mouvements-controller';

/**
 * Contrôleur du transfert entre lieux — extrait de
 * `finance-stock-inventaire-controller.ts` (lot 040, fondations), étendu par
 * le lot 040 (demandeur et motif, chantier clos, verrous, idempotence).
 *
 * Enveloppé dans `asyncHandler` : le middleware central traduit les erreurs du
 * domaine. `tenantId` vient toujours de l'URL. La réponse est masquée pour
 * l'appelant et porte `meta` ; `201` pour un transfert neuf, `200` pour un
 * rejeu idempotent (B3-R2).
 */

// POST /stock/transfers — déplacer d'un lieu vers un autre (aucune écriture comptable).
export const createStockTransferHandler = asyncHandler(async (req: Request, res: Response) => {
  const body = createStockTransferSchema.parse(req.body ?? {});
  const { tenantId, ctx } = await stockRequestContext(req);
  sendStockWrite(res, await recordStockTransfer(tenantId, ctx, body, body));
});
