import { Request, Response, NextFunction } from 'express';
import { hasPermission } from '../services/permission-service';
import { logger } from '../utils/logger';
import { t } from '../i18n';

/**
 * Middleware to require a specific property permission
 * @param permissionKey - Property permission key required (e.g., PROPERTIES_VIEW, PROPERTIES_CREATE)
 * @returns Express middleware function
 */
export function requirePropertyPermission(permissionKey: string) {
  const middleware = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // User must be authenticated
      if (!req.user?.userId) {
        res.status(401).json({
          success: false,
          error: 'Unauthorized',
          message: t('Authentification requise.')
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
          message: t("Vous n'avez pas les droits nécessaires pour effectuer cette action."),
          // Code technique, hors du texte affiché.
          requiredPermission: permissionKey
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

  // Lisible par le catalogue de la passerelle IA (lib/ai/gateway) : aucune incidence sur la garde.
  return Object.assign(middleware, { permissionKey });
}

/**
 * Middleware to require any of the specified property permissions
 * @param permissionKeys - Array of permission keys (user needs at least one)
 * @returns Express middleware function
 */
export function requireAnyPropertyPermission(permissionKeys: string[]) {
  const middleware = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user?.userId) {
        res.status(401).json({
          success: false,
          error: 'Unauthorized',
          message: t('Authentification requise.')
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
        message: t("Vous n'avez pas les droits nécessaires pour effectuer cette action."),
        requiredPermissions: permissionKeys
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

  // Lisible par le catalogue de la passerelle IA (lib/ai/gateway) : aucune incidence sur la garde.
  return Object.assign(middleware, { anyPermissionKeys: [...permissionKeys] });
}
