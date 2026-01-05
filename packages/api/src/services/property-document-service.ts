import { prisma } from '../utils/database';
import { logger } from '../utils/logger';
import { logAuditEvent } from './audit-service';
import { PROPERTY_ENTITY_TYPES } from '../types/audit-types';
import { AuditActionKey } from '../types/audit-types';
import { PropertyDocumentType } from '@prisma/client';
import * as path from 'path';
import * as fs from 'fs/promises';

/**
 * Validate document type
 * @param documentType - Document type to validate
 * @returns True if valid
 */
export function validateDocumentType(documentType: string): boolean {
  return Object.values(PropertyDocumentType).includes(documentType as PropertyDocumentType);
}

/**
 * Get allowed file types for document type
 * @param documentType - Document type
 * @returns Array of allowed MIME types
 */
export function getAllowedFileTypes(documentType: PropertyDocumentType): string[] {
  // All documents accept PDF and common document formats
  const commonTypes = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/jpeg',
    'image/png'
  ];

  // Some document types may have specific requirements
  if (documentType === PropertyDocumentType.PLAN) {
    return [...commonTypes, 'image/tiff', 'application/dwg'];
  }

  return commonTypes;
}

/**
 * Upload document for a property
 * @param propertyId - Property ID
 * @param file - Uploaded file (from multer)
 * @param documentType - Type of document
 * @param expirationDate - Expiration date (optional)
 * @param isRequired - Whether document is required (optional)
 * @param actorUserId - User uploading the document (for audit)
 * @returns Created document record
 */
export async function uploadDocument(
  propertyId: string,
  file: Express.Multer.File,
  documentType: PropertyDocumentType,
  expirationDate?: Date,
  isRequired?: boolean,
  actorUserId?: string
) {
  // Verify property exists
  const property = await prisma.property.findUnique({
    where: { id: propertyId }
  });

  if (!property) {
    throw new Error('Property not found');
  }

  // Validate document type
  if (!validateDocumentType(documentType)) {
    throw new Error(`Invalid document type: ${documentType}`);
  }

  // Validate file type
  const allowedTypes = getAllowedFileTypes(documentType);
  if (!file.mimetype || !allowedTypes.includes(file.mimetype)) {
    throw new Error(`Invalid file type for ${documentType}. Allowed: ${allowedTypes.join(', ')}`);
  }

  // Generate file path
  // When running from packages/api, process.cwd() is packages/api, so go up one level
  // When running from project root, process.cwd() is already the project root
  const cwd = process.cwd();
  const projectRoot =
    path.basename(cwd) === 'api' && path.basename(path.dirname(cwd)) === 'packages' ? path.resolve(cwd, '..') : cwd;
  const uploadDir = path.join(projectRoot, 'uploads', 'properties', propertyId, 'documents');
  await fs.mkdir(uploadDir, { recursive: true });

  const fileExtension = path.extname(file.originalname);
  const fileName = `${documentType}-${Date.now()}-${Math.random().toString(36).substring(7)}${fileExtension}`;
  const filePath = path.join(uploadDir, fileName);

  // Save file
  await fs.writeFile(filePath, file.buffer);

  // Calculate validity
  const isValid = expirationDate ? expirationDate > new Date() : true;

  // Create document record
  const document = await prisma.propertyDocument.create({
    data: {
      propertyId,
      documentType,
      filePath: filePath,
      fileUrl: `/uploads/properties/${propertyId}/documents/${fileName}`,
      fileName: file.originalname,
      fileSize: file.size,
      mimeType: file.mimetype,
      expirationDate: expirationDate || null,
      isRequired: isRequired || false,
      isValid
    }
  });

  logger.info('Property document uploaded', {
    documentId: document.id,
    propertyId,
    documentType,
    fileName: file.originalname,
    expirationDate
  });

  // Audit log
  if (actorUserId) {
    logAuditEvent({
      actorUserId,
      tenantId: property.tenantId || null,
      actionKey: AuditActionKey.PROPERTY_DOCUMENT_UPLOADED,
      entityType: PROPERTY_ENTITY_TYPES.PROPERTY_DOCUMENT,
      entityId: document.id,
      payload: {
        propertyId,
        documentType,
        fileName: file.originalname,
        expirationDate
      }
    });
  }

  return document;
}

/**
 * Get documents for a property
 * @param propertyId - Property ID
 * @param includeExpired - Whether to include expired documents (default: true)
 * @returns List of documents
 */
export async function getDocuments(propertyId: string, includeExpired: boolean = true) {
  const where: any = { propertyId };

  if (!includeExpired) {
    where.OR = [{ expirationDate: null }, { expirationDate: { gt: new Date() } }];
  }

  const documents = await prisma.propertyDocument.findMany({
    where,
    orderBy: [{ isRequired: 'desc' }, { createdAt: 'desc' }]
  });

  return documents;
}

/**
 * Delete document
 * @param propertyId - Property ID
 * @param documentId - Document ID to delete
 * @param actorUserId - User deleting the document (for audit)
 */
export async function deleteDocument(propertyId: string, documentId: string, actorUserId?: string) {
  // Get document with property
  const document = await prisma.propertyDocument.findFirst({
    where: {
      id: documentId,
      propertyId
    },
    include: {
      property: true
    }
  });

  if (!document) {
    throw new Error('Document not found or does not belong to property');
  }

  // Delete file from filesystem
  try {
    if (document.filePath) {
      await fs.unlink(document.filePath);
    }
  } catch (error) {
    logger.warn('Failed to delete document file', { filePath: document.filePath, error });
    // Continue with database deletion even if file deletion fails
  }

  // Delete document record
  await prisma.propertyDocument.delete({
    where: { id: documentId }
  });

  logger.info('Property document deleted', {
    documentId,
    propertyId
  });

  return { success: true };
}
