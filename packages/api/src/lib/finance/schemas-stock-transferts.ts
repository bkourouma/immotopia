import { z } from 'zod';

import {
  clientRequestIdSchema,
  requesterFieldsSchema,
  stockQuantitySchema,
  stockReasonCodeSchema,
  stockReasonTextSchema
} from './schemas-stock-mouvements';

/**
 * Validation Zod du transfert entre lieux — extraite de
 * `schemas-stock-inventaire.ts` (lot 040, fondations), étendue par le lot 040
 * (A11 : demandeur et motif ; B3-R2 : idempotence).
 *
 * `.strict()` : un corps ne répète jamais un identifiant que le chemin porte
 * déjà, et un champ inconnu — un prix, par exemple — reçoit un 400 explicite.
 * AUCUN PRIX n'est reçu : la valeur part au coût moyen du lieu d'origine
 * (principe P-4).
 *
 * Le motif et le demandeur sont FACULTATIFS ici : leur absence répond par un
 * code stable du contrat (`STOCK_REASON_REQUIRED`, `STOCK_REQUESTER_REQUIRED`),
 * levé par le service, seule autorité. Le même lieu des deux côtés est aussi
 * refusé par le service.
 */
export const createStockTransferSchema = z
  .object({
    fromLocationId: z.string().uuid('Identifiant de lieu d’origine invalide.'),
    toLocationId: z.string().uuid('Identifiant de lieu d’arrivée invalide.'),
    itemId: z.string().uuid('Identifiant d’article invalide.'),
    quantity: stockQuantitySchema,
    transferDate: z.coerce.date({ errorMap: () => ({ message: 'Date de transfert invalide.' }) }),
    reasonCode: stockReasonCodeSchema,
    reason: stockReasonTextSchema,
    ...requesterFieldsSchema,
    clientRequestId: clientRequestIdSchema
  })
  .strict();

export type CreateStockTransferInput = z.infer<typeof createStockTransferSchema>;
