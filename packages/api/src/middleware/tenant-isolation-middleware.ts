import { Request, Response, NextFunction } from 'express';
import { runWithTenantContext } from '../utils/tenant-context';

/**
 * Middleware to enforce tenant isolation for CRM operations
 * Ensures tenantId is present in request context and adds helper to enforce filtering
 *
 * This middleware should be used after requireTenantAccess to ensure tenantContext exists
 */

/**
 * Publish the resolved tenant as the ambient context for the rest of the
 * request, so the Prisma tenant guard can tell whether a query that touches a
 * tenant-scoped model forgot its filter.
 *
 * Mount after requireTenantAccess. Purely observational by default; see
 * utils/prisma-tenant-guard-extension.ts and TENANT_GUARD_MODE.
 */
export const withTenantContext = (req: Request, _res: Response, next: NextFunction): void => {
  const tenantId = req.tenantContext?.tenantId;

  if (!tenantId) {
    next();
    return;
  }

  runWithTenantContext(
    {
      tenantId,
      userId: req.user?.userId,
      isSuperAdmin: Boolean(req.tenantContext?.isSuperAdmin)
    },
    next
  );
};

/**
 * Middleware to ensure tenant context exists for CRM operations
 * Must be used after requireTenantAccess middleware
 */
export const enforceTenantIsolation = (req: Request, res: Response, next: NextFunction): void => {
  if (!req.tenantContext?.tenantId) {
    res.status(400).json({
      success: false,
      error: 'Bad Request',
      message: 'Tenant context required for CRM operations'
    });
    return;
  }

  // Add helper to request for services to use
  req.crmTenantId = req.tenantContext.tenantId;

  next();
};

/**
 * Middleware to enforce tenant isolation for Property operations
 * Ensures tenantId is present in request context for tenant-owned property queries
 * Must be used after requireTenantAccess middleware
 */
export const enforcePropertyTenantIsolation = (req: Request, res: Response, next: NextFunction): void => {
  if (!req.tenantContext?.tenantId) {
    res.status(400).json({
      success: false,
      error: 'Bad Request',
      message: 'Tenant context required for property operations'
    });
    return;
  }

  // Add helper to request for services to use
  req.propertyTenantId = req.tenantContext.tenantId;

  next();
};

/**
 * Helper function to extract tenantId from request
 * Throws error if tenantId is missing
 */
export function getTenantIdFromRequest(req: Request): string {
  const tenantId = req.tenantContext?.tenantId || req.crmTenantId;
  if (!tenantId) {
    throw new Error('Tenant ID is required for CRM operations');
  }
  return tenantId;
}

// Extend Express Request type to include CRM and Property tenant IDs
declare module 'express-serve-static-core' {
  interface Request {
    crmTenantId?: string;
    propertyTenantId?: string;
  }
}
