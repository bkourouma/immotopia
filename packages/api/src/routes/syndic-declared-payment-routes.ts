import { Router, type RequestHandler } from 'express';
import { authenticate } from '../middleware/auth-middleware';
import { requireTenantAccess } from '../middleware/tenant-middleware';
import { enforcePropertyTenantIsolation } from '../middleware/tenant-isolation-middleware';
import { requireAnyPropertyPermission, requirePropertyPermission } from '../middleware/property-rbac-middleware';
import { syndicDeclaredWriteRateLimiter } from '../middleware/rate-limit-middleware';
import { receiveDeclarationProof } from '../middleware/declared-proof-upload';
import {
  approveDeclarationHandler,
  createManagerDeclarationHandler,
  createReceivingNumberHandler,
  deleteReceivingNumberHandler,
  getDeclarationHandler,
  getDeclarationProofHandler,
  getDeclaredSettingsHandler,
  listDeclarationsHandler,
  listReceivingNumbersHandler,
  rejectDeclarationHandler,
  updateDeclaredSettingsHandler,
  updateReceivingNumberHandler
} from '../controllers/syndic-declared-payment-controller';

/**
 * Paiement mobile money déclaré, côté gestionnaire (spec 047, contrat §1).
 *
 * Lecture `SYNDIC_VIEW`, écriture `SYNDIC_EDIT` (D8 : `SYNDIC_EDIT` suffit pour valider).
 * Classées SYNDIC par le préfixe `/syndics` de `lib/subscription/route-features.ts`.
 *
 * Gardes posées avec leur chemin, jamais en `router.use` nu : ce routeur est
 * monté sur `/api` tout entier. Le chemin littéral `reglages` précède
 * `:declarationId`.
 */
const router = Router();

const guards: RequestHandler[] = [authenticate, requireTenantAccess, enforcePropertyTenantIsolation];
const canView = requireAnyPropertyPermission(['SYNDIC_VIEW']);
const canEdit = requirePropertyPermission('SYNDIC_EDIT');

const BASE = '/tenants/:tenantId/syndics/:syndicId';
const NUMBERS = `${BASE}/numeros-reception`;
const DECLARED = `${BASE}/paiements-declares`;

// 1.1 à 1.4 : numéros de réception.
router.get(NUMBERS, ...guards, canView, listReceivingNumbersHandler);
router.post(NUMBERS, ...guards, canEdit, syndicDeclaredWriteRateLimiter, createReceivingNumberHandler);
router.patch(`${NUMBERS}/:numberId`, ...guards, canEdit, syndicDeclaredWriteRateLimiter, updateReceivingNumberHandler);
router.delete(`${NUMBERS}/:numberId`, ...guards, canEdit, syndicDeclaredWriteRateLimiter, deleteReceivingNumberHandler);

// 1.5 : réglages.
router.get(`${DECLARED}/reglages`, ...guards, canView, getDeclaredSettingsHandler);
router.put(`${DECLARED}/reglages`, ...guards, canEdit, syndicDeclaredWriteRateLimiter, updateDeclaredSettingsHandler);

// 1.6 à 1.8 : file de validation, détail, capture (flux privé).
router.get(DECLARED, ...guards, canView, listDeclarationsHandler);
router.get(`${DECLARED}/:declarationId`, ...guards, canView, getDeclarationHandler);
router.get(`${DECLARED}/:declarationId/preuve`, ...guards, canView, getDeclarationProofHandler);

// 1.9 et 1.10 : décision.
router.post(
  `${DECLARED}/:declarationId/validation`,
  ...guards,
  canEdit,
  syndicDeclaredWriteRateLimiter,
  approveDeclarationHandler
);
router.post(
  `${DECLARED}/:declarationId/rejet`,
  ...guards,
  canEdit,
  syndicDeclaredWriteRateLimiter,
  rejectDeclarationHandler
);

// 1.11 : déclaration saisie par le gestionnaire (multipart : `payload` + `proof`). Limiteur avant le parseur.
router.post(
  DECLARED,
  ...guards,
  canEdit,
  syndicDeclaredWriteRateLimiter,
  receiveDeclarationProof,
  createManagerDeclarationHandler
);

export default router;
