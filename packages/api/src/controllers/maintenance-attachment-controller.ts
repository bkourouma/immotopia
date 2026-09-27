import { Request, Response } from 'express';
import { getTenantIdFromRequest } from '../middleware/tenant-isolation-middleware';
import { asyncHandler, ForbiddenError } from '../middleware/error-middleware';
import { uploadAttachment } from '../services/maintenance-attachment-service';
import {
  getMaintenanceAttachmentFileForOwnerPortal,
  getMaintenanceAttachmentFileForTenant,
  getMaintenanceAttachmentFileForTenantPortal,
  type MaintenanceAttachmentFile
} from '../lib/maintenance/attachment-files';

/**
 * Upload attachment for a ticket
 * POST /tenants/:tenantId/maintenance/tenant/tickets/:ticketId/attachments
 */
export async function uploadAttachmentHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = getTenantIdFromRequest(req);
    const { ticketId } = req.params;
    const actorUserId = req.user?.userId;
    const actorContactId = req.body.tenantContactId || (req.query.tenantContactId as string | undefined);

    if (!req.file) {
      res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'Aucun fichier fourni'
      });
      return;
    }

    const attachment = await uploadAttachment(tenantId, ticketId, req.file, actorUserId, actorContactId);

    res.status(201).json({
      success: true,
      data: attachment
    });
  } catch (error) {
    console.error('Error uploading attachment:', error);
    if (error instanceof Error) {
      if (error.message.includes('introuvable')) {
        res.status(404).json({
          success: false,
          error: 'Not Found',
          message: error.message
        });
        return;
      }
      if (
        error.message.includes('invalide') ||
        error.message.includes('trop volumineux') ||
        error.message.includes('maximum')
      ) {
        res.status(400).json({
          success: false,
          error: 'Bad Request',
          message: error.message
        });
        return;
      }
    }
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: "Échec de l'upload de la pièce jointe"
    });
  }
}

/**
 * Réponse fichier commune aux trois routes de téléchargement — même forme que
 * `.../syndics/:syndicId/documents/:documentId/fichier`. Le fichier n'est
 * jamais servi en statique (lib/maintenance/attachment-files.ts).
 */
function sendAttachmentFile(res: Response, file: MaintenanceAttachmentFile): void {
  res.setHeader('Content-Type', file.mimeType);
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(file.fileName)}`);
  res.setHeader('Content-Length', file.buffer.length.toString());
  res.setHeader('Cache-Control', 'private, no-store');
  res.send(file.buffer);
}

/**
 * Gestion : GET /tenants/:tenantId/maintenance/files/:attachmentId
 *
 * `requireTenantAccess` + permission maintenance (voir maintenance-routes.ts) ;
 * la pièce doit appartenir à l'agence, sinon 404. Le paramètre
 * `tenantContactId` que lisait l'ancienne version n'est plus lu : fourni par
 * l'appelant, il ne pouvait que restreindre, jamais protéger.
 */
export const downloadAttachmentHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantIdFromRequest(req);
  const file = await getMaintenanceAttachmentFileForTenant(tenantId, req.params.attachmentId);
  sendAttachmentFile(res, file);
});

/**
 * Portail locataire : GET /portal/tenant/maintenance/:id/attachments/:attachmentId
 *
 * Le périmètre vient de la garde (`requireTenantPortalAccess`), jamais de la
 * requête : seulement les pièces d'un ticket visible dans CE portail.
 */
export const downloadTenantPortalAttachmentHandler = asyncHandler(async (req: Request, res: Response) => {
  if (!req.tenantPortal) {
    throw new ForbiddenError('Accès portail locataire refusé.');
  }
  const { tenantId, tenantClientId } = req.tenantPortal;
  const file = await getMaintenanceAttachmentFileForTenantPortal(
    { tenantId, tenantClientId },
    req.params.id,
    req.params.attachmentId
  );
  sendAttachmentFile(res, file);
});

/**
 * Portail propriétaire : GET /portal/owner/maintenance/:id/attachments/:attachmentId
 *
 * Seulement les pièces d'un ticket portant sur un bien du propriétaire
 * connecté, dans l'agence résolue par `requireOwnerPortalAccess`.
 */
export const downloadOwnerPortalAttachmentHandler = asyncHandler(async (req: Request, res: Response) => {
  if (!req.ownerPortal) {
    throw new ForbiddenError('Accès portail propriétaire requis.');
  }
  const { tenantId, propertyIds } = req.ownerPortal;
  const file = await getMaintenanceAttachmentFileForOwnerPortal(
    { tenantId, propertyIds },
    req.params.id,
    req.params.attachmentId
  );
  sendAttachmentFile(res, file);
});
