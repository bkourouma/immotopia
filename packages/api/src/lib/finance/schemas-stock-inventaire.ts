import { z } from 'zod';
import { uuidPathParamSchema as sharedUuidPathParamSchema } from './schemas';

/**
 * Validation Zod des sept points d'entrée des transferts et de l'inventaire —
 * lot 5, troisième sous-lot (`lib/finance/types-lot5-inventaire.ts`).
 *
 * **Toute entrée invalide devient un `ZodError`**, que le middleware central
 * (`middleware/error-middleware.ts`) traduit en 400, quelle que soit la route.
 * Même discipline qu'aux sous-lots précédents (`schemas-stock-mouvements.ts`,
 * `schemas-retentions.ts`) : le contrôleur n'appelle que `.parse`, jamais un
 * `.safeParse` suivi d'un abandon silencieux.
 *
 * ---------------------------------------------------------------------------
 * `.strict()` partout, et trois raisons distinctes de l'être
 * ---------------------------------------------------------------------------
 *
 * 1. **Un corps ne répète jamais un identifiant que le chemin porte déjà.**
 *    Le chemin porte `tenantId`, `countId` et `itemId` selon la route ; aucun
 *    corps de ce fichier n'en parle. Quatre créations des lots 2 et 3
 *    échouaient en 400 contre le vrai serveur pour avoir ignoré cette règle.
 *
 * 2. **`expectedQuantity` n'est PAS un champ de saisie** (principe P-4,
 *    contrat). Le service la lit dans le stock au moment de la saisie et la
 *    fige. La laisser entrer permettrait de fabriquer un écart nul — c'est
 *    exactement le geste que le besoin S6 cherche à empêcher. Comme le schéma
 *    est strict, un appelant qui l'enverrait reçoit un 400 explicite plutôt
 *    que de croire sa valeur prise en compte alors que Zod l'a *retirée* sans
 *    le dire. C'est la seule façon de rendre le principe visible du dehors.
 *    `variance` et `varianceValue`, tout aussi dérivées, sont refusées pour la
 *    même raison.
 *
 * 3. **La validation d'un inventaire ne se paramètre pas.** Son corps est un
 *    objet vide et strict : rien à décider au moment de valider, tout a été
 *    décidé en comptant.
 *
 * ---------------------------------------------------------------------------
 * Une quantité n'est pas un montant
 * ---------------------------------------------------------------------------
 *
 * Les quantités portent quatre décimales (`Decimal(16,4)`) : on compte des
 * tonnes et des mètres cubes. Aucun schéma de ce fichier ne les contraint à
 * l'entier.
 *
 * La quantité **transférée** est strictement positive : déplacer zéro n'est
 * pas un geste, et un négatif serait un transfert à l'envers déguisé.
 * La quantité **comptée**, elle, accepte le zéro — « on a compté, il n'y a
 * rien » est un résultat de comptage, et le plus fréquent des écarts. Seul le
 * négatif est refusé : on ne compte pas moins que rien.
 */

export const uuidPathParamSchema = sharedUuidPathParamSchema;

/** Les deux états d'un inventaire (`StockCountStatus`). */
export const stockCountStatusSchema = z.enum(['DRAFT', 'VALIDATED'], {
  errorMap: () => ({ message: 'Statut d’inventaire invalide.' })
});

// ---------------------------------------------------------------------------
// POST /stock/transfers
//
// Les deux lieux sont dans le CORPS, et ce n'est pas une répétition : le
// chemin ne porte que `tenantId`. AUCUN PRIX n'est reçu — la valeur part au
// coût moyen du lieu d'origine (principe P-4), et un transfert n'écrit aucune
// écriture comptable.
//
// Le même lieu des deux côtés est refusé par le domaine, pas ici : Zod valide
// la forme d'un champ, et la relation entre deux champs est une règle métier
// dont le domaine reste la seule autorité.
// ---------------------------------------------------------------------------

export const createStockTransferSchema = z
  .object({
    fromLocationId: z.string().uuid('Identifiant de lieu d’origine invalide.'),
    toLocationId: z.string().uuid('Identifiant de lieu d’arrivée invalide.'),
    itemId: z.string().uuid('Identifiant d’article invalide.'),
    quantity: z
      .number({ invalid_type_error: 'La quantité doit être un nombre.' })
      .finite('La quantité doit être un nombre fini.')
      .gt(0, 'La quantité transférée doit être strictement positive.'),
    transferDate: z.coerce.date({ errorMap: () => ({ message: 'Date de transfert invalide.' }) })
  })
  .strict();

export type CreateStockTransferInput = z.infer<typeof createStockTransferSchema>;

// ---------------------------------------------------------------------------
// POST /stock/counts
// ---------------------------------------------------------------------------

export const createStockCountSchema = z
  .object({
    locationId: z.string().uuid('Identifiant de lieu de stockage invalide.'),
    countedAt: z.coerce.date({ errorMap: () => ({ message: 'Date de comptage invalide.' }) })
  })
  .strict();

export type CreateStockCountInput = z.infer<typeof createStockCountSchema>;

// ---------------------------------------------------------------------------
// PUT /stock/counts/:countId/lines
//
// `countId` est dans le CHEMIN, jamais dans le corps. `expectedQuantity` n'y
// est pas non plus : voir la raison n°2 de l'en-tête.
// ---------------------------------------------------------------------------

export const setStockCountLineSchema = z
  .object({
    itemId: z.string().uuid('Identifiant d’article invalide.'),
    // Le ZÉRO est accepté (voir l'en-tête). Seul le négatif est refusé.
    countedQuantity: z
      .number({ invalid_type_error: 'La quantité comptée doit être un nombre.' })
      .finite('La quantité comptée doit être un nombre fini.')
      .min(0, 'La quantité comptée ne peut pas être négative.'),
    // Facultatif ICI, exigé À LA VALIDATION quand il y a un écart (besoin S6) :
    // on compte une allée d'abord, on explique ensuite. Refuser le motif dès la
    // saisie obligerait à inventer une explication avant d'avoir regardé, et
    // « écart constaté » finirait recopié sur toutes les lignes.
    reason: z.string().trim().max(500, 'Le motif de l’écart est trop long.').nullish()
  })
  .strict();

export type SetStockCountLineInput = z.infer<typeof setStockCountLineSchema>;

// ---------------------------------------------------------------------------
// POST /stock/counts/:countId/validate
//
// Corps vide et strict : rien à décider au moment de valider. Parsé quand
// même, pour refuser un corps qui répéterait `countId` plutôt que de le jeter
// en silence (raison n°3 de l'en-tête).
// ---------------------------------------------------------------------------

export const validateStockCountSchema = z.object({}).strict();

export type ValidateStockCountInput = z.infer<typeof validateStockCountSchema>;

// ---------------------------------------------------------------------------
// GET /stock/counts
// ---------------------------------------------------------------------------

export const listStockCountsQuerySchema = z
  .object({
    locationId: z.string().uuid('Identifiant de lieu de stockage invalide.').optional(),
    status: stockCountStatusSchema.optional()
  })
  .strict();

export type ListStockCountsQuery = z.infer<typeof listStockCountsQuerySchema>;
