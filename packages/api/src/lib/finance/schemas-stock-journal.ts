import { z } from 'zod';

/**
 * Validation Zod des lectures du journal des mouvements et du terrain —
 * lot 040, territoire API-3 (spec A5, A8-R1, B3-R1).
 *
 * `.strict()` : un paramètre inconnu reçoit un 400 explicite plutôt que d'être
 * jeté en silence. Toute entrée invalide devient un `ZodError`, que le
 * middleware central traduit en 400.
 *
 * La liste des natures est recopiée de `schemas-stock-mouvements.ts` plutôt
 * qu'importée : le journal (territoire API-3) et les mouvements (API-1)
 * évoluent séparément.
 */

/** Les six natures de mouvement (`StockMovementType`, A5-R2). */
export const stockJournalMovementTypeSchema = z.enum(
  ['RECEIPT', 'ISSUE', 'TRANSFER', 'ADJUSTMENT', 'SUPPLIER_RETURN', 'SCRAP'],
  { errorMap: () => ({ message: 'Nature de mouvement de stock invalide.' }) }
);

/** Jour `AAAA-MM-JJ` (ou date ISO complète), lu en UTC. */
const dateQueryParam = (message: string) => z.coerce.date({ errorMap: () => ({ message }) });

// ---------------------------------------------------------------------------
// GET /stock/movements et /stock/movements/export.csv
// ---------------------------------------------------------------------------

/** Les filtres communs au journal et à son export (A5-R2). */
const movementFilterShape = {
  itemId: z.string().uuid('Identifiant d’article invalide.').optional(),
  locationId: z.string().uuid('Identifiant de lieu de stockage invalide.').optional(),
  siteId: z.string().uuid('Identifiant de chantier invalide.').optional(),
  type: stockJournalMovementTypeSchema.optional(),
  slipId: z.string().uuid('Identifiant de bon invalide.').optional(),
  movementId: z.string().uuid('Identifiant de mouvement invalide.').optional(),
  takerId: z.string().uuid('Identifiant de preneur invalide.').optional(),
  createdByUserId: z.string().trim().min(1, 'Identifiant d’utilisateur invalide.').max(64).optional(),
  requestedBy: z.string().trim().min(1, 'Le demandeur recherché est vide.').max(120).optional(),
  from: dateQueryParam('Date de début invalide.').optional(),
  to: dateQueryParam('Date de fin invalide.').optional()
};

export const listStockMovementsQuerySchema = z
  .object({
    ...movementFilterShape,
    cursor: z.string().max(512, 'Curseur invalide.').optional(),
    limit: z.coerce
      .number({ invalid_type_error: 'La taille de page doit être un nombre.' })
      .int('La taille de page doit être un entier.')
      .min(1, 'La taille de page va de 1 à 200.')
      .max(200, 'La taille de page va de 1 à 200.')
      .default(50)
  })
  .strict();

export type ListStockMovementsQuery = z.infer<typeof listStockMovementsQuerySchema>;

export const exportStockMovementsQuerySchema = z.object(movementFilterShape).strict();

export type ExportStockMovementsQuery = z.infer<typeof exportStockMovementsQuerySchema>;

// ---------------------------------------------------------------------------
// GET /stock/receivable-invoices (B3-R1, question Q9)
// ---------------------------------------------------------------------------

export const listReceivableInvoicesQuerySchema = z
  .object({
    search: z.string().trim().max(120, 'La recherche compte au plus 120 caractères.').optional(),
    cursor: z.string().max(512, 'Curseur invalide.').optional(),
    limit: z.coerce
      .number({ invalid_type_error: 'La taille de page doit être un nombre.' })
      .int('La taille de page doit être un entier.')
      .min(1, 'La taille de page va de 1 à 50.')
      .max(50, 'La taille de page va de 1 à 50.')
      .default(20)
  })
  .strict();

export type ListReceivableInvoicesQuery = z.infer<typeof listReceivableInvoicesQuerySchema>;
