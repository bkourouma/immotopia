import { Router } from 'express';
import {
  createTenantHandler,
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
import { authenticate } from '../middleware/auth-middleware';
import { requirePermission } from '../middleware/rbac-middleware';

const router = Router();

// All admin routes require authentication
router.use(authenticate);

// Tenant management routes (Platform Admin only)
router.post('/tenants', requirePermission('PLATFORM_TENANTS_CREATE'), createTenantHandler);

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

export default router;
