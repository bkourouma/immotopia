import { Router } from 'express';
import { authenticate } from '../middleware/auth-middleware';
import { requireTenantAccess } from '../middleware/tenant-middleware';
import { enforceTenantIsolation } from '../middleware/tenant-isolation-middleware';
import multer from 'multer';
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
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
        file.originalname.toLowerCase().endsWith('.docx')) {
      cb(null, true);
    } else {
      cb(new Error('Only DOCX files are allowed'));
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
router.post('/:tenantId/documents/templates/upload', upload.single('file'), uploadTemplateHandler);
router.get('/:tenantId/documents/templates', listTemplatesHandler);
router.patch('/:tenantId/documents/templates/:id', updateTemplateHandler);
router.post('/:tenantId/documents/templates/:id/set-default', setDefaultTemplateHandler);
router.delete('/:tenantId/documents/templates/:id', deleteTemplateHandler);

// Document generation routes
router.post('/:tenantId/documents/generate', generateDocumentHandler);
router.post('/:tenantId/documents/:id/regenerate', regenerateDocumentHandler);
router.get('/:tenantId/documents/:id/download', downloadDocumentHandler);

export default router;

