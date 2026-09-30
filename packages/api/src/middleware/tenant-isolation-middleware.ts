import { Request, Response, NextFunction } from 'express';
import { t } from '../i18n';
import { BadRequestError } from './error-middleware';

/**
 * Middleware to enforce tenant isolation for CRM operations
 * Ensures tenantId is present in request context and adds helper to enforce filtering
 *
 * This middleware should be used after requireTenantAccess to ensure tenantContext exists
 *
 * D1 : le contexte ambiant (AsyncLocalStorage) utilisé par le garde-fou Prisma
 * (utils/prisma-tenant-guard-extension.ts) n'est plus posé par un middleware
 * séparé ici — il l'était, sous le nom `withTenantContext`, mais rien ne le
 * montait jamais dans `index.ts` : le garde-fou ne voyait donc jamais de
 * contexte. Il est posé directement dans `requireTenantAccess`
 * (middleware/tenant-middleware.ts) et dans les deux middlewares de portail
 * (tenant-portal-access.ts, owner-portal-access.ts), autour de leur propre
 * appel à `next()`. `withTenantContext` n'avait aucun importeur ailleurs dans
 * le code : supprimé plutôt que laissé mort à côté de son remplaçant.
 */

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
    throw new BadRequestError(t("L'agence est requise pour les opérations CRM"));
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
