import { z } from 'zod';

/**
 * Validation Zod des filtres du journal des mouvements — extraite de
 * `schemas-stock-mouvements.ts` (lot 040, étape des fondations) **sans
 * changement de comportement**.
 *
 * `.strict()` : un paramètre inconnu reçoit un 400 explicite plutôt que d'être
 * jeté en silence. Toute entrée invalide devient un `ZodError`, que le
 * middleware central traduit en 400.
 *
 * La liste des natures est recopiée de `schemas-stock-mouvements.ts` plutôt
 * qu'importée : le journal (territoire API-3) et les mouvements (API-1)
 * évoluent séparément au lot 040.
 */

/** Les quatre natures de mouvement filtrables au lot 5 (`StockMovementType`). */
export const stockJournalMovementTypeSchema = z.enum(['RECEIPT', 'ISSUE', 'TRANSFER', 'ADJUSTMENT'], {
  errorMap: () => ({ message: 'Nature de mouvement de stock invalide.' })
});

// ---------------------------------------------------------------------------
// GET /stock/movements
// ---------------------------------------------------------------------------

export const listStockMovementsQuerySchema = z
  .object({
    itemId: z.string().uuid('Identifiant d’article invalide.').optional(),
    locationId: z.string().uuid('Identifiant de lieu de stockage invalide.').optional(),
    siteId: z.string().uuid('Identifiant de chantier invalide.').optional(),
    type: stockJournalMovementTypeSchema.optional(),
    from: z.coerce.date({ errorMap: () => ({ message: 'Date de début invalide.' }) }).optional(),
    to: z.coerce.date({ errorMap: () => ({ message: 'Date de fin invalide.' }) }).optional()
  })
  .strict();

export type ListStockMovementsQuery = z.infer<typeof listStockMovementsQuerySchema>;
