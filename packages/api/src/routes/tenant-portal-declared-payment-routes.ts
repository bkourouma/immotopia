import { Router, type RequestHandler } from 'express';
import { authenticate } from '../middleware/auth-middleware';
import { requireTenantPortalAccess } from '../middleware/tenant-portal-access';
import { receiveRentalDeclarationProof } from '../middleware/rental-declared-proof-upload';
import {
  rentalDeclareCancelLimiter,
  rentalDeclareCreateLimiter,
  rentalPortalReadLimiter,
  rentalProofReadDayLimiter,
  rentalProofReadMinuteLimiter
} from '../middleware/rental-declared-rate-limiters';
import {
  cancelMyDeclarationHandler,
  declarePaymentHandler,
  getAvailabilityHandler,
  getMyDeclarationHandler,
  listMyDeclarationsHandler,
  readProofHandler
} from '../controllers/tenant-portal-declared-payment-controller';

/**
 * Paiement de loyer déclaré, côté portail locataire (contrat 049, §1.3 à 1.5).
 *
 * Monté sur `/api/portal/tenant` AVANT `tenantPortalRoutes` pour que les chemins
 * littéraux (ex. `/payments/declare/lecture`) passent avant les chemins à
 * paramètres, et pour que `POST /payments/declare` serve la version étendue
 * (la route historique de `tenant-portal-routes.ts` n'est plus atteinte).
 * Les gardes se posent AVEC leur chemin, jamais en `router.use` nu : le
 * routeur voisin garde son propre `router.use` d'authentification.
 * Les limiteurs précèdent le parseur multipart.
 */
const router = Router();

const guards: RequestHandler[] = [authenticate, requireTenantPortalAccess];

router.get('/payments/declare/availability', ...guards, rentalPortalReadLimiter, getAvailabilityHandler);
router.post(
  '/payments/declare/lecture',
  ...guards,
  rentalProofReadMinuteLimiter,
  rentalProofReadDayLimiter,
  receiveRentalDeclarationProof,
  readProofHandler
);
router.post(
  '/payments/declare',
  ...guards,
  rentalDeclareCreateLimiter,
  receiveRentalDeclarationProof,
  declarePaymentHandler
);
router.get('/payments/declarations', ...guards, rentalPortalReadLimiter, listMyDeclarationsHandler);
router.get('/payments/declarations/:declarationId', ...guards, rentalPortalReadLimiter, getMyDeclarationHandler);
router.post(
  '/payments/declarations/:declarationId/cancel',
  ...guards,
  rentalDeclareCancelLimiter,
  cancelMyDeclarationHandler
);

export default router;
