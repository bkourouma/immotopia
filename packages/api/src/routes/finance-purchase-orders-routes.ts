import { Router } from 'express';
import { authenticate } from '../middleware/auth-middleware';
import { requireTenantAccess } from '../middleware/tenant-middleware';
import {
  requireAccountsRead,
  requireDocumentsCreate,
  requireDocumentsValidate
} from '../middleware/finance-rbac-middleware';
import {
  cancelPurchaseOrderHandler,
  createPurchaseOrderHandler,
  getPurchaseOrderHandler,
  getSiteEngagementHandler,
  issuePurchaseOrderHandler,
  linkInvoiceToPurchaseOrderHandler,
  listPurchaseOrdersHandler
} from '../controllers/finance-purchase-orders-controller';

/**
 * Routes agence « bons de commande et engagé » — lot 3, volet achats
 * (`specs/018-finance-budget-pilotage/data-model.md` §5).
 *
 * **Ce fichier ne se monte pas lui-même** : c'est le rôle de `src/index.ts`,
 * hors du territoire de cet agent (fichier-registre monté à l'intégration).
 * Modèle : `routes/finance-suppliers-routes.ts` (lot 2).
 *
 * **Gardes posés avec leur chemin**, jamais en `router.use(authenticate)` nu.
 * Un garde posé sans chemin sur un routeur monté sur `/api` tout entier ferait
 * traverser ce garde à toute requête `/api/*`, y compris une route publique
 * montée après lui — l'incident déjà rencontré et corrigé au lot 2 (voir
 * l'en-tête de `finance-suppliers-routes.ts`).
 *
 * **Aucune permission neuve** (`data-model.md` §5) : les cinq droits du module
 * financier posés aux lots 1 et 2 suffisent. La validation et l'annulation
 * d'un bon portent `requireDocumentsValidate`, jamais `requireDocumentsCreate` —
 * décision D7, plusieurs saisisseurs, un seul validateur, déjà appliquée à la
 * facture et au règlement fournisseurs.
 */

const router = Router();

router.use('/tenants/:tenantId/finance', authenticate, requireTenantAccess);

// ---------------------------------------------------------------------------
// Bons de commande
// ---------------------------------------------------------------------------

router.get('/tenants/:tenantId/finance/purchase-orders', requireAccountsRead, listPurchaseOrdersHandler);

router.post('/tenants/:tenantId/finance/purchase-orders', requireDocumentsCreate, createPurchaseOrderHandler);

router.get('/tenants/:tenantId/finance/purchase-orders/:orderId', requireAccountsRead, getPurchaseOrderHandler);

router.post(
  '/tenants/:tenantId/finance/purchase-orders/:orderId/issue',
  requireDocumentsValidate,
  issuePurchaseOrderHandler
);

router.post(
  '/tenants/:tenantId/finance/purchase-orders/:orderId/cancel',
  requireDocumentsValidate,
  cancelPurchaseOrderHandler
);

// ---------------------------------------------------------------------------
// Rapprochement facture <-> bon de commande
//
// Porte le droit de CRÉATION (`requireDocumentsCreate`), pas celui de
// validation : rapprocher une facture d'un bon est un geste de saisie (au
// même titre que saisir la facture elle-même), pas une décision de
// validation — c'est `documents.create` au tableau des routes
// (`data-model.md` §5).
// ---------------------------------------------------------------------------

router.post(
  '/tenants/:tenantId/finance/supplier-invoices/:invoiceId/purchase-order',
  requireDocumentsCreate,
  linkInvoiceToPurchaseOrderHandler
);

// ---------------------------------------------------------------------------
// Engagé du chantier
// ---------------------------------------------------------------------------

router.get('/tenants/:tenantId/finance/sites/:siteId/engagement', requireAccountsRead, getSiteEngagementHandler);

export default router;
