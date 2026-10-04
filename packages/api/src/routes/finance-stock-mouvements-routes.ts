import { Router } from 'express';
import { authenticate } from '../middleware/auth-middleware';
import { requireTenantAccess } from '../middleware/tenant-middleware';
import { requireAccountsRead, requireDocumentsCreate } from '../middleware/finance-rbac-middleware';
import {
  createStockIssueHandler,
  createStockReceiptHandler,
  listStockBalancesHandler
} from '../controllers/finance-stock-mouvements-controller';

/**
 * Routes agence du module financier opérationnel — lot 5, deuxième sous-lot :
 * réceptions, sorties et valorisation (`lib/finance/types-lot5-mouvements.ts`).
 *
 * **Ce fichier ne se monte pas lui-même** : c'est le rôle de `src/index.ts`,
 * fichier-registre hors du territoire de cet agent, monté à l'intégration.
 * Modèle : `routes/finance-retentions-routes.ts` (lot 4, sous-lot 5).
 *
 * **Gardes posés AVEC leur chemin**, jamais en `router.use(authenticate)` nu.
 * Un garde posé sans chemin sur un routeur monté sur `/api` tout entier
 * traverserait toute requête `/api/*`, y compris une route publique montée
 * après lui — l'incident du lot 1, documenté dans `finance-routes.ts`. Ici
 * comme là-bas, le garde ne s'applique qu'au préfixe que ce routeur sert
 * réellement : `/tenants/:tenantId/finance`.
 *
 * **Aucune permission neuve** : deux droits déjà posés aux lots 1 et 2
 * (`requireAccountsRead`, `requireDocumentsCreate`) couvrent les quatre
 * routes — exactement le tableau donné à cet agent.
 *
 * **Aucune route ne porte de paramètre de chemin autre que `tenantId`.** Le
 * piège d'ordre d'Express (`/summary` capturé par `/:id`) qui s'est produit
 * aux sous-lots 3 et 5 du lot 4 ne peut donc pas se produire ici — et si une
 * route `/stock/movements/:movementId` s'ajoute un jour, elle devra être
 * déclarée APRÈS `/stock/movements`.
 */

const router = Router();

router.use('/tenants/:tenantId/finance', authenticate, requireTenantAccess);

// A. Réception. N'écrit AUCUNE écriture comptable ni aucune imputation : la
// facture a déjà porté la valeur au 311 (contrat, en-tête). C'est donc bien
// une création de pièce, mais une pièce de quantités.
router.post('/tenants/:tenantId/finance/stock/receipts', requireDocumentsCreate, createStockReceiptHandler);

// B. Sortie vers un chantier. C'est LE geste du lot : celui qui fait entrer le
// matériau dans le coût réel du chantier, à la place de la facture (P-7).
router.post('/tenants/:tenantId/finance/stock/issues', requireDocumentsCreate, createStockIssueHandler);

// C. Soldes par (article, lieu), avec leur valeur et leur coût moyen déduit.
router.get('/tenants/:tenantId/finance/stock/balances', requireAccountsRead, listStockBalancesHandler);

// D. Journal des mouvements : route déplacée dans
// `finance-stock-journal-routes.ts` (lot 040, fondations), même chemin et
// même garde.

export default router;
