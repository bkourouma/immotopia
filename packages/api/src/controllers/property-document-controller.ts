import { Request, Response } from 'express';
import { logger } from '../utils/logger';
import { uploadDocument, getDocuments, deleteDocument } from '../services/property-document-service';
import { getTenantIdFromRequest } from '../middleware/tenant-isolation-middleware';
import { PropertyDocumentType } from '@prisma/client';

/**
 * Upload document handler
 */
export async function uploadDocumentHandler(req: Request, res: Response): Promise<void> {
  try {
    const propertyId = req.params.id;
    const userId = req.user?.userId;

    if (!req.file) {
      res.status(400).json({
        success: false,
        error: 'File is required'
      });
      return;
    }

    const documentType = (req.body.documentType || PropertyDocumentType.OTHER) as PropertyDocumentType;
    const expirationDate = req.body.expirationDate ? new Date(req.body.expirationDate) : undefined;
    const isRequired = req.body.isRequired === 'true' || req.body.isRequired === true;

    const document = await uploadDocument(propertyId, req.file, documentType, expirationDate, isRequired, userId);

    res.status(201).json({
      success: true,
      data: document
    });
  } catch (error: any) {
    logger.error('Error uploading document', { error, propertyId: req.params.id });
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to upload document'
    });
  }
}

/**
 * List documents handler
 */
export async function listDocumentsHandler(req: Request, res: Response): Promise<void> {
  try {
    const propertyId = req.params.id;
    const includeExpired = req.query.includeExpired !== 'false';

    const documents = await getDocuments(propertyId, includeExpired);

    res.json({
      success: true,
      data: documents
    });
  } catch (error: any) {
    logger.error('Error listing documents', { error, propertyId: req.params.id });
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to list documents'
    });
  }
}

/**
 * Delete document handler
 */
export async function deleteDocumentHandler(req: Request, res: Response): Promise<void> {
  try {
    const propertyId = req.params.id;
    const documentId = req.params.documentId;
    const userId = req.user?.userId;

    await deleteDocument(propertyId, documentId, userId);

    res.json({
      success: true,
      message: 'Document deleted successfully'
    });
  } catch (error: any) {
    logger.error('Error deleting document', { error, documentId: req.params.documentId });
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to delete document'
    });
  }
}




