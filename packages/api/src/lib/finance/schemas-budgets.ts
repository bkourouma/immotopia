import { z } from 'zod';
import { uuidPathParamSchema as sharedUuidPathParamSchema } from './schemas';

/**
 * Validation Zod des sept points d'entrée budget/avenant — lot 3, premier
 * volet (`specs/018-finance-budget-pilotage/data-model.md` §5).
 *
 * **Toute entrée invalide devient un `ZodError`**, que le middleware central
 * (`middleware/error-middleware.ts`) traduit en 400, quelle que soit la
 * route — même discipline qu'aux lots 1 et 2 (`lib/finance/schemas.ts`,
 * `schemas-suppliers.ts`) : `.parse` partout, jamais `.safeParse` suivi d'un
 * abandon silencieux.
 *
 * **Mode strict, demandé explicitement pour ce lot** : `.strict()` sur
 * chaque objet, de sorte qu'un champ non prévu dans le corps d'une requête
 * soit rejeté plutôt qu'ignoré en silence. Les schémas des lots précédents
 * ne le faisaient pas ; celui-ci le fait partout où un corps est accepté.
 */

export const uuidPathParamSchema = sharedUuidPathParamSchema;

// ---------------------------------------------------------------------------
// POST sites/:siteId/budgets
// ---------------------------------------------------------------------------

/**
 * Quantité et prix unitaire : **facultatifs, additifs, jamais recalculés
 * ici** (20 septembre 2026). Même parti pris qu'aux lignes de facture et de
 * bon de commande : le montant prévu reste la donnée de référence, et une
 * ligne sans quantité ni prix unitaire se saisit toujours en montant direct.
 *
 * Déclarés explicitement parce que ce lot est en mode `.strict()` : un champ
 * non prévu est rejeté en 400, et l'écran n'aurait pas pu les transmettre.
 *
 * `.nullish()` plutôt que `.optional()` : un écran envoie volontiers `null`
 * pour un champ laissé vide au lieu d'omettre la clé, et `.optional()` seul
 * rejetterait ce `null` en 400 — silencieusement pour l'utilisateur, qui
 * verrait sa saisie refusée sans comprendre pourquoi.
 */
const siteBudgetLineInputSchema = z
  .object({
    costCategoryId: z.string().uuid('Identifiant de poste de dépense invalide.'),
    label: z.string().min(1, 'Le libellé de la ligne est obligatoire.'),
    amountForecast: z.number().positive('Le montant prévu de la ligne doit être positif.'),
    quantity: z.number().positive('La quantité doit être positive.').nullish(),
    unitPrice: z.number().nonnegative('Le prix unitaire ne peut pas être négatif.').nullish()
  })
  .strict();

export const createSiteBudgetSchema = z
  .object({
    label: z.string().min(1, 'Le libellé du budget est obligatoire.'),
    lines: z.array(siteBudgetLineInputSchema).min(1, 'Un budget doit porter au moins une ligne.')
  })
  .strict();

export type CreateSiteBudgetInput = z.infer<typeof createSiteBudgetSchema>;

// ---------------------------------------------------------------------------
// POST site-budgets/:budgetId/amendments
// ---------------------------------------------------------------------------

const budgetAmendmentLineInputSchema = z
  .object({
    costCategoryId: z.string().uuid('Identifiant de poste de dépense invalide.'),
    // Signé à dessein (voir le contrat, `BudgetAmendmentLineRecord`) : un
    // avenant réduit parfois une enveloppe. `z.number()` seul, sans
    // `.positive()` ni `.nonnegative()`.
    amountDelta: z.number({ invalid_type_error: "Le montant de l'écart doit être un nombre." }),
    // Facultatifs, comme partout ailleurs. **Particularité de l'avenant** :
    // `amountDelta` est signé et une quantité négative n'a aucun sens, donc
    // c'est `unitPrice` qui porte le signe — `z.number()` seul, sans
    // `.nonnegative()`, là où la ligne de budget l'exige positif.
    quantity: z.number().positive('La quantité doit être positive.').nullish(),
    unitPrice: z.number({ invalid_type_error: 'Le prix unitaire doit être un nombre.' }).nullish()
  })
  .strict();

export const createBudgetAmendmentSchema = z
  .object({
    amendmentDate: z.coerce.date({ errorMap: () => ({ message: "Date d'avenant invalide." }) }),
    reason: z.string().min(1, "Le motif de l'avenant est obligatoire."),
    lines: z.array(budgetAmendmentLineInputSchema).min(1, 'Un avenant doit porter au moins une ligne.')
  })
  .strict();

export type CreateBudgetAmendmentInput = z.infer<typeof createBudgetAmendmentSchema>;
