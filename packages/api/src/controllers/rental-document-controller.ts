import { Request, Response } from 'express';
import { z } from 'zod';
import {
  generateDocument,
  updateDocumentStatus,
  getDocumentById,
  listDocuments
} from '../services/rental-document-service';
import { RentalDocumentType, RentalDocumentStatus } from '@prisma/client';

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
 * Get document by ID
 * GET /tenants/:tenantId/rental/documents/:documentId
 */
export async function getDocumentHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = req.tenantContext?.tenantId;
    const { documentId } = req.params;

    const document = await getDocumentById(tenantId, documentId);

    if (!document) {
      res.status(404).json({
        success: false,
        message: 'Document non trouvé'
      });
      return;
    }

    res.json({
      success: true,
      data: document
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération du document'
    });
  }
}

/**
 * List documents
 * GET /tenants/:tenantId/rental/documents
 */
export async function listDocumentsHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = req.tenantContext?.tenantId;
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

    const page = req.query.page ? parseInt(req.query.page as string, 10) : undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;

    const result = await listDocuments(tenantId, filters, { page, limit });

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des documents'
    });
  }
}

/**
 * Update document status
 * PATCH /tenants/:tenantId/rental/documents/:documentId
 */
export async function updateDocumentStatusHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = req.tenantContext?.tenantId;
    const { documentId } = req.params;
    const actorUserId = req.user?.userId;

    if (!actorUserId) {
      res.status(401).json({
        success: false,
        message: 'Non authentifié'
      });
      return;
    }

    // Validate request body
    const validatedData = updateDocumentStatusSchema.parse(req.body);

    const document = await updateDocumentStatus(
      tenantId,
      documentId,
      validatedData.status as RentalDocumentStatus,
      actorUserId
    );

    res.json({
      success: true,
      data: document
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
      message: 'Erreur lors de la mise à jour du statut du document'
    });
  }
}
