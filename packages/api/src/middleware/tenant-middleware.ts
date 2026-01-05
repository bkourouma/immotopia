import { Request, Response, NextFunction } from 'express';
import { prisma } from '../utils/database';
import { MembershipStatus } from '@prisma/client';

/**
 * Middleware to require tenant access (T029)
 * Verifies that the authenticated user has access to the specified tenant
 * via Membership (RBAC system) or legacy TenantClient model
 */
export const requireTenantAccess = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    // User must be authenticated
    if (!req.user?.userId) {
      res.status(401).json({ success: false, message: 'Authentification requise.' });
      return;
    }

    // Get tenantId from params, body, query, or extract from URL path
    let tenantId = req.params.tenantId || req.body.tenantId || req.query.tenantId;

    // If not in params yet (middleware runs before route matching), extract from URL
    // Try originalUrl first (full path), then url, then path
    if (!tenantId) {
      const urlToCheck = req.originalUrl || req.url || req.path || '';
      const pathMatch = urlToCheck.match(/\/tenant[s]?\/([^\/]+)/);
      if (pathMatch) {
        tenantId = pathMatch[1];
      }
    }

    if (!tenantId) {
      res.status(400).json({ success: false, message: 'Tenant ID requis.' });
      return;
    }

    // Super admin bypass - always allow access
    if (req.user.globalRole === 'SUPER_ADMIN') {
      req.tenantContext = {
        tenantId: tenantId as string,
        role: null,
        isCollaborator: true, // Super admin has all access
        isClient: false,
        isSuperAdmin: true
      };
      next();
      return;
    }

    // Check Membership (RBAC system) - primary check
    const membership = await prisma.membership.findUnique({
      where: {
        userId_tenantId: {
          userId: req.user.userId,
          tenantId: tenantId as string
        }
      }
    });

    if (membership && membership.status === MembershipStatus.ACTIVE) {
      // User has active membership, check if user has any tenant roles
      const userRoles = await prisma.userRole.findMany({
        where: {
          userId: req.user.userId,
          tenantId: tenantId as string
        },
        include: {
          role: true
        }
      });

      const hasTenantRoles = userRoles.some(ur => ur.role.scope === 'TENANT');

      req.tenantContext = {
        tenantId: tenantId as string,
        role: null, // Role is determined by UserRole, not CollaboratorRole
        isCollaborator: hasTenantRoles,
        isClient: !hasTenantRoles
      };
      next();
      return;
    }

    // Legacy Collaborator model has been removed - use Membership only

    // Fallback: Check legacy TenantClient model (for backward compatibility)
    const client = await prisma.tenantClient.findUnique({
      where: {
        userId_tenantId: {
          userId: req.user.userId,
          tenantId: tenantId as string
        }
      }
    });

    if (client) {
      req.tenantContext = {
        tenantId: tenantId as string,
        role: null,
        isCollaborator: false,
        isClient: true,
        clientType: client.clientType
      };
      next();
      return;
    }

    // No access
    res.status(403).json({
      success: false,
      message: "Vous n'avez pas accès à ce tenant."
    });
  } catch (error) {
    console.error('Tenant access check error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : undefined;
    console.error('Error details:', { errorMessage, errorStack });
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la vérification des accès.',
      ...(process.env.NODE_ENV !== 'production' && { error: errorMessage })
    });
  }
};

/**
 * Middleware to require collaborator (member with tenant roles)
 * Must be used after requireTenantAccess
 * Note: Use requirePermission for specific permission checks instead
 */
export const requireTenantCollaborator = (req: Request, res: Response, next: NextFunction): void => {
  if (!req.tenantContext) {
    res.status(403).json({ success: false, message: 'Contexte tenant manquant.' });
    return;
  }

  // Super admin bypass
  if (req.tenantContext.isSuperAdmin) {
    next();
    return;
  }

  // Must be a collaborator (has tenant roles)
  if (!req.tenantContext.isCollaborator) {
    res.status(403).json({
      success: false,
      message: 'Accès réservé aux collaborateurs du tenant.'
    });
    return;
  }

  next();
};

// Extend Express Request type to include tenant context
declare global {
  namespace Express {
    interface Request {
      tenantContext?: {
        tenantId: string;
        role: string | null; // Role key from RBAC system (e.g., 'TENANT_ADMIN')
        isCollaborator: boolean;
        isClient: boolean;
        clientType?: string;
        isSuperAdmin?: boolean;
      };
    }
  }
}
