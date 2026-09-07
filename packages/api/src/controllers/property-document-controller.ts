import { Request, Response } from 'express';
import { logger } from '../utils/logger';
import { uploadDocument, getDocuments, deleteDocument } from '../services/property-document-service';
import { PropertyDocumentType } from '@prisma/client';

/**
 * Resolve the tenant the caller is authorised for.
 * Set by enforcePropertyTenantIsolation; required to scope every property lookup.
 */
function getTenantId(req: Request): string | undefined {
  return req.propertyTenantId || req.tenantContext?.tenantId;
}

/**
 * Upload document handler
 */
export async function uploadDocumentHandler(req: Request, res: Response): Promise<void> {
  try {
    const propertyId = req.params.id;
    const tenantId = getTenantId(req);
    const userId = req.user?.userId;

    if (!tenantId) {
      res.status(400).json({
        success: false,
        error: 'Tenant context required for property operations'
      });
      return;
    }

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

    const document = await uploadDocument(
      propertyId,
      tenantId,
      req.file,
      documentType,
      expirationDate,
      isRequired,
      userId
    );

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
    const tenantId = getTenantId(req);
    const includeExpired = req.query.includeExpired !== 'false';

    if (!tenantId) {
      res.status(400).json({
        success: false,
        error: 'Tenant context required for property operations'
      });
      return;
    }

    const documents = await getDocuments(propertyId, tenantId, includeExpired);

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
    const tenantId = getTenantId(req);
    const userId = req.user?.userId;

    if (!tenantId) {
      res.status(400).json({
        success: false,
        error: 'Tenant context required for property operations'
      });
      return;
    }

    await deleteDocument(propertyId, tenantId, documentId, userId);

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
