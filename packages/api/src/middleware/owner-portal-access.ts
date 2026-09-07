import { Request, Response, NextFunction } from 'express';
import { prisma } from '../utils/database';
import { ClientType } from '@prisma/client';

/**
 * Middleware to require owner portal access
 * Verifies that the authenticated user:
 * 1. Is linked to a TenantClient
 * 2. Has PROPRIETAIRE clientType (OWNER in enum)
 * 3. Resolves all properties owned by the user (direct ownership and lease ownership)
 * Stores portal context in req.ownerPortal for use in controllers/services
 */
export const requireOwnerPortalAccess = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    // User must be authenticated (from authenticate middleware)
    if (!req.user?.userId) {
      res.status(401).json({ success: false, message: 'Authentification requise.' });
      return;
    }

    // Find TenantClient linked to user
    const tenantClient = await prisma.tenantClient.findFirst({
      where: {
        userId: req.user.userId
      },
      select: {
        id: true,
        userId: true,
        tenantId: true,
        clientType: true
      }
    });

    if (!tenantClient) {
      res.status(403).json({ success: false, message: 'Accès portail propriétaire refusé.' });
      return;
    }

    // Verify clientType is OWNER (PROPRIETAIRE in French)
    if (tenantClient.clientType !== ClientType.OWNER) {
      res.status(403).json({
        success: false,
        message: 'Accès portail propriétaire refusé. Vous devez être propriétaire.'
      });
      return;
    }

    // Resolve all properties owned by this owner through two methods:
    // 1. Direct ownership: Property.ownerUserId = TenantClient.userId
    const directOwnedProperties = await prisma.property.findMany({
      where: {
        ownerUserId: tenantClient.userId
      },
      select: {
        id: true
      }
    });

    // 2. Lease ownership: Properties where RentalLease.ownerClient = TenantClient.id
    const leaseOwnedLeases = await prisma.rentalLease.findMany({
      where: {
        owner_client_id: tenantClient.id
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
      propertyIds: uniquePropertyIds
    };

    next();
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
    };
  }
}
