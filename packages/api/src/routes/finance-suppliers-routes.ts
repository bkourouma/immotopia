import { Router } from 'express';
import { authenticate } from '../middleware/auth-middleware';
import { requireTenantAccess } from '../middleware/tenant-middleware';
import {
  requireAccountsRead,
  requireDocumentsCreate,
  requireDocumentsValidate,
  requireReportsRead
} from '../middleware/finance-rbac-middleware';
import {
  createSupplierHandler,
  createSupplierInvoiceHandler,
  createSupplierPaymentHandler,
  getSupplierHandler,
  getSupplierInvoiceHandler,
  getSuppliersBalanceHandler,
  listSupplierInvoicesHandler,
  listSuppliersHandler,
  validateSupplierInvoiceHandler,
  voidSupplierInvoiceHandler
} from '../controllers/finance-suppliers-controller';

/**
 * Routes agence du module financier opérationnel — lot 2, volet fournisseurs.
 *
 * **Ce fichier ne se monte pas lui-même** : c'est le rôle de `src/index.ts`,
 * hors du territoire de cet agent (fichier-registre monté à l'intégration).
 * Modèle : `routes/finance-routes.ts` (lot 1).
 *
 * **Gardes posés avec leur chemin**, jamais en `router.use(authenticate)`
 * nu. Au lot 1, un garde posé sans chemin sur un routeur monté sur `/api`
 * tout entier traversait toute requête `/api/*`, y compris une route
 * publique montée après lui (`/api/geographic`, qui recevait alors un 401
 * incompréhensible). Voir l'en-tête de `finance-routes.ts` pour l'incident.
 * Ici comme là-bas, le garde ne s'applique qu'au préfixe que ce routeur sert
 * réellement.
 *
 * **`GET .../suppliers/balance` est déclarée avant `GET .../suppliers/:supplierId`.**
 * Express résout les routes dans l'ordre de déclaration : si la route
 * paramétrée venait en premier, `balance` serait capturé comme la valeur de
 * `:supplierId`, et la balance ne répondrait jamais (un 404 incompréhensible
 * — `getSupplierHandler` chercherait un fournisseur d'identifiant
 * `"balance"` — plutôt que la balance attendue). Un test de
 * `__tests__/api/finance.suppliers.test.ts` le vérifie explicitement.
 *
 * **La validation et l'annulation d'une facture portent `requireDocumentsValidate`**,
 * jamais `requireDocumentsCreate` : décision D7, plusieurs saisisseurs, un
 * validateur. Voir `middleware/finance-rbac-middleware.ts`.
 *
 * Contrat : `specs/017-finance-fournisseurs-chantiers/contracts/openapi.yaml`.
 */

const router = Router();

router.use('/tenants/:tenantId/finance', authenticate, requireTenantAccess);

router.get('/tenants/:tenantId/finance/suppliers', requireAccountsRead, listSuppliersHandler);

router.post('/tenants/:tenantId/finance/suppliers', requireDocumentsCreate, createSupplierHandler);

// Doit précéder la route paramétrée `suppliers/:supplierId` ci-dessous —
// voir l'en-tête du fichier.
router.get('/tenants/:tenantId/finance/suppliers/balance', requireReportsRead, getSuppliersBalanceHandler);

router.get('/tenants/:tenantId/finance/suppliers/:supplierId', requireAccountsRead, getSupplierHandler);

router.get(
  '/tenants/:tenantId/finance/suppliers/:supplierId/invoices',
  requireAccountsRead,
  listSupplierInvoicesHandler
);

router.post(
  '/tenants/:tenantId/finance/suppliers/:supplierId/invoices',
  requireDocumentsCreate,
  createSupplierInvoiceHandler
);

router.get('/tenants/:tenantId/finance/supplier-invoices/:invoiceId', requireAccountsRead, getSupplierInvoiceHandler);

router.post(
  '/tenants/:tenantId/finance/supplier-invoices/:invoiceId/validate',
  requireDocumentsValidate,
  validateSupplierInvoiceHandler
);

router.post(
  '/tenants/:tenantId/finance/supplier-invoices/:invoiceId/void',
  requireDocumentsValidate,
  voidSupplierInvoiceHandler
);

router.post(
  '/tenants/:tenantId/finance/suppliers/:supplierId/payments',
  requireDocumentsCreate,
  createSupplierPaymentHandler
);

export default router;
