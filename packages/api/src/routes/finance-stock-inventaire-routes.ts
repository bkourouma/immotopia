import { Router } from 'express';
import { authenticate } from '../middleware/auth-middleware';
import { requireTenantAccess } from '../middleware/tenant-middleware';
import {
  requireAccountsRead,
  requireDocumentsCreate,
  requireDocumentsValidate
} from '../middleware/finance-rbac-middleware';
import {
  createStockCountHandler,
  createStockTransferHandler,
  getStockCountHandler,
  listStockCountsHandler,
  removeStockCountLineHandler,
  setStockCountLineHandler,
  validateStockCountHandler
} from '../controllers/finance-stock-inventaire-controller';

/**
 * Routes agence du module financier opérationnel — lot 5, troisième sous-lot :
 * transferts et inventaire physique (`lib/finance/types-lot5-inventaire.ts`).
 *
 * **Ce fichier ne se monte pas lui-même** : c'est le rôle de `src/index.ts`,
 * fichier-registre hors du territoire de cet agent, monté à l'intégration.
 * Modèle : `routes/finance-stock-mouvements-routes.ts` (sous-lot 2).
 *
 * **Gardes posés AVEC leur chemin**, jamais en `router.use(authenticate)` nu.
 * Un garde posé sans chemin sur un routeur monté sur `/api` tout entier
 * traverserait toute requête `/api/*`, y compris une route publique montée
 * après lui — l'incident du lot 1, documenté dans `finance-routes.ts`. Ici
 * comme là-bas, le garde ne s'applique qu'au préfixe que ce routeur sert
 * réellement : `/tenants/:tenantId/finance`.
 *
 * **Aucune permission neuve** : trois droits déjà posés aux lots 1 et 2
 * (`requireAccountsRead`, `requireDocumentsCreate`, `requireDocumentsValidate`)
 * couvrent les sept routes — exactement le tableau donné à cet agent.
 *
 * **Valider porte le droit de VALIDATION, saisir porte celui de création**
 * (décision D7, depuis le lot 2) : plusieurs personnes comptent, une seule
 * acte la perte.
 */

const router = Router();

router.use('/tenants/:tenantId/finance', authenticate, requireTenantAccess);

// A. Transfert entre deux lieux. N'écrit AUCUNE écriture comptable et
// n'impute AUCUN chantier : déplacer n'est pas consommer (contrat, principe
// P-7). C'est bien une création de pièce, mais une pièce de quantités.
router.post('/tenants/:tenantId/finance/stock/transfers', requireDocumentsCreate, createStockTransferHandler);

// ────────────────────────────────────────────────────────────────────────────
// LES CHEMINS LITTÉRAUX SE MONTENT AVANT LES PARAMÉTRÉS, ET L'ORDRE EST LA
// SEULE CHOSE QUI LES EN PROTÈGE. Express prend la PREMIÈRE route qui
// correspond : `/stock/counts/:countId` déclaré au-dessus de
// `/stock/counts/:countId/validate` ne capturerait rien de plus (les segments
// diffèrent en nombre), mais un futur `/stock/counts/summary` placé APRÈS
// `/stock/counts/:countId` serait avalé par le paramètre, le contrôleur de
// détail le rejetterait en 400 (« identifiant valide »), et le résumé serait
// injoignable. Le piège s'est déjà produit aux sous-lots 3 et 5 du lot 4.
//
// Règle tenue ici : POST `/stock/counts` puis les chemins à segment fixe
// (`/lines`, `/validate`), puis GET `/stock/counts`, et `/stock/counts/:countId`
// EN DERNIER.
// ────────────────────────────────────────────────────────────────────────────

// B. Ouverture d'un inventaire, en brouillon et sans aucune ligne : on compte
// une allée après l'autre, et exiger la liste complète d'un coup obligerait à
// tout ressaisir pour corriger un chiffre.
router.post('/tenants/:tenantId/finance/stock/counts', requireDocumentsCreate, createStockCountHandler);

// C. Saisie ou correction du comptage d'un article. PUT, parce que rappeler le
// même article REMPLACE son comptage. `expectedQuantity` n'est pas un champ de
// saisie : le service la lit dans le stock et la fige (principe P-4).
router.put('/tenants/:tenantId/finance/stock/counts/:countId/lines', requireDocumentsCreate, setStockCountLineHandler);

// D. Retrait d'une ligne. Les deux identifiants sont dans le chemin.
router.delete(
  '/tenants/:tenantId/finance/stock/counts/:countId/lines/:itemId',
  requireDocumentsCreate,
  removeStockCountLineHandler
);

// E. Validation : les écarts deviennent des ajustements. Droit de VALIDATION,
// jamais de création (décision D7). Un écart sans motif est refusé (besoin S6).
router.post(
  '/tenants/:tenantId/finance/stock/counts/:countId/validate',
  requireDocumentsValidate,
  validateStockCountHandler
);

// F. Liste des inventaires, filtrable par lieu et par statut.
router.get('/tenants/:tenantId/finance/stock/counts', requireAccountsRead, listStockCountsHandler);

// G. Détail d'un inventaire. Voir l'avertissement au-dessus : cette route
// reste la DERNIÈRE des lectures, et rien ne doit être déclaré après elle sous
// `/stock/counts/`.
router.get('/tenants/:tenantId/finance/stock/counts/:countId', requireAccountsRead, getStockCountHandler);

export default router;
