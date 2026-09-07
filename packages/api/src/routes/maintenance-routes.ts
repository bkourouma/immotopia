import { Router } from 'express';
import { authenticate } from '../middleware/auth-middleware';
import { requireTenantAccess } from '../middleware/tenant-middleware';
import { enforceTenantIsolation } from '../middleware/tenant-isolation-middleware';
import {
  requireMaintenanceTenantPermission,
  requireMaintenanceAdminPermission
} from '../middleware/maintenance-rbac-middleware';
import {
  createTicketHandler,
  listTenantTicketsHandler,
  getTenantTicketHandler,
  cancelTicketHandler,
  deleteTicketHandler,
  addCommentHandler,
  listAllTicketsHandler,
  getTicketHandler,
  updateTicketHandler,
  addManagerCommentHandler,
  getPropertyMaintenanceHistoryHandler
} from '../controllers/maintenance-ticket-controller';
import { uploadAttachmentHandler, downloadAttachmentHandler } from '../controllers/maintenance-attachment-controller';
import {
  getActiveVendorsHandler,
  createVendorHandler,
  listVendorsHandler,
  getVendorHandler,
  updateVendorHandler,
  deactivateVendorHandler,
  deleteVendorHandler
} from '../controllers/maintenance-vendor-controller';
import multer from 'multer';

const router = Router({ mergeParams: true });

// Configure multer for maintenance file uploads
const storage = multer.memoryStorage();

// File filter for maintenance attachments (images and PDFs only)
const maintenanceFileFilter = (req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf'];

  if (file.mimetype && allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Type de fichier non autorisé. Types autorisés: JPEG, PNG, WebP, PDF'));
  }
};

const uploadMaintenance = multer({
  storage,
  fileFilter: maintenanceFileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB max file size
  }
});

// Tenant routes - All routes require authentication, tenant access, isolation, and tenant permission
const tenantRouter = Router({ mergeParams: true });
tenantRouter.use(authenticate);
tenantRouter.use(requireTenantAccess);
tenantRouter.use(enforceTenantIsolation);
tenantRouter.use(requireMaintenanceTenantPermission);

// Ticket routes
tenantRouter.get('/tickets', listTenantTicketsHandler);
tenantRouter.post('/tickets', createTicketHandler);
tenantRouter.get('/tickets/:ticketId', getTenantTicketHandler);
tenantRouter.patch('/tickets/:ticketId', cancelTicketHandler);
tenantRouter.delete('/tickets/:ticketId', deleteTicketHandler);

// Comment routes
tenantRouter.post('/tickets/:ticketId/comments', addCommentHandler);

// Attachment routes
tenantRouter.post('/tickets/:ticketId/attachments', uploadMaintenance.single('file'), uploadAttachmentHandler);

router.use('/tenant', tenantRouter);

// Manager/Admin routes - All routes require authentication, tenant access, isolation, and admin permission
const adminRouter = Router({ mergeParams: true });
adminRouter.use(authenticate);
adminRouter.use(requireTenantAccess);
adminRouter.use(enforceTenantIsolation);
adminRouter.use(requireMaintenanceAdminPermission);

// Manager ticket routes
adminRouter.get('/tickets', listAllTicketsHandler);
adminRouter.get('/tickets/:ticketId', getTicketHandler);
adminRouter.patch('/tickets/:ticketId', updateTicketHandler);

// Manager comment routes
adminRouter.post('/tickets/:ticketId/comments', addManagerCommentHandler);

// Property maintenance history route (in admin router, validates property belongs to tenant)
adminRouter.get('/properties/:propertyId/maintenance', getPropertyMaintenanceHistoryHandler);

// Vendor routes (in admin router)
adminRouter.get('/vendors', listVendorsHandler);
adminRouter.post('/vendors', createVendorHandler);
adminRouter.get('/vendors/:vendorId', getVendorHandler);
adminRouter.patch('/vendors/:vendorId', updateVendorHandler);
adminRouter.delete('/vendors/:vendorId', deactivateVendorHandler);
adminRouter.post('/vendors/:vendorId/delete', deleteVendorHandler);

router.use('/admin', adminRouter);

// Vendor routes (shared, requires authentication and tenant access)
router.get('/vendors/active', authenticate, requireTenantAccess, enforceTenantIsolation, getActiveVendorsHandler);

// File download route (shared, but requires authentication and tenant access)
router.get(
  '/files/:attachmentId',
  authenticate,
  requireTenantAccess,
  enforceTenantIsolation,
  downloadAttachmentHandler
);

export default router;
