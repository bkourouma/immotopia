import { Router } from 'express';
import {
  adminCreditNoteHandler,
  adminGenerateInvoiceHandler,
  adminGetInvoiceHandler,
  adminInvoicePdfHandler,
  adminIssueInvoiceHandler,
  adminListInvoicesHandler,
  adminMarkPaidHandler,
  tenantGetInvoiceHandler,
  tenantInvoicePdfHandler,
  tenantListInvoicesHandler
} from '../controllers/platform-invoice-controller';
import { authenticate } from '../middleware/auth-middleware';
import { requirePermission } from '../middleware/rbac-middleware';
import { requireTenantAccess } from '../middleware/tenant-middleware';

/**
 * Factures PLATFORM des abonnements (vague 3, lot A,
 * docs/architecture/PLAN-ABONNEMENTS.md §6 quater).
 *
 * `platformInvoiceAdminRouter` : monte dans admin-routes.ts (/api/admin,
 * deja authentifie), permissions PLATFORM_INVOICES_*.
 * `platformInvoiceTenantRouter` : monte dans tenant-routes.ts
 * (/api/tenants), `requireTenantAccess` ; le prefixe `/subscription/invoices`
 * est EXEMPT dans lib/subscription/route-features.ts : une agence en lecture
 * seule voit et paie ses factures.
 */

export const platformInvoiceAdminRouter = Router();

const base = '/tenants/:tenantId/platform-invoices';
platformInvoiceAdminRouter.get(base, requirePermission('PLATFORM_INVOICES_VIEW'), adminListInvoicesHandler);
platformInvoiceAdminRouter.post(`${base}/generate`, requirePermission('PLATFORM_INVOICES_CREATE'), adminGenerateInvoiceHandler);
platformInvoiceAdminRouter.get(`${base}/:invoiceId`, requirePermission('PLATFORM_INVOICES_VIEW'), adminGetInvoiceHandler);
platformInvoiceAdminRouter.get(`${base}/:invoiceId/pdf`, requirePermission('PLATFORM_INVOICES_VIEW'), adminInvoicePdfHandler);
platformInvoiceAdminRouter.post(`${base}/:invoiceId/issue`, requirePermission('PLATFORM_INVOICES_EDIT'), adminIssueInvoiceHandler);
platformInvoiceAdminRouter.post(`${base}/:invoiceId/mark-paid`, requirePermission('PLATFORM_INVOICES_EDIT'), adminMarkPaidHandler);
platformInvoiceAdminRouter.post(
  `${base}/:invoiceId/credit-note`,
  requirePermission('PLATFORM_INVOICES_EDIT'),
  adminCreditNoteHandler
);

export const platformInvoiceTenantRouter = Router();

platformInvoiceTenantRouter.get(
  '/:tenantId/subscription/invoices',
  authenticate,
  requireTenantAccess,
  requirePermission('TENANT_SETTINGS_VIEW'),
  tenantListInvoicesHandler
);
platformInvoiceTenantRouter.get(
  '/:tenantId/subscription/invoices/:invoiceId',
  authenticate,
  requireTenantAccess,
  requirePermission('TENANT_SETTINGS_VIEW'),
  tenantGetInvoiceHandler
);
platformInvoiceTenantRouter.get(
  '/:tenantId/subscription/invoices/:invoiceId/pdf',
  authenticate,
  requireTenantAccess,
  requirePermission('TENANT_SETTINGS_VIEW'),
  tenantInvoicePdfHandler
);
