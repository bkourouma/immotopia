import { Router } from 'express';
import { authenticate } from '../middleware/auth-middleware';
import { requireTenantAccess } from '../middleware/tenant-middleware';
import { requirePermission } from '../middleware/rbac-middleware';
import {
  clearOwnerFeeTermsHandler,
  getAgentCommissionsHandler,
  getLeaseManagementTermsHandler,
  listAgentCommissionRatesHandler,
  listOwnerFeeTermsHandler,
  setAgentCommissionRateHandler,
  setLeaseManagementTermsHandler,
  setOwnerFeeTermsHandler
} from '../controllers/management-fee-controller';

/**
 * Honoraires de gestion — lot 2 de la gestion locative.
 *
 * Conditions par propriétaire et part des collaborateurs : sous les
 * paramètres de l'agence, mêmes permissions que la page qui les affiche.
 * Conditions d'un bail : permissions des baux. État des commissions :
 * permission des rapports financiers.
 *
 * Gardes posés avec leur chemin, jamais en `router.use` nu : ce routeur est
 * monté sur `/api` tout entier.
 */
const router = Router();

const guard = (permission: string) => [authenticate, requireTenantAccess, requirePermission(permission)];

const OWNERS = '/tenants/:tenantId/settings/finance/owners';
router.get(OWNERS, ...guard('TENANT_SETTINGS_VIEW'), listOwnerFeeTermsHandler);
router.put(`${OWNERS}/:ownerClientId`, ...guard('TENANT_SETTINGS_EDIT'), setOwnerFeeTermsHandler);
router.delete(`${OWNERS}/:ownerClientId`, ...guard('TENANT_SETTINGS_EDIT'), clearOwnerFeeTermsHandler);

const AGENTS = '/tenants/:tenantId/settings/finance/agents';
router.get(AGENTS, ...guard('TENANT_SETTINGS_VIEW'), listAgentCommissionRatesHandler);
router.put(`${AGENTS}/:userId`, ...guard('TENANT_SETTINGS_EDIT'), setAgentCommissionRateHandler);

const LEASE_TERMS = '/tenants/:tenantId/rental/leases/:leaseId/management-terms';
router.get(LEASE_TERMS, ...guard('RENTAL_LEASES_VIEW'), getLeaseManagementTermsHandler);
router.put(LEASE_TERMS, ...guard('RENTAL_LEASES_EDIT'), setLeaseManagementTermsHandler);

router.get(
  '/tenants/:tenantId/finance/agent-commissions',
  ...guard('FINANCE_REPORTS_READ'),
  getAgentCommissionsHandler
);

export default router;
