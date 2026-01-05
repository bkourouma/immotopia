import { Request, Response, NextFunction } from 'express';
import { hasPermission } from '../services/permission-service';
import { logger } from '../utils/logger';

/**
 * Middleware to require a specific property permission
 * @param permissionKey - Property permission key required (e.g., PROPERTIES_VIEW, PROPERTIES_CREATE)
 * @returns Express middleware function
 */
export function requirePropertyPermission(permissionKey: string) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // User must be authenticated
      if (!req.user?.userId) {
        res.status(401).json({
          success: false,
          error: 'Unauthorized',
          message: 'Authentication required'
        });
        return;
      }

      // Get tenant context if available
      const tenantId = req.tenantContext?.tenantId;

      // Check permission
      const hasAccess = await hasPermission(req.user.userId, permissionKey, tenantId);

      if (!hasAccess) {
        logger.warn('Property permission denied', {
          userId: req.user.userId,
          permissionKey,
          tenantId,
          path: req.path
        });

        res.status(403).json({
          success: false,
          error: 'Forbidden',
          message: `Permission denied: ${permissionKey}`
        });
        return;
      }

      next();
    } catch (error) {
      logger.error('Property permission check error', { error, permissionKey });
      res.status(500).json({
        success: false,
        error: 'Internal Server Error',
        message: 'Failed to check property permissions'
      });
    }
  };
}

/**
 * Middleware to require any of the specified property permissions
 * @param permissionKeys - Array of permission keys (user needs at least one)
 * @returns Express middleware function
 */
export function requireAnyPropertyPermission(permissionKeys: string[]) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user?.userId) {
        res.status(401).json({
          success: false,
          error: 'Unauthorized',
          message: 'Authentication required'
        });
        return;
      }

      const tenantId = req.tenantContext?.tenantId;

      // Check if user has any of the required permissions
      for (const permissionKey of permissionKeys) {
        const hasAccess = await hasPermission(req.user.userId, permissionKey, tenantId);
        if (hasAccess) {
          next();
          return;
        }
      }

      res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: `Permission denied: requires one of [${permissionKeys.join(', ')}]`
      });
    } catch (error) {
      logger.error('Property permission check error', { error, permissionKeys });
      res.status(500).json({
        success: false,
        error: 'Internal Server Error',
        message: 'Failed to check property permissions'
      });
    }
  };
}




