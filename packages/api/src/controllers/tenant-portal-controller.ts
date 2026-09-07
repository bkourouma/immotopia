/**
 * Tenant Portal Controller
 * API endpoints for tenant portal operations
 */

import { Request, Response } from 'express';
import { TenantPortalService } from '../services/tenant-portal-service';
import {
  addCommentSchema,
  createMaintenanceTicketSchema,
  declarePaymentSchema,
  validateMaintenanceAttachment,
  validatePaymentProofFile
} from '../utils/tenant-portal-validators';

export class TenantPortalController {
  private service: TenantPortalService;

  constructor() {
    this.service = new TenantPortalService();
  }

  /**
   * Get dashboard data
   * GET /api/portal/tenant/dashboard
   */
  async getDashboard(req: Request, res: Response): Promise<void> {
    try {
      if (!req.tenantPortal) {
        res.status(403).json({
          success: false,
          message: 'Accès portail locataire requis.'
        });
        return;
      }

      const { tenantClientId, leaseId, tenantId } = req.tenantPortal;

      const dashboardData = await this.service.getDashboard(tenantClientId, leaseId, tenantId);

      res.status(200).json({
        success: true,
        data: dashboardData
      });
    } catch (error: any) {
      const statusCode = error.statusCode || 500;
      const message = error.message || 'Erreur lors de la récupération du tableau de bord.';

      res.status(statusCode).json({
        success: false,
        message,
        ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
      });
    }
  }

  /**
   * Get lease details
   * GET /api/portal/tenant/lease
   */
  async getLeaseDetails(req: Request, res: Response): Promise<void> {
    try {
      if (!req.tenantPortal) {
        res.status(403).json({
          success: false,
          message: 'Accès portail locataire requis.'
        });
        return;
      }

      const { tenantClientId, leaseId, tenantId } = req.tenantPortal;

      const leaseDetailsData = await this.service.getLeaseDetails(tenantClientId, leaseId, tenantId);

      res.status(200).json({
        success: true,
        data: leaseDetailsData
      });
    } catch (error: any) {
      const statusCode = error.statusCode || 500;
      const message = error.message || 'Erreur lors de la récupération des détails du bail.';

      res.status(statusCode).json({
        success: false,
        message,
        ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
      });
    }
  }

  /**
   * Get installments list
   * GET /api/portal/tenant/installments
   */
  async getInstallments(req: Request, res: Response): Promise<void> {
    try {
      if (!req.tenantPortal) {
        res.status(403).json({
          success: false,
          message: 'Accès portail locataire requis.'
        });
        return;
      }

      const { tenantClientId, leaseId, tenantId } = req.tenantPortal;

      const filters: any = {};
      if (req.query.status) {
        filters.status = req.query.status as string;
      }
      if (req.query.startDate) {
        filters.startDate = req.query.startDate as string;
      }
      if (req.query.endDate) {
        filters.endDate = req.query.endDate as string;
      }

      const pagination: any = {};
      if (req.query.page) {
        pagination.page = parseInt(req.query.page as string, 10);
      }
      if (req.query.limit) {
        pagination.limit = parseInt(req.query.limit as string, 10);
      }

      const installmentsData = await this.service.getInstallments(
        tenantClientId,
        leaseId,
        tenantId,
        Object.keys(filters).length > 0 ? filters : undefined,
        Object.keys(pagination).length > 0 ? pagination : undefined
      );

      res.status(200).json({
        success: true,
        data: installmentsData
      });
    } catch (error: any) {
      const statusCode = error.statusCode || 500;
      const message = error.message || 'Erreur lors de la récupération des échéances.';

      res.status(statusCode).json({
        success: false,
        message,
        ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
      });
    }
  }

  /**
   * Get installment details
   * GET /api/portal/tenant/installments/:id
   */
  async getInstallmentDetails(req: Request, res: Response): Promise<void> {
    try {
      if (!req.tenantPortal) {
        res.status(403).json({
          success: false,
          message: 'Accès portail locataire requis.'
        });
        return;
      }

      const { tenantClientId, leaseId, tenantId } = req.tenantPortal;
      const installmentId = req.params.id;

      if (!installmentId) {
        res.status(400).json({
          success: false,
          message: "ID d'échéance requis."
        });
        return;
      }

      const installmentDetailsData = await this.service.getInstallmentDetails(
        tenantClientId,
        leaseId,
        tenantId,
        installmentId
      );

      res.status(200).json({
        success: true,
        data: installmentDetailsData
      });
    } catch (error: any) {
      // Check if it's a "not found" error
      const statusCode =
        error.message?.includes('non trouvé') || error.message?.includes('not found') ? 404 : error.statusCode || 500;
      const message = error.message || "Erreur lors de la récupération des détails de l'échéance.";

      res.status(statusCode).json({
        success: false,
        message,
        ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
      });
    }
  }

  /**
   * Declare payment
   * POST /api/portal/tenant/payments/declare
   */
  async declarePayment(req: Request, res: Response): Promise<void> {
    console.log('[DECLARATION] POST /portal/tenant/payments/declare reçu');
    try {
      if (!req.tenantPortal) {
        console.warn('[DECLARATION] Refusé: pas de contexte portail locataire');
        res.status(403).json({
          success: false,
          message: 'Accès portail locataire requis.'
        });
        return;
      }

      const { tenantClientId, leaseId, tenantId } = req.tenantPortal;
      console.log('[DECLARATION] Contexte:', { tenantId, leaseId, tenantClientId });

      // Validate request body
      const validationResult = declarePaymentSchema.safeParse({
        amount: parseFloat(req.body.amount),
        paymentDate: req.body.paymentDate,
        paymentMethod: req.body.paymentMethod,
        transactionPhone: req.body.transactionPhone,
        mobileOperator: req.body.mobileOperator,
        reference: req.body.reference,
        installmentId: req.body.installmentId,
        notes: req.body.notes
      });

      if (!validationResult.success) {
        const errorMessages = validationResult.error.errors
          .map((err: any) => `${err.path.join('.')}: ${err.message}`)
          .join(', ');

        res.status(400).json({
          success: false,
          message: `Données invalides: ${errorMessages}`,
          errors: validationResult.error.errors
        });
        return;
      }

      // Validate file if provided
      const fileValidation = validatePaymentProofFile(req.file);
      if (!fileValidation.valid) {
        res.status(400).json({
          success: false,
          message: fileValidation.error || 'Fichier invalide.'
        });
        return;
      }

      const paymentDeclaration = await this.service.declarePayment(
        tenantClientId,
        leaseId,
        tenantId,
        validationResult.data,
        req.file
      );

      res.status(201).json({
        success: true,
        message: 'Déclaration de paiement créée avec succès.',
        data: paymentDeclaration
      });
    } catch (error: any) {
      console.error('[DECLARATION] Erreur contrôleur:', error?.message, error);
      const statusCode = error.statusCode || 500;
      const message = error.message || 'Erreur lors de la déclaration du paiement.';

      res.status(statusCode).json({
        success: false,
        message,
        ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
      });
    }
  }

  /**
   * Get payment history
   * GET /api/portal/tenant/payments
   */
  async getPaymentHistory(req: Request, res: Response): Promise<void> {
    try {
      if (!req.tenantPortal) {
        res.status(403).json({
          success: false,
          message: 'Accès portail locataire requis.'
        });
        return;
      }

      const { tenantClientId, leaseId, tenantId } = req.tenantPortal;

      const filters: any = {};
      if (req.query.startDate) {
        filters.startDate = req.query.startDate as string;
      }
      if (req.query.endDate) {
        filters.endDate = req.query.endDate as string;
      }
      if (req.query.method) {
        filters.method = req.query.method as string;
      }

      const pagination: any = {};
      if (req.query.page) {
        pagination.page = parseInt(req.query.page as string, 10);
      }
      if (req.query.limit) {
        pagination.limit = parseInt(req.query.limit as string, 10);
      }

      const paymentHistoryData = await this.service.getPaymentHistory(
        tenantClientId,
        leaseId,
        tenantId,
        Object.keys(filters).length > 0 ? filters : undefined,
        Object.keys(pagination).length > 0 ? pagination : undefined
      );

      res.status(200).json({
        success: true,
        data: paymentHistoryData
      });
    } catch (error: any) {
      const statusCode = error.statusCode || 500;
      const message = error.message || "Erreur lors de la récupération de l'historique des paiements.";

      res.status(statusCode).json({
        success: false,
        message,
        ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
      });
    }
  }

  /**
   * Get deposit information
   * GET /api/portal/tenant/deposit
   */
  async getDepositInfo(req: Request, res: Response): Promise<void> {
    try {
      if (!req.tenantPortal) {
        res.status(403).json({
          success: false,
          message: 'Accès portail locataire requis.'
        });
        return;
      }

      const { tenantClientId, leaseId, tenantId } = req.tenantPortal;

      const depositInfoData = await this.service.getDepositInfo(tenantClientId, leaseId, tenantId);

      res.status(200).json({
        success: true,
        data: depositInfoData
      });
    } catch (error: any) {
      const statusCode = error.statusCode || 500;
      const message = error.message || 'Erreur lors de la récupération des informations du dépôt.';

      res.status(statusCode).json({
        success: false,
        message,
        ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
      });
    }
  }

  /**
   * Create maintenance ticket
   * POST /api/portal/tenant/maintenance
   */
  async createMaintenanceTicket(req: Request, res: Response): Promise<void> {
    try {
      if (!req.tenantPortal) {
        res.status(403).json({
          success: false,
          message: 'Accès portail locataire requis.'
        });
        return;
      }

      const { tenantClientId, leaseId, tenantId } = req.tenantPortal;

      // Validate request body
      const validationResult = createMaintenanceTicketSchema.safeParse({
        category: req.body.category,
        priority: req.body.priority,
        title: req.body.title,
        description: req.body.description
      });

      if (!validationResult.success) {
        const errorMessages = validationResult.error.errors
          .map((err: any) => `${err.path.join('.')}: ${err.message}`)
          .join(', ');

        res.status(400).json({
          success: false,
          message: `Données invalides: ${errorMessages}`,
          errors: validationResult.error.errors
        });
        return;
      }

      // Validate files if provided
      const files = req.files as Express.Multer.File[];
      if (files && files.length > 0) {
        for (const file of files) {
          const fileValidation = validateMaintenanceAttachment(file);
          if (!fileValidation.valid) {
            res.status(400).json({
              success: false,
              message: fileValidation.error || 'Fichier invalide.'
            });
            return;
          }
        }
      }

      const ticket = await this.service.createMaintenanceTicket(
        tenantClientId,
        leaseId,
        tenantId,
        {
          ...validationResult.data,
          locationDetails: req.body.locationDetails
        },
        files
      );

      res.status(201).json({
        success: true,
        message: 'Ticket de maintenance créé avec succès.',
        data: ticket
      });
    } catch (error: any) {
      const statusCode = error.statusCode || 500;
      const message = error.message || 'Erreur lors de la création du ticket de maintenance.';

      res.status(statusCode).json({
        success: false,
        message,
        ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
      });
    }
  }

  /**
   * Get maintenance tickets
   * GET /api/portal/tenant/maintenance
   */
  async getMaintenanceTickets(req: Request, res: Response): Promise<void> {
    try {
      if (!req.tenantPortal) {
        res.status(403).json({
          success: false,
          message: 'Accès portail locataire requis.'
        });
        return;
      }

      const { tenantClientId, leaseId, tenantId } = req.tenantPortal;

      const filters: any = {};
      if (req.query.status) {
        filters.status = req.query.status as string;
      }

      const pagination: any = {};
      if (req.query.page) {
        pagination.page = parseInt(req.query.page as string, 10);
      }
      if (req.query.limit) {
        pagination.limit = parseInt(req.query.limit as string, 10);
      }

      const ticketsData = await this.service.getMaintenanceTickets(
        tenantClientId,
        leaseId,
        tenantId,
        Object.keys(filters).length > 0 ? filters : undefined,
        Object.keys(pagination).length > 0 ? pagination : undefined
      );

      res.status(200).json({
        success: true,
        data: ticketsData
      });
    } catch (error: any) {
      const statusCode = error.statusCode || 500;
      const message = error.message || 'Erreur lors de la récupération des tickets de maintenance.';

      res.status(statusCode).json({
        success: false,
        message,
        ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
      });
    }
  }

  /**
   * Get maintenance ticket details
   * GET /api/portal/tenant/maintenance/:id
   */
  async getMaintenanceTicketDetails(req: Request, res: Response): Promise<void> {
    try {
      if (!req.tenantPortal) {
        res.status(403).json({
          success: false,
          message: 'Accès portail locataire requis.'
        });
        return;
      }

      const { tenantClientId, leaseId, tenantId } = req.tenantPortal;
      const ticketId = req.params.id;

      if (!ticketId) {
        res.status(400).json({
          success: false,
          message: 'ID de ticket requis.'
        });
        return;
      }

      const ticketDetails = await this.service.getMaintenanceTicketDetails(tenantClientId, leaseId, tenantId, ticketId);

      res.status(200).json({
        success: true,
        data: ticketDetails
      });
    } catch (error: any) {
      // Check if it's a "not found" error
      const statusCode =
        error.message?.includes('introuvable') || error.message?.includes('not found') ? 404 : error.statusCode || 500;
      const message = error.message || 'Erreur lors de la récupération des détails du ticket.';

      res.status(statusCode).json({
        success: false,
        message,
        ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
      });
    }
  }

  /**
   * Add comment to maintenance ticket
   * POST /api/portal/tenant/maintenance/:id/comment
   */
  async addTicketComment(req: Request, res: Response): Promise<void> {
    try {
      if (!req.tenantPortal) {
        res.status(403).json({
          success: false,
          message: 'Accès portail locataire requis.'
        });
        return;
      }

      const { tenantClientId, leaseId, tenantId } = req.tenantPortal;
      const ticketId = req.params.id;

      if (!ticketId) {
        res.status(400).json({
          success: false,
          message: 'ID de ticket requis.'
        });
        return;
      }

      const validationResult = addCommentSchema.safeParse({
        comment: req.body.comment
      });

      if (!validationResult.success) {
        const errorMessages = validationResult.error.errors
          .map((err: any) => `${err.path.join('.')}: ${err.message}`)
          .join(', ');

        res.status(400).json({
          success: false,
          message: `Données invalides: ${errorMessages}`,
          errors: validationResult.error.errors
        });
        return;
      }

      const comment = await this.service.addTicketComment(
        tenantClientId,
        leaseId,
        tenantId,
        ticketId,
        validationResult.data.comment
      );

      res.status(201).json({
        success: true,
        message: 'Commentaire ajouté avec succès.',
        data: comment
      });
    } catch (error: any) {
      const statusCode = error.statusCode || 500;
      const message = error.message || "Erreur lors de l'ajout du commentaire.";

      res.status(statusCode).json({
        success: false,
        message,
        ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
      });
    }
  }

  /**
   * Get documents
   * GET /api/portal/tenant/documents
   */
  async getDocuments(req: Request, res: Response): Promise<void> {
    try {
      if (!req.tenantPortal) {
        res.status(403).json({
          success: false,
          message: 'Accès portail locataire requis.'
        });
        return;
      }

      const { tenantClientId, leaseId, tenantId } = req.tenantPortal;

      const filters: any = {};
      if (req.query.type) {
        filters.type = req.query.type as string;
      }

      const documentsData = await this.service.getDocuments(
        tenantClientId,
        leaseId,
        tenantId,
        Object.keys(filters).length > 0 ? filters : undefined
      );

      res.status(200).json({
        success: true,
        data: documentsData
      });
    } catch (error: any) {
      const statusCode = error.statusCode || 500;
      const message = error.message || 'Erreur lors de la récupération des documents.';

      res.status(statusCode).json({
        success: false,
        message,
        ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
      });
    }
  }

  /**
   * Download document
   * GET /api/portal/tenant/documents/:id/download
   */
  async downloadDocument(req: Request, res: Response): Promise<void> {
    try {
      if (!req.tenantPortal) {
        res.status(403).json({
          success: false,
          message: 'Accès portail locataire requis.'
        });
        return;
      }

      const { tenantClientId, leaseId, tenantId } = req.tenantPortal;
      const documentId = req.params.id;

      if (!documentId) {
        res.status(400).json({
          success: false,
          message: 'ID de document requis.'
        });
        return;
      }

      const { buffer, fileName, mimeType } = await this.service.downloadDocument(
        tenantClientId,
        leaseId,
        tenantId,
        documentId
      );

      res.setHeader('Content-Type', mimeType);
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      res.send(buffer);
    } catch (error: any) {
      // Check if it's a "not found" error
      const statusCode =
        error.message?.includes('non trouvé') || error.message?.includes('not found') ? 404 : error.statusCode || 500;
      const message = error.message || 'Erreur lors du téléchargement du document.';

      res.status(statusCode).json({
        success: false,
        message,
        ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
      });
    }
  }
}
