import { Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler, BadRequestError } from '../middleware/error-middleware';
import { inviteCoOwnerToPortal, revokeCoOwnerPortalAccess } from '../services/syndic-coowner-portal-service';

/**
 * Gestionnaire : ouvrir ou fermer le portail copropriétaire d'un contact,
 * depuis sa fiche de profil propriétaire de lot (écran « Profils lot et
 * incidents »). Routes de `syndic-routes.ts`, derrière `requireTenantAccess`
 * et la permission `PROPERTIES_EDIT`.
 */

const paramsSchema = z.object({
  syndicId: z.string().uuid(),
  ownerProfileId: z.string().uuid()
});

function tenantIdOf(req: Request): string {
  const tenantId = req.tenantContext?.tenantId ?? req.params.tenantId;
  if (!tenantId) throw new BadRequestError('Contexte agence requis.');
  return tenantId;
}

export const inviteCoOwnerToPortalHandler = asyncHandler(async (req: Request, res: Response) => {
  const { syndicId, ownerProfileId } = paramsSchema.parse(req.params);
  const result = await inviteCoOwnerToPortal({
    tenantId: tenantIdOf(req),
    syndicateId: syndicId,
    ownerProfileId,
    actorUserId: req.user?.userId
  });
  res.status(201).json({ success: true, data: result });
});

export const revokeCoOwnerPortalAccessHandler = asyncHandler(async (req: Request, res: Response) => {
  const { syndicId, ownerProfileId } = paramsSchema.parse(req.params);
  const result = await revokeCoOwnerPortalAccess({
    tenantId: tenantIdOf(req),
    syndicateId: syndicId,
    ownerProfileId,
    actorUserId: req.user?.userId
  });
  res.json({ success: true, data: result });
});
