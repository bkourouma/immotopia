import { Router } from 'express';
import { authenticate } from '../middleware/auth-middleware';
import { requireTenantAccess } from '../middleware/tenant-middleware';
import { requirePermission } from '../middleware/rbac-middleware';
import {
  getAgencyFinanceSettingsHandler,
  updateAgencyFinanceSettingsHandler
} from '../controllers/agency-finance-settings-controller';
import {
  getPaymentGatewaySettingsHandler,
  updatePaymentGatewaySettingsHandler,
  testPaymentGatewayConnectionHandler
} from '../controllers/payment-gateway-settings-controller';
import {
  getOwnerPortalSettingsHandler,
  updateOwnerPortalSettingsHandler
} from '../controllers/owner-portal-settings-controller';

import {
  createAgencyReceivingAccountHandler,
  deleteAgencyReceivingAccountHandler,
  listAgencyReceivingAccountsHandler,
  readAgencyReceivingAccountQrHandler,
  updateAgencyReceivingAccountHandler
} from '../controllers/receiving-account-controller';
import { receiveReceivingAccountQr } from '../middleware/receiving-account-upload';
import {
  receivingAccountQrReadRateLimiter,
  receivingAccountWriteRateLimiter
} from '../middleware/rate-limit-middleware';

/**
 * Paramètres de l'agence qui ne relèvent pas de son identité (`PATCH
 * /tenants/:tenantId`) : aujourd'hui la fiscalité, les honoraires de gestion et
 * les comptes de la gestion locative.
 *
 * Mêmes permissions que la page « Paramètres de l'agence » où ils s'affichent.
 * Gardes posés avec leur chemin, jamais en `router.use` nu : ce routeur est
 * monté sur `/api` tout entier.
 */
const router = Router();

const PATH = '/tenants/:tenantId/settings/finance';

router.get(
  PATH,
  authenticate,
  requireTenantAccess,
  requirePermission('TENANT_SETTINGS_VIEW'),
  getAgencyFinanceSettingsHandler
);
router.put(
  PATH,
  authenticate,
  requireTenantAccess,
  requirePermission('TENANT_SETTINGS_EDIT'),
  updateAgencyFinanceSettingsHandler
);

// Lot 7 : paiement en ligne des loyers (PaySecureHub). Mêmes permissions que
// les autres paramètres agence.
const PAYMENT_GATEWAY_PATH = '/tenants/:tenantId/settings/payment-gateway';

router.get(
  PAYMENT_GATEWAY_PATH,
  authenticate,
  requireTenantAccess,
  requirePermission('TENANT_SETTINGS_VIEW'),
  getPaymentGatewaySettingsHandler
);
router.put(
  PAYMENT_GATEWAY_PATH,
  authenticate,
  requireTenantAccess,
  requirePermission('TENANT_SETTINGS_EDIT'),
  updatePaymentGatewaySettingsHandler
);
router.post(
  `${PAYMENT_GATEWAY_PATH}/test`,
  authenticate,
  requireTenantAccess,
  requirePermission('TENANT_SETTINGS_EDIT'),
  testPaymentGatewayConnectionHandler
);

// Lot P5 : masquage de la vue patrimoine du portail propriétaire. Mêmes
// permissions que les autres paramètres agence.
const OWNER_PORTAL_SETTINGS_PATH = '/tenants/:tenantId/settings/owner-portal';

router.get(
  OWNER_PORTAL_SETTINGS_PATH,
  authenticate,
  requireTenantAccess,
  requirePermission('TENANT_SETTINGS_VIEW'),
  getOwnerPortalSettingsHandler
);
router.put(
  OWNER_PORTAL_SETTINGS_PATH,
  authenticate,
  requireTenantAccess,
  requirePermission('TENANT_SETTINGS_EDIT'),
  updateOwnerPortalSettingsHandler
);

// Spec 048, lot Q : comptes de réception de l'agence (alias, QR) pour les loyers. Mêmes
// permissions que les autres paramètres agence ; limiteur AVANT le parseur multipart.
const RECEIVING_ACCOUNTS_PATH = '/tenants/:tenantId/settings/receiving-accounts';
const canViewSettings = requirePermission('TENANT_SETTINGS_VIEW');
const canEditSettings = requirePermission('TENANT_SETTINGS_EDIT');

router.get(
  RECEIVING_ACCOUNTS_PATH,
  authenticate,
  requireTenantAccess,
  canViewSettings,
  listAgencyReceivingAccountsHandler
);
router.post(
  RECEIVING_ACCOUNTS_PATH,
  authenticate,
  requireTenantAccess,
  canEditSettings,
  receivingAccountWriteRateLimiter,
  receiveReceivingAccountQr,
  createAgencyReceivingAccountHandler
);
router.put(
  `${RECEIVING_ACCOUNTS_PATH}/:accountId`,
  authenticate,
  requireTenantAccess,
  canEditSettings,
  receivingAccountWriteRateLimiter,
  receiveReceivingAccountQr,
  updateAgencyReceivingAccountHandler
);
router.delete(
  `${RECEIVING_ACCOUNTS_PATH}/:accountId`,
  authenticate,
  requireTenantAccess,
  canEditSettings,
  receivingAccountWriteRateLimiter,
  deleteAgencyReceivingAccountHandler
);
router.get(
  `${RECEIVING_ACCOUNTS_PATH}/:accountId/qr`,
  authenticate,
  requireTenantAccess,
  canViewSettings,
  receivingAccountQrReadRateLimiter,
  readAgencyReceivingAccountQrHandler
);

export default router;
