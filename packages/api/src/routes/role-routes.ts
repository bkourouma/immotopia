import { Router } from 'express';
import {
  listRolesHandler,
  getRoleHandler,
  listPermissionsHandler,
  updateRolePermissionsHandler
} from '../controllers/role-controller';
import { authenticate } from '../middleware/auth-middleware';
import { requirePermission } from '../middleware/rbac-middleware';

const router = Router();

// All role routes require authentication
router.use(authenticate);

// List roles
router.get('/', listRolesHandler);

// Get role with permissions
router.get('/:id', getRoleHandler);

// List all permissions
router.get('/permissions/all', listPermissionsHandler);

// Update role permissions (requires platform admin permission)
router.patch(
  '/:id/permissions',
  requirePermission('PLATFORM_TENANTS_EDIT'), // Using existing platform permission
  updateRolePermissionsHandler
);

export default router;
