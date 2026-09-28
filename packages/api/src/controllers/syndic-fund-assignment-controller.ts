import { Request, Response } from 'express';
import { asyncHandler, BadRequestError, NotFoundError } from '../middleware/error-middleware';
import { setBudgetLineFundByTenant, setChargeCallFundByTenant } from '../lib/syndics/fund-assignments';
import { assignFundSchema } from '../lib/syndics/schemas';

/**
 * Affectation d'un appel de charges ou d'un poste de budget a un fonds de la
 * copropriete : les sommes affectees ensuite a l'appel creditent ce fonds
 * (`lib/syndics/fund-credits.ts`). Meme forme que `property-media-controller`.
 */

/** Agence posee par `requireTenantAccess`, jamais prise telle quelle dans l'URL. */
function tenantOf(req: Request): string {
  const tenantId = req.tenantContext?.tenantId || req.params.tenantId;
  if (!tenantId) {
    throw new BadRequestError('Contexte tenant requis pour les fonds de copropriété.');
  }
  return tenantId;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Un identifiant qui n'est pas un UUID ne designe rien : 404, pas 500. */
function idParam(req: Request, name: string, message: string): string {
  const value = req.params[name];
  if (!value || !UUID.test(value)) throw new NotFoundError(message);
  return value;
}

export const assignChargeCallFundHandler = asyncHandler(async (req: Request, res: Response) => {
  const { fundId } = assignFundSchema.parse(req.body ?? {});
  const data = await setChargeCallFundByTenant(
    tenantOf(req),
    idParam(req, 'syndicId', 'Copropriété introuvable ou inaccessible'),
    idParam(req, 'chargeId', 'Appel de charges introuvable ou inaccessible'),
    fundId,
    req.user?.userId
  );
  res.json({ success: true, data });
});

export const assignBudgetLineFundHandler = asyncHandler(async (req: Request, res: Response) => {
  const { fundId } = assignFundSchema.parse(req.body ?? {});
  const data = await setBudgetLineFundByTenant(
    tenantOf(req),
    idParam(req, 'syndicId', 'Copropriété introuvable ou inaccessible'),
    idParam(req, 'budgetId', 'Ligne budgétaire introuvable pour cette copropriété'),
    idParam(req, 'lineId', 'Ligne budgétaire introuvable pour cette copropriété'),
    fundId,
    req.user?.userId
  );
  res.json({ success: true, data });
});
