import { Request, Response, NextFunction } from 'express';
import { TenantStatus } from '@prisma/client';
import { prisma } from '../utils/database';
import { runWithTenantContext } from '../utils/tenant-context';
import { AppError, ForbiddenError, UnauthorizedError } from './error-middleware';
import { readCoOwnerContactIds, resolveCoOwnerScope, type CoOwnerPortalScope } from '../lib/syndics/coowner-portal';

/** En-tête par lequel un client de plusieurs agences désigne la sienne (B3 b). */
const PORTAL_TENANT_HEADER = 'x-portal-tenant-id';

function readPortalTenantHeader(req: Request): string | undefined {
  const raw = req.headers[PORTAL_TENANT_HEADER];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value?.trim() || undefined;
}

function tenantSuspended(): AppError {
  return new AppError('Cette agence est suspendue.', 403, 'TENANT_SUSPENDED');
}

/**
 * Garde du portail copropriétaire (`/api/portal/copropriete/*`).
 *
 * Même mécanique que `requireTenantPortalAccess` et
 * `requireOwnerPortalAccess`, dont elle reprend les règles B3 et D1 :
 *
 *   - le compte doit avoir un `TenantClient` dont `details` ouvre au moins un
 *     contact au portail copropriétaire (`syndicCoOwnerContactIds`, posé par
 *     l'invitation, retiré par la révocation) — le `clientType` n'entre pas
 *     en jeu : un propriétaire bailleur ou un locataire de l'agence peut
 *     AUSSI être copropriétaire ;
 *   - en-tête `X-Portal-Tenant-Id` → l'agence demandée, 403 si le compte n'y
 *     est pas copropriétaire ; sinon la plus ancienne non suspendue ;
 *   - agence suspendue → 403 `TENANT_SUSPENDED` ;
 *   - le périmètre (contacts, lots, copropriétés) est recalculé à CHAQUE
 *     requête : une révocation, un profil désactivé ou une case « accès
 *     portail » décochée coupent l'accès immédiatement, sans attendre
 *     l'expiration de la session ;
 *   - aucun lot ouvert → 403 ;
 *   - le contexte d'agence est posé par `runWithTenantContext` AVANT le
 *     calcul du périmètre, pour que le garde-fou Prisma contrôle aussi ces
 *     lectures-là, puis reste actif pour toute la suite de la requête.
 *
 * Le jeton de session reste un jeton ordinaire : il n'ouvre aucune route de
 * gestion (`/api/tenants/...`), qui exigent des permissions de rôle qu'un
 * copropriétaire n'a pas.
 */
export const requireCoOwnerPortalAccess = async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      next(new UnauthorizedError('Authentification requise.'));
      return;
    }

    // Un compte désactivé perd le portail immédiatement, même avec une session
    // encore valide (audit S5). Compte introuvable : même refus.
    const account = await prisma.user.findUnique({ where: { id: userId }, select: { isActive: true } });
    if (!account || account.isActive === false) {
      next(new ForbiddenError('Accès portail copropriétaire refusé.'));
      return;
    }

    const clients = await prisma.tenantClient.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
      select: { id: true, tenantId: true, details: true }
    });
    const candidates = clients
      .map(client => ({ ...client, contactIds: readCoOwnerContactIds(client.details) }))
      .filter(client => client.contactIds.length > 0);

    if (candidates.length === 0) {
      next(new ForbiddenError('Accès portail copropriétaire refusé.'));
      return;
    }

    const tenants = await prisma.tenant.findMany({
      where: { id: { in: candidates.map(client => client.tenantId) } },
      select: { id: true, status: true }
    });
    const statusByTenant = new Map(tenants.map(tenant => [tenant.id, tenant.status]));
    // Même règle que les deux autres portails : seule une agence suspendue
    // (ou introuvable) ferme l'accès.
    const isSuspended = (tenantId: string) =>
      !statusByTenant.has(tenantId) || statusByTenant.get(tenantId) === TenantStatus.SUSPENDED;

    const headerTenantId = readPortalTenantHeader(req);
    let selected: (typeof candidates)[number] | undefined;
    if (headerTenantId) {
      selected = candidates.find(client => client.tenantId === headerTenantId);
      if (!selected) {
        next(new ForbiddenError('Accès portail copropriétaire refusé.'));
        return;
      }
      if (isSuspended(selected.tenantId)) {
        next(tenantSuspended());
        return;
      }
    } else {
      selected = candidates.find(client => !isSuspended(client.tenantId));
      if (!selected) {
        next(tenantSuspended());
        return;
      }
    }

    const chosen = selected;
    await runWithTenantContext({ tenantId: chosen.tenantId, userId, isSuperAdmin: false }, async () => {
      const scope = await resolveCoOwnerScope(chosen.tenantId, chosen.contactIds);
      if (scope.lotIds.length === 0) {
        next(new ForbiddenError("Aucun lot de copropriété n'est ouvert à votre compte."));
        return;
      }
      req.coOwnerPortal = {
        tenantClientId: chosen.id,
        availableTenantIds: candidates.map(client => client.tenantId),
        scope
      };
      next();
    });
  } catch (error) {
    next(error);
  }
};

declare module 'express-serve-static-core' {
  interface Request {
    coOwnerPortal?: {
      tenantClientId: string;
      /** Agences où ce compte est copropriétaire — pour un sélecteur front (B3 d). */
      availableTenantIds: string[];
      scope: CoOwnerPortalScope;
    };
  }
}
