import { Router } from 'express';
import { authenticate } from '../middleware/auth-middleware';
import { requireTenantAccess } from '../middleware/tenant-middleware';
import { enforceTenantIsolation } from '../middleware/tenant-isolation-middleware';
import { requireAnyPermission } from '../middleware/rbac-middleware';
import {
  requireDocumentsView,
  requireDocumentsGenerate,
  requireDocumentsEdit
} from '../middleware/rental-rbac-middleware';
import multer from 'multer';
import { BadRequestError } from '../middleware/error-middleware';
import {
  uploadTemplateHandler,
  listTemplatesHandler,
  updateTemplateHandler,
  setDefaultTemplateHandler,
  deleteTemplateHandler
} from '../controllers/document-template-controller';
import {
  generateDocumentHandler,
  regenerateDocumentHandler,
  downloadDocumentHandler
} from '../controllers/document-generation-controller';

const router = Router({ mergeParams: true });

// Configure multer for template uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024 // 10 MB
  },
  fileFilter: (_req, file, cb) => {
    if (
      file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      file.originalname.toLowerCase().endsWith('.docx')
    ) {
      cb(null, true);
    } else {
      // Erreur typée : un `Error` nu tomberait en 500 dans le gestionnaire
      // central (modele property-media-controller.ts).
      cb(new BadRequestError('Type de fichier non accepté. Format autorisé : DOCX.'));
    }
  }
});

// All routes require authentication and tenant access
// Routes are tenant-scoped: /tenants/:tenantId/documents/*
router.use(authenticate);
router.use(requireTenantAccess);
router.use(enforceTenantIsolation);

// Template routes
// All routes are tenant-scoped: /tenants/:tenantId/documents/*
// Droits du module Location : lecture ou génération pour lister les modèles
// (le formulaire de génération en a besoin), édition pour les gérer.
router.post(
  '/:tenantId/documents/templates/upload',
  requireDocumentsEdit,
  upload.single('file'),
  uploadTemplateHandler
);
router.get(
  '/:tenantId/documents/templates',
  requireAnyPermission(['RENTAL_DOCUMENTS_VIEW', 'RENTAL_DOCUMENTS_GENERATE']),
  listTemplatesHandler
);
router.patch('/:tenantId/documents/templates/:id', requireDocumentsEdit, updateTemplateHandler);
router.post('/:tenantId/documents/templates/:id/set-default', requireDocumentsEdit, setDefaultTemplateHandler);
router.delete('/:tenantId/documents/templates/:id', requireDocumentsEdit, deleteTemplateHandler);

// Document generation routes
router.post('/:tenantId/documents/generate', requireDocumentsGenerate, generateDocumentHandler);
router.post('/:tenantId/documents/:id/regenerate', requireDocumentsGenerate, regenerateDocumentHandler);
router.get('/:tenantId/documents/:id/download', requireDocumentsView, downloadDocumentHandler);

export default router;
