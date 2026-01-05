import { Router } from 'express';
import { authenticate } from '../middleware/auth-middleware';
import { requireTenantAccess } from '../middleware/tenant-middleware';
import { enforcePropertyTenantIsolation } from '../middleware/tenant-isolation-middleware';
import { requirePropertyPermission, requireAnyPropertyPermission } from '../middleware/property-rbac-middleware';
import {
  createPropertyHandler,
  getPropertyHandler,
  updatePropertyHandler,
  listPropertiesHandler,
  getTemplateHandler,
  listTemplatesHandler,
  publishPropertyHandler,
  unpublishPropertyHandler
} from '../controllers/property-controller';
import {
  createMandateHandler,
  revokeMandateHandler,
  getPropertyMandatesHandler,
  getTenantMandatesHandler
} from '../controllers/property-mandate-controller';
import {
  uploadMediaHandler,
  listMediaHandler,
  reorderMediaHandler,
  deleteMediaHandler,
  setPrimaryMediaHandler
} from '../controllers/property-media-controller';
import {
  uploadDocumentHandler,
  listDocumentsHandler,
  deleteDocumentHandler
} from '../controllers/property-document-controller';
import { updateStatusHandler, getStatusHistoryHandler } from '../controllers/property-status-controller';
import { getQualityScoreHandler } from '../controllers/property-controller';
import { searchPropertiesHandler } from '../controllers/property-search-controller';
import {
  scheduleVisitHandler,
  updateVisitStatusHandler,
  getPropertyVisitsHandler,
  getCalendarVisitsHandler,
  completeVisitHandler
} from '../controllers/property-visit-controller';
import { uploadMedia, uploadDocument } from '../middleware/upload-middleware';

const router = Router();

// Template routes (no tenant required, but authenticated)
router.get('/property-templates', authenticate, listTemplatesHandler);

router.get('/property-templates/:type', authenticate, getTemplateHandler);

// Tenant-scoped property routes
router.post(
  '/tenants/:tenantId/properties',
  authenticate,
  requireTenantAccess,
  enforcePropertyTenantIsolation,
  requirePropertyPermission('PROPERTIES_CREATE'),
  createPropertyHandler
);

router.get(
  '/tenants/:tenantId/properties',
  authenticate,
  requireTenantAccess,
  enforcePropertyTenantIsolation,
  requirePropertyPermission('PROPERTIES_VIEW'),
  listPropertiesHandler
);

router.get(
  '/tenants/:tenantId/properties/:id',
  authenticate,
  requireTenantAccess,
  enforcePropertyTenantIsolation,
  requirePropertyPermission('PROPERTIES_VIEW'),
  getPropertyHandler
);

router.put(
  '/tenants/:tenantId/properties/:id',
  authenticate,
  requireTenantAccess,
  enforcePropertyTenantIsolation,
  requirePropertyPermission('PROPERTIES_EDIT'),
  updatePropertyHandler
);

// Property Mandate routes
router.post(
  '/tenants/:tenantId/properties/:id/mandates',
  authenticate,
  requireTenantAccess,
  enforcePropertyTenantIsolation,
  requirePropertyPermission('PROPERTIES_EDIT'),
  createMandateHandler
);

router.delete(
  '/tenants/:tenantId/properties/:id/mandates/:mandateId',
  authenticate,
  requireTenantAccess,
  enforcePropertyTenantIsolation,
  requirePropertyPermission('PROPERTIES_EDIT'),
  revokeMandateHandler
);

router.get(
  '/tenants/:tenantId/properties/:id/mandates',
  authenticate,
  requireTenantAccess,
  enforcePropertyTenantIsolation,
  requirePropertyPermission('PROPERTIES_VIEW'),
  getPropertyMandatesHandler
);

router.get(
  '/tenants/:tenantId/mandates',
  authenticate,
  requireTenantAccess,
  enforcePropertyTenantIsolation,
  requirePropertyPermission('PROPERTIES_VIEW'),
  getTenantMandatesHandler
);

// Property Media routes
router.post(
  '/tenants/:tenantId/properties/:id/media',
  authenticate,
  requireTenantAccess,
  enforcePropertyTenantIsolation,
  requirePropertyPermission('PROPERTIES_EDIT'),
  uploadMedia.single('file'),
  uploadMediaHandler
);

router.get(
  '/tenants/:tenantId/properties/:id/media',
  authenticate,
  requireTenantAccess,
  enforcePropertyTenantIsolation,
  requirePropertyPermission('PROPERTIES_VIEW'),
  listMediaHandler
);

router.post(
  '/tenants/:tenantId/properties/:id/media/reorder',
  authenticate,
  requireTenantAccess,
  enforcePropertyTenantIsolation,
  requirePropertyPermission('PROPERTIES_EDIT'),
  reorderMediaHandler
);

router.post(
  '/tenants/:tenantId/properties/:id/media/primary',
  authenticate,
  requireTenantAccess,
  enforcePropertyTenantIsolation,
  requirePropertyPermission('PROPERTIES_EDIT'),
  setPrimaryMediaHandler
);

router.delete(
  '/tenants/:tenantId/properties/:id/media/:mediaId',
  authenticate,
  requireTenantAccess,
  enforcePropertyTenantIsolation,
  requirePropertyPermission('PROPERTIES_EDIT'),
  deleteMediaHandler
);

// Property Document routes
router.post(
  '/tenants/:tenantId/properties/:id/documents',
  authenticate,
  requireTenantAccess,
  enforcePropertyTenantIsolation,
  requirePropertyPermission('PROPERTIES_EDIT'),
  uploadDocument.single('file'),
  uploadDocumentHandler
);

router.get(
  '/tenants/:tenantId/properties/:id/documents',
  authenticate,
  requireTenantAccess,
  enforcePropertyTenantIsolation,
  requirePropertyPermission('PROPERTIES_VIEW'),
  listDocumentsHandler
);

router.delete(
  '/tenants/:tenantId/properties/:id/documents/:documentId',
  authenticate,
  requireTenantAccess,
  enforcePropertyTenantIsolation,
  requirePropertyPermission('PROPERTIES_EDIT'),
  deleteDocumentHandler
);

// Property Status routes
router.post(
  '/tenants/:tenantId/properties/:id/status',
  authenticate,
  requireTenantAccess,
  enforcePropertyTenantIsolation,
  requirePropertyPermission('PROPERTIES_EDIT'),
  updateStatusHandler
);

router.get(
  '/tenants/:tenantId/properties/:id/status/history',
  authenticate,
  requireTenantAccess,
  enforcePropertyTenantIsolation,
  requirePropertyPermission('PROPERTIES_VIEW'),
  getStatusHistoryHandler
);

// Property Search routes
router.post(
  '/tenants/:tenantId/properties/search',
  authenticate,
  requireTenantAccess,
  enforcePropertyTenantIsolation,
  requirePropertyPermission('PROPERTIES_VIEW'),
  searchPropertiesHandler
);

// Property Publication routes
router.post(
  '/tenants/:tenantId/properties/:id/publish',
  authenticate,
  requireTenantAccess,
  enforcePropertyTenantIsolation,
  requirePropertyPermission('PROPERTIES_PUBLISH'),
  publishPropertyHandler
);

router.post(
  '/tenants/:tenantId/properties/:id/unpublish',
  authenticate,
  requireTenantAccess,
  enforcePropertyTenantIsolation,
  requirePropertyPermission('PROPERTIES_PUBLISH'),
  unpublishPropertyHandler
);

// Property Visit routes
router.post(
  '/tenants/:tenantId/properties/:id/visits',
  authenticate,
  requireTenantAccess,
  enforcePropertyTenantIsolation,
  requirePropertyPermission('PROPERTIES_VISITS_SCHEDULE'),
  scheduleVisitHandler
);

router.get(
  '/tenants/:tenantId/properties/:id/visits',
  authenticate,
  requireTenantAccess,
  enforcePropertyTenantIsolation,
  requirePropertyPermission('PROPERTIES_VIEW'),
  getPropertyVisitsHandler
);

router.patch(
  '/tenants/:tenantId/properties/:id/visits/:visitId/status',
  authenticate,
  requireTenantAccess,
  enforcePropertyTenantIsolation,
  requirePropertyPermission('PROPERTIES_VISITS_SCHEDULE'),
  updateVisitStatusHandler
);

router.post(
  '/tenants/:tenantId/properties/:id/visits/:visitId/complete',
  authenticate,
  requireTenantAccess,
  enforcePropertyTenantIsolation,
  requirePropertyPermission('PROPERTIES_VISITS_SCHEDULE'),
  completeVisitHandler
);

router.get(
  '/tenants/:tenantId/properties/visits/calendar',
  authenticate,
  requireTenantAccess,
  enforcePropertyTenantIsolation,
  requirePropertyPermission('PROPERTIES_VIEW'),
  getCalendarVisitsHandler
);

// Property Quality Score routes
router.get(
  '/tenants/:tenantId/properties/:id/quality',
  authenticate,
  requireTenantAccess,
  enforcePropertyTenantIsolation,
  requirePropertyPermission('PROPERTIES_VIEW'),
  getQualityScoreHandler
);

export default router;
