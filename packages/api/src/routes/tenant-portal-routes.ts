import { Router } from 'express';
import { authenticate } from '../middleware/auth-middleware';
import { requireTenantPortalAccess } from '../middleware/tenant-portal-access';
import { TenantPortalController } from '../controllers/tenant-portal-controller';
import { downloadTenantPortalAttachmentHandler } from '../controllers/maintenance-attachment-controller';
import {
  getOnlinePaymentAvailabilityHandler,
  startOnlinePaymentHandler,
  getOnlinePaymentHandler
} from '../controllers/tenant-portal-online-payment-controller';
import {
  listTenantPortalReceivingAccountsHandler,
  readTenantPortalReceivingAccountQrHandler
} from '../controllers/receiving-account-controller';
import {
  rentalPortalOnlinePaymentAvailabilityLimiter,
  rentalPortalOnlinePaymentStartLimiter,
  rentalPortalOnlinePaymentStatusLimiter,
  receivingAccountQrReadRateLimiter
} from '../middleware/rate-limit-middleware';
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

// Les handlers du contrôleur sont enveloppés dans `asyncHandler` : branchés
// directement, ils reçoivent `next` d'Express et toute erreur suit la chaîne
// standard jusqu'à `errorHandler`.

// Dashboard
router.get('/dashboard', controller.getDashboard);

// Baux actifs du locataire (sélecteur de bail, H29)
router.get('/leases', controller.getLeases);

// Lease Details
router.get('/lease', controller.getLeaseDetails);

// Installments
router.get('/installments', controller.getInstallments);
router.get('/installments/:id', controller.getInstallmentDetails);

// Payments
router.get('/payments', controller.getPaymentHistory);
// servi par tenant-portal-declared-payment-routes (monté avant)
router.post('/payments/declare', upload.single('proof'), controller.declarePayment);

// Lot 7 : paiement en ligne (PaySecureHub).
router.get(
  '/online-payments/availability',
  rentalPortalOnlinePaymentAvailabilityLimiter,
  getOnlinePaymentAvailabilityHandler
);
router.post('/online-payments', rentalPortalOnlinePaymentStartLimiter, startOnlinePaymentHandler);
router.get('/online-payments/:codePaiement', rentalPortalOnlinePaymentStatusLimiter, getOnlinePaymentHandler);

// Spec 048, lot Q : comptes de réception de l'agence (alias, QR), actifs seulement ; image privée.
router.get('/receiving-accounts', listTenantPortalReceivingAccountsHandler);
router.get(
  '/receiving-accounts/:accountId/qr',
  receivingAccountQrReadRateLimiter,
  readTenantPortalReceivingAccountQrHandler
);

// Deposit
router.get('/deposit', controller.getDepositInfo);

// Finance (lot 016 — solde et relevé du locataire connecté, lecture seule)
router.get('/finance/statement', controller.getFinanceStatement);

// Maintenance
router.get('/maintenance', controller.getMaintenanceTickets);
router.post('/maintenance', upload.array('attachments', 10), controller.createMaintenanceTicket);
router.get('/maintenance/:id', controller.getMaintenanceTicketDetails);
router.post('/maintenance/:id/comment', controller.addTicketComment);
// Pièce jointe d'un ticket visible dans ce portail — jamais servie en statique.
router.get('/maintenance/:id/attachments/:attachmentId', downloadTenantPortalAttachmentHandler);

// Documents
router.get('/documents', controller.getDocuments);
router.get('/documents/:id/download', controller.downloadDocument);

export default router;
