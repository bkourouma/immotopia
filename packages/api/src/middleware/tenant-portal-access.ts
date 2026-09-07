import { Request, Response, NextFunction } from 'express';
import { prisma } from '../utils/database';
import { RentalLeaseStatus } from '@prisma/client';

/**
 * Middleware to require tenant portal access
 * Verifies that the authenticated user:
 * 1. Is linked to a TenantClient
 * 2. Has an active lease (as primary renter or co-renter)
 * Stores portal context in req.tenantPortal for use in controllers/services
 */
export const requireTenantPortalAccess = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
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
        tenantId: true
      }
    });

    if (!tenantClient) {
      res.status(403).json({ success: false, message: 'Accès portail locataire refusé.' });
      return;
    }

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
      lease: { id: activeLease.id }
    };

    next();
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
    };
  }
}
