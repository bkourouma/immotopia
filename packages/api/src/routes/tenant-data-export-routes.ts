import { Router } from 'express';
import {
  deleteExportHandler,
  downloadExportHandler,
  getExportHandler,
  listExportsHandler,
  requestExportHandler
} from '../controllers/tenant-data-export-controller';
import { requirePermission } from '../middleware/rbac-middleware';
import { requireSuperAdmin } from '../middleware/super-admin-middleware';

/**
 * Export complet des donnees d'une agence (lot S7, besoin 8).
 *
 * Monte dans admin-routes.ts (/api/admin, deja authentifie). Double garde :
 * `requirePermission('PLATFORM_TENANTS_*')` (inventaire des routes, RBAC), puis
 * `requireSuperAdmin` — un role plateforme delegue ne suffit pas : l'archive
 * contient toutes les donnees de l'agence.
 */
export const tenantDataExportAdminRouter = Router();

const base = '/tenants/:tenantId/data-exports';
const view = requirePermission('PLATFORM_TENANTS_VIEW');
const edit = requirePermission('PLATFORM_TENANTS_EDIT');

tenantDataExportAdminRouter.post(base, edit, requireSuperAdmin, requestExportHandler);
tenantDataExportAdminRouter.get(base, view, requireSuperAdmin, listExportsHandler);
tenantDataExportAdminRouter.get(`${base}/:exportId`, view, requireSuperAdmin, getExportHandler);
tenantDataExportAdminRouter.get(`${base}/:exportId/download`, edit, requireSuperAdmin, downloadExportHandler);
tenantDataExportAdminRouter.delete(`${base}/:exportId`, edit, requireSuperAdmin, deleteExportHandler);
