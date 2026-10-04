import { Request, Response } from 'express';
import { asyncHandler, BadRequestError } from '../middleware/error-middleware';
import { listStockMovements } from '../lib/finance/stock-journal';
import { listStockMovementsQuerySchema } from '../lib/finance/schemas-stock-journal';

/**
 * Contrôleur du journal des mouvements de stock — extrait de
 * `finance-stock-mouvements-controller.ts` (lot 040, étape des fondations)
 * **sans changement de comportement**.
 *
 * Enveloppé dans `asyncHandler` : le middleware central traduit les erreurs.
 * Isolation multi-tenant : `tenantId` vient toujours de l'URL (posé par
 * `requireTenantAccess` en amont), jamais du corps ni d'une query.
 */

function requireTenantId(req: Request): string {
  const tenantId = req.params.tenantId || req.tenantContext?.tenantId;
  if (!tenantId) {
    throw new BadRequestError('Contexte tenant requis pour les opérations financières.');
  }
  return tenantId;
}

// ---------------------------------------------------------------------------
// GET /stock/movements — le journal des mouvements
// ---------------------------------------------------------------------------

export const listStockMovementsHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = requireTenantId(req);
  const query = listStockMovementsQuerySchema.parse(req.query ?? {});

  const movements = await listStockMovements(tenantId, {
    itemId: query.itemId,
    locationId: query.locationId,
    siteId: query.siteId,
    type: query.type,
    from: query.from,
    to: query.to
  });

  res.status(200).json({ success: true, data: movements });
});
