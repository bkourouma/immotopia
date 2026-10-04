import { StockReasonCode } from '@prisma/client';
import { z } from 'zod';
import { uuidPathParamSchema as sharedUuidPathParamSchema } from './schemas';

/**
 * Validation Zod des points d'entrée de l'inventaire — lot 5, refondue par le
 * lot 040 (contrat `contracts/openapi.yaml` 2.0.0 : `CreateCountRequest`,
 * `SetCountLineRequest`, `JustifyLineRequest`, `ValidateCountRequest`,
 * `ReasonOnlyRequest`).
 *
 * **Toute entrée invalide devient un `ZodError`**, que le middleware central
 * traduit en 400. Le contrôleur n'appelle que `.parse`.
 *
 * `.strict()` partout :
 *
 * 1. **Un corps ne répète jamais un identifiant que le chemin porte déjà**
 *    (`tenantId`, `countId`, `itemId`).
 * 2. **`expectedQuantity` n'est PAS un champ de saisie** (principe P-4) : le
 *    service la fige depuis le solde. `variance` et `varianceValue`, dérivées,
 *    sont refusées pour la même raison.
 * 3. **Le motif ne se saisit pas au comptage** (spec A2-R5) : il se saisit
 *    ligne par ligne APRÈS la clôture du comptage, par la route de
 *    justification. `reason` envoyé avec une saisie est refusé avec un message
 *    explicite plutôt que par le refus générique d'un champ inconnu.
 *
 * Une quantité comptée accepte le zéro (« il n'y a rien » est un résultat de
 * comptage) ; seul le négatif est refusé. Quatre décimales, jamais l'entier.
 */

export const uuidPathParamSchema = sharedUuidPathParamSchema;

/** Les quatre états d'un inventaire (`StockCountStatus`, A2-R1). */
export const stockCountStatusSchema = z.enum(['DRAFT', 'COUNTED', 'VALIDATED', 'CANCELLED'], {
  errorMap: () => ({ message: 'Statut d’inventaire invalide.' })
});

/** Les trois natures d'un inventaire (`StockCountKind`, A7). */
export const stockCountKindSchema = z.enum(['REGULAR', 'OPENING', 'CLOSING'], {
  errorMap: () => ({ message: 'Nature d’inventaire invalide.' })
});

/** Identifiant d'idempotence d'une saisie (B3-R2). */
const clientRequestIdSchema = z.string().uuid('Identifiant de requête invalide.');

// ---------------------------------------------------------------------------
// POST /stock/counts
// ---------------------------------------------------------------------------

export const createStockCountSchema = z
  .object({
    locationId: z.string().uuid('Identifiant de lieu de stockage invalide.'),
    countedAt: z.coerce.date({ errorMap: () => ({ message: 'Date de comptage invalide.' }) }),
    kind: stockCountKindSchema.optional()
  })
  .strict();

export type CreateStockCountInput = z.infer<typeof createStockCountSchema>;

// ---------------------------------------------------------------------------
// PUT /stock/counts/:countId/lines
// ---------------------------------------------------------------------------

/** Le message du refus d'un motif saisi au comptage (A2-R5). */
export const REASON_AT_COUNT_MESSAGE = 'Le motif se saisit après la clôture du comptage.';

export const setStockCountLineSchema = z
  .object({
    itemId: z.string().uuid('Identifiant d’article invalide.'),
    countedQuantity: z
      .number({ invalid_type_error: 'La quantité comptée doit être un nombre.' })
      .finite('La quantité comptée doit être un nombre fini.')
      .min(0, 'La quantité comptée ne peut pas être négative.'),
    clientRequestId: clientRequestIdSchema.optional(),
    // Accepté par la forme pour être refusé avec un message clair (A2-R5).
    reason: z.unknown().optional(),
    reasonCode: z.unknown().optional()
  })
  .strict()
  .superRefine((value, context) => {
    for (const field of ['reason', 'reasonCode'] as const) {
      if (value[field] !== undefined) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: [field], message: REASON_AT_COUNT_MESSAGE });
      }
    }
  })
  .transform(({ itemId, countedQuantity, clientRequestId }) => ({ itemId, countedQuantity, clientRequestId }));

export type SetStockCountLineInput = z.infer<typeof setStockCountLineSchema>;

// ---------------------------------------------------------------------------
// POST /stock/counts/:countId/close
// ---------------------------------------------------------------------------

export const closeStockCountSchema = z.object({}).strict();

// ---------------------------------------------------------------------------
// PUT /stock/counts/:countId/lines/:itemId/justification
// ---------------------------------------------------------------------------

export const justifyStockCountLineSchema = z
  .object({
    // Un code de la liste fermée ; le service refuse ceux qui ne sont pas de la
    // colonne « Inventaire » (et `OPENING_BALANCE`) en `STOCK_REASON_NOT_ALLOWED`.
    reasonCode: z.nativeEnum(StockReasonCode, { errorMap: () => ({ message: 'Motif d’écart invalide.' }) }),
    reason: z.string().trim().max(500, 'La précision du motif est trop longue.').nullish()
  })
  .strict();

export type JustifyStockCountLineInput = z.infer<typeof justifyStockCountLineSchema>;

// ---------------------------------------------------------------------------
// POST …/set-aside, …/set-aside-uncounted, …/cancel
// ---------------------------------------------------------------------------

export const reasonOnlySchema = z
  .object({
    reason: z
      .string({ required_error: 'Le motif est obligatoire.' })
      .trim()
      .min(3, 'Le motif compte au moins 3 caractères.')
      .max(500, 'Le motif est trop long.')
  })
  .strict();

export type ReasonOnlyInput = z.infer<typeof reasonOnlySchema>;

// ---------------------------------------------------------------------------
// POST /stock/counts/:countId/validate
// ---------------------------------------------------------------------------

export const validateStockCountSchema = z
  .object({
    // Les bornes (10 à 500) sont vérifiées par le service : il répond alors
    // `STOCK_COUNT_SELF_VALIDATION_REASON_REQUIRED`, que l'écran sait lire.
    selfValidationReason: z.string().max(500, 'Le motif de la dérogation est trop long.').optional()
  })
  .strict();

export type ValidateStockCountInput = z.infer<typeof validateStockCountSchema>;

// ---------------------------------------------------------------------------
// GET /stock/counts
// ---------------------------------------------------------------------------

export const listStockCountsQuerySchema = z
  .object({
    locationId: z.string().uuid('Identifiant de lieu de stockage invalide.').optional(),
    status: stockCountStatusSchema.optional(),
    kind: stockCountKindSchema.optional(),
    withLines: z
      .enum(['true', 'false'], { errorMap: () => ({ message: 'withLines vaut true ou false.' }) })
      .optional()
      .transform(value => value === 'true')
  })
  .strict();

export type ListStockCountsQuery = z.infer<typeof listStockCountsQuerySchema>;
