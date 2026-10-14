import { Router } from 'express';
import { authenticate } from '../middleware/auth-middleware';
import { requireTenantAccess } from '../middleware/tenant-middleware';
import { requireSettingsManage } from '../middleware/finance-rbac-middleware';
import { requireStockView } from '../middleware/stock-rbac-middleware';
import {
  createStockItemHandler,
  createStockLocationHandler,
  getStockItemHandler,
  getStockSettingsHandler,
  listStockItemsHandler,
  listStockLocationsHandler,
  setStockValuationMethodHandler,
  updateStockItemHandler,
  updateStockLocationHandler
} from '../controllers/finance-stock-referentiel-controller';

/**
 * Routes agence du module financier opérationnel — lot 5, premier sous-lot :
 * le référentiel du stock (`lib/finance/types-lot5-referentiel.ts`).
 *
 * **Ce fichier ne se monte pas lui-même** : c'est le rôle de `src/index.ts`,
 * hors du territoire de cet agent (fichier-registre monté à l'intégration par
 * le superviseur). Modèle : `routes/finance-salaries-routes.ts` (lot 4).
 *
 * **Gardes posés avec leur chemin**, jamais en `router.use(authenticate)`
 * nu. Un garde posé sans chemin sur un routeur monté sur `/api` tout entier
 * traverserait toute requête `/api/*`, y compris une route publique montée
 * après lui — l'incident du lot 1, documenté dans `finance-routes.ts`. Ici
 * comme là-bas, le garde ne s'applique qu'au préfixe que ce routeur sert
 * réellement : `/tenants/:tenantId/finance`.
 *
 * ---------------------------------------------------------------------------
 * Les chemins LITTÉRAUX avant les chemins PARAMÉTRÉS
 * ---------------------------------------------------------------------------
 *
 * `GET /stock/items` et `GET /stock/settings` sont montés AVANT
 * `GET /stock/items/:itemId`. Ce piège s'est déjà produit deux fois dans ce
 * projet : un segment paramétré monté en premier avale le littéral qui le
 * suit, et la route littérale devient injoignable sans qu'aucun test ne
 * l'annonce. `/stock/locations` et `/stock/settings` ne se recouvrent avec
 * rien, mais l'ordre est tenu partout pour que la règle reste visible.
 *
 * ---------------------------------------------------------------------------
 * Deux permissions, et pas une de plus
 * ---------------------------------------------------------------------------
 *
 * Écrire le référentiel est un geste de PARAMÉTRAGE (`requireSettingsManage`,
 * comme le plan de comptes ou les postes de dépense au lot 2), pas une saisie
 * courante : un article, un lieu ou une méthode de valorisation engagent tous
 * les mouvements à venir (spec 040, B1-R3 : l'écriture reste sur
 * `FINANCE_SETTINGS_MANAGE`). Le lire suffit avec `STOCK_VIEW` depuis le
 * lot 040 (B1-R2, était `FINANCE_ACCOUNTS_READ`) : le magasinier, qui n'a
 * aucun droit financier, doit lire articles, lieux et méthode.
 *
 * ---------------------------------------------------------------------------
 * Aucune route de suppression, et c'est délibéré
 * ---------------------------------------------------------------------------
 *
 * Ni `DELETE /stock/items/:itemId` ni `DELETE /stock/locations/:locationId`.
 * Désactiver n'est pas supprimer : leurs mouvements racontent où la matière
 * est passée (contrat, `UpdateStockLocationTx`). La désactivation passe par
 * `isActive` sur les deux PATCH.
 */

const router = Router();

router.use('/tenants/:tenantId/finance', authenticate, requireTenantAccess);

// A. Liste des articles — littéral, monté avant `items/:itemId`.
router.get('/tenants/:tenantId/finance/stock/items', requireStockView, listStockItemsHandler);

// B. Enregistrement d'un article.
router.post('/tenants/:tenantId/finance/stock/items', requireSettingsManage, createStockItemHandler);

// C. Détail d'un article — paramétré, monté APRÈS le littéral ci-dessus.
router.get('/tenants/:tenantId/finance/stock/items/:itemId', requireStockView, getStockItemHandler);

// D. Correction d'un article. La référence ne s'y corrige pas ; l'unité si,
// et c'est un danger assumé (contrat, `UpdateStockItemTx`).
router.patch('/tenants/:tenantId/finance/stock/items/:itemId', requireSettingsManage, updateStockItemHandler);

// E. Liste des lieux de stockage — littéral, monté avant `locations/:locationId`.
router.get('/tenants/:tenantId/finance/stock/locations', requireStockView, listStockLocationsHandler);

// F. Création d'un magasin, ou du lieu de stockage d'un chantier.
router.post('/tenants/:tenantId/finance/stock/locations', requireSettingsManage, createStockLocationHandler);

// G. Correction d'un lieu : son libellé, son activité. Ni sa nature ni son
// chantier — le schéma `.strict()` les refuse en 400.
router.patch(
  '/tenants/:tenantId/finance/stock/locations/:locationId',
  requireSettingsManage,
  updateStockLocationHandler
);

// H. Méthode de valorisation de l'agence — lecture.
router.get('/tenants/:tenantId/finance/stock/settings', requireStockView, getStockSettingsHandler);

// I. Méthode de valorisation — décision, motif exigé (besoin S5).
router.put('/tenants/:tenantId/finance/stock/settings', requireSettingsManage, setStockValuationMethodHandler);

export default router;
