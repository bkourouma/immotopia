import { Request, Response, NextFunction } from 'express';
import { hasPermission, hasAnyPermission, hasAllPermissions } from '../services/permission-service';
import { prisma } from '../utils/database';
import { checkSubscriptionAccess } from '../services/subscription-service';

// Extend Express Request type to include user and tenant context
declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: string;
        email: string;
        globalRole?: string;
      };
      tenantContext?: {
        tenantId: string;
        role?: string;
        isCollaborator?: boolean;
        isClient?: boolean;
        isSuperAdmin?: boolean;
      };
      subscriptionAccess?: {
        isReadOnly: boolean;
        reason?: string;
        subscription?: any;
      };
    }
  }
}

/**
 * Middleware to require a specific permission
 * @param permissionKey - Permission key required
 * @returns Express middleware function
 */
export function requirePermission(permissionKey: string) {
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
        res.status(403).json({
          success: false,
          error: 'Forbidden',
          message: `Permission denied: ${permissionKey}`
        });
        return;
      }

      next();
    } catch (error) {
      console.error('Permission check error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal Server Error',
        message: 'Failed to check permissions'
      });
    }
  };
}

/**
 * Middleware to require any of the specified permissions
 * @param permissionKeys - Array of permission keys (user needs at least one)
 * @returns Express middleware function
 */
export function requireAnyPermission(permissionKeys: string[]) {
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
      const hasAccess = await hasAnyPermission(req.user.userId, permissionKeys, tenantId);

      if (!hasAccess) {
        res.status(403).json({
          success: false,
          error: 'Forbidden',
          message: `Permission denied: requires one of [${permissionKeys.join(', ')}]`
        });
        return;
      }

      next();
    } catch (error) {
      console.error('Permission check error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal Server Error',
        message: 'Failed to check permissions'
      });
    }
  };
}

/**
 * Middleware to require all of the specified permissions
 * @param permissionKeys - Array of permission keys (user needs all)
 * @returns Express middleware function
 */
export function requireAllPermissions(permissionKeys: string[]) {
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
      const hasAccess = await hasAllPermissions(req.user.userId, permissionKeys, tenantId);

      if (!hasAccess) {
        res.status(403).json({
          success: false,
          error: 'Forbidden',
          message: `Permission denied: requires all of [${permissionKeys.join(', ')}]`
        });
        return;
      }

      next();
    } catch (error) {
      console.error('Permission check error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal Server Error',
        message: 'Failed to check permissions'
      });
    }
  };
}

/**
 * Middleware to require a specific module to be enabled for the tenant
 * @param moduleKey - Module key required (e.g., 'MODULE_AGENCY')
 * @returns Express middleware function
 */
export function requireModule(moduleKey: string) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const tenantId = req.tenantContext?.tenantId;

      if (!tenantId) {
        res.status(400).json({
          success: false,
          error: 'Bad Request',
          message: 'Tenant context required for module check'
        });
        return;
      }

      // Check if module is enabled (using service for consistency)
      const { isModuleEnabled } = await import('../services/module-service');
      const enabled = await isModuleEnabled(tenantId, moduleKey as any);

      if (!enabled) {
        res.status(403).json({
          success: false,
          error: 'Module Disabled',
          message: `Module ${moduleKey} is not enabled for this tenant. Access to this feature has been revoked.`
        });
        return;
      }

      next();
    } catch (error) {
      console.error('Module check error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal Server Error',
        message: 'Failed to check module status'
      });
    }
  };
}

/**
 * Middleware to check subscription access and enforce read-only for expired/canceled subscriptions
 * @returns Express middleware function
 */
export function requireSubscriptionAccess() {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const tenantId = req.tenantContext?.tenantId;

      if (!tenantId) {
        res.status(400).json({
          success: false,
          error: 'Bad Request',
          message: 'Tenant context required for subscription check'
        });
        return;
      }

      const access = await checkSubscriptionAccess(tenantId);

      if (!access.hasAccess) {
        res.status(403).json({
          success: false,
          error: 'Subscription Required',
          message: 'A valid subscription is required to access this feature'
        });
        return;
      }

      // Attach subscription access info to request
      req.subscriptionAccess = {
        isReadOnly: access.isReadOnly,
        reason: access.reason,
        subscription: access.subscription
      };

      // For write operations, check if subscription allows writes
      if (access.isReadOnly && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
        res.status(403).json({
          success: false,
          error: 'Read-Only Access',
          message: `This operation is not allowed. ${access.reason || 'Subscription is expired or canceled.'}`
        });
        return;
      }

      next();
    } catch (error) {
      console.error('Subscription access check error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal Server Error',
        message: 'Failed to check subscription access'
      });
    }
  };
}
