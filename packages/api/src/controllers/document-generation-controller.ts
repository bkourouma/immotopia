import { Request, Response } from 'express';
import { z } from 'zod';
import {
  generateDocument,
  regenerateDocument,
  getDocumentFile
} from '../services/document-generation-service';
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

    const document = await regenerateDocument(
      tenantId,
      id,
      templateId,
      actorUserId
    );

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
  try {
    const tenantId = req.tenantContext?.tenantId;
    const { id } = req.params;

    if (!tenantId) {
      res.status(400).json({
        success: false,
        message: 'Tenant ID is required'
      });
      return;
    }

    // Get document info first to verify it exists and get filename
    const { prisma } = await import('../utils/database');
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
      res.status(404).json({
        success: false,
        message: 'Document not found'
      });
      return;
    }

    if (!document.file_path) {
      res.status(404).json({
        success: false,
        message: 'Document file not found'
      });
      return;
    }

    // Get file buffer
    const buffer = await getDocumentFile(tenantId, id);

    const filename = document.document_number
      ? `${document.document_number}.docx`
      : `document_${id}.docx`;

    // Set headers for file download
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
    res.setHeader('Content-Length', buffer.length.toString());
    
    // Send file
    res.send(buffer);
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


