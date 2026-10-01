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
import { exportAuditLogsHandler, getAuditLogsHandler } from '../controllers/audit-controller';
import { requireSuperAdmin } from '../middleware/super-admin-middleware';
import { auditExportRateLimiter } from '../middleware/rate-limit-middleware';
import {
  listCatalogHandler,
  updateCatalogItemHandler,
  quoteHandler,
  getOverviewHandler,
  getEntitlementsHandler,
  addItemHandler,
  removeItemHandler,
  changePackHandler,
  updateSettingsHandler,
  listOverridesHandler,
  grantOverrideHandler,
  revokeOverrideHandler,
  invoicePreviewHandler,
  reconcileLotsHandler,
  clearModuleOverrideHandler,
  setManualReadOnlyHandler,
  clearManualReadOnlyHandler
} from '../controllers/subscription-v2-controller';
import {
  adminGetInvoicePaymentHandler,
  adminListExtensionRequestsHandler,
  downloadPaymentProofHandler,
  handleExtensionRequestHandler,
  paymentProofUpload,
  recordManualPaymentHandler,
  summariesHandler,
  updateItemHandler
} from '../controllers/platform-billing-controller';
import { platformInvoiceAdminRouter } from './platform-invoice-routes';
import { tenantDataExportAdminRouter } from './tenant-data-export-routes';
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

// Abonnements par packs (docs/architecture/PLAN-ABONNEMENTS.md) : catalogue
// global, elements souscrits, derogations, apercu de facture. Routes
// plateforme, sans contexte d'agence (lecture volontaire hors agence).
router.get('/catalog', requirePermission('PLATFORM_SUBSCRIPTIONS_VIEW'), listCatalogHandler);
router.post('/catalog/quote', requirePermission('PLATFORM_SUBSCRIPTIONS_VIEW'), quoteHandler);
router.patch('/catalog/:code', requirePermission('PLATFORM_SUBSCRIPTIONS_EDIT'), updateCatalogItemHandler);

router.get('/tenants/:tenantId/entitlements', requirePermission('PLATFORM_SUBSCRIPTIONS_VIEW'), getEntitlementsHandler);
router.get(
  '/tenants/:tenantId/subscription/overview',
  requirePermission('PLATFORM_SUBSCRIPTIONS_VIEW'),
  getOverviewHandler
);
router.post('/tenants/:tenantId/subscription/items', requirePermission('PLATFORM_SUBSCRIPTIONS_EDIT'), addItemHandler);
// Vague 3, lot B : remise ou prix d'un element (audit), sans retrait + re-ajout.
router.patch(
  '/tenants/:tenantId/subscription/items/:itemId',
  requirePermission('PLATFORM_SUBSCRIPTIONS_EDIT'),
  updateItemHandler
);
// Resume de l'abonnement de plusieurs agences (liste des agences, sans N+1).
router.get('/subscriptions/summaries', requirePermission('PLATFORM_SUBSCRIPTIONS_VIEW'), summariesHandler);
// Demandes d'extension envoyees par l'agence.
router.get(
  '/tenants/:tenantId/subscription/extension-requests',
  requirePermission('PLATFORM_SUBSCRIPTIONS_VIEW'),
  adminListExtensionRequestsHandler
);
router.patch(
  '/tenants/:tenantId/subscription/extension-requests/:requestId',
  requirePermission('PLATFORM_SUBSCRIPTIONS_EDIT'),
  handleExtensionRequestHandler
);
// Reglement d'une facture PLATFORM : constat manuel (justificatif prive
// facultatif), lecture du reglement et des tentatives en ligne.
router.post(
  '/tenants/:tenantId/platform-invoices/:invoiceId/payment',
  requirePermission('PLATFORM_INVOICES_EDIT'),
  paymentProofUpload.single('proof'),
  recordManualPaymentHandler
);
router.get(
  '/tenants/:tenantId/platform-invoices/:invoiceId/payment',
  requirePermission('PLATFORM_INVOICES_VIEW'),
  adminGetInvoicePaymentHandler
);
router.get(
  '/tenants/:tenantId/platform-invoices/:invoiceId/payment/proof',
  requirePermission('PLATFORM_INVOICES_VIEW'),
  downloadPaymentProofHandler
);
router.delete(
  '/tenants/:tenantId/subscription/items/:itemId',
  requirePermission('PLATFORM_SUBSCRIPTIONS_EDIT'),
  removeItemHandler
);
router.post(
  '/tenants/:tenantId/subscription/change-pack',
  requirePermission('PLATFORM_SUBSCRIPTIONS_EDIT'),
  changePackHandler
);
router.patch(
  '/tenants/:tenantId/subscription/settings',
  requirePermission('PLATFORM_SUBSCRIPTIONS_EDIT'),
  updateSettingsHandler
);
// Lecture seule manuelle (Baba, 25/09) : hors impaye, motif obligatoire, seul
// le super-admin la leve (jamais un paiement ni la tache planifiee).
router.post(
  '/tenants/:tenantId/subscription/manual-read-only',
  requirePermission('PLATFORM_SUBSCRIPTIONS_EDIT'),
  setManualReadOnlyHandler
);
router.delete(
  '/tenants/:tenantId/subscription/manual-read-only',
  requirePermission('PLATFORM_SUBSCRIPTIONS_EDIT'),
  clearManualReadOnlyHandler
);
router.get(
  '/tenants/:tenantId/subscription/overrides',
  requirePermission('PLATFORM_SUBSCRIPTIONS_VIEW'),
  listOverridesHandler
);
router.post(
  '/tenants/:tenantId/subscription/overrides',
  requirePermission('PLATFORM_SUBSCRIPTIONS_EDIT'),
  grantOverrideHandler
);
router.delete(
  '/tenants/:tenantId/subscription/overrides/:overrideId',
  requirePermission('PLATFORM_SUBSCRIPTIONS_EDIT'),
  revokeOverrideHandler
);
router.get(
  '/tenants/:tenantId/subscription/invoice-preview',
  requirePermission('PLATFORM_SUBSCRIPTIONS_VIEW'),
  invoicePreviewHandler
);
router.post(
  '/tenants/:tenantId/subscription/lots/reconcile',
  requirePermission('PLATFORM_SUBSCRIPTIONS_EDIT'),
  reconcileLotsHandler
);
router.delete(
  '/tenants/:tenantId/modules/:moduleKey/override',
  requirePermission('PLATFORM_MODULES_EDIT'),
  clearModuleOverrideHandler
);

// Invoice management routes
router.get('/tenants/:tenantId/invoices', requirePermission('PLATFORM_INVOICES_VIEW'), listInvoicesHandler);

router.post('/tenants/:tenantId/invoices', requirePermission('PLATFORM_INVOICES_CREATE'), createInvoiceHandler);

router.get('/invoices/:invoiceId', requirePermission('PLATFORM_INVOICES_VIEW'), getInvoiceHandler);

router.patch('/invoices/:invoiceId', requirePermission('PLATFORM_INVOICES_EDIT'), updateInvoiceHandler);

router.post('/invoices/:invoiceId/mark-paid', requirePermission('PLATFORM_INVOICES_EDIT'), markInvoicePaidHandler);

// Factures PLATFORM des abonnements (vague 3, lot A) : liste, generation,
// emission, constat de paiement, avoir, PDF.
router.use(platformInvoiceAdminRouter);

// Export complet des donnees d'une agence (lot S7) : super-admin seulement.
router.use(tenantDataExportAdminRouter);

// Statistics routes
router.get('/statistics', requirePermission('PLATFORM_TENANTS_VIEW'), getGlobalStatisticsHandler);

router.get('/tenants/:tenantId/activity', requirePermission('PLATFORM_TENANTS_VIEW'), getTenantActivityStatsHandler);

// Audit log routes (ADR-006, niveau plateforme). La consultation et l'export ont
// leurs droits : PLATFORM_AUDIT_VIEW / PLATFORM_AUDIT_EXPORT. L'export est en
// plus réservé au super-admin et limité en débit.
router.get('/audit', requirePermission('PLATFORM_AUDIT_VIEW'), getAuditLogsHandler);
router.get(
  '/audit/export',
  requirePermission('PLATFORM_AUDIT_EXPORT'),
  requireSuperAdmin,
  auditExportRateLimiter,
  exportAuditLogsHandler
);

export default router;
