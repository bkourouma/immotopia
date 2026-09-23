import { Router } from 'express';
import multer from 'multer';
import { BadRequestError } from '../middleware/error-middleware';
import { authenticate } from '../middleware/auth-middleware';
import { requireTenantAccess } from '../middleware/tenant-middleware';
import { requirePermission } from '../middleware/rbac-middleware';
import {
  addInspectionPhotoHandler,
  compareInspectionsHandler,
  createInspectionHandler,
  deleteInspectionHandler,
  deleteInspectionPhotoHandler,
  getInspectionPhotoFileHandler,
  listInspectionsHandler,
  updateInspectionHandler,
  finalizeInspectionHandler
} from '../controllers/lease-inspection-controller';

/**
 * États des lieux d'entrée et de sortie — lot 5 (section B) de la gestion
 * locative.
 *
 * Montée à part par `index.ts` (pas ici) : voir le routeur de la section A
 * (vie du bail) pour le préfixe commun `/tenants/:tenantId/rental/leases/:leaseId`.
 *
 * Gardes posés avec leur chemin, jamais en `router.use` nu : ce routeur est
 * monté sur `/api` tout entier, comme `management-fee-routes.ts`.
 */
const router = Router();

const guard = (permission: string) => [authenticate, requireTenantAccess, requirePermission(permission)];

// Stockage en mémoire, comme les pièces jointes de maintenance : le service
// écrit lui-même le fichier sur disque, en dehors de tout dossier public.
const photoFileFilter = (_req: unknown, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  if (file.mimetype && allowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    // Erreur typée : un `Error` nu tomberait en 500 dans le gestionnaire central.
    cb(new BadRequestError('Type de fichier non autorisé. Formats acceptés : JPEG, PNG, WebP.'));
  }
};

const uploadInspectionPhoto = multer({
  storage: multer.memoryStorage(),
  fileFilter: photoFileFilter,
  limits: { fileSize: 10 * 1024 * 1024 } // 10 Mo
});

const BASE = '/tenants/:tenantId/rental/leases/:leaseId/inspections';

router.get(BASE, ...guard('RENTAL_LEASES_VIEW'), listInspectionsHandler);
router.post(BASE, ...guard('RENTAL_LEASES_EDIT'), createInspectionHandler);
router.get(`${BASE}/compare`, ...guard('RENTAL_LEASES_VIEW'), compareInspectionsHandler);

router.put(`${BASE}/:id`, ...guard('RENTAL_LEASES_EDIT'), updateInspectionHandler);
router.delete(`${BASE}/:id`, ...guard('RENTAL_LEASES_EDIT'), deleteInspectionHandler);
router.post(`${BASE}/:id/finalize`, ...guard('RENTAL_LEASES_EDIT'), finalizeInspectionHandler);

router.post(
  `${BASE}/:id/photos`,
  ...guard('RENTAL_LEASES_EDIT'),
  uploadInspectionPhoto.single('file'),
  addInspectionPhotoHandler
);
router.get(`${BASE}/:id/photos/:photoId/file`, ...guard('RENTAL_LEASES_VIEW'), getInspectionPhotoFileHandler);
router.delete(`${BASE}/:id/photos/:photoId`, ...guard('RENTAL_LEASES_EDIT'), deleteInspectionPhotoHandler);

export default router;
