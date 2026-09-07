import { Router } from 'express';
import {
  registerAsTenantClient,
  getTenant,
  getTenantBySlugHandler,
  listTenants,
  createTenantHandler,
  getTenantClientsHandler,
  getMyMemberships,
  updateClientDetails,
  unregisterFromTenant,
  updateTenantSelfHandler
} from '../controllers/tenant-controller';
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
import { requireTenantAccess } from '../middleware/tenant-middleware';

const router = Router();

// Public routes
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

// Public routes with tenantId (must come after specific routes)
router.get('/:tenantId', getTenant);
router.post('/:tenantId/register', authenticate, registerAsTenantClient);
router.get('/:tenantId/clients', authenticate, getTenantClientsHandler);
router.patch('/:tenantId/client-details', authenticate, updateClientDetails);
router.delete('/:tenantId/unregister', authenticate, unregisterFromTenant);

// Admin only routes
router.post('/', authenticate, createTenantHandler);

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
