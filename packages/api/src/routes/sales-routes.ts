import { Router } from 'express';
import { authenticate } from '../middleware/auth-middleware';
import { requireTenantAccess } from '../middleware/tenant-middleware';
import { requireAnyPermission, requirePermission } from '../middleware/rbac-middleware';
import {
  addConditionHandler,
  cancelAgreementHandler,
  completeAgreementHandler,
  createAgreementHandler,
  createCommissionPaymentHandler,
  createMandateHandler,
  createOfferHandler,
  decideOfferHandler,
  deleteConditionHandler,
  getAgreementHandler,
  getCommissionHandler,
  getMandateHandler,
  getSalesPipelineHandler,
  listAgreementsHandler,
  listCommissionsHandler,
  listMandatesHandler,
  patchConditionHandler,
  replaceMilestonesHandler,
  revokeMandateHandler,
  signAgreementHandler,
  updateAgreementHandler,
  updateMandateHandler,
  voidCommissionPaymentHandler
} from '../controllers/sales-controller';

/**
 * Ventes immobilières — lot 9.
 *
 * Préfixe distinct `/tenants/:tenantId/sales` (comme `treasury-routes.ts`) :
 * pas de garde répétée sur `/api` (piège documenté dans
 * `docs/finance/LOT-5-RAPPORT.md` §5).
 *
 * Permissions (PRD §4, P8 — pas de nouvelle permission) :
 * - Mandats, offres, compromis : `CRM_DEALS_VIEW` en lecture, `CRM_DEALS_EDIT`
 *   en écriture.
 * - Encaisser une commission : `FINANCE_DOCUMENTS_CREATE`. Annuler un
 *   règlement : `FINANCE_DOCUMENTS_VALIDATE`.
 * - Lister/consulter les commissions : `FINANCE_ACCOUNTS_READ` OU
 *   `CRM_DEALS_VIEW` (`requireAnyPermission`).
 */
const router = Router();
const BASE = '/tenants/:tenantId/sales';
const guard = (permission: string) => [authenticate, requireTenantAccess, requirePermission(permission)];
const guardAny = (permissions: string[]) => [authenticate, requireTenantAccess, requireAnyPermission(permissions)];

router.get(`${BASE}/pipeline`, ...guard('CRM_DEALS_VIEW'), getSalesPipelineHandler);

router.get(`${BASE}/mandates`, ...guard('CRM_DEALS_VIEW'), listMandatesHandler);
router.post(`${BASE}/mandates`, ...guard('CRM_DEALS_EDIT'), createMandateHandler);
router.get(`${BASE}/mandates/:id`, ...guard('CRM_DEALS_VIEW'), getMandateHandler);
router.patch(`${BASE}/mandates/:id`, ...guard('CRM_DEALS_EDIT'), updateMandateHandler);
router.post(`${BASE}/mandates/:id/revoke`, ...guard('CRM_DEALS_EDIT'), revokeMandateHandler);
router.post(`${BASE}/mandates/:id/offers`, ...guard('CRM_DEALS_EDIT'), createOfferHandler);

router.post(`${BASE}/offers/:id/decision`, ...guard('CRM_DEALS_EDIT'), decideOfferHandler);
router.post(`${BASE}/offers/:id/agreement`, ...guard('CRM_DEALS_EDIT'), createAgreementHandler);

router.get(`${BASE}/agreements`, ...guard('CRM_DEALS_VIEW'), listAgreementsHandler);
router.get(`${BASE}/agreements/:id`, ...guard('CRM_DEALS_VIEW'), getAgreementHandler);
router.patch(`${BASE}/agreements/:id`, ...guard('CRM_DEALS_EDIT'), updateAgreementHandler);
router.post(`${BASE}/agreements/:id/sign`, ...guard('CRM_DEALS_EDIT'), signAgreementHandler);
router.post(`${BASE}/agreements/:id/complete`, ...guard('CRM_DEALS_EDIT'), completeAgreementHandler);
router.post(`${BASE}/agreements/:id/cancel`, ...guard('CRM_DEALS_EDIT'), cancelAgreementHandler);
router.post(`${BASE}/agreements/:id/conditions`, ...guard('CRM_DEALS_EDIT'), addConditionHandler);
router.put(`${BASE}/agreements/:id/milestones`, ...guard('CRM_DEALS_EDIT'), replaceMilestonesHandler);

router.patch(`${BASE}/conditions/:id`, ...guard('CRM_DEALS_EDIT'), patchConditionHandler);
router.delete(`${BASE}/conditions/:id`, ...guard('CRM_DEALS_EDIT'), deleteConditionHandler);

router.get(`${BASE}/commissions`, ...guardAny(['FINANCE_ACCOUNTS_READ', 'CRM_DEALS_VIEW']), listCommissionsHandler);
router.get(`${BASE}/commissions/:id`, ...guardAny(['FINANCE_ACCOUNTS_READ', 'CRM_DEALS_VIEW']), getCommissionHandler);
router.post(`${BASE}/commissions/:id/payments`, ...guard('FINANCE_DOCUMENTS_CREATE'), createCommissionPaymentHandler);
router.post(
  `${BASE}/commission-payments/:id/void`,
  ...guard('FINANCE_DOCUMENTS_VALIDATE'),
  voidCommissionPaymentHandler
);

export default router;
