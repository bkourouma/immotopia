/**
 * Owner Portal Controller
 * HTTP request handlers for owner portal endpoints
 */

import { Request, Response } from 'express';
import { OwnerPortalService } from '../services/owner-portal-service';
import { logger } from '../utils/logger';
import { parseIntParam } from '../utils/query-params';
import { respondWithAppError } from '../utils/app-error-response';
import {
  parseOwnerPortalDocumentsQuery,
  parseOwnerPortalInstallmentsQuery,
  parseOwnerPortalLeasesQuery,
  parseOwnerPortalMaintenanceQuery,
  parseOwnerPortalPaymentsQuery
} from '../services/portal-list-filters/owner-portal-list-filters';
import { PropertyStatus, PropertyTransactionMode, PropertyType } from '@prisma/client';
import { BadRequestError } from '../middleware/error-middleware';
import { t } from '../i18n';

const REPORT_FORMATS = ['pdf', 'csv', 'excel'] as const;
type ReportFormat = (typeof REPORT_FORMATS)[number];

/**
 * Borne de période reçue en JSON ou en query : `aaaa-mm-jj` ou date ISO
 * complète, valide, sinon 400 (jamais un `Invalid Date` qui ferait lever
 * Prisma, soit un 500). Un jour seul couvre la journée entière (UTC) : la
 * borne de fin (`endOfDay`) vaut 23:59:59.999Z, pour que le dernier jour choisi
 * reste inclus — comme les listes du portail (`owner-portal-list-filters`).
 * Absente ou vide : `undefined`.
 */
export function parsePortalDateBoundary(raw: unknown, field: string, endOfDay: boolean): Date | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined;
  const invalid = () =>
    new BadRequestError(t('Paramètres de recherche invalides.'), [{ field, message: t('Date invalide.') }]);
  if (typeof raw !== 'string') throw invalid();
  const value = raw.trim();
  if (!/^\d{4}-\d{2}-\d{2}([T ].+)?$/.test(value)) throw invalid();
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw invalid();
  if (value.length === 10) {
    // Un jour inexistant (2026-02-31) se « corrige » en mars : on le refuse.
    if (parsed.toISOString().slice(0, 10) !== value) throw invalid();
    return new Date(`${value}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z`);
  }
  return parsed;
}

function parseEnumQuery<T extends string>(raw: unknown, field: string, values: Record<string, T>): T | undefined {
  if (raw === undefined || raw === '') return undefined;
  if (typeof raw === 'string' && (Object.values(values) as string[]).includes(raw)) return raw as T;
  throw new BadRequestError(t('Paramètres de recherche invalides.'), [{ field, message: t('Format invalide.') }]);
}

function parseReportFormat(raw: unknown): ReportFormat {
  if (typeof raw === 'string' && (REPORT_FORMATS as readonly string[]).includes(raw)) {
    return raw as ReportFormat;
  }
  throw new BadRequestError(t('Paramètres de recherche invalides.'), [
    { field: 'format', message: t('Format invalide.') }
  ]);
}

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
        // Jamais le message brut (erreur Prisma, noms de colonnes) dans une réponse de portail.
        message: 'Erreur lors du chargement du tableau de bord.'
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
      // Une valeur hors enum ferait lever Prisma (500) : 400 typé à la place.
      const status = parseEnumQuery(req.query.status, 'status', PropertyStatus);
      const propertyType = parseEnumQuery(req.query.propertyType, 'propertyType', PropertyType);
      const transactionMode = parseEnumQuery(req.query.transactionMode, 'transactionMode', PropertyTransactionMode);

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
      if (respondWithAppError(res, error)) return;
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

      const filters = parseOwnerPortalLeasesQuery(req.query);

      const leasesData = await this.service.getLeases(propertyIds, tenantId, filters);

      res.json({
        success: true,
        data: leasesData
      });
    } catch (error) {
      if (respondWithAppError(res, error)) return;
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

      const startDate = parsePortalDateBoundary(req.query.startDate, 'startDate', false);
      const endDate = parsePortalDateBoundary(req.query.endDate, 'endDate', true);
      const propertyId = typeof req.query.propertyId === 'string' ? req.query.propertyId : undefined;
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
      if (respondWithAppError(res, error)) return;
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

      const startDate = parsePortalDateBoundary(req.query.startDate, 'startDate', false);
      const endDate = parsePortalDateBoundary(req.query.endDate, 'endDate', true);

      const filters: any = {};
      if (startDate) filters.startDate = startDate;
      if (endDate) filters.endDate = endDate;

      const revenuesByProperty = await this.service.getRevenuesByProperty(propertyIds, tenantId, filters);

      res.json({
        success: true,
        data: revenuesByProperty
      });
    } catch (error) {
      if (respondWithAppError(res, error)) return;
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
      const year = parseIntParam(req.query.year, 'year', { min: 1900, max: 2200 }) ?? new Date().getFullYear();

      const revenuesByMonth = await this.service.getRevenuesByMonth(propertyIds, tenantId, year);

      res.json({
        success: true,
        data: revenuesByMonth
      });
    } catch (error) {
      if (respondWithAppError(res, error)) return;
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

      const filters = parseOwnerPortalInstallmentsQuery(req.query);

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
      if (respondWithAppError(res, error)) return;
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

      const filters = parseOwnerPortalPaymentsQuery(req.query);

      const paymentsData = await this.service.getPayments(propertyIds, tenantId, filters);

      res.json({
        success: true,
        data: paymentsData
      });
    } catch (error) {
      if (respondWithAppError(res, error)) return;
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

      const filters = parseOwnerPortalMaintenanceQuery(req.query);

      const ticketsData = await this.service.getMaintenanceTickets(propertyIds, tenantId, filters);

      res.json({
        success: true,
        data: ticketsData
      });
    } catch (error) {
      if (respondWithAppError(res, error)) return;
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

      const filters = parseOwnerPortalDocumentsQuery(req.query);

      const documentsData = await this.service.getDocuments(propertyIds, tenantId, filters);

      res.json({
        success: true,
        data: documentsData
      });
    } catch (error) {
      if (respondWithAppError(res, error)) return;
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

      const { startDate, endDate, propertyId, format: outputFormat } = req.body;

      if (!startDate || !endDate || !outputFormat) {
        res.status(400).json({
          success: false,
          message: 'startDate, endDate et format sont requis.'
        });
        return;
      }

      parseReportFormat(outputFormat);
      const start = parsePortalDateBoundary(startDate, 'startDate', false) as Date;
      const end = parsePortalDateBoundary(endDate, 'endDate', true) as Date;
      if (start.getTime() > end.getTime()) {
        throw new BadRequestError(t('Paramètres de recherche invalides.'), [
          { field: 'startDate', message: t('Date invalide.') }
        ]);
      }

      const buffer = await this.service.generateRevenueReport(propertyIds, tenantId, {
        startDate: start,
        endDate: end,
        propertyId: typeof propertyId === 'string' && propertyId ? propertyId : undefined,
        format: outputFormat
      });

      // Set appropriate content type
      const contentType =
        outputFormat === 'pdf'
          ? 'application/pdf'
          : outputFormat === 'csv'
            ? 'text/csv'
            : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

      const extension = outputFormat === 'pdf' ? 'pdf' : outputFormat === 'csv' ? 'csv' : 'xlsx';
      const filename = `revenue-report-${new Date().toISOString().slice(0, 10)}.${extension}`;

      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(buffer);
    } catch (error) {
      if (respondWithAppError(res, error)) return;
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

      const { asOfDate, format: outputFormat } = req.body;

      if (!asOfDate || !outputFormat) {
        res.status(400).json({
          success: false,
          message: 'asOfDate et format sont requis.'
        });
        return;
      }

      parseReportFormat(outputFormat);
      const buffer = await this.service.generateOccupancyReport(propertyIds, tenantId, {
        asOfDate: parsePortalDateBoundary(asOfDate, 'asOfDate', false) as Date,
        format: outputFormat
      });

      // Set appropriate content type
      const contentType =
        outputFormat === 'pdf'
          ? 'application/pdf'
          : outputFormat === 'csv'
            ? 'text/csv'
            : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

      const extension = outputFormat === 'pdf' ? 'pdf' : outputFormat === 'csv' ? 'csv' : 'xlsx';
      const filename = `occupancy-report-${new Date().toISOString().slice(0, 10)}.${extension}`;

      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(buffer);
    } catch (error) {
      if (respondWithAppError(res, error)) return;
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

      const { entityType, startDate, endDate, propertyId, format: outputFormat } = req.body;

      if (!entityType || !outputFormat) {
        res.status(400).json({
          success: false,
          message: 'entityType et format sont requis.'
        });
        return;
      }

      const VALID_ENTITY_TYPES = ['payments', 'installments', 'leases'];
      const VALID_FORMATS = ['csv', 'excel'];

      if (!VALID_ENTITY_TYPES.includes(entityType)) {
        res.status(400).json({
          success: false,
          message: 'entityType invalide.'
        });
        return;
      }

      if (!VALID_FORMATS.includes(outputFormat)) {
        res.status(400).json({
          success: false,
          message: 'format invalide.'
        });
        return;
      }

      const buffer = await this.service.exportData(propertyIds, tenantId, {
        entityType,
        startDate: parsePortalDateBoundary(startDate, 'startDate', false),
        endDate: parsePortalDateBoundary(endDate, 'endDate', true),
        propertyId: typeof propertyId === 'string' && propertyId ? propertyId : undefined,
        format: outputFormat
      });

      // Set appropriate content type
      const contentType =
        outputFormat === 'csv' ? 'text/csv' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

      const extension = outputFormat === 'csv' ? 'csv' : 'xlsx';
      const filename = `${entityType}-export-${new Date().toISOString().slice(0, 10)}.${extension}`;

      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(buffer);
    } catch (error) {
      if (respondWithAppError(res, error)) return;
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
        message: 'Erreur lors du chargement des préférences.'
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
      const { newsletterConsent } = (req.body ?? {}) as { newsletterConsent?: unknown };
      if (newsletterConsent !== undefined && typeof newsletterConsent !== 'boolean') {
        throw new BadRequestError(t('Paramètres de recherche invalides.'), [
          { field: 'newsletterConsent', message: t('Format invalide.') }
        ]);
      }
      const data = await this.service.updatePreferences(req.ownerPortal.tenantClientId, { newsletterConsent });
      res.json({ success: true, data });
    } catch (error: any) {
      if (respondWithAppError(res, error)) return;
      logger.error('Error updating preferences:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la mise à jour des préférences.'
      });
    }
  }
}
