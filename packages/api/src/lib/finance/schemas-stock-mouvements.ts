import { z } from 'zod';
import { uuidPathParamSchema as sharedUuidPathParamSchema } from './schemas';

/**
 * Validation Zod des quatre points d'entrée des mouvements de stock — lot 5,
 * deuxième sous-lot (`lib/finance/types-lot5-mouvements.ts`).
 *
 * **Toute entrée invalide devient un `ZodError`**, que le middleware central
 * (`middleware/error-middleware.ts`) traduit en 400, quelle que soit la route.
 * Même discipline qu'aux sous-lots précédents (`schemas-retentions.ts`,
 * `schemas-salaries.ts`) : le contrôleur n'appelle que `.parse`, jamais un
 * `.safeParse` suivi d'un abandon silencieux.
 *
 * ---------------------------------------------------------------------------
 * `.strict()` partout, et trois raisons distinctes de l'être
 * ---------------------------------------------------------------------------
 *
 * 1. **Un corps ne répète jamais un identifiant que le chemin porte déjà.**
 *    Le chemin porte `tenantId`, et lui seul : aucun corps de ce fichier n'en
 *    parle. Quatre créations des lots 2 et 3 échouaient en 400 contre le vrai
 *    serveur pour avoir ignoré cette règle.
 *
 * 2. **Le prix unitaire d'une SORTIE est dérivé, jamais saisi** (principe P-4,
 *    contrat). `createStockIssueSchema` n'accepte donc aucun champ `unitCost`
 *    ni `totalValue`, et comme il est strict, un appelant qui en enverrait un
 *    reçoit un 400 explicite plutôt que de croire son prix pris en compte
 *    alors qu'il a été jeté — Zod *retire* les clés inconnues sans le dire.
 *    C'est la seule façon de rendre le principe visible depuis l'extérieur.
 *
 * 3. **Les quantités sont positives, toujours.** Le sens d'un mouvement est
 *    porté par son type, jamais par un signe : une quantité négative sur une
 *    réception serait indéchiffrable six mois plus tard. Le refus est ici, en
 *    plus du domaine, qui reste la seule autorité.
 *
 * ---------------------------------------------------------------------------
 * Une quantité n'est pas un montant
 * ---------------------------------------------------------------------------
 *
 * Les quantités portent quatre décimales (`Decimal(16,4)`) : on compte des
 * tonnes et des mètres cubes. Aucun schéma de ce fichier ne les contraint à
 * l'entier, et aucun ne doit le faire — la seule contrainte est la stricte
 * positivité.
 */

export const uuidPathParamSchema = sharedUuidPathParamSchema;

/**
 * `z.coerce.boolean()` transformerait `?onlyInStock=false` en `true` : toute
 * chaîne non vide est « truthy ». On accepte donc explicitement les deux
 * chaînes littérales en plus du booléen déjà typé (même détour qu'aux
 * sous-lots précédents).
 */
const booleanQueryParam = z
  .union([z.boolean(), z.enum(['true', 'false'])])
  .optional()
  .transform(value => (typeof value === 'string' ? value === 'true' : value));

/** Les quatre natures de mouvement du schéma (`StockMovementType`). */
export const stockMovementTypeSchema = z.enum(['RECEIPT', 'ISSUE', 'TRANSFER', 'ADJUSTMENT'], {
  errorMap: () => ({ message: 'Nature de mouvement de stock invalide.' })
});

/** Une quantité : strictement positive, quatre décimales admises. */
const quantitySchema = z
  .number({ invalid_type_error: 'La quantité doit être un nombre.' })
  .finite('La quantité doit être un nombre fini.')
  .gt(0, 'La quantité doit être strictement positive.');

// ---------------------------------------------------------------------------
// POST /stock/receipts
//
// `supplierInvoiceId` EST dans le corps, et ce n'est pas une répétition : le
// chemin ne porte que `tenantId`. La facture est ce qui VALORISE la réception
// (besoin S2, principe P-2) — sans elle, une valeur apparaîtrait de nulle part.
//
// UNE LIGNE PAR ARTICLE, et au moins une : le coût moyen se recalcule article
// par article, et un mouvement fourre-tout rendrait le calcul illisible.
// ---------------------------------------------------------------------------

export const stockReceiptLineSchema = z
  .object({
    itemId: z.string().uuid('Identifiant d’article invalide.'),
    quantity: quantitySchema,
    // Le ZÉRO est accepté — un don, une reprise, une chute récupérée entrent
    // en stock à valeur nulle (contrat). Seul le négatif est refusé : il
    // retirerait de la valeur d'un stock au lieu d'en ajouter.
    unitCost: z
      .number({ invalid_type_error: 'Le prix unitaire doit être un nombre.' })
      .finite('Le prix unitaire doit être un nombre fini.')
      .min(0, 'Le prix unitaire ne peut pas être négatif.')
  })
  .strict();

export const createStockReceiptSchema = z
  .object({
    locationId: z.string().uuid('Identifiant de lieu de stockage invalide.'),
    supplierInvoiceId: z.string().uuid('Identifiant de facture fournisseur invalide.'),
    receiptDate: z.coerce.date({ errorMap: () => ({ message: 'Date de réception invalide.' }) }),
    lines: z.array(stockReceiptLineSchema).min(1, 'Une réception comporte au moins une ligne.')
  })
  .strict();

export type CreateStockReceiptInput = z.infer<typeof createStockReceiptSchema>;

// ---------------------------------------------------------------------------
// POST /stock/issues
//
// AUCUN prix : il est dérivé du coût moyen du lieu avant la sortie
// (principe P-4). Voir la raison n°2 de l'en-tête.
// ---------------------------------------------------------------------------

export const createStockIssueSchema = z
  .object({
    locationId: z.string().uuid('Identifiant de lieu de stockage invalide.'),
    itemId: z.string().uuid('Identifiant d’article invalide.'),
    quantity: quantitySchema,
    siteId: z.string().uuid('Identifiant de chantier invalide.'),
    // Le poste est EXIGÉ, jamais deviné depuis l'article : le
    // `defaultCostCategoryId` de l'article est une proposition d'écran, pas
    // une autorité (contrat). Un poste deviné se lirait comme un choix sans
    // en être un.
    costCategoryId: z.string().uuid('Identifiant de poste de dépense invalide.'),
    // Exigé, jamais optionnel (besoin S3) : une sortie sans demandeur est un
    // matériau qui a disparu sans que personne n'en réponde.
    requestedBy: z
      .string({ required_error: 'Le demandeur de la sortie est obligatoire.' })
      .trim()
      .min(1, 'Le demandeur de la sortie est obligatoire.'),
    issueDate: z.coerce.date({ errorMap: () => ({ message: 'Date de sortie invalide.' }) })
  })
  .strict();

export type CreateStockIssueInput = z.infer<typeof createStockIssueSchema>;

// ---------------------------------------------------------------------------
// GET /stock/balances
// ---------------------------------------------------------------------------

export const listStockBalancesQuerySchema = z
  .object({
    locationId: z.string().uuid('Identifiant de lieu de stockage invalide.').optional(),
    itemId: z.string().uuid('Identifiant d’article invalide.').optional(),
    onlyInStock: booleanQueryParam
  })
  .strict();

export type ListStockBalancesQuery = z.infer<typeof listStockBalancesQuerySchema>;

// GET /stock/movements : filtres déplacés dans `schemas-stock-journal.ts`
// (lot 040, fondations), sans changement de comportement.
