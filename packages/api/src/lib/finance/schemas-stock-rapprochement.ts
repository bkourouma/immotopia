import { z } from 'zod';

import { uuidPathParamSchema as sharedUuidPathParamSchema } from './schemas';

/**
 * Validation Zod des trois points d'entrée de la bascule au stock et du
 * rapprochement — lot 5, quatrième sous-lot
 * (`lib/finance/types-lot5-rapprochement.ts`).
 *
 * **Toute entrée invalide devient un `ZodError`**, que le middleware central
 * (`middleware/error-middleware.ts`) traduit en 400, quelle que soit la route.
 * Même discipline qu'aux sous-lots précédents (`schemas-stock-mouvements.ts`,
 * `schemas-site-closing.ts`) : le contrôleur n'appelle que `.parse`, jamais un
 * `.safeParse` suivi d'un abandon silencieux.
 *
 * ---------------------------------------------------------------------------
 * `.strict()`, et AUCUN identifiant déjà porté par le chemin
 * ---------------------------------------------------------------------------
 *
 * Quatre créations des lots 2 et 3 échouaient en 400 contre le vrai serveur
 * parce que leur corps répétait un identifiant que le chemin portait déjà. Ici
 * le chemin porte `tenantId` et `siteId` : aucun corps n'en parle. `.strict()`
 * rend le refus BRUYANT — un corps qui les répéterait échoue en 400 avec un
 * message explicite, plutôt que d'être silencieusement amputé par le
 * comportement par défaut de Zod, qui *retire* les clés inconnues sans le dire.
 *
 * ---------------------------------------------------------------------------
 * La bascule n'a AUCUN corps, et surtout pas de date
 * ---------------------------------------------------------------------------
 *
 * `EnableStockOnSiteTx` prend bien un `enabledAt`, mais c'est le contrôleur
 * qui le fournit — l'instant de la décision —, jamais l'appelant. Accepter une
 * date choisie reviendrait à laisser antidater la bascule, c'est-à-dire à
 * reclasser après coup des factures déjà imputées : exactement ce que le
 * contrat interdit lorsqu'il refuse de redater un chantier déjà basculé, et
 * exactement ce que « la bascule ne touche à aucune facture passée » veut
 * éviter.
 *
 * Le schéma est donc vide et strict : un corps qui porterait `enabledAt`
 * reçoit un 400 explicite plutôt que de croire sa date prise en compte alors
 * qu'elle aurait été jetée. Même geste que le refus d'`unitCost` sur une
 * sortie de stock (principe P-4) : c'est la seule façon de rendre la règle
 * visible depuis l'extérieur.
 */

export const uuidPathParamSchema = sharedUuidPathParamSchema;

// ---------------------------------------------------------------------------
// POST /sites/:siteId/stock/enable
//
// Aucun corps : le chantier vient du chemin, la date vient de l'instant de la
// décision, et l'auteur du jeton d'authentification. Voir l'en-tête.
// ---------------------------------------------------------------------------

export const enableSiteStockSchema = z.object({}).strict();

export type EnableSiteStockInput = z.infer<typeof enableSiteStockSchema>;

// ---------------------------------------------------------------------------
// GET /sites/:siteId/stock/status
// GET /sites/:siteId/stock/reconciliation
//
// Aucun filtre. Le rapprochement porte sur UN chantier, depuis SA bascule :
// une borne de période saisie de l'extérieur permettrait de regarder un écart
// sur une fenêtre choisie après coup, ce qui est une autre question que celle
// du besoin S7.
// ---------------------------------------------------------------------------

export const siteStockQuerySchema = z.object({}).strict();

export type SiteStockQuery = z.infer<typeof siteStockQuerySchema>;
