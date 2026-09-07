import { Request, Response } from 'express';
import { getTenantIdFromRequest } from '../middleware/tenant-isolation-middleware';
import { uploadAttachment, downloadAttachment } from '../services/maintenance-attachment-service';

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
 * Download attachment
 * GET /tenants/:tenantId/maintenance/files/:attachmentId
 */
export async function downloadAttachmentHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = getTenantIdFromRequest(req);
    const { attachmentId } = req.params;
    const actorContactId = req.query.tenantContactId as string | undefined;

    const { stream, metadata } = await downloadAttachment(tenantId, attachmentId, actorContactId);

    // Set response headers
    res.setHeader('Content-Type', metadata.mimeType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${metadata.fileName}"`);
    res.setHeader('Content-Length', metadata.fileSize?.toString() || '0');

    // Stream file to response
    stream.pipe(res);
  } catch (error) {
    console.error('Error downloading attachment:', error);
    if (error instanceof Error) {
      if (error.message.includes('introuvable')) {
        res.status(404).json({
          success: false,
          error: 'Not Found',
          message: error.message
        });
        return;
      }
      if (error.message.includes('non autorisé')) {
        res.status(403).json({
          success: false,
          error: 'Forbidden',
          message: error.message
        });
        return;
      }
    }
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: 'Échec du téléchargement de la pièce jointe'
    });
  }
}
