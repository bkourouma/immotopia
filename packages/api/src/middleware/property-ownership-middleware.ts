import { Request, Response, NextFunction } from 'express';
import { prisma } from '../utils/database';
import { logger } from '../utils/logger';
import { PropertyOwnershipType } from '@prisma/client';

/**
 * Middleware to validate property ownership and mandate access
 * Validates that the user has access to the property based on ownership type and mandates
 */
export function validatePropertyOwnership() {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const propertyId = req.params.propertyId || req.params.id;
      if (!propertyId) {
        res.status(400).json({
          success: false,
          error: 'Bad Request',
          message: 'Property ID is required'
        });
        return;
      }

      const userId = req.user?.userId;
      const tenantId = req.tenantContext?.tenantId;

      if (!userId) {
        res.status(401).json({
          success: false,
          error: 'Unauthorized',
          message: 'Authentication required'
        });
        return;
      }

      // Fetch property with ownership information
      const property = await prisma.property.findUnique({
        where: { id: propertyId },
        include: {
          mandates: {
            where: {
              isActive: true
            }
          }
        }
      });

      if (!property) {
        res.status(404).json({
          success: false,
          error: 'Not Found',
          message: 'Property not found'
        });
        return;
      }

      // Check access based on ownership type
      let hasAccess = false;

      if (property.ownershipType === PropertyOwnershipType.TENANT) {
        // Tenant-owned: user must be in the same tenant
        hasAccess = property.tenantId === tenantId;
      } else if (property.ownershipType === PropertyOwnershipType.PUBLIC) {
        // Public property: owner has access, or anyone can view if published
        hasAccess = property.ownerUserId === userId || property.isPublished;
      } else if (property.ownershipType === PropertyOwnershipType.CLIENT) {
        // Client property with mandate: owner or managing tenant has access
        hasAccess =
          property.ownerUserId === userId ||
          (tenantId && property.mandates.some(mandate => mandate.tenantId === tenantId && mandate.isActive));
      }

      if (!hasAccess) {
        logger.warn('Property ownership access denied', {
          userId,
          tenantId,
          propertyId,
          ownershipType: property.ownershipType
        });

        res.status(403).json({
          success: false,
          error: 'Forbidden',
          message: 'You do not have access to this property'
        });
        return;
      }

      // Attach property to request for use in controllers
      (req as any).property = property;
      next();
    } catch (error) {
      logger.error('Property ownership validation error', { error });
      res.status(500).json({
        success: false,
        error: 'Internal Server Error',
        message: 'Failed to validate property ownership'
      });
    }
  };
}

/**
 * Middleware to check if user can manage property (edit, delete, publish)
 * More restrictive than view access - requires ownership or active mandate
 */
export function requirePropertyManagement() {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const propertyId = req.params.propertyId || req.params.id;
      if (!propertyId) {
        res.status(400).json({
          success: false,
          error: 'Bad Request',
          message: 'Property ID is required'
        });
        return;
      }

      const userId = req.user?.userId;
      const tenantId = req.tenantContext?.tenantId;

      if (!userId || !tenantId) {
        res.status(401).json({
          success: false,
          error: 'Unauthorized',
          message: 'Authentication and tenant context required'
        });
        return;
      }

      const property = await prisma.property.findUnique({
        where: { id: propertyId },
        include: {
          mandates: {
            where: {
              isActive: true
            }
          }
        }
      });

      if (!property) {
        res.status(404).json({
          success: false,
          error: 'Not Found',
          message: 'Property not found'
        });
        return;
      }

      let canManage = false;

      if (property.ownershipType === PropertyOwnershipType.TENANT) {
        // Tenant-owned: must be in same tenant
        canManage = property.tenantId === tenantId;
      } else if (property.ownershipType === PropertyOwnershipType.PUBLIC) {
        // Public: only owner can manage
        canManage = property.ownerUserId === userId;
      } else if (property.ownershipType === PropertyOwnershipType.CLIENT) {
        // Client: owner or managing tenant (with active mandate) can manage
        canManage =
          property.ownerUserId === userId ||
          property.mandates.some(mandate => mandate.tenantId === tenantId && mandate.isActive);
      }

      if (!canManage) {
        logger.warn('Property management access denied', {
          userId,
          tenantId,
          propertyId,
          ownershipType: property.ownershipType
        });

        res.status(403).json({
          success: false,
          error: 'Forbidden',
          message: 'You do not have permission to manage this property'
        });
        return;
      }

      (req as any).property = property;
      next();
    } catch (error) {
      logger.error('Property management validation error', { error });
      res.status(500).json({
        success: false,
        error: 'Internal Server Error',
        message: 'Failed to validate property management access'
      });
    }
  };
}




