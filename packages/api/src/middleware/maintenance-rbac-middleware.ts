import { requirePermission } from './rbac-middleware';

/**
 * Middleware to require maintenance tenant permission
 * Allows tenants to create and view their own tickets
 * @returns Express middleware function
 */
export const requireMaintenanceTenantPermission = requirePermission('MAINTENANCE_TENANT');

/**
 * Middleware to require maintenance admin permission
 * Allows property managers to view and manage all tickets
 * @returns Express middleware function
 */
export const requireMaintenanceAdminPermission = requirePermission('MAINTENANCE_ADMIN');
