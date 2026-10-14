import { Router, type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';

import { authenticate } from '../middleware/auth-middleware';
import { ErrorCode } from '../middleware/error-middleware';
import { requireStockAttachmentDeposit, requireStockView } from '../middleware/stock-rbac-middleware';
import { requireTenantAccess } from '../middleware/tenant-middleware';
import { stockError } from '../lib/finance/stock-controles';
import { STOCK_ATTACHMENT_MAX_BYTES } from '../lib/finance/stock-pieces-jointes';
import {
  getStockAttachmentFileHandler,
  getStockCountReportPdfHandler,
  getStockSlipHandler,
  getStockSlipPdfHandler,
  listStockAttachmentsHandler,
  removeStockAttachmentHandler,
  uploadStockAttachmentHandler
} from '../controllers/finance-stock-preuves-controller';

/**
 * Routes des preuves du stock — lot 040, territoire API-4 (bons PDF, procès-
 * verbal d'inventaire, pièces jointes ; spec B4, B5).
 *
 * Monté sur `/api` par `app.ts` (fondations). **Gardes posés AVEC leur
 * chemin** (`authenticate`, `requireTenantAccess`, une garde `STOCK_*`),
 * jamais en `router.use` nu : ce routeur est monté sur `/api` tout entier.
 *
 * `GET /stock/counts/:countId/report.pdf` vit ICI : le segment fixe
 * `report.pdf` empêche toute capture par `GET /stock/counts/:countId` (un
 * paramètre Express ne franchit pas un `/`), quel que soit l'ordre de montage
 * des routeurs.
 *
 * Le dépôt reçoit le fichier en mémoire (forme de `lease-inspection-routes.ts`) :
 * le service vérifie le type sur les OCTETS (jamais le type déclaré), retire
 * l'EXIF puis écrit lui-même sous `uploads/stock/<tenantId>/<aaaa>/`, dossier
 * jamais servi en statique.
 */

const router = Router();

const BASE = '/tenants/:tenantId/finance/stock';
const guard = [authenticate, requireTenantAccess];

// Un octet de plus que la limite : le service rend lui-même le 413 typé pour
// un fichier de 10 Mo + 1 ; multer ne coupe qu'au-delà, pour ne pas lire en
// mémoire un envoi démesuré.
const attachmentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: STOCK_ATTACHMENT_MAX_BYTES + 1, files: 1 }
}).single('file');

/** multer, avec le dépassement de taille traduit en `413 STOCK_ATTACHMENT_TOO_LARGE`. */
function receiveAttachment(req: Request, res: Response, next: NextFunction): void {
  attachmentUpload(req, res, (error: unknown) => {
    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
      next(stockError(413, ErrorCode.STOCK_ATTACHMENT_TOO_LARGE, 'Le fichier dépasse 10 Mo.', { field: 'file' }));
      return;
    }
    next(error as Error | undefined);
  });
}

// ---------------------------------------------------------------------------
// Bons (B4)
// ---------------------------------------------------------------------------

router.get(`${BASE}/slips/:slipId/pdf`, ...guard, requireStockView, getStockSlipPdfHandler);
router.get(`${BASE}/slips/:slipId`, ...guard, requireStockView, getStockSlipHandler);
router.get(`${BASE}/counts/:countId/report.pdf`, ...guard, requireStockView, getStockCountReportPdfHandler);

// ---------------------------------------------------------------------------
// Pièces jointes (B5)
// ---------------------------------------------------------------------------

// Garde de route : l'un des six droits de dépôt ; le service vérifie le droit
// propre à la cible (B5-R6).
router.post(
  `${BASE}/attachments`,
  ...guard,
  requireStockAttachmentDeposit,
  receiveAttachment,
  uploadStockAttachmentHandler
);
router.get(`${BASE}/attachments`, ...guard, requireStockView, listStockAttachmentsHandler);
router.get(`${BASE}/attachments/:attachmentId/file`, ...guard, requireStockView, getStockAttachmentFileHandler);
// Le retrait est ouvert au dépositaire (15 minutes) comme à STOCK_DISPOSE :
// la garde de route exige seulement la lecture, le service tranche (B5-R5).
router.post(`${BASE}/attachments/:attachmentId/remove`, ...guard, requireStockView, removeStockAttachmentHandler);

export default router;
