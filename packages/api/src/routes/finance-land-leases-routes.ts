import { Router } from 'express';
import { authenticate } from '../middleware/auth-middleware';
import { requireTenantAccess } from '../middleware/tenant-middleware';
import {
  requireAccountsRead,
  requireDocumentsCreate,
  requireDocumentsValidate,
  requireSitesManage
} from '../middleware/finance-rbac-middleware';
import {
  attachSiteToLandLeaseHandler,
  createLandLeaseHandler,
  createLandLeasePaymentHandler,
  getLandLeaseHandler,
  listLandLeaseAccrualsHandler,
  listLandLeasePaymentsHandler,
  listLandLeasesHandler,
  recordLandLeaseAccrualHandler,
  validateLandLeasePaymentHandler
} from '../controllers/finance-land-leases-controller';

/**
 * Routes agence du module financier opérationnel — lot 4, premier sous-lot :
 * les baux de terrain (`specs/019-finance-baux-terrain/data-model.md` §5).
 *
 * **Ce fichier ne se monte pas lui-même** : c'est le rôle de `src/index.ts`,
 * hors du territoire de cet agent (fichier-registre monté à l'intégration).
 * Modèle : `routes/finance-suppliers-routes.ts` (lot 2).
 *
 * **Gardes posés avec leur chemin**, jamais en `router.use(authenticate)`
 * nu. Un garde posé sans chemin sur un routeur monté sur `/api` tout entier
 * traverserait toute requête `/api/*`, y compris une route publique montée
 * après lui — l'incident du lot 1, documenté dans `finance-routes.ts`. Ici
 * comme là-bas, le garde ne s'applique qu'au préfixe que ce routeur sert
 * réellement : `/tenants/:tenantId/finance`.
 *
 * **Aucune permission neuve** (data-model.md §5) : les quatre droits déjà
 * posés au lot 1/2 (`requireAccountsRead`, `requireSitesManage`,
 * `requireDocumentsCreate`, `requireDocumentsValidate`) couvrent les neuf
 * routes.
 *
 * Contrat : `specs/019-finance-baux-terrain/data-model.md` §5.
 */

const router = Router();

router.use('/tenants/:tenantId/finance', authenticate, requireTenantAccess);

router.get('/tenants/:tenantId/finance/land-leases', requireAccountsRead, listLandLeasesHandler);

router.post('/tenants/:tenantId/finance/land-leases', requireSitesManage, createLandLeaseHandler);

router.get('/tenants/:tenantId/finance/land-leases/:landLeaseId', requireAccountsRead, getLandLeaseHandler);

// Rattache (ou détache, `landLeaseId: null`) un chantier à un bail. Portée
// par `sites.manage`, comme la création du bail : gérer les chantiers d'un
// bail est la même responsabilité que gérer le bail lui-même.
router.put('/tenants/:tenantId/finance/sites/:siteId/land-lease', requireSitesManage, attachSiteToLandLeaseHandler);

router.get(
  '/tenants/:tenantId/finance/land-leases/:landLeaseId/payments',
  requireAccountsRead,
  listLandLeasePaymentsHandler
);

router.post(
  '/tenants/:tenantId/finance/land-leases/:landLeaseId/payments',
  requireDocumentsCreate,
  createLandLeasePaymentHandler
);

// Validation d'un paiement : droit de VALIDATION, jamais de création —
// décision D7, plusieurs saisisseurs, un validateur (même règle qu'au lot 2).
router.post(
  '/tenants/:tenantId/finance/land-lease-payments/:paymentId/validate',
  requireDocumentsValidate,
  validateLandLeasePaymentHandler
);

router.get(
  '/tenants/:tenantId/finance/land-leases/:landLeaseId/accruals',
  requireAccountsRead,
  listLandLeaseAccrualsHandler
);

// Constatation manuelle d'un mois précis, en rattrapage du travail
// programmé. Porte aussi le droit de VALIDATION : une constatation naît déjà
// validée, il n'existe pas de droit de « création » séparé pour elle.
router.post(
  '/tenants/:tenantId/finance/land-leases/:landLeaseId/accruals',
  requireDocumentsValidate,
  recordLandLeaseAccrualHandler
);

export default router;
