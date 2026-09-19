import { Router } from 'express';
import { authenticate } from '../middleware/auth-middleware';
import { requireTenantAccess } from '../middleware/tenant-middleware';
import {
  requireAccountsRead,
  requireDocumentsCreate,
  requireDocumentsValidate
} from '../middleware/finance-rbac-middleware';
import {
  createRetentionHandler,
  getRetentionHandler,
  getRetentionSummaryHandler,
  listRetentionsHandler,
  releaseRetentionHandler
} from '../controllers/finance-retentions-controller';

/**
 * Routes agence du module financier opérationnel — lot 4, cinquième sous-lot :
 * la retenue de garantie (`lib/finance/types-lot4-retentions.ts`).
 *
 * **Ce fichier ne se monte pas lui-même** : c'est le rôle de `src/index.ts`,
 * fichier-registre hors du territoire de cet agent, monté à l'intégration.
 * Modèle : `routes/finance-salaries-routes.ts` (sous-lot 3).
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
 * couvrent les cinq routes — exactement le tableau donné à cet agent.
 */

const router = Router();

router.use('/tenants/:tenantId/finance', authenticate, requireTenantAccess);

// A. Pose d'une retenue sur une pièce validée. `sourceType`/`sourceId` sont
// dans le CORPS : le chemin ne porte que `tenantId`, et la pièce source change
// de table selon sa nature.
router.post('/tenants/:tenantId/finance/retentions', requireDocumentsCreate, createRetentionHandler);

// B. Libération : droit de VALIDATION, jamais de création — décision D7,
// plusieurs saisisseurs, un validateur. Libérer n'est pas payer : cette route
// ne crée aucun règlement, le tiers redevient simplement créancier.
router.post(
  '/tenants/:tenantId/finance/retentions/:retentionId/release',
  requireDocumentsValidate,
  releaseRetentionHandler
);

// C. Liste filtrée (statut, chantier, tiers, échéance dépassée).
router.get('/tenants/:tenantId/finance/retentions', requireAccountsRead, listRetentionsHandler);

// D. Résumé de ce qui est détenu.
//
// ────────────────────────────────────────────────────────────────────────────
// MONTÉE AVANT `/retentions/:retentionId`, ET L'ORDRE EST LA SEULE CHOSE QUI
// L'EN PROTÈGE. Express prend la PREMIÈRE route qui correspond : si
// `:retentionId` était déclaré au-dessus, il capturerait la chaîne `summary`,
// le contrôleur de détail la rejetterait en 400 (« identifiant valide »), et le
// résumé serait injoignable. Le piège s'est déjà produit au sous-lot 3.
//
// Ne jamais déplacer cette ligne sous la suivante.
// ────────────────────────────────────────────────────────────────────────────
router.get('/tenants/:tenantId/finance/retentions/summary', requireAccountsRead, getRetentionSummaryHandler);

// E. Détail d'une retenue. Voir l'avertissement au-dessus : cette route reste
// la dernière des trois lectures.
router.get('/tenants/:tenantId/finance/retentions/:retentionId', requireAccountsRead, getRetentionHandler);

export default router;
