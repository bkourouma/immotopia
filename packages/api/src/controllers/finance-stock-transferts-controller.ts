import { Request, Response } from 'express';
import { asyncHandler, BadRequestError } from '../middleware/error-middleware';
import { recordStockTransferTx } from '../lib/finance/stock-transferts';
import { createStockTransferSchema } from '../lib/finance/schemas-stock-transferts';
import { prisma } from '../utils/database';

/**
 * Contrôleur du transfert entre lieux — extrait de
 * `finance-stock-inventaire-controller.ts` (lot 040, étape des fondations)
 * **sans changement de comportement**.
 *
 * Enveloppé dans `asyncHandler` : le middleware central traduit les erreurs du
 * domaine (`lib/finance/stock-transferts.ts`) comme celles levées ici. Aucun
 * `try/catch` ne devine de statut HTTP depuis un message.
 *
 * Isolation multi-tenant : `tenantId` vient toujours de l'URL (posé par
 * `requireTenantAccess` en amont), jamais du corps ni d'une query.
 *
 * **Une seule transaction** : le transfert écrit deux mouvements et deux
 * soldes ; sans la transaction, une panne entre les deux ferait disparaître de
 * la matière.
 */

function requireTenantId(req: Request): string {
  const tenantId = req.params.tenantId || req.tenantContext?.tenantId;
  if (!tenantId) {
    throw new BadRequestError('Contexte tenant requis pour les opérations financières.');
  }
  return tenantId;
}

function requireActorUserId(req: Request): string {
  const actorUserId = req.user?.userId;
  if (!actorUserId) {
    throw new BadRequestError('Utilisateur authentifié requis pour cette opération financière.');
  }
  return actorUserId;
}

// ---------------------------------------------------------------------------
// POST /stock/transfers — déplacer d'un lieu vers un autre
//
// AUCUN PRIX n'est transmis au domaine, parce qu'aucun n'est reçu : la valeur
// part au coût moyen du lieu d'origine (principe P-4). Le schéma est
// `.strict()`, un corps qui porterait `unitCost` a déjà échoué en 400.
// ---------------------------------------------------------------------------

export const createStockTransferHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = requireTenantId(req);
  const body = createStockTransferSchema.parse(req.body ?? {});
  const actorUserId = requireActorUserId(req);

  const transfer = await prisma.$transaction(tx =>
    recordStockTransferTx(tx, tenantId, {
      fromLocationId: body.fromLocationId,
      toLocationId: body.toLocationId,
      itemId: body.itemId,
      quantity: body.quantity,
      transferDate: body.transferDate,
      createdByUserId: actorUserId
    })
  );

  res.status(201).json({ success: true, data: transfer });
});
