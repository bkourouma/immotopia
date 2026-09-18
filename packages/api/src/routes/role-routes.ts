import { Router } from 'express';
import {
  listRolesHandler,
  getRoleHandler,
  listPermissionsHandler,
  updateRolePermissionsHandler,
  listMenuAccessHandler,
  getMyMenuAccessHandler,
  updateMenuAccessHandler
} from '../controllers/role-controller';
import { authenticate } from '../middleware/auth-middleware';
import { requirePermission } from '../middleware/rbac-middleware';

const router = Router();

// All role routes require authentication
router.use(authenticate);

// List roles
router.get('/', listRolesHandler);

// List all permissions
router.get('/permissions/all', listPermissionsHandler);

// --- Accès aux menus par rôle ---------------------------------------------
// Déclarés AVANT `/:id` : Express prend la première route qui correspond, et
// `/:id` capturerait `/menu-access` comme un identifiant de rôle.

// Menus coupés pour l'utilisateur courant (lu par la coquille à chaque session)
router.get('/menu-access/me', getMyMenuAccessHandler);

// Carte complète des décisions, tous rôles confondus (écran d'administration)
router.get('/menu-access', requirePermission('PLATFORM_TENANTS_VIEW'), listMenuAccessHandler);

// Remplace les menus d'un rôle
router.put('/menu-access/:roleKey', requirePermission('PLATFORM_TENANTS_EDIT'), updateMenuAccessHandler);

// Get role with permissions
router.get('/:id', getRoleHandler);

// Update role permissions (requires platform admin permission)
router.patch(
  '/:id/permissions',
  requirePermission('PLATFORM_TENANTS_EDIT'), // Using existing platform permission
  updateRolePermissionsHandler
);

export default router;
