import { Router } from 'express';
import { authenticate } from '../middleware/auth-middleware';
import { requireTenantAccess } from '../middleware/tenant-middleware';
import { enforceTenantIsolation } from '../middleware/tenant-isolation-middleware';
import {
  requireLeasesView,
  requireLeasesCreate,
  requireLeasesEdit,
  requireInstallmentsView,
  requireInstallmentsGenerate,
  requirePaymentsView,
  requirePaymentsCreate,
  requirePaymentsAllocate,
  requirePenaltiesView,
  requirePenaltiesCalculate,
  requirePenaltiesEdit,
  requireDepositsView,
  requireDepositsCreate,
  requireDepositsEdit,
  requireDocumentsView,
  requireDocumentsGenerate,
  requireDocumentsEdit
} from '../middleware/rental-rbac-middleware';
import {
  createLeaseHandler,
  getLeaseHandler,
  updateLeaseHandler,
  listLeasesHandler,
  updateLeaseStatusHandler,
  addCoRenterHandler,
  removeCoRenterHandler,
  listCoRentersHandler,
  deleteLeaseHandler
} from '../controllers/rental-controller';
import {
  generateInstallmentsHandler,
  listInstallmentsHandler,
  getInstallmentHandler,
  recalculateInstallmentStatusesHandler,
  deleteAllInstallmentsHandler
} from '../controllers/rental-installment-controller';
import {
  createPaymentHandler,
  allocatePaymentHandler,
  updatePaymentStatusHandler,
  getPaymentHandler,
  listPaymentsHandler
} from '../controllers/rental-payment-controller';
import {
  approvePaymentDeclarationHandler,
  rejectPaymentDeclarationHandler,
  listPaymentDeclarationsHandler,
  getPaymentDeclarationHandler
} from '../controllers/rental-payment-declaration-controller';
import {
  calculatePenaltiesHandler,
  updatePenaltyHandler,
  getPenaltyHandler,
  listPenaltiesHandler,
  deletePenaltyHandler,
  uploadPenaltyJustificationHandler
} from '../controllers/rental-penalty-controller';
import {
  getDepositHandler,
  createDepositHandler,
  createDepositMovementHandler,
  listDepositMovementsHandler
} from '../controllers/rental-deposit-controller';
import {
  generateDocumentHandler,
  getDocumentHandler,
  listDocumentsHandler,
  updateDocumentStatusHandler
} from '../controllers/rental-document-controller';
import { uploadDocument } from '../middleware/upload-middleware';

const router = Router({ mergeParams: true });

// All routes are tenant-scoped: /tenants/:tenantId/rental/*
router.use(authenticate);
router.use(requireTenantAccess);
router.use(enforceTenantIsolation);

// Lease routes
router.get('/:tenantId/rental/leases', requireLeasesView, listLeasesHandler);
router.post('/:tenantId/rental/leases', requireLeasesCreate, createLeaseHandler);
router.get('/:tenantId/rental/leases/:leaseId', requireLeasesView, getLeaseHandler);
router.patch('/:tenantId/rental/leases/:leaseId', requireLeasesEdit, updateLeaseHandler);
router.delete('/:tenantId/rental/leases/:leaseId', requireLeasesEdit, deleteLeaseHandler);
router.patch('/:tenantId/rental/leases/:leaseId/status', requireLeasesEdit, updateLeaseStatusHandler);
router.post('/:tenantId/rental/leases/:leaseId/co-renters', requireLeasesEdit, addCoRenterHandler);
router.delete('/:tenantId/rental/leases/:leaseId/co-renters/:renterClientId', requireLeasesEdit, removeCoRenterHandler);
router.get('/:tenantId/rental/leases/:leaseId/co-renters', requireLeasesView, listCoRentersHandler);

// Installment routes
router.get('/:tenantId/rental/leases/:leaseId/installments', requireInstallmentsView, listInstallmentsHandler);
router.get('/:tenantId/rental/installments', requireInstallmentsView, listInstallmentsHandler);
router.get('/:tenantId/rental/installments/:installmentId', requireInstallmentsView, getInstallmentHandler);
router.post('/:tenantId/rental/leases/:leaseId/installments', requireInstallmentsGenerate, generateInstallmentsHandler);
router.delete(
  '/:tenantId/rental/leases/:leaseId/installments',
  requireInstallmentsGenerate,
  deleteAllInstallmentsHandler
);
router.post(
  '/:tenantId/rental/leases/:leaseId/installments/recalculate',
  requireInstallmentsGenerate,
  recalculateInstallmentStatusesHandler
);

// Payment routes
router.post('/:tenantId/rental/payments', requirePaymentsCreate, createPaymentHandler);
router.get('/:tenantId/rental/payments', requirePaymentsView, listPaymentsHandler);
router.get('/:tenantId/rental/payments/:paymentId', requirePaymentsView, getPaymentHandler);
router.post('/:tenantId/rental/payments/:paymentId/allocate', requirePaymentsAllocate, allocatePaymentHandler);
router.patch('/:tenantId/rental/payments/:paymentId/status', requirePaymentsAllocate, updatePaymentStatusHandler);

// Payment Declaration routes
router.get('/:tenantId/rental/payment-declarations', requirePaymentsView, listPaymentDeclarationsHandler);
router.get('/:tenantId/rental/payment-declarations/:declarationId', requirePaymentsView, getPaymentDeclarationHandler);
router.post(
  '/:tenantId/rental/payment-declarations/:declarationId/approve',
  requirePaymentsAllocate,
  approvePaymentDeclarationHandler
);
router.post(
  '/:tenantId/rental/payment-declarations/:declarationId/reject',
  requirePaymentsAllocate,
  rejectPaymentDeclarationHandler
);

// Penalty routes
router.get('/:tenantId/rental/penalties', requirePenaltiesView, listPenaltiesHandler);
router.get('/:tenantId/rental/penalties/:penaltyId', requirePenaltiesView, getPenaltyHandler);
router.post('/:tenantId/rental/penalties/calculate', requirePenaltiesCalculate, calculatePenaltiesHandler);
router.patch('/:tenantId/rental/penalties/:penaltyId', requirePenaltiesEdit, updatePenaltyHandler);
router.delete('/:tenantId/rental/penalties/:penaltyId', requirePenaltiesEdit, deletePenaltyHandler);
router.post(
  '/:tenantId/rental/penalties/:penaltyId/justification',
  requirePenaltiesEdit,
  uploadDocument.single('file'),
  uploadPenaltyJustificationHandler
);

// Security deposit routes
router.get('/:tenantId/rental/leases/:leaseId/deposit', requireDepositsView, getDepositHandler);
router.post('/:tenantId/rental/leases/:leaseId/deposit', requireDepositsCreate, createDepositHandler);
router.post('/:tenantId/rental/deposits/:depositId/movements', requireDepositsEdit, createDepositMovementHandler);
router.get('/:tenantId/rental/deposits/:depositId/movements', requireDepositsView, listDepositMovementsHandler);

// Document routes
router.get('/:tenantId/rental/documents', requireDocumentsView, listDocumentsHandler);
router.post('/:tenantId/rental/documents', requireDocumentsGenerate, generateDocumentHandler);
router.get('/:tenantId/rental/documents/:documentId', requireDocumentsView, getDocumentHandler);
router.patch('/:tenantId/rental/documents/:documentId', requireDocumentsEdit, updateDocumentStatusHandler);

export default router;
