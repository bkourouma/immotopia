import { Router } from 'express';
import { authenticate } from '../middleware/auth-middleware';
import { requireTenantAccess } from '../middleware/tenant-middleware';
import { requireLeasesEdit, requireLeasesView } from '../middleware/rental-rbac-middleware';
import { requireFeature } from '../middleware/subscription-feature-middleware';
import { resolveSignatureTenant } from '../middleware/signature-tenant-middleware';
import {
  cancelSignatureHandler,
  createSignatureHandler,
  getSignatureHandler,
  listSignaturesHandler,
  reissueInPersonTokenHandler,
  remindSignatureHandler,
  signatureFileHandler
} from '../controllers/signature-controller';

/**
 * Signature électronique, routes « agence » (spec 044, lot S1), montées sur
 * `/api/signatures`. L'agence est résolue par `resolveSignatureTenant` puis
 * contrôlée par `requireTenantAccess` ; le droit est celui de la gestion
 * locative (premier document : le bail), le module `RENTAL` doit être inclus
 * dans l'abonnement. Gardes posées route par route, jamais en `router.use` nu.
 */
const router = Router();

const view = [authenticate, resolveSignatureTenant, requireTenantAccess, requireLeasesView, requireFeature('RENTAL')];
const edit = [authenticate, resolveSignatureTenant, requireTenantAccess, requireLeasesEdit, requireFeature('RENTAL')];

router.post('/', ...edit, createSignatureHandler);
router.get('/', ...view, listSignaturesHandler);
router.get('/:id', ...view, getSignatureHandler);
router.get('/:id/file', ...view, signatureFileHandler);
router.post('/:id/cancel', ...edit, cancelSignatureHandler);
router.post('/:id/remind', ...edit, remindSignatureHandler);
router.post('/:id/signers/:signerId/in-person-token', ...edit, reissueInPersonTokenHandler);

export default router;
