import { Router } from 'express';
import { authenticate } from '../middleware/auth-middleware';
import { requireOwnerPortalAccess } from '../middleware/owner-portal-access';
import { OwnerPortalController } from '../controllers/owner-portal-controller';
import { downloadOwnerPortalAttachmentHandler } from '../controllers/maintenance-attachment-controller';

const router = Router();
const controller = new OwnerPortalController();

// All routes require authentication and owner portal access
router.use(authenticate);
router.use(requireOwnerPortalAccess);

// Dashboard
router.get('/dashboard', (req, res) => controller.getDashboard(req, res));

// Properties
router.get('/properties', (req, res) => controller.getProperties(req, res));

router.get('/properties/:id', (req, res) => controller.getPropertyDetails(req, res));

// Leases
router.get('/leases', (req, res) => controller.getLeases(req, res));

router.get('/leases/:id', (req, res) => controller.getLeaseDetails(req, res));

// Revenues
router.get('/revenues', (req, res) => controller.getRevenues(req, res));

router.get('/revenues/summary', (req, res) => controller.getRevenueSummary(req, res));

router.get('/revenues/by-property', (req, res) => controller.getRevenuesByProperty(req, res));

router.get('/revenues/by-month', (req, res) => controller.getRevenuesByMonth(req, res));

// Installments
router.get('/installments', (req, res) => controller.getInstallments(req, res));

// Payments
router.get('/payments', (req, res) => controller.getPayments(req, res));

router.get('/payments/:id', (req, res) => controller.getPaymentDetails(req, res));

// Deposits
router.get('/deposits', (req, res) => controller.getDeposits(req, res));

router.get('/deposits/:id/movements', (req, res) => controller.getDepositMovements(req, res));

// Maintenance
router.get('/maintenance', (req, res) => controller.getMaintenanceTickets(req, res));

router.get('/maintenance/:id', (req, res) => controller.getMaintenanceTicketDetails(req, res));

// Pièce jointe d'un ticket d'un de ses biens — jamais servie en statique.
router.get('/maintenance/:id/attachments/:attachmentId', downloadOwnerPortalAttachmentHandler);

// Documents
router.get('/documents', (req, res) => controller.getDocuments(req, res));

router.get('/documents/:id/download', (req, res) => controller.downloadDocument(req, res));

// Reports
router.post('/reports/revenue', (req, res) => controller.generateRevenueReport(req, res));

router.post('/reports/occupancy', (req, res) => controller.generateOccupancyReport(req, res));

router.post('/reports/export', (req, res) => controller.exportData(req, res));

// Preferences (newsletter consent)
router.get('/preferences', (req, res) => controller.getPreferences(req, res));
router.patch('/preferences', (req, res) => controller.updatePreferences(req, res));

export default router;
