import { Router } from 'express';
import { authenticate } from '../middleware/auth-middleware';
import { requireTenantAccess } from '../middleware/tenant-middleware';
import { requireSignatureKindAccess } from '../middleware/signature-access-middleware';
import { resolveSignatureTenant } from '../middleware/signature-tenant-middleware';
import {
  cancelSignatureHandler,
  createSignatureHandler,
  getSignatureHandler,
  listSignaturesHandler,
  reissueInPersonTokenHandler,
  remindSignatureHandler,
  signatureFileHandler,
  signatureTargetContextHandler
} from '../controllers/signature-controller';

/**
 * Signature électronique, routes « agence » (spec 043), montées sur
 * `/api/signatures`. Toutes passent par `authenticate`, `resolveSignatureTenant`
 * puis `requireTenantAccess` (agence). Le droit RBAC et la fonctionnalité
 * d'abonnement dépendent du TYPE de document, déclarés par sa source
 * (`lib/signature/sources`) : `requireSignatureKindAccess` lit le type dans le
 * corps (création), dans la demande `:id` lue en base dans l'agence, ou dans
 * `:kind`. La liste filtre aux types lisibles par l'utilisateur. Gardes posées
 * route par route, jamais en `router.use` nu.
 */
const router = Router();

const tenantScoped = [authenticate, resolveSignatureTenant, requireTenantAccess];
const edit = (origin: 'body' | 'request' | 'param') => [...tenantScoped, requireSignatureKindAccess('edit', origin)];
const view = (origin: 'request') => [...tenantScoped, requireSignatureKindAccess('view', origin)];

router.post('/', ...edit('body'), createSignatureHandler);
router.get('/', ...tenantScoped, listSignaturesHandler);
router.get('/targets/:kind/:targetId/context', ...edit('param'), signatureTargetContextHandler);
router.get('/:id', ...view('request'), getSignatureHandler);
router.get('/:id/file', ...view('request'), signatureFileHandler);
router.post('/:id/cancel', ...edit('request'), cancelSignatureHandler);
router.post('/:id/remind', ...edit('request'), remindSignatureHandler);
router.post('/:id/signers/:signerId/in-person-token', ...edit('request'), reissueInPersonTokenHandler);

export default router;
