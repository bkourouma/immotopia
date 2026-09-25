import { Request, Response, NextFunction } from 'express';
import { prisma } from '../utils/database';
import { ClientType, TenantStatus } from '@prisma/client';
import { t } from '../i18n';
import { runWithTenantContext } from '../utils/tenant-context';

/** Header a client can send to pick which agency's portal it wants (B3 b). */
const PORTAL_TENANT_HEADER = 'x-portal-tenant-id';

function readPortalTenantHeader(req: Request): string | undefined {
  const raw = req.headers[PORTAL_TENANT_HEADER];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value?.trim() || undefined;
}

/**
 * Middleware to require owner portal access
 * Verifies that the authenticated user:
 * 1. Is linked to a TenantClient with PROPRIETAIRE clientType (OWNER in enum)
 * 2. Resolves all properties owned by the user IN THAT AGENCY (direct
 *    ownership and lease ownership)
 * Stores portal context in req.ownerPortal for use in controllers/services
 *
 * ---------------------------------------------------------------------------
 * B3 — un propriétaire peut être client de plusieurs agences
 * ---------------------------------------------------------------------------
 *
 * Comme le portail locataire (tenant-portal-access.ts), la résolution du
 * `TenantClient` est déterministe plutôt qu'un `findFirst` sans `orderBy` :
 *
 *   - En-tête `X-Portal-Tenant-Id` présent → le `TenantClient` OWNER de CETTE
 *     agence. 403 si l'utilisateur n'en a pas (ou n'y est pas propriétaire).
 *   - Sinon → le plus ancien (`createdAt` croissant) parmi ceux où le client
 *     est OWNER et dont l'agence n'est pas `SUSPENDED`.
 *   - Une agence suspendue refuse l'accès (403, `code: 'TENANT_SUSPENDED'`).
 *
 * `req.ownerPortal.availableTenantIds` porte la liste des agences où ce
 * client est propriétaire, pour un sélecteur côté front (B3 d).
 *
 * Avant ce lot, les biens étaient listés par `ownerUserId` seul, sans filtre
 * d'agence (constat #7 de l'audit multi-tenant, `docs/architecture/
 * PLAN-MULTI-TENANT.md`) : un propriétaire de plusieurs agences aurait vu,
 * sur le portail d'UNE agence, les biens qu'il possède dans une AUTRE. B3 a)
 * corrige cela : chaque requête ci-dessous porte désormais `tenantId` /
 * `tenant_id` égal à l'agence résolue.
 *
 * ---------------------------------------------------------------------------
 * D1 — contexte d'agence posé ici
 * ---------------------------------------------------------------------------
 *
 * `runWithTenantContext` est posé autour de l'appel à `next()`, comme dans
 * `requireTenantAccess` : le garde-fou Prisma
 * (utils/prisma-tenant-guard-extension.ts) voit l'agence résolue pour le
 * reste de la requête, y compris après un `await`.
 */
export const requireOwnerPortalAccess = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    // User must be authenticated (from authenticate middleware)
    if (!req.user?.userId) {
      res.status(401).json({ success: false, message: 'Authentification requise.' });
      return;
    }

    // Every TenantClient this user is OWNER for, oldest first.
    const clients = await prisma.tenantClient.findMany({
      where: { userId: req.user.userId, clientType: ClientType.OWNER },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        userId: true,
        tenantId: true,
        createdAt: true,
        tenant: { select: { status: true } }
      }
    });

    if (clients.length === 0) {
      res.status(403).json({
        success: false,
        message: 'Accès portail propriétaire refusé. Vous devez être propriétaire.'
      });
      return;
    }

    const availableTenantIds = clients.map(client => client.tenantId);
    const headerTenantId = readPortalTenantHeader(req);

    let selected: (typeof clients)[number] | undefined;

    if (headerTenantId) {
      selected = clients.find(client => client.tenantId === headerTenantId);
      if (!selected) {
        res.status(403).json({ success: false, message: 'Accès portail propriétaire refusé.' });
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
        // Toutes les agences où ce client est propriétaire sont suspendues.
        res
          .status(403)
          .json({ success: false, code: 'TENANT_SUSPENDED', message: t('Cette agence est suspendue.') });
        return;
      }
    }

    const tenantClient = selected;

    // Resolve all properties owned by this owner, IN THIS AGENCY, through two
    // methods:
    // 1. Direct ownership: Property.ownerUserId = TenantClient.userId, scoped
    //    to the resolved agency (B3 a — was unscoped before this lot).
    const directOwnedProperties = await prisma.property.findMany({
      where: {
        ownerUserId: tenantClient.userId,
        tenantId: tenantClient.tenantId
      },
      select: {
        id: true
      }
    });

    // 2. Lease ownership: Properties where RentalLease.ownerClient = TenantClient.id,
    //    scoped to the same agency explicitly (the guard needs it named, and
    //    it documents the invariant even though owner_client_id already
    //    belongs to a single agency's TenantClient).
    const leaseOwnedLeases = await prisma.rentalLease.findMany({
      where: {
        owner_client_id: tenantClient.id,
        tenant_id: tenantClient.tenantId
      },
      select: {
        property_id: true
      },
      distinct: ['property_id']
    });

    // Combine property IDs from both sources
    const propertyIds = [...directOwnedProperties.map(p => p.id), ...leaseOwnedLeases.map(l => l.property_id)];

    // Remove duplicates
    const uniquePropertyIds = Array.from(new Set(propertyIds));

    // Keep the access check resilient on environments where optional owner-portal
    // columns are not present yet. We don't block access for telemetry updates.
    try {
      await prisma.$executeRaw`
        UPDATE tenant_clients
        SET updated_at = NOW()
        WHERE id = ${tenantClient.id}
      `;
    } catch (_error) {
      // no-op: portal access must continue even if tracking fields are unavailable
    }

    // Store portal context in request
    req.ownerPortal = {
      tenantClientId: tenantClient.id,
      tenantId: tenantClient.tenantId,
      propertyIds: uniquePropertyIds,
      availableTenantIds
    };

    runWithTenantContext(
      {
        tenantId: tenantClient.tenantId,
        userId: req.user.userId,
        isSuperAdmin: false
      },
      next
    );
  } catch (error) {
    console.error('Owner portal access check error:', error);
    res.status(500).json({ success: false, message: 'Erreur lors de la vérification des accès.' });
  }
};

// Extend Express Request type to include owner portal context
declare module 'express-serve-static-core' {
  interface Request {
    ownerPortal?: {
      tenantClientId: string;
      tenantId: string;
      propertyIds: string[];
      /** Agences (tenantId) où ce client est propriétaire — pour un sélecteur front (B3 d). */
      availableTenantIds: string[];
    };
  }
}
