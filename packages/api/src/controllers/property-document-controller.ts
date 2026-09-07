import { Request, Response } from 'express';
import { uploadDocument, getDocuments, deleteDocument } from '../services/property-document-service';
import { PropertyDocumentType } from '@prisma/client';
import { asyncHandler, BadRequestError } from '../middleware/error-middleware';

/**
 * Resolve the tenant the caller is authorised for.
 * Set by enforcePropertyTenantIsolation; required to scope every property lookup.
 */
function requireTenantId(req: Request): string {
  const tenantId = req.propertyTenantId || req.tenantContext?.tenantId;
  if (!tenantId) {
    throw new BadRequestError('Contexte tenant requis pour les opérations sur les biens.');
  }
  return tenantId;
}

/**
 * Upload document handler
 */
export const uploadDocumentHandler = asyncHandler(async (req: Request, res: Response) => {
  const propertyId = req.params.id;
  const tenantId = requireTenantId(req);
  const userId = req.user?.userId;

  if (!req.file) {
    throw new BadRequestError('Un fichier est requis.');
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

  res.status(201).json({ success: true, data: document });
});

/**
 * List documents handler
 */
export const listDocumentsHandler = asyncHandler(async (req: Request, res: Response) => {
  const propertyId = req.params.id;
  const tenantId = requireTenantId(req);
  const includeExpired = req.query.includeExpired !== 'false';

  const documents = await getDocuments(propertyId, tenantId, includeExpired);

  res.json({ success: true, data: documents });
});

/**
 * Delete document handler
 */
export const deleteDocumentHandler = asyncHandler(async (req: Request, res: Response) => {
  const propertyId = req.params.id;
  const documentId = req.params.documentId;
  const tenantId = requireTenantId(req);
  const userId = req.user?.userId;

  await deleteDocument(propertyId, tenantId, documentId, userId);

  res.json({ success: true, message: 'Document deleted successfully' });
});
