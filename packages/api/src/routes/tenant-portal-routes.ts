import { Router } from 'express';
import { authenticate } from '../middleware/auth-middleware';
import { requireTenantPortalAccess } from '../middleware/tenant-portal-access';
import { TenantPortalController } from '../controllers/tenant-portal-controller';
import multer from 'multer';

const router = Router();
const controller = new TenantPortalController();

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB max
});

// All routes require authentication and tenant portal access
router.use(authenticate);
router.use(requireTenantPortalAccess);

// Dashboard
router.get('/dashboard', (req, res) => controller.getDashboard(req, res));

// Lease Details
router.get('/lease', (req, res) => controller.getLeaseDetails(req, res));

// Installments
router.get('/installments', (req, res) => controller.getInstallments(req, res));
router.get('/installments/:id', (req, res) => controller.getInstallmentDetails(req, res));

// Payments
router.get('/payments', (req, res) => controller.getPaymentHistory(req, res));
router.post('/payments/declare', upload.single('proof'), (req, res) => controller.declarePayment(req, res));

// Deposit
router.get('/deposit', (req, res) => controller.getDepositInfo(req, res));

// Maintenance
router.get('/maintenance', (req, res) => controller.getMaintenanceTickets(req, res));
router.post('/maintenance', upload.array('attachments', 10), (req, res) =>
  controller.createMaintenanceTicket(req, res)
);
router.get('/maintenance/:id', (req, res) => controller.getMaintenanceTicketDetails(req, res));
router.post('/maintenance/:id/comment', (req, res) => controller.addTicketComment(req, res));

// Documents
router.get('/documents', (req, res) => controller.getDocuments(req, res));
router.get('/documents/:id/download', (req, res) => controller.downloadDocument(req, res));

export default router;
