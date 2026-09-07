import { requirePermission } from './rbac-middleware';

/**
 * CRM-specific permission checking middleware
 * Convenience wrapper around requirePermission for CRM permissions
 */

/**
 * Middleware to require CRM_CONTACTS_VIEW permission
 */
export const requireContactsView = requirePermission('CRM_CONTACTS_VIEW');

/**
 * Middleware to require CRM_CONTACTS_CREATE permission
 */
export const requireContactsCreate = requirePermission('CRM_CONTACTS_CREATE');

/**
 * Middleware to require CRM_CONTACTS_EDIT permission
 */
export const requireContactsEdit = requirePermission('CRM_CONTACTS_EDIT');

/**
 * Middleware to require CRM_CONTACTS_ARCHIVE permission
 */
export const requireContactsArchive = requirePermission('CRM_CONTACTS_ARCHIVE');

/**
 * Middleware to require CRM_DEALS_VIEW permission
 */
export const requireDealsView = requirePermission('CRM_DEALS_VIEW');

/**
 * Middleware to require CRM_DEALS_CREATE permission
 */
export const requireDealsCreate = requirePermission('CRM_DEALS_CREATE');

/**
 * Middleware to require CRM_DEALS_EDIT permission
 */
export const requireDealsEdit = requirePermission('CRM_DEALS_EDIT');

/**
 * Middleware to require CRM_DEALS_STAGE_CHANGE permission
 */
export const requireDealsStageChange = requirePermission('CRM_DEALS_STAGE_CHANGE');

/**
 * Middleware to require CRM_ACTIVITIES_VIEW permission
 */
export const requireActivitiesView = requirePermission('CRM_ACTIVITIES_VIEW');

/**
 * Middleware to require CRM_ACTIVITIES_CREATE permission
 */
export const requireActivitiesCreate = requirePermission('CRM_ACTIVITIES_CREATE');

/**
 * Middleware to require CRM_MATCHING_RUN permission
 */
export const requireMatchingRun = requirePermission('CRM_MATCHING_RUN');

/**
 * Middleware to require CRM_MATCHING_VIEW permission
 */
export const requireMatchingView = requirePermission('CRM_MATCHING_VIEW');

/**
 * Generic CRM permission checker - allows passing any CRM permission key
 * @param permissionKey - CRM permission key (must start with 'CRM_')
 * @returns Express middleware function
 */
export function requireCrmPermission(permissionKey: string) {
  if (!permissionKey.startsWith('CRM_')) {
    throw new Error(`Invalid CRM permission key: ${permissionKey}. Must start with 'CRM_'`);
  }
  return requirePermission(permissionKey);
}
