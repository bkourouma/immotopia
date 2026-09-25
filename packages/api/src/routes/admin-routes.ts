import { Router } from 'express';
import {
  provisionTenantHandler,
  updateTenantHandler,
  listTenantsHandler,
  getTenantDetailHandler,
  getTenantStatsHandler,
  suspendTenantHandler,
  activateTenantHandler,
  getTenantModulesHandler,
  updateTenantModulesHandler
} from '../controllers/tenant-controller';
import {
  getSubscriptionHandler,
  createSubscriptionHandler,
  updateSubscriptionHandler,
  cancelSubscriptionHandler,
  listInvoicesHandler,
  createInvoiceHandler,
  getInvoiceHandler,
  updateInvoiceHandler,
  markInvoicePaidHandler
} from '../controllers/subscription-controller';
import { getGlobalStatisticsHandler, getTenantActivityStatsHandler } from '../controllers/statistics-controller';
import { getAuditLogsHandler } from '../controllers/audit-controller';
import {
  getPlatformSmsStatusHandler,
  testPlatformSmsConnectionHandler,
  getAdminTenantSmsHandler,
  updateAdminTenantSmsHandler,
  sendAdminTenantTestSmsHandler
} from '../controllers/sms-settings-controller';
import { authenticate } from '../middleware/auth-middleware';
import { requirePermission } from '../middleware/rbac-middleware';

const router = Router();

// All admin routes require authentication
router.use(authenticate);

// Tenant management routes (Platform Admin only)
// Creation d'agence en un clic (lot F) : provisionne tenant + modules +
// abonnement d'essai + socle comptable + administrateur invite, en une seule
// transaction. Remplace l'ancien `createTenantHandler`, qui n'ecrivait qu'une
// ligne Tenant PENDING (voir docs/architecture/PLAN-MULTI-TENANT.md, lot F1).
router.post('/tenants', requirePermission('PLATFORM_TENANTS_CREATE'), provisionTenantHandler);

router.get('/tenants', requirePermission('PLATFORM_TENANTS_VIEW'), listTenantsHandler);

router.get('/tenants/:tenantId', requirePermission('PLATFORM_TENANTS_VIEW'), getTenantDetailHandler);

router.patch('/tenants/:tenantId', requirePermission('PLATFORM_TENANTS_EDIT'), updateTenantHandler);

router.get('/tenants/:tenantId/stats', requirePermission('PLATFORM_TENANTS_VIEW'), getTenantStatsHandler);

router.post('/tenants/:tenantId/suspend', requirePermission('PLATFORM_TENANTS_EDIT'), suspendTenantHandler);

router.post('/tenants/:tenantId/activate', requirePermission('PLATFORM_TENANTS_EDIT'), activateTenantHandler);

// Module management routes
router.get('/tenants/:tenantId/modules', requirePermission('PLATFORM_MODULES_VIEW'), getTenantModulesHandler);

router.patch('/tenants/:tenantId/modules', requirePermission('PLATFORM_MODULES_EDIT'), updateTenantModulesHandler);

// Subscription management routes
router.get('/tenants/:tenantId/subscription', requirePermission('PLATFORM_SUBSCRIPTIONS_VIEW'), getSubscriptionHandler);

router.post(
  '/tenants/:tenantId/subscription',
  requirePermission('PLATFORM_SUBSCRIPTIONS_EDIT'),
  createSubscriptionHandler
);

router.patch(
  '/tenants/:tenantId/subscription',
  requirePermission('PLATFORM_SUBSCRIPTIONS_EDIT'),
  updateSubscriptionHandler
);

router.post(
  '/tenants/:tenantId/subscription/cancel',
  requirePermission('PLATFORM_SUBSCRIPTIONS_EDIT'),
  cancelSubscriptionHandler
);

// Invoice management routes
router.get('/tenants/:tenantId/invoices', requirePermission('PLATFORM_INVOICES_VIEW'), listInvoicesHandler);

router.post('/tenants/:tenantId/invoices', requirePermission('PLATFORM_INVOICES_CREATE'), createInvoiceHandler);

router.get('/invoices/:invoiceId', requirePermission('PLATFORM_INVOICES_VIEW'), getInvoiceHandler);

router.patch('/invoices/:invoiceId', requirePermission('PLATFORM_INVOICES_EDIT'), updateInvoiceHandler);

router.post('/invoices/:invoiceId/mark-paid', requirePermission('PLATFORM_INVOICES_EDIT'), markInvoicePaidHandler);

// Statistics routes
router.get('/statistics', requirePermission('PLATFORM_TENANTS_VIEW'), getGlobalStatisticsHandler);

router.get('/tenants/:tenantId/activity', requirePermission('PLATFORM_TENANTS_VIEW'), getTenantActivityStatsHandler);

// Audit log routes
router.get(
  '/audit',
  requirePermission('PLATFORM_TENANTS_VIEW'), // Using same permission as viewing tenants
  getAuditLogsHandler
);

// SMS (lot SMS-1) — décision produit : un seul compte Orange, au nom
// d'ImmoTopia. Réglages par agence modifiables seulement ici (super-admin) ;
// l'agence les voit en lecture seule sous /api/tenants/:tenantId/settings/sms.
router.get('/sms/platform', requirePermission('PLATFORM_TENANTS_VIEW'), getPlatformSmsStatusHandler);
router.post('/sms/platform/test', requirePermission('PLATFORM_TENANTS_EDIT'), testPlatformSmsConnectionHandler);
router.get('/tenants/:tenantId/sms', requirePermission('PLATFORM_TENANTS_VIEW'), getAdminTenantSmsHandler);
router.patch('/tenants/:tenantId/sms', requirePermission('PLATFORM_TENANTS_EDIT'), updateAdminTenantSmsHandler);
router.post('/tenants/:tenantId/sms/test', requirePermission('PLATFORM_TENANTS_EDIT'), sendAdminTenantTestSmsHandler);

export default router;
