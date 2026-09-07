import { Request, Response } from 'express';
import { z } from 'zod';
import { generateDocument, regenerateDocument, getDocumentFile } from '../services/document-generation-service';
import { DocumentType } from '@prisma/client';

const generateDocumentSchema = z.object({
  docType: z.enum(['LEASE_HABITATION', 'LEASE_COMMERCIAL', 'RENT_RECEIPT', 'RENT_STATEMENT']),
  sourceKey: z.string().uuid(), // leaseId or paymentId
  templateId: z.string().uuid().optional(),
  installmentId: z.string().uuid().optional(),
  startDate: z.string().optional(), // For RENT_STATEMENT
  endDate: z.string().optional() // For RENT_STATEMENT
});

/**
 * Generate a document
 * POST /api/v1/documents/generate
 */
export async function generateDocumentHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = req.tenantContext?.tenantId;
    const actorUserId = req.user?.userId;

    if (!actorUserId) {
      res.status(401).json({
        success: false,
        message: 'Non authentifié'
      });
      return;
    }

    // Validate request body
    const validatedData = generateDocumentSchema.parse(req.body);

    // Prepare additional params
    const additionalParams: any = {};
    if (validatedData.installmentId) {
      additionalParams.installmentId = validatedData.installmentId;
    }
    if (validatedData.startDate && validatedData.endDate) {
      additionalParams.startDate = new Date(validatedData.startDate);
      additionalParams.endDate = new Date(validatedData.endDate);
    }

    const document = await generateDocument(
      tenantId,
      validatedData.docType as DocumentType,
      validatedData.sourceKey,
      validatedData.templateId,
      Object.keys(additionalParams).length > 0 ? additionalParams : undefined,
      actorUserId
    );

    res.status(201).json({
      success: true,
      data: document,
      message: `Document ${document.document_number} généré avec succès`
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        success: false,
        message: 'Données invalides',
        errors: error.errors
      });
      return;
    }

    if (error instanceof Error) {
      // Provide helpful guidance for template-related errors
      if (error.message.includes('Aucun template disponible')) {
        res.status(400).json({
          success: false,
          message: error.message,
          help: `Aucun template n'est configuré pour le type de document "${validatedData?.docType || 'inconnu'}". Veuillez d'abord uploader un template via l'interface de gestion des templates ou l'API.`,
          action: 'upload_template',
          docType: validatedData?.docType
        });
        return;
      }

      res.status(400).json({
        success: false,
        message: error.message
      });
      return;
    }

    res.status(500).json({
      success: false,
      message: 'Erreur lors de la génération du document'
    });
  }
}

/**
 * Regenerate a document
 * POST /api/v1/documents/:id/regenerate
 */
export async function regenerateDocumentHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = req.tenantContext?.tenantId;
    const { id } = req.params;
    const actorUserId = req.user?.userId;

    if (!actorUserId) {
      res.status(401).json({
        success: false,
        message: 'Non authentifié'
      });
      return;
    }

    const { templateId } = req.body;

    const document = await regenerateDocument(tenantId, id, templateId, actorUserId);

    res.json({
      success: true,
      data: document,
      message: `Document régénéré avec succès (révision ${document.revision})`
    });
  } catch (error) {
    if (error instanceof Error) {
      res.status(400).json({
        success: false,
        message: error.message
      });
      return;
    }

    res.status(500).json({
      success: false,
      message: 'Erreur lors de la régénération du document'
    });
  }
}

/**
 * Download document file
 * GET /api/tenants/:tenantId/documents/:id/download
 */
export async function downloadDocumentHandler(req: Request, res: Response): Promise<void> {
  const logger = (await import('../utils/logger')).logger;

  try {
    const tenantId = req.tenantContext?.tenantId;
    const { id } = req.params;

    logger.info('downloadDocumentHandler: Starting download', {
      tenantId,
      documentId: id,
      userAgent: req.get('user-agent'),
      referer: req.get('referer')
    });

    if (!tenantId) {
      logger.warn('downloadDocumentHandler: No tenant ID', { documentId: id });
      res.status(400).json({
        success: false,
        message: 'Tenant ID is required'
      });
      return;
    }

    // Get document info first to verify it exists and get filename
    const { prisma } = await import('../utils/database');
    logger.info('downloadDocumentHandler: Fetching document from database', {
      tenantId,
      documentId: id
    });

    const document = await prisma.rentalDocument.findFirst({
      where: {
        id,
        tenant_id: tenantId
      },
      select: {
        id: true,
        document_number: true,
        file_path: true,
        tenant_id: true
      }
    });

    if (!document) {
      logger.warn('downloadDocumentHandler: Document not found', {
        tenantId,
        documentId: id
      });
      res.status(404).json({
        success: false,
        message: 'Document not found'
      });
      return;
    }

    logger.info('downloadDocumentHandler: Document found', {
      documentId: document.id,
      documentNumber: document.document_number,
      filePath: document.file_path,
      hasFilePath: !!document.file_path
    });

    if (!document.file_path) {
      logger.warn('downloadDocumentHandler: Document file path is missing', {
        documentId: document.id,
        documentNumber: document.document_number
      });
      res.status(404).json({
        success: false,
        message: 'Document file not found'
      });
      return;
    }

    // Get file buffer
    logger.info('downloadDocumentHandler: Getting file buffer', {
      tenantId,
      documentId: id,
      filePath: document.file_path
    });

    const buffer = await getDocumentFile(tenantId, id);

    logger.info('downloadDocumentHandler: File buffer retrieved', {
      documentId: id,
      bufferSize: buffer.length
    });

    const filename = document.document_number ? `${document.document_number}.docx` : `document_${id}.docx`;

    logger.info('downloadDocumentHandler: Sending file', {
      documentId: id,
      filename,
      bufferSize: buffer.length
    });

    // Set headers for file download
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
    res.setHeader('Content-Length', buffer.length.toString());

    // Send file
    res.send(buffer);

    logger.info('downloadDocumentHandler: File sent successfully', {
      documentId: id,
      filename
    });
  } catch (error) {
    const logger = (await import('../utils/logger')).logger;
    logger.error('Error downloading document', {
      error: error instanceof Error ? error.message : error,
      stack: error instanceof Error ? error.stack : undefined,
      documentId: req.params.id,
      tenantId: req.tenantContext?.tenantId
    });

    if (error instanceof Error) {
      res.status(400).json({
        success: false,
        message: error.message
      });
      return;
    }

    res.status(500).json({
      success: false,
      message: 'Erreur lors du téléchargement du document'
    });
  }
}
