import { NextFunction, Request, Response } from 'express';
import { prisma } from '../utils/database';

/**
 * Résout l'agence des routes plates `/api/signatures` (le contrat ne porte pas
 * `/tenants/:tenantId`). Ordre : `tenantId` de la requête (requête ou corps),
 * sinon l'UNIQUE adhésion active de l'utilisateur. Un utilisateur de plusieurs
 * agences doit donc passer `?tenantId=` ; sans agence, `requireTenantAccess`
 * répond 400. Ce middleware ne décide d'aucun droit : `requireTenantAccess`
 * vérifie ensuite l'adhésion à l'agence retenue.
 */
export async function resolveSignatureTenant(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const present = (value: unknown) => typeof value === 'string' && value.length > 0;
    if (present(req.query?.tenantId) || present(req.body?.tenantId) || !req.user?.userId) {
      next();
      return;
    }
    const memberships = await prisma.membership.findMany({
      where: { userId: req.user.userId, status: 'ACTIVE' },
      select: { tenantId: true },
      take: 2
    });
    if (memberships.length === 1) req.query.tenantId = memberships[0].tenantId;
    next();
  } catch (error) {
    next(error);
  }
}
