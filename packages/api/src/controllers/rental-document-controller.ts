import { Request, Response } from 'express';
import { z } from 'zod';
import {
  generateDocument,
  updateDocumentStatus,
  getDocumentById,
  listDocuments,
  toRentalDocumentDto
} from '../services/rental-document-service';
import { RentalDocumentType, RentalDocumentStatus } from '@prisma/client';
import { parsePagination } from '../utils/pagination-helper';
import { asyncHandler, NotFoundError, UnauthorizedError } from '../middleware/error-middleware';
import { t } from '../i18n';
import { getTenantIdFromRequest } from '../middleware/tenant-isolation-middleware';

const generateDocumentSchema = z.object({
  type: z.enum([
    'LEASE_CONTRACT',
    'LEASE_ADDENDUM',
    'RENT_RECEIPT',
    'RENT_QUITTANCE',
    'DEPOSIT_RECEIPT',
    'STATEMENT',
    'OTHER'
  ]),
  leaseId: z.string().uuid().optional(),
  installmentId: z.string().uuid().optional(),
  paymentId: z.string().uuid().optional(),
  title: z.string().optional(),
  description: z.string().optional()
});

const updateDocumentStatusSchema = z.object({
  status: z.enum(['DRAFT', 'FINAL', 'VOID'])
});

/**
 * Generate a document
 * POST /tenants/:tenantId/rental/documents
 */
export const generateDocumentHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantIdFromRequest(req);
  const actorUserId = req.user?.userId;

  if (!actorUserId) {
    throw new UnauthorizedError('Non authentifié');
  }

  const validatedData = generateDocumentSchema.parse(req.body);

  const document = await generateDocument(
    tenantId,
    validatedData.type as RentalDocumentType,
    validatedData.leaseId,
    validatedData.installmentId,
    validatedData.paymentId,
    validatedData.title,
    validatedData.description,
    actorUserId
  );

  res.status(201).json({
    success: true,
    data: toRentalDocumentDto(document),
    message: t('Document {{number}} généré avec succès', { number: document.document_number ?? '' })
  });
});

/**
 * Get document by ID
 * GET /tenants/:tenantId/rental/documents/:documentId
 */
export const getDocumentHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantIdFromRequest(req);
  const { documentId } = req.params;

  const document = await getDocumentById(tenantId, documentId);

  if (!document) {
    throw new NotFoundError('Document non trouvé');
  }

  res.json({
    success: true,
    data: toRentalDocumentDto(document)
  });
});

/**
 * List documents
 * GET /tenants/:tenantId/rental/documents
 */
export const listDocumentsHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantIdFromRequest(req);
  const { type, status, leaseId, installmentId, paymentId } = req.query;

  const filters: any = {};
  if (type) {
    filters.type = type as RentalDocumentType;
  }
  if (status) {
    filters.status = status as RentalDocumentStatus;
  }
  if (leaseId) {
    filters.leaseId = leaseId as string;
  }
  if (installmentId) {
    filters.installmentId = installmentId as string;
  }
  if (paymentId) {
    filters.paymentId = paymentId as string;
  }

  // Un 400 de parsePagination reste un 400 (plus converti en 500).
  const { page, limit } = parsePagination(req.query);

  const result = await listDocuments(tenantId, filters, { page, limit });

  res.json({
    success: true,
    ...result,
    data: result.data.map(toRentalDocumentDto)
  });
});

/**
 * Update document status
 * PATCH /tenants/:tenantId/rental/documents/:documentId
 */
export const updateDocumentStatusHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantIdFromRequest(req);
  const { documentId } = req.params;
  const actorUserId = req.user?.userId;

  if (!actorUserId) {
    throw new UnauthorizedError('Non authentifié');
  }

  const validatedData = updateDocumentStatusSchema.parse(req.body);

  const document = await updateDocumentStatus(
    tenantId,
    documentId,
    validatedData.status as RentalDocumentStatus,
    actorUserId
  );

  res.json({
    success: true,
    data: toRentalDocumentDto(document)
  });
});
