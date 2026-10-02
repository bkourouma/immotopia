import { Request, Response, NextFunction } from 'express';
import { prisma } from '../utils/database';
import { RentalLeaseStatus, TenantStatus } from '@prisma/client';
import { t } from '../i18n';
import { runWithTenantContext } from '../utils/tenant-context';
import { setAuditActor } from '../utils/request-context';

/** Header a client can send to pick which agency's portal it wants (B3 b). */
const PORTAL_TENANT_HEADER = 'x-portal-tenant-id';

function readPortalTenantHeader(req: Request): string | undefined {
  const raw = req.headers[PORTAL_TENANT_HEADER];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value?.trim() || undefined;
}

/**
 * Middleware to require tenant portal access
 * Verifies that the authenticated user:
 * 1. Is linked to a TenantClient
 * 2. Has an active lease (as primary renter or co-renter)
 * Stores portal context in req.tenantPortal for use in controllers/services
 *
 * ---------------------------------------------------------------------------
 * B3 — un client peut être rattaché à plusieurs agences
 * ---------------------------------------------------------------------------
 *
 * `TenantClient` n'est pas unique par utilisateur : un même locataire peut
 * avoir un compte dans plusieurs agences (`@@unique([userId, tenantId])`).
 * La résolution est donc déterministe plutôt qu'un `findFirst` sans `orderBy`
 * (qui dépendait auparavant d'un ordre non garanti par la base) :
 *
 *   - En-tête `X-Portal-Tenant-Id` présent → on prend le `TenantClient` de
 *     CETTE agence. 403 si l'utilisateur n'en a pas.
 *   - Sinon → le plus ancien (`createdAt` croissant) dont l'agence n'est pas
 *     `SUSPENDED`.
 *   - Une agence suspendue refuse l'accès (`403`, `code: 'TENANT_SUSPENDED'`),
 *     y compris quand elle a été demandée explicitement par l'en-tête, ou
 *     quand c'est la seule dont dispose le client.
 *
 * `req.tenantPortal.availableTenantIds` porte la liste des agences du client,
 * pour un sélecteur côté front (B3 d).
 *
 * ---------------------------------------------------------------------------
 * D1 — contexte d'agence posé ici
 * ---------------------------------------------------------------------------
 *
 * `runWithTenantContext` est posé autour de l'appel à `next()`, comme dans
 * `requireTenantAccess` (middleware/tenant-middleware.ts) : le reste de la
 * chaîne — y compris après un `await` — voit `getCurrentTenantId()`, et le
 * garde-fou Prisma (utils/prisma-tenant-guard-extension.ts) peut donc
 * contrôler les requêtes du portail locataire.
 */
export const requireTenantPortalAccess = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    // User must be authenticated (from authenticate middleware)
    if (!req.user?.userId) {
      res.status(401).json({ success: false, message: 'Authentification requise.' });
      return;
    }

    // Every TenantClient this user has, oldest first (deterministic default).
    const clients = await prisma.tenantClient.findMany({
      where: { userId: req.user.userId },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        tenantId: true,
        createdAt: true,
        tenant: { select: { status: true } }
      }
    });

    if (clients.length === 0) {
      res.status(403).json({ success: false, message: 'Accès portail locataire refusé.' });
      return;
    }

    const availableTenantIds = clients.map(client => client.tenantId);
    const headerTenantId = readPortalTenantHeader(req);

    let selected: (typeof clients)[number] | undefined;

    if (headerTenantId) {
      selected = clients.find(client => client.tenantId === headerTenantId);
      if (!selected) {
        res.status(403).json({ success: false, message: 'Accès portail locataire refusé.' });
        return;
      }
      if (selected.tenant.status === TenantStatus.SUSPENDED) {
        res
          .status(403)
          .json({ success: false, code: 'TENANT_SUSPENDED', message: t('Cette agence est suspendue.') });
        return;
      }
    } else {
      selected = clients.find(client => client.tenant.status !== TenantStatus.SUSPENDED);
      if (!selected) {
        // Toutes les agences de ce client sont suspendues.
        res
          .status(403)
          .json({ success: false, code: 'TENANT_SUSPENDED', message: t('Cette agence est suspendue.') });
        return;
      }
    }

    const tenantClient = selected;

    // Find active lease where tenant is primary renter or co-renter
    const activeLease = await prisma.rentalLease.findFirst({
      where: {
        tenant_id: tenantClient.tenantId,
        status: RentalLeaseStatus.ACTIVE,
        OR: [
          { primary_renter_client_id: tenantClient.id },
          {
            coRenters: {
              some: {
                renter_client_id: tenantClient.id
              }
            }
          }
        ]
      },
      select: {
        id: true
      }
    });

    if (!activeLease) {
      res.status(403).json({ success: false, message: 'Aucun bail actif trouvé.' });
      return;
    }

    // Store portal context in request
    req.tenantPortal = {
      leaseId: activeLease.id,
      tenantClientId: tenantClient.id,
      tenantId: tenantClient.tenantId,
      lease: { id: activeLease.id },
      availableTenantIds
    };

    // Les événements d'audit de cette requête sont ceux d'un portail, pas d'un collaborateur.
    setAuditActor({ type: 'PORTAL' });
    runWithTenantContext(
      {
        tenantId: tenantClient.tenantId,
        userId: req.user.userId,
        isSuperAdmin: false
      },
      next
    );
  } catch (error) {
    console.error('Tenant portal access check error:', error);
    res.status(500).json({ success: false, message: 'Erreur lors de la vérification des accès.' });
  }
};

// Extend Express Request type to include tenant portal context
declare module 'express-serve-static-core' {
  interface Request {
    tenantPortal?: {
      leaseId: string;
      tenantClientId: string;
      tenantId: string;
      lease: any; // Will be properly typed in tenant-portal-types.ts
      /** Agences (tenantId) où ce client a un compte — pour un sélecteur front (B3 d). */
      availableTenantIds: string[];
    };
  }
}
