/**
 * Tenant Portal Controller
 * API endpoints for tenant portal operations
 *
 * Les handlers ne fabriquent plus leurs réponses d'erreur : les services
 * lèvent des erreurs typées (`middleware/error-middleware`) et
 * `errorHandler` répond — 404 pour un objet inconnu ou d'un autre locataire,
 * 400 pour une donnée invalide, et un message neutre (sans chemin de fichier
 * ni `stack`) pour une panne de la base. Voir BUG-2026-11-03-004 et -007.
 */

import { Request, Response } from 'express';
import { RentalInstallmentStatus } from '@prisma/client';
import { TenantPortalService } from '../services/tenant-portal-service';
import {
  addCommentSchema,
  createMaintenanceTicketSchema,
  declarePaymentSchema,
  validateMaintenanceAttachment,
  validatePaymentProofFile
} from '../utils/tenant-portal-validators';
import { handleTenantPortalFinanceStatement } from './finance-controller';
import { parseEnumParam, parseNumberParam } from '../utils/query-params';
import { parsePagination } from '../utils/pagination-helper';
import { asyncHandler, BadRequestError, ForbiddenError } from '../middleware/error-middleware';

/** Contexte du portail locataire posé par `requireTenantPortalAccess`, sinon 403. */
function portalContext(req: Request): { tenantClientId: string; leaseId: string; tenantId: string } {
  if (!req.tenantPortal) {
    throw new ForbiddenError('Accès portail locataire requis.');
  }
  const { tenantClientId, leaseId, tenantId } = req.tenantPortal;
  return { tenantClientId, leaseId, tenantId };
}

function paginationFrom(query: Request['query']): { page?: number; limit?: number } | undefined {
  const { page, limit } = parsePagination(query);
  const pagination: { page?: number; limit?: number } = {};
  if (page !== undefined) {
    pagination.page = page;
  }
  if (limit !== undefined) {
    pagination.limit = limit;
  }
  return Object.keys(pagination).length > 0 ? pagination : undefined;
}

function orUndefined<T extends object>(filters: T): T | undefined {
  return Object.keys(filters).length > 0 ? filters : undefined;
}

export class TenantPortalController {
  private service: TenantPortalService;

  constructor() {
    this.service = new TenantPortalService();
  }

  /**
   * Get dashboard data
   * GET /api/portal/tenant/dashboard
   */
  getDashboard = asyncHandler(async (req, res) => {
    const { tenantClientId, leaseId, tenantId } = portalContext(req);

    const dashboardData = await this.service.getDashboard(tenantClientId, leaseId, tenantId);

    res.status(200).json({
      success: true,
      data: dashboardData
    });
  });

  /**
   * Get lease details
   * GET /api/portal/tenant/lease
   */
  getLeaseDetails = asyncHandler(async (req, res) => {
    const { tenantClientId, leaseId, tenantId } = portalContext(req);

    const leaseDetailsData = await this.service.getLeaseDetails(tenantClientId, leaseId, tenantId);

    res.status(200).json({
      success: true,
      data: leaseDetailsData
    });
  });

  /**
   * Get installments list
   * GET /api/portal/tenant/installments
   */
  getInstallments = asyncHandler(async (req, res) => {
    const { tenantClientId, leaseId, tenantId } = portalContext(req);

    const filters: { status?: string; startDate?: string; endDate?: string } = {};
    const status = parseEnumParam(req.query.status, RentalInstallmentStatus, 'status');
    if (status) {
      filters.status = status;
    }
    if (req.query.startDate) {
      filters.startDate = req.query.startDate as string;
    }
    if (req.query.endDate) {
      filters.endDate = req.query.endDate as string;
    }

    const installmentsData = await this.service.getInstallments(
      tenantClientId,
      leaseId,
      tenantId,
      orUndefined(filters),
      paginationFrom(req.query)
    );

    res.status(200).json({
      success: true,
      data: installmentsData
    });
  });

  /**
   * Get installment details
   * GET /api/portal/tenant/installments/:id
   */
  getInstallmentDetails = asyncHandler(async (req, res) => {
    const { tenantClientId, leaseId, tenantId } = portalContext(req);

    const installmentDetailsData = await this.service.getInstallmentDetails(
      tenantClientId,
      leaseId,
      tenantId,
      req.params.id
    );

    res.status(200).json({
      success: true,
      data: installmentDetailsData
    });
  });

  /**
   * Declare payment
   * POST /api/portal/tenant/payments/declare
   */
  declarePayment = asyncHandler(async (req, res) => {
    const { tenantClientId, leaseId, tenantId } = portalContext(req);
    const body = req.body ?? {};

    // Un `ZodError` remonte à `errorHandler` : 400 avec le détail par champ.
    const data = declarePaymentSchema.parse({
      amount: parseNumberParam(body.amount, 'amount'),
      paymentDate: body.paymentDate,
      paymentMethod: body.paymentMethod,
      transactionPhone: body.transactionPhone,
      mobileOperator: body.mobileOperator,
      reference: body.reference,
      installmentId: body.installmentId,
      notes: body.notes
    });

    const fileValidation = validatePaymentProofFile(req.file);
    if (!fileValidation.valid) {
      throw new BadRequestError(fileValidation.error || 'Fichier invalide.');
    }

    const paymentDeclaration = await this.service.declarePayment(tenantClientId, leaseId, tenantId, data, req.file);

    res.status(201).json({
      success: true,
      message: 'Déclaration de paiement créée avec succès.',
      data: paymentDeclaration
    });
  });

  /**
   * Get payment history
   * GET /api/portal/tenant/payments
   */
  getPaymentHistory = asyncHandler(async (req, res) => {
    const { tenantClientId, leaseId, tenantId } = portalContext(req);

    const filters: { startDate?: string; endDate?: string; method?: string } = {};
    if (req.query.startDate) {
      filters.startDate = req.query.startDate as string;
    }
    if (req.query.endDate) {
      filters.endDate = req.query.endDate as string;
    }
    if (req.query.method) {
      filters.method = req.query.method as string;
    }

    const paymentHistoryData = await this.service.getPaymentHistory(
      tenantClientId,
      leaseId,
      tenantId,
      orUndefined(filters),
      paginationFrom(req.query)
    );

    res.status(200).json({
      success: true,
      data: paymentHistoryData
    });
  });

  /**
   * Get deposit information
   * GET /api/portal/tenant/deposit
   */
  getDepositInfo = asyncHandler(async (req, res) => {
    const { tenantClientId, leaseId, tenantId } = portalContext(req);

    const depositInfoData = await this.service.getDepositInfo(tenantClientId, leaseId, tenantId);

    res.status(200).json({
      success: true,
      data: depositInfoData
    });
  });

  /**
   * Create maintenance ticket
   * POST /api/portal/tenant/maintenance
   */
  createMaintenanceTicket = asyncHandler(async (req, res) => {
    const { tenantClientId, leaseId, tenantId } = portalContext(req);
    const body = req.body ?? {};

    const data = createMaintenanceTicketSchema.parse({
      category: body.category,
      priority: body.priority,
      title: body.title,
      description: body.description
    });

    const files = req.files as Express.Multer.File[] | undefined;
    for (const file of files ?? []) {
      const fileValidation = validateMaintenanceAttachment(file);
      if (!fileValidation.valid) {
        throw new BadRequestError(fileValidation.error || 'Fichier invalide.');
      }
    }

    const ticket = await this.service.createMaintenanceTicket(
      tenantClientId,
      leaseId,
      tenantId,
      {
        ...data,
        locationDetails: body.locationDetails
      },
      files
    );

    res.status(201).json({
      success: true,
      message: 'Ticket de maintenance créé avec succès.',
      data: ticket
    });
  });

  /**
   * Get maintenance tickets
   * GET /api/portal/tenant/maintenance
   */
  getMaintenanceTickets = asyncHandler(async (req, res) => {
    const { tenantClientId, leaseId, tenantId } = portalContext(req);

    const filters: { status?: string } = {};
    if (req.query.status) {
      filters.status = req.query.status as string;
    }

    const ticketsData = await this.service.getMaintenanceTickets(
      tenantClientId,
      leaseId,
      tenantId,
      orUndefined(filters),
      paginationFrom(req.query)
    );

    res.status(200).json({
      success: true,
      data: ticketsData
    });
  });

  /**
   * Get maintenance ticket details
   * GET /api/portal/tenant/maintenance/:id
   */
  getMaintenanceTicketDetails = asyncHandler(async (req, res) => {
    const { tenantClientId, leaseId, tenantId } = portalContext(req);

    const ticketDetails = await this.service.getMaintenanceTicketDetails(
      tenantClientId,
      leaseId,
      tenantId,
      req.params.id
    );

    res.status(200).json({
      success: true,
      data: ticketDetails
    });
  });

  /**
   * Add comment to maintenance ticket
   * POST /api/portal/tenant/maintenance/:id/comment
   */
  addTicketComment = asyncHandler(async (req, res) => {
    const { tenantClientId, leaseId, tenantId } = portalContext(req);

    const { comment: text } = addCommentSchema.parse({ comment: req.body?.comment });

    const comment = await this.service.addTicketComment(tenantClientId, leaseId, tenantId, req.params.id, text);

    res.status(201).json({
      success: true,
      message: 'Commentaire ajouté avec succès.',
      data: comment
    });
  });

  /**
   * Get documents
   * GET /api/portal/tenant/documents
   */
  getDocuments = asyncHandler(async (req, res) => {
    const { tenantClientId, leaseId, tenantId } = portalContext(req);

    const filters: { type?: string } = {};
    if (req.query.type) {
      filters.type = req.query.type as string;
    }

    const documentsData = await this.service.getDocuments(tenantClientId, leaseId, tenantId, orUndefined(filters));

    res.status(200).json({
      success: true,
      data: documentsData
    });
  });

  /**
   * Download document
   * GET /api/portal/tenant/documents/:id/download
   */
  downloadDocument = asyncHandler(async (req, res) => {
    const { tenantClientId, leaseId, tenantId } = portalContext(req);

    const { buffer, fileName, mimeType } = await this.service.downloadDocument(
      tenantClientId,
      leaseId,
      tenantId,
      req.params.id
    );

    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.send(buffer);
  });

  /**
   * Solde et relevé financier du locataire connecté (lecture seule).
   * GET /api/portal/tenant/finance/statement
   *
   * **Aucun identifiant de compte n'est reçu ni accepté** : c'est ce qui
   * garantit qu'un locataire ne peut jamais lire le relevé d'un autre, quel
   * que soit ce qu'il tente de passer en requête. Le compte de tiers est
   * résolu depuis la session (`req.tenantPortal.tenantClientId`), exactement
   * comme le font déjà `getLeaseDetails` et `getPaymentHistory` ci-dessus —
   * jamais depuis un paramètre fourni par l'appelant.
   *
   * La logique vit dans `finance-controller.ts`
   * (`handleTenantPortalFinanceStatement`), pas ici : c'est le même code qui
   * résout le compte de tiers et calcule le relevé pour la route agence,
   * réutilisé tel quel pour que le locataire voie exactement ce que verrait
   * la gestionnaire pour son compte (US6, scénario 1).
   */
  getFinanceStatement = (req: Request, res: Response): Promise<void> => handleTenantPortalFinanceStatement(req, res);
}
