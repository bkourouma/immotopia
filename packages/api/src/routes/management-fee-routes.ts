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
import { requireThirdPartyAllowed } from '../services/own-assets-barrier-service';

const router = Router();

const guard = (permission: string) => [authenticate, requireTenantAccess, requirePermission(permission)];
// Barriere « detenu en propre » : honoraires par proprietaire et commissions de
// negociateurs n'existent qu'avec la gestion pour un tiers.
const feeGuard = (permission: string, action: 'OWNER_FEE_TERMS' | 'AGENT_COMMISSION') => [
  ...guard(permission),
  requireThirdPartyAllowed(action)
];

const OWNERS = '/tenants/:tenantId/settings/finance/owners';
router.get(OWNERS, ...feeGuard('TENANT_SETTINGS_VIEW', 'OWNER_FEE_TERMS'), listOwnerFeeTermsHandler);
router.put(`${OWNERS}/:ownerClientId`, ...feeGuard('TENANT_SETTINGS_EDIT', 'OWNER_FEE_TERMS'), setOwnerFeeTermsHandler);
router.delete(
  `${OWNERS}/:ownerClientId`,
  ...feeGuard('TENANT_SETTINGS_EDIT', 'OWNER_FEE_TERMS'),
  clearOwnerFeeTermsHandler
);

const AGENTS = '/tenants/:tenantId/settings/finance/agents';
router.get(AGENTS, ...feeGuard('TENANT_SETTINGS_VIEW', 'AGENT_COMMISSION'), listAgentCommissionRatesHandler);
router.put(`${AGENTS}/:userId`, ...feeGuard('TENANT_SETTINGS_EDIT', 'AGENT_COMMISSION'), setAgentCommissionRateHandler);

const LEASE_TERMS = '/tenants/:tenantId/rental/leases/:leaseId/management-terms';
router.get(LEASE_TERMS, ...guard('RENTAL_LEASES_VIEW'), getLeaseManagementTermsHandler);
router.put(LEASE_TERMS, ...guard('RENTAL_LEASES_EDIT'), setLeaseManagementTermsHandler);

router.get(
  '/tenants/:tenantId/finance/agent-commissions',
  ...guard('FINANCE_REPORTS_READ'),
  getAgentCommissionsHandler
);

export default router;
