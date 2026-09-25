import { Router } from 'express';
import {
  registerAsTenantClient,
  getTenant,
  getTenantBySlugHandler,
  listTenants,
  getTenantClientsHandler,
  getMyMemberships,
  updateClientDetails,
  unregisterFromTenant,
  updateTenantSelfHandler,
  uploadTenantLogoHandler
} from '../controllers/tenant-controller';
import { logoUpload } from '../middleware/logo-upload-middleware';
import {
  inviteCollaboratorHandler,
  resendInvitationHandler,
  revokeInvitationHandler,
  listInvitationsHandler
} from '../controllers/invitation-controller';
import {
  listMembersHandler,
  getMemberHandler,
  updateMemberHandler,
  disableMemberHandler,
  enableMemberHandler,
  resetPasswordHandler,
  revokeSessionsHandler
} from '../controllers/membership-controller';
import { authenticate } from '../middleware/auth-middleware';
import { requirePermission } from '../middleware/rbac-middleware';
import { requireTenantAccess, requireTenantCollaborator } from '../middleware/tenant-middleware';
import { getEntitlementsHandler } from '../controllers/subscription-v2-controller';
import {
  createExtensionRequestHandler,
  getCheckoutHandler,
  paymentAvailabilityHandler,
  startCheckoutHandler,
  tenantGetInvoicePaymentHandler,
  tenantListExtensionRequestsHandler
} from '../controllers/platform-billing-controller';
import { platformInvoiceTenantRouter } from './platform-invoice-routes';

const router = Router();

// Public routes — vitrine d'agence : seuls les champs de PUBLIC_TENANT_SELECT
// (services/tenant-service.ts) sortent.
router.get('/', listTenants);
router.get('/slug/:slug', getTenantBySlugHandler);

// Protected routes - MUST come before /:tenantId to avoid route conflicts
router.get('/my-memberships', authenticate, getMyMemberships);

// Tenant self-update route (requires tenant access and permission)
// Note: Placed before other /:tenantId routes to avoid conflicts
router.patch(
  '/:tenantId',
  authenticate,
  requireTenantAccess,
  requirePermission('TENANT_SETTINGS_EDIT'),
  updateTenantSelfHandler
);

// Depot du logo d'agence (lot G). Le super-admin passe (requireTenantAccess
// le laisse toujours entrer), un collaborateur a besoin de TENANT_SETTINGS_EDIT.
router.post(
  '/:tenantId/logo',
  authenticate,
  requireTenantAccess,
  requirePermission('TENANT_SETTINGS_EDIT'),
  logoUpload.single('logo'),
  uploadTenantLogoHandler
);

// Fiche complete d'une agence (membres, clients, abonnement) : reservee a ses
// membres et au super-admin. Elle etait publique et renvoyait des `User`
// complets, empreinte du mot de passe comprise.
router.get('/:tenantId', authenticate, requireTenantAccess, getTenant);

// Droits de l'agence (abonnement par packs) : modules, lecture seule,
// capacites et consommation. Lu par le menu et les gardes de la vague 2
// (docs/architecture/PLAN-ABONNEMENTS.md).
router.get('/:tenantId/entitlements', authenticate, requireTenantAccess, getEntitlementsHandler);
// Factures PLATFORM de l'agence (vague 3, lot A) : liste, detail, PDF.
router.use(platformInvoiceTenantRouter);
// Abonnement vu par l'agence (vague 3, lot B) : paiement en ligne des
// factures sur le compte ImmoTopia et demandes d'extension. `/subscription`
// est EXEMPT dans lib/subscription/route-features.ts : une agence en lecture
// seule doit pouvoir payer pour en sortir.
router.get(
  '/:tenantId/subscription/payment-availability',
  authenticate,
  requireTenantAccess,
  requirePermission('TENANT_SETTINGS_VIEW'),
  paymentAvailabilityHandler
);
router.post(
  '/:tenantId/subscription/invoices/:invoiceId/checkout',
  authenticate,
  requireTenantAccess,
  requirePermission('TENANT_SETTINGS_EDIT'),
  startCheckoutHandler
);
router.get(
  '/:tenantId/subscription/invoices/:invoiceId/payment',
  authenticate,
  requireTenantAccess,
  requirePermission('TENANT_SETTINGS_VIEW'),
  tenantGetInvoicePaymentHandler
);
router.get(
  '/:tenantId/subscription/checkouts/:codePaiement',
  authenticate,
  requireTenantAccess,
  requirePermission('TENANT_SETTINGS_VIEW'),
  getCheckoutHandler
);
router.get(
  '/:tenantId/subscription/extension-requests',
  authenticate,
  requireTenantAccess,
  requirePermission('TENANT_SETTINGS_VIEW'),
  tenantListExtensionRequestsHandler
);
router.post(
  '/:tenantId/subscription/extension-requests',
  authenticate,
  requireTenantAccess,
  requirePermission('TENANT_SETTINGS_EDIT'),
  createExtensionRequestHandler
);
router.post('/:tenantId/register', authenticate, registerAsTenantClient);

// Client directory exposes e-mails and names: restricted to collaborators of
// this tenant (used by the property form to pick an owner). Any authenticated
// user could previously read any tenant's client list.
router.get('/:tenantId/clients', authenticate, requireTenantAccess, requireTenantCollaborator, getTenantClientsHandler);

router.patch('/:tenantId/client-details', authenticate, requireTenantAccess, updateClientDetails);
router.delete('/:tenantId/unregister', authenticate, unregisterFromTenant);

// L'alias POST /api/tenants a ete supprime (lot F2) : la creation d'agence
// est desormais POST /api/admin/tenants uniquement (provisionTenantHandler),
// qui remplace l'ancien `createTenantHandler` a comportement minimal.

// Tenant user management routes (require tenant context and permissions)
router.get(
  '/:tenantId/invitations',
  authenticate,
  requireTenantAccess,
  requirePermission('USERS_VIEW'),
  listInvitationsHandler
);

router.post(
  '/:tenantId/users/invite',
  authenticate,
  requireTenantAccess,
  requirePermission('USERS_CREATE'),
  inviteCollaboratorHandler
);

router.post(
  '/:tenantId/users/invitations/:invitationId/resend',
  authenticate,
  requireTenantAccess,
  requirePermission('USERS_CREATE'),
  resendInvitationHandler
);

router.delete(
  '/:tenantId/users/invitations/:invitationId',
  authenticate,
  requireTenantAccess,
  requirePermission('USERS_EDIT'),
  revokeInvitationHandler
);

// Member management routes
router.get('/:tenantId/users', authenticate, requireTenantAccess, requirePermission('USERS_VIEW'), listMembersHandler);

router.get(
  '/:tenantId/users/:userId',
  authenticate,
  requireTenantAccess,
  requirePermission('USERS_VIEW'),
  getMemberHandler
);

router.patch(
  '/:tenantId/users/:userId',
  authenticate,
  requireTenantAccess,
  requirePermission('USERS_EDIT'),
  updateMemberHandler
);

router.post(
  '/:tenantId/users/:userId/disable',
  authenticate,
  requireTenantAccess,
  requirePermission('USERS_DISABLE'),
  disableMemberHandler
);

router.post(
  '/:tenantId/users/:userId/enable',
  authenticate,
  requireTenantAccess,
  requirePermission('USERS_EDIT'),
  enableMemberHandler
);

router.post(
  '/:tenantId/users/:userId/reset-password',
  authenticate,
  requireTenantAccess,
  requirePermission('USERS_EDIT'),
  resetPasswordHandler
);

router.post(
  '/:tenantId/users/:userId/revoke-sessions',
  authenticate,
  requireTenantAccess,
  requirePermission('USERS_EDIT'),
  revokeSessionsHandler
);

export default router;
