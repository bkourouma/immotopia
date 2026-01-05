import { requirePermission } from './rbac-middleware';

/**
 * Rental-specific permission checking middleware
 * Convenience wrapper around requirePermission for rental permissions
 */

/**
 * Middleware to require RENTAL_LEASES_VIEW permission
 */
export const requireLeasesView = requirePermission('RENTAL_LEASES_VIEW');

/**
 * Middleware to require RENTAL_LEASES_CREATE permission
 */
export const requireLeasesCreate = requirePermission('RENTAL_LEASES_CREATE');

/**
 * Middleware to require RENTAL_LEASES_EDIT permission
 */
export const requireLeasesEdit = requirePermission('RENTAL_LEASES_EDIT');

/**
 * Middleware to require RENTAL_INSTALLMENTS_VIEW permission
 */
export const requireInstallmentsView = requirePermission('RENTAL_INSTALLMENTS_VIEW');

/**
 * Middleware to require RENTAL_INSTALLMENTS_GENERATE permission
 */
export const requireInstallmentsGenerate = requirePermission('RENTAL_INSTALLMENTS_GENERATE');

/**
 * Middleware to require RENTAL_PAYMENTS_VIEW permission
 */
export const requirePaymentsView = requirePermission('RENTAL_PAYMENTS_VIEW');

/**
 * Middleware to require RENTAL_PAYMENTS_CREATE permission
 */
export const requirePaymentsCreate = requirePermission('RENTAL_PAYMENTS_CREATE');

/**
 * Middleware to require RENTAL_PAYMENTS_ALLOCATE permission
 */
export const requirePaymentsAllocate = requirePermission('RENTAL_PAYMENTS_ALLOCATE');

/**
 * Middleware to require RENTAL_PENALTIES_VIEW permission
 */
export const requirePenaltiesView = requirePermission('RENTAL_PENALTIES_VIEW');

/**
 * Middleware to require RENTAL_PENALTIES_CALCULATE permission
 */
export const requirePenaltiesCalculate = requirePermission('RENTAL_PENALTIES_CALCULATE');

/**
 * Middleware to require RENTAL_PENALTIES_EDIT permission
 */
export const requirePenaltiesEdit = requirePermission('RENTAL_PENALTIES_EDIT');

/**
 * Middleware to require RENTAL_DEPOSITS_VIEW permission
 */
export const requireDepositsView = requirePermission('RENTAL_DEPOSITS_VIEW');

/**
 * Middleware to require RENTAL_DEPOSITS_CREATE permission
 */
export const requireDepositsCreate = requirePermission('RENTAL_DEPOSITS_CREATE');

/**
 * Middleware to require RENTAL_DEPOSITS_EDIT permission
 */
export const requireDepositsEdit = requirePermission('RENTAL_DEPOSITS_EDIT');

/**
 * Middleware to require RENTAL_DOCUMENTS_VIEW permission
 */
export const requireDocumentsView = requirePermission('RENTAL_DOCUMENTS_VIEW');

/**
 * Middleware to require RENTAL_DOCUMENTS_GENERATE permission
 */
export const requireDocumentsGenerate = requirePermission('RENTAL_DOCUMENTS_GENERATE');

/**
 * Middleware to require RENTAL_DOCUMENTS_EDIT permission
 */
export const requireDocumentsEdit = requirePermission('RENTAL_DOCUMENTS_EDIT');
