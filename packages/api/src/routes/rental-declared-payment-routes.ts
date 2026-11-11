import { Router, type RequestHandler } from 'express';
import { authenticate } from '../middleware/auth-middleware';
import { requireTenantAccess } from '../middleware/tenant-middleware';
import { enforceTenantIsolation } from '../middleware/tenant-isolation-middleware';
import {
  requirePaymentsAllocate,
  requirePaymentsCreate,
  requirePaymentsView
} from '../middleware/rental-rbac-middleware';
import { receiveRentalDeclarationProof } from '../middleware/rental-declared-proof-upload';
import { rentalDeclaredManagerWriteLimiter } from '../middleware/rental-declared-rate-limiters';
import {
  createReceivingNumberHandler,
  deleteReceivingNumberHandler,
  getDeclaredSettingsHandler,
  listReceivingNumbersHandler,
  updateDeclaredSettingsHandler,
  updateReceivingNumberHandler
} from '../controllers/rental-receiving-numbers-controller';
import { createDeclarationForThirdPartyHandler } from '../controllers/rental-declared-payment-controller';

/**
 * Paiement de loyer déclaré, côté gestionnaire (numéros de réception, réglages, déclarations).
 *
 * Contrat : specs/049-locatif-paiement-parite-syndic/contracts.md, section 1.
 * Monté sur `/api` tout entier dans `app.ts` : les gardes se posent AVEC leur
 * chemin (comme `routes/syndic-declared-payment-routes.ts`), jamais en
 * `router.use` nu. Classées RENTAL par le préfixe `/rental` de
 * `lib/subscription/route-features.ts`.
 *
 * Les routes historiques `GET/POST …/rental/payment-declarations…` (liste,
 * détail, preuve, approve, reject) restent dans `routes/rental-routes.ts`, montée
 * AVANT ce routeur : `/payment-declarations/pending-count` y est donc déclarée
 * avant `/:declarationId` (voir ce fichier) et ce routeur ne porte que
 * `POST /payment-declarations` (déclaration pour un tiers).
 */
const router = Router();

const guards: RequestHandler[] = [authenticate, requireTenantAccess, enforceTenantIsolation];
const BASE = '/tenants/:tenantId/rental';
const NUMBERS = `${BASE}/receiving-numbers`;

// 1.1 Numéros de réception (lecture RENTAL_PAYMENTS_VIEW, écriture RENTAL_PAYMENTS_ALLOCATE).
router.get(NUMBERS, ...guards, requirePaymentsView, listReceivingNumbersHandler);
router.post(
  NUMBERS,
  ...guards,
  requirePaymentsAllocate,
  rentalDeclaredManagerWriteLimiter,
  createReceivingNumberHandler
);
router.patch(
  `${NUMBERS}/:numberId`,
  ...guards,
  requirePaymentsAllocate,
  rentalDeclaredManagerWriteLimiter,
  updateReceivingNumberHandler
);
router.delete(
  `${NUMBERS}/:numberId`,
  ...guards,
  requirePaymentsAllocate,
  rentalDeclaredManagerWriteLimiter,
  deleteReceivingNumberHandler
);

// 1.2 Réglages.
router.get(`${BASE}/declared-payment/settings`, ...guards, requirePaymentsView, getDeclaredSettingsHandler);
router.put(
  `${BASE}/declared-payment/settings`,
  ...guards,
  requirePaymentsAllocate,
  rentalDeclaredManagerWriteLimiter,
  updateDeclaredSettingsHandler
);

// 1.6 Déclaration saisie par le gestionnaire pour un tiers (multipart : `payload` + `proof`). Limiteur avant le parseur.
router.post(
  `${BASE}/payment-declarations`,
  ...guards,
  requirePaymentsCreate,
  rentalDeclaredManagerWriteLimiter,
  receiveRentalDeclarationProof,
  createDeclarationForThirdPartyHandler
);

export default router;
