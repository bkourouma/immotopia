import { Router } from 'express';
import { authenticate } from '../middleware/auth-middleware';
import { requireTenantAccess, requireTenantCollaborator } from '../middleware/tenant-middleware';
import { requireTenantTypeGuard } from '../middleware/subscription-feature-middleware';
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
  signatureSummaryHandler,
  signatureTargetContextHandler
} from '../controllers/signature-controller';

/**
 * Signature électronique, routes « agence » (spec 044), montées sur
 * `/api/signatures`. Toutes passent par `authenticate`, `resolveSignatureTenant`
 * puis `requireTenantAccess` (agence), `requireTenantCollaborator` (pas de client) et la garde de
 * type d'espace (PARTICULIER refusé). Le droit RBAC et la fonctionnalité
 * d'abonnement dépendent du TYPE de document, déclarés par sa source
 * (`lib/signature/sources`) : `requireSignatureKindAccess` lit le type dans le
 * corps (création), dans la demande `:id` lue en base dans l'agence, ou dans
 * `:kind`. La liste filtre aux types lisibles par l'utilisateur. Gardes posées
 * route par route, jamais en `router.use` nu.
 */
const router = Router();

// Collaborateurs seulement (un locataire ou propriétaire client n'a pas accès à la signature d'agence) ;
// espace PARTICULIER refusé (liste blanche de lib/subscription/particulier-routes.ts, défaut refusé).
const tenantScoped = [
  authenticate,
  resolveSignatureTenant,
  requireTenantAccess,
  requireTenantCollaborator,
  requireTenantTypeGuard('/signatures')
];
const edit = (origin: 'body' | 'request' | 'param') => [...tenantScoped, requireSignatureKindAccess('edit', origin)];
const view = (origin: 'request') => [...tenantScoped, requireSignatureKindAccess('view', origin)];

router.post('/', ...edit('body'), createSignatureHandler);
router.get('/', ...tenantScoped, listSignaturesHandler);
router.get('/summary', ...tenantScoped, signatureSummaryHandler);
router.get('/targets/:kind/:targetId/context', ...edit('param'), signatureTargetContextHandler);
router.get('/:id', ...view('request'), getSignatureHandler);
router.get('/:id/file', ...view('request'), signatureFileHandler);
router.post('/:id/cancel', ...edit('request'), cancelSignatureHandler);
router.post('/:id/remind', ...edit('request'), remindSignatureHandler);
router.post('/:id/signers/:signerId/in-person-token', ...edit('request'), reissueInPersonTokenHandler);

export default router;
