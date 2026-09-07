/**
 * Owner Portal Controller
 * HTTP request handlers for owner portal endpoints
 */

import { Request, Response } from 'express';
import { OwnerPortalService } from '../services/owner-portal-service';
import { logger } from '../utils/logger';

export class OwnerPortalController {
  private service: OwnerPortalService;

  constructor() {
    this.service = new OwnerPortalService();
  }

  /**
   * T025: Get dashboard data
   */
  async getDashboard(req: Request, res: Response): Promise<void> {
    try {
      if (!req.ownerPortal) {
        res.status(403).json({ success: false, message: 'Accès portail propriétaire requis.' });
        return;
      }

      const { propertyIds, tenantId } = req.ownerPortal;

      logger.info('Getting owner dashboard', {
        tenantId,
        propertyIdsCount: propertyIds.length,
        propertyIds
      });

      const dashboardData = await this.service.getDashboard(propertyIds, tenantId);

      res.json({
        success: true,
        data: dashboardData
      });
    } catch (error: any) {
      logger.error('Error getting owner dashboard:', {
        error: error.message,
        stack: error.stack,
        ownerPortal: req.ownerPortal
      });
      res.status(500).json({
        success: false,
        message: error.message || 'Erreur lors du chargement du tableau de bord.'
      });
    }
  }

  /**
   * T042: Get properties list
   */
  async getProperties(req: Request, res: Response): Promise<void> {
    try {
      if (!req.ownerPortal) {
        res.status(403).json({ success: false, message: 'Accès portail propriétaire requis.' });
        return;
      }

      const { propertyIds, tenantId } = req.ownerPortal;

      // Parse query parameters
      const status = req.query.status as string | undefined;
      const propertyType = req.query.propertyType as string | undefined;
      const transactionMode = req.query.transactionMode as string | undefined;

      const filters: any = {};
      if (status) filters.status = status;
      if (propertyType) filters.propertyType = propertyType;
      if (transactionMode) filters.transactionMode = transactionMode;

      logger.info('Getting owner properties', {
        tenantId,
        propertyIdsCount: propertyIds.length,
        filters
      });

      const propertiesData = await this.service.getProperties(propertyIds, tenantId, filters);

      res.json({
        success: true,
        data: propertiesData
      });
    } catch (error: any) {
      logger.error('Error getting owner properties:', {
        error: error.message,
        stack: error.stack,
        ownerPortal: req.ownerPortal
      });
      logger.error('Error getting owner properties:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors du chargement des propriétés.'
      });
    }
  }

  /**
   * T043: Get property details with ownership validation
   */
  async getPropertyDetails(req: Request, res: Response): Promise<void> {
    try {
      if (!req.ownerPortal) {
        res.status(403).json({ success: false, message: 'Accès portail propriétaire requis.' });
        return;
      }

      const { propertyIds, tenantId } = req.ownerPortal;
      const propertyId = req.params.id;

      if (!propertyId) {
        res.status(400).json({ success: false, message: 'ID de propriété requis.' });
        return;
      }

      // Ownership validation is done in service
      const propertyDetails = await this.service.getPropertyDetails(propertyId, propertyIds, tenantId);

      res.json({
        success: true,
        data: propertyDetails
      });
    } catch (error: any) {
      logger.error('Error getting property details:', error);
      if (error.message.includes('non trouvée') || error.message.includes('non autorisé')) {
        res.status(404).json({
          success: false,
          message: error.message
        });
      } else {
        res.status(500).json({
          success: false,
          message: 'Erreur lors du chargement des détails de la propriété.'
        });
      }
    }
  }

  /**
   * T062: Get leases list
   */
  async getLeases(req: Request, res: Response): Promise<void> {
    try {
      if (!req.ownerPortal) {
        res.status(403).json({ success: false, message: 'Accès portail propriétaire requis.' });
        return;
      }

      const { propertyIds, tenantId } = req.ownerPortal;

      // Parse query parameters
      const status = req.query.status as string | undefined;
      const propertyId = req.query.propertyId as string | undefined;

      const filters: any = {};
      if (status) filters.status = status;
      if (propertyId) filters.propertyId = propertyId;

      const leasesData = await this.service.getLeases(propertyIds, tenantId, filters);

      res.json({
        success: true,
        data: leasesData
      });
    } catch (error) {
      logger.error('Error getting owner leases:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors du chargement des baux.'
      });
    }
  }

  /**
   * T063: Get lease details with property ownership validation
   */
  async getLeaseDetails(req: Request, res: Response): Promise<void> {
    try {
      if (!req.ownerPortal) {
        res.status(403).json({ success: false, message: 'Accès portail propriétaire requis.' });
        return;
      }

      const { propertyIds, tenantId } = req.ownerPortal;
      const leaseId = req.params.id;

      if (!leaseId) {
        res.status(400).json({ success: false, message: 'ID de bail requis.' });
        return;
      }

      // Ownership validation is done in service
      const leaseDetails = await this.service.getLeaseDetails(leaseId, propertyIds, tenantId);

      res.json({
        success: true,
        data: leaseDetails
      });
    } catch (error: any) {
      logger.error('Error getting lease details:', error);
      if (error.message.includes('non trouvé') || error.message.includes('non autorisé')) {
        res.status(404).json({
          success: false,
          message: error.message
        });
      } else {
        res.status(500).json({
          success: false,
          message: 'Erreur lors du chargement des détails du bail.'
        });
      }
    }
  }

  /**
   * T078: Get revenues
   */
  async getRevenues(req: Request, res: Response): Promise<void> {
    try {
      if (!req.ownerPortal) {
        res.status(403).json({ success: false, message: 'Accès portail propriétaire requis.' });
        return;
      }

      const { propertyIds, tenantId } = req.ownerPortal;

      const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
      const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;
      const propertyId = req.query.propertyId as string | undefined;
      const groupBy = req.query.groupBy as 'month' | 'year' | 'property' | undefined;

      const filters: any = {};
      if (startDate) filters.startDate = startDate;
      if (endDate) filters.endDate = endDate;
      if (propertyId) filters.propertyId = propertyId;
      if (groupBy) filters.groupBy = groupBy;

      const revenues = await this.service.getRevenues(propertyIds, tenantId, filters);

      res.json({
        success: true,
        data: revenues
      });
    } catch (error) {
      logger.error('Error getting owner revenues:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors du chargement des revenus.'
      });
    }
  }

  /**
   * T079: Get revenue summary
   */
  async getRevenueSummary(req: Request, res: Response): Promise<void> {
    try {
      if (!req.ownerPortal) {
        res.status(403).json({ success: false, message: 'Accès portail propriétaire requis.' });
        return;
      }

      const { propertyIds, tenantId } = req.ownerPortal;
      const summary = await this.service.getRevenueSummary(propertyIds, tenantId);

      res.json({
        success: true,
        data: summary
      });
    } catch (error) {
      logger.error('Error getting revenue summary:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors du chargement du résumé des revenus.'
      });
    }
  }

  /**
   * T080: Get revenues by property
   */
  async getRevenuesByProperty(req: Request, res: Response): Promise<void> {
    try {
      if (!req.ownerPortal) {
        res.status(403).json({ success: false, message: 'Accès portail propriétaire requis.' });
        return;
      }

      const { propertyIds, tenantId } = req.ownerPortal;

      const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
      const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;

      const filters: any = {};
      if (startDate) filters.startDate = startDate;
      if (endDate) filters.endDate = endDate;

      const revenuesByProperty = await this.service.getRevenuesByProperty(propertyIds, tenantId, filters);

      res.json({
        success: true,
        data: revenuesByProperty
      });
    } catch (error) {
      logger.error('Error getting revenues by property:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors du chargement des revenus par propriété.'
      });
    }
  }

  /**
   * T081: Get revenues by month
   */
  async getRevenuesByMonth(req: Request, res: Response): Promise<void> {
    try {
      if (!req.ownerPortal) {
        res.status(403).json({ success: false, message: 'Accès portail propriétaire requis.' });
        return;
      }

      const { propertyIds, tenantId } = req.ownerPortal;
      const year = req.query.year ? parseInt(req.query.year as string) : new Date().getFullYear();

      const revenuesByMonth = await this.service.getRevenuesByMonth(propertyIds, tenantId, year);

      res.json({
        success: true,
        data: revenuesByMonth
      });
    } catch (error) {
      logger.error('Error getting revenues by month:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors du chargement des revenus par mois.'
      });
    }
  }

  /**
   * T093: Get installments
   */
  async getInstallments(req: Request, res: Response): Promise<void> {
    try {
      if (!req.ownerPortal) {
        res.status(403).json({ success: false, message: 'Accès portail propriétaire requis.' });
        return;
      }

      const { propertyIds, tenantId } = req.ownerPortal;

      const status = req.query.status as string | undefined;
      const propertyId = req.query.propertyId as string | undefined;
      const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
      const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;

      const filters: any = {};
      if (status) {
        filters.status = status as any;
      }
      if (propertyId) filters.propertyId = propertyId;
      if (startDate) filters.startDate = startDate;
      if (endDate) filters.endDate = endDate;

      logger.info('Getting owner installments', {
        tenantId,
        propertyIdsCount: propertyIds.length,
        filters
      });

      const installmentsData = await this.service.getInstallments(propertyIds, tenantId, filters);

      res.json({
        success: true,
        data: installmentsData
      });
    } catch (error: any) {
      logger.error('Error getting owner installments:', {
        error: error.message,
        stack: error.stack,
        ownerPortal: req.ownerPortal
      });
      res.status(500).json({
        success: false,
        message: 'Erreur lors du chargement des échéances.'
      });
    }
  }

  /**
   * T102: Get payments
   */
  async getPayments(req: Request, res: Response): Promise<void> {
    try {
      if (!req.ownerPortal) {
        res.status(403).json({ success: false, message: 'Accès portail propriétaire requis.' });
        return;
      }

      const { propertyIds, tenantId } = req.ownerPortal;

      const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
      const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;
      const propertyId = req.query.propertyId as string | undefined;
      const method = req.query.method as string | undefined;

      const filters: any = {};
      if (startDate) filters.startDate = startDate;
      if (endDate) filters.endDate = endDate;
      if (propertyId) filters.propertyId = propertyId;
      if (method) filters.method = method as any;

      const paymentsData = await this.service.getPayments(propertyIds, tenantId, filters);

      res.json({
        success: true,
        data: paymentsData
      });
    } catch (error) {
      logger.error('Error getting owner payments:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors du chargement des paiements.'
      });
    }
  }

  /**
   * T103: Get payment details
   */
  async getPaymentDetails(req: Request, res: Response): Promise<void> {
    try {
      if (!req.ownerPortal) {
        res.status(403).json({ success: false, message: 'Accès portail propriétaire requis.' });
        return;
      }

      const { propertyIds, tenantId } = req.ownerPortal;
      const paymentId = req.params.id;

      const paymentDetails = await this.service.getPaymentDetails(paymentId, propertyIds, tenantId);

      res.json({
        success: true,
        data: paymentDetails
      });
    } catch (error: any) {
      logger.error('Error getting payment details:', error);
      if (error.message === 'Paiement non trouvé ou accès non autorisé') {
        res.status(404).json({
          success: false,
          message: error.message
        });
      } else {
        res.status(500).json({
          success: false,
          message: 'Erreur lors du chargement des détails du paiement.'
        });
      }
    }
  }

  /**
   * T113: Get deposits
   */
  async getDeposits(req: Request, res: Response): Promise<void> {
    try {
      if (!req.ownerPortal) {
        res.status(403).json({ success: false, message: 'Accès portail propriétaire requis.' });
        return;
      }

      const { propertyIds, tenantId } = req.ownerPortal;
      const depositsData = await this.service.getDeposits(propertyIds, tenantId);

      res.json({
        success: true,
        data: depositsData
      });
    } catch (error) {
      logger.error('Error getting owner deposits:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors du chargement des dépôts de garantie.'
      });
    }
  }

  /**
   * T114: Get deposit movements
   */
  async getDepositMovements(req: Request, res: Response): Promise<void> {
    try {
      if (!req.ownerPortal) {
        res.status(403).json({ success: false, message: 'Accès portail propriétaire requis.' });
        return;
      }

      const { propertyIds, tenantId } = req.ownerPortal;
      const depositId = req.params.id;

      const movementsData = await this.service.getDepositMovements(depositId, propertyIds, tenantId);

      res.json({
        success: true,
        data: movementsData
      });
    } catch (error: any) {
      logger.error('Error getting deposit movements:', error);
      if (error.message === 'Dépôt de garantie non trouvé ou accès non autorisé') {
        res.status(404).json({
          success: false,
          message: error.message
        });
      } else {
        res.status(500).json({
          success: false,
          message: 'Erreur lors du chargement des mouvements du dépôt.'
        });
      }
    }
  }

  /**
   * T123: Get maintenance tickets
   */
  async getMaintenanceTickets(req: Request, res: Response): Promise<void> {
    try {
      if (!req.ownerPortal) {
        res.status(403).json({ success: false, message: 'Accès portail propriétaire requis.' });
        return;
      }

      const { propertyIds, tenantId } = req.ownerPortal;

      const status = req.query.status as string | undefined;
      const propertyId = req.query.propertyId as string | undefined;
      const category = req.query.category as string | undefined;
      const priority = req.query.priority as string | undefined;

      const filters: any = {};
      if (status) filters.status = status as any;
      if (propertyId) filters.propertyId = propertyId;
      if (category) filters.category = category as any;
      if (priority) filters.priority = priority as any;

      const ticketsData = await this.service.getMaintenanceTickets(propertyIds, tenantId, filters);

      res.json({
        success: true,
        data: ticketsData
      });
    } catch (error) {
      logger.error('Error getting owner maintenance tickets:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors du chargement des tickets de maintenance.'
      });
    }
  }

  /**
   * T124: Get maintenance ticket details
   */
  async getMaintenanceTicketDetails(req: Request, res: Response): Promise<void> {
    try {
      if (!req.ownerPortal) {
        res.status(403).json({ success: false, message: 'Accès portail propriétaire requis.' });
        return;
      }

      const { propertyIds, tenantId } = req.ownerPortal;
      const ticketId = req.params.id;

      const ticketDetails = await this.service.getMaintenanceTicketDetails(ticketId, propertyIds, tenantId);

      res.json({
        success: true,
        data: ticketDetails
      });
    } catch (error: any) {
      logger.error('Error getting maintenance ticket details:', error);
      if (error.message === 'Ticket de maintenance non trouvé ou accès non autorisé') {
        res.status(404).json({
          success: false,
          message: error.message
        });
      } else {
        res.status(500).json({
          success: false,
          message: 'Erreur lors du chargement des détails du ticket.'
        });
      }
    }
  }

  /**
   * T133: Get documents
   */
  async getDocuments(req: Request, res: Response): Promise<void> {
    try {
      if (!req.ownerPortal) {
        res.status(403).json({ success: false, message: 'Accès portail propriétaire requis.' });
        return;
      }

      const { propertyIds, tenantId } = req.ownerPortal;

      const documentType = req.query.documentType as string | undefined;
      const propertyId = req.query.propertyId as string | undefined;
      const leaseId = req.query.leaseId as string | undefined;

      const filters: any = {};
      if (documentType) filters.documentType = documentType as any;
      if (propertyId) filters.propertyId = propertyId;
      if (leaseId) filters.leaseId = leaseId;

      const documentsData = await this.service.getDocuments(propertyIds, tenantId, filters);

      res.json({
        success: true,
        data: documentsData
      });
    } catch (error) {
      logger.error('Error getting owner documents:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors du chargement des documents.'
      });
    }
  }

  /**
   * T134: Download document
   */
  async downloadDocument(req: Request, res: Response): Promise<void> {
    try {
      if (!req.ownerPortal) {
        res.status(403).json({ success: false, message: 'Accès portail propriétaire requis.' });
        return;
      }

      const { propertyIds, tenantId } = req.ownerPortal;
      const documentId = req.params.id;

      const { buffer, fileName, mimeType } = await this.service.downloadDocument(documentId, propertyIds, tenantId);

      res.setHeader('Content-Type', mimeType);
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      res.send(buffer);
    } catch (error: any) {
      logger.error('Error downloading document:', error);
      if (error.message === 'Document non trouvé ou accès non autorisé') {
        res.status(404).json({
          success: false,
          message: error.message
        });
      } else {
        res.status(500).json({
          success: false,
          message: 'Erreur lors du téléchargement du document.'
        });
      }
    }
  }

  /**
   * T147: Generate revenue report
   */
  async generateRevenueReport(req: Request, res: Response): Promise<void> {
    try {
      if (!req.ownerPortal) {
        res.status(403).json({ success: false, message: 'Accès portail propriétaire requis.' });
        return;
      }

      const { propertyIds, tenantId } = req.ownerPortal;

      const { startDate, endDate, propertyId, format } = req.body;

      if (!startDate || !endDate || !format) {
        res.status(400).json({
          success: false,
          message: 'startDate, endDate et format sont requis.'
        });
        return;
      }

      const buffer = await this.service.generateRevenueReport(propertyIds, tenantId, {
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        propertyId,
        format
      });

      // Set appropriate content type
      const contentType =
        format === 'pdf'
          ? 'application/pdf'
          : format === 'csv'
            ? 'text/csv'
            : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

      const extension = format === 'pdf' ? 'pdf' : format === 'csv' ? 'csv' : 'xlsx';
      const filename = `revenue-report-${format(new Date(), 'yyyy-MM-dd')}.${extension}`;

      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(buffer);
    } catch (error) {
      logger.error('Error generating revenue report:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la génération du rapport de revenus.'
      });
    }
  }

  /**
   * T148: Generate occupancy report
   */
  async generateOccupancyReport(req: Request, res: Response): Promise<void> {
    try {
      if (!req.ownerPortal) {
        res.status(403).json({ success: false, message: 'Accès portail propriétaire requis.' });
        return;
      }

      const { propertyIds, tenantId } = req.ownerPortal;

      const { asOfDate, format } = req.body;

      if (!asOfDate || !format) {
        res.status(400).json({
          success: false,
          message: 'asOfDate et format sont requis.'
        });
        return;
      }

      const buffer = await this.service.generateOccupancyReport(propertyIds, tenantId, {
        asOfDate: new Date(asOfDate),
        format
      });

      // Set appropriate content type
      const contentType =
        format === 'pdf'
          ? 'application/pdf'
          : format === 'csv'
            ? 'text/csv'
            : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

      const extension = format === 'pdf' ? 'pdf' : format === 'csv' ? 'csv' : 'xlsx';
      const filename = `occupancy-report-${format(new Date(), 'yyyy-MM-dd')}.${extension}`;

      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(buffer);
    } catch (error) {
      logger.error('Error generating occupancy report:', error);
      res.status(500).json({
        success: false,
        message: "Erreur lors de la génération du rapport d'occupation."
      });
    }
  }

  /**
   * T149: Export data
   */
  async exportData(req: Request, res: Response): Promise<void> {
    try {
      if (!req.ownerPortal) {
        res.status(403).json({ success: false, message: 'Accès portail propriétaire requis.' });
        return;
      }

      const { propertyIds, tenantId } = req.ownerPortal;

      const { entityType, startDate, endDate, propertyId, format } = req.body;

      if (!entityType || !format) {
        res.status(400).json({
          success: false,
          message: 'entityType et format sont requis.'
        });
        return;
      }

      const buffer = await this.service.exportData(propertyIds, tenantId, {
        entityType,
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined,
        propertyId,
        format
      });

      // Set appropriate content type
      const contentType =
        format === 'csv' ? 'text/csv' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

      const extension = format === 'csv' ? 'csv' : 'xlsx';
      const filename = `${entityType}-export-${format(new Date(), 'yyyy-MM-dd')}.${extension}`;

      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(buffer);
    } catch (error) {
      logger.error('Error exporting data:', error);
      res.status(500).json({
        success: false,
        message: "Erreur lors de l'export des données."
      });
    }
  }

  /**
   * Get owner preferences (newsletter consent, etc.)
   */
  async getPreferences(req: Request, res: Response): Promise<void> {
    try {
      if (!req.ownerPortal) {
        res.status(403).json({ success: false, message: 'Accès portail propriétaire requis.' });
        return;
      }
      const data = await this.service.getPreferences(req.ownerPortal.tenantClientId);
      res.json({ success: true, data });
    } catch (error: any) {
      logger.error('Error getting preferences:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Erreur lors du chargement des préférences.'
      });
    }
  }

  /**
   * Update owner preferences (newsletter consent)
   */
  async updatePreferences(req: Request, res: Response): Promise<void> {
    try {
      if (!req.ownerPortal) {
        res.status(403).json({ success: false, message: 'Accès portail propriétaire requis.' });
        return;
      }
      const { newsletterConsent } = req.body as { newsletterConsent?: boolean };
      const data = await this.service.updatePreferences(req.ownerPortal.tenantClientId, { newsletterConsent });
      res.json({ success: true, data });
    } catch (error: any) {
      logger.error('Error updating preferences:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Erreur lors de la mise à jour des préférences.'
      });
    }
  }
}
